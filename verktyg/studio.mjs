// Studio: matrisvyn med redigering, som en lokal server. Källan är fortsatt
// filerna i arbetsytan (git): systemregistret, användningsfallen i
// skissformatet och IG:arnas sushi-config.yaml. Studion skriver filerna
// (kommentarer och ordning bevaras), komponerar om utan SUSHI och visar
// resultatet direkt. Ändringarna granskas och committas som vanligt.
//
//   GET  /                         vyn med studioläge
//   PUT  /api/system/<namn>        { titel, organisation, andpunkter, roller, tillval, informationsmangder }
//   PUT  /api/skiss                { fil, doc }   användningsfall eller delflöde
//   POST /api/yaml                 { doc } → { text }  förhandsgranskning
//   PUT  /api/komposition/<ig-id>  { komponerar, anvandningsfall, valfria, forutsattningar, flodesmonster }
//   PUT  /api/tillampning/<ig-id>  { flode, steg, operation, resurstyp, ta_bort }  bindning i tjänsten
//   POST /api/aterstall            { fil }        git checkout av en fil
//   POST /api/bygg                                hela bygget med SUSHI
//   POST /api/anslut/forhandsgranska { system, titel, organisation, roller }  klient-CS, scopes, WSO2-plan
//   POST /api/anslut               samma        (testmiljöläge) roller + anslutningar till behörig i test
//   POST /api/anslutning/status    { system, tjanst, aktor, miljo, status, bevis }  nästa steg i kedjan
//   POST /api/anslut/producent/forhandsgranska { system, titel, produkt, organisation, adress, roller }
//   POST /api/anslut/producent     samma        (testmiljöläge) anslutningspunkt i testmiljöns katalog
//   POST /api/producent/adress     { system, fran, till }  byt anropsadress (ändra vägval)
//   PUT  /api/produkt/<id>         { titel, leverantor, foljer, foljsamhet }  lägg till eller ändra en produkt
//   POST /api/produkt/<id>/godkannande { tjanst, aktor, status, bevis }  produktgodkännande per roll
//   POST /api/produkt/<id>/testa   { adress?, roller? }  federationstest mot referensimplementationen
//   POST /api/organisation         { namn, hsaId }         lägg till en organisation i katalogen
//
// Testmiljöläge (studio --miljo test): studion för den som ansluter en klient.
// Bara anslutningsflödet skriver, och bara anslutningar i test; IG:ar, flöden
// och systemens roller i övrigt redigeras inte där.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { loadSystems } from './system.mjs';
import { overga } from './anslutning.mjs';
import { behorigheterForSystem, klientCapabilityStatement, arKonsumentroll, sammanfogaScopes } from './behorighet.mjs';
import { wso2Plan } from './wso2.mjs';
import { referensroller, testaReferens, skrivProdukttest } from './produkttest.mjs';
import {
  loadProdukter, skrivProdukt, organisationer, registreraOrganisation, registreraProducent, forhandsgranskaProducent,
  producentMangder, arProducentroll, bytAdress, STANDARDKATALOG, HSA_ID, skrivProduktGodkannande,
} from './systemregister.mjs';

const EXT = 'https://fhir.inera.se/ig/conventions/StructureDefinition/';
const SKISS = /^[^/]+\/[^/]+\/input\/scenarier\/[a-z0-9-]+\.yaml$/;
const SYSTEMNAMN = /^[A-Za-z][A-Za-z0-9]*$/;

const git = (root, ...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

// Ändrade filer i arbetsytan enligt git, med diff per fil.
export function andringar(root) {
  const st = git(root, 'status', '--porcelain', '--', 'system', 'byggblock', 'federationer', 'stodtjanster', 'tjanster', 'konventioner');
  if (st.status !== 0) return [];
  return st.stdout.split('\n').filter(Boolean).map((rad) => {
    const fil = rad.slice(3);
    const diff = rad.startsWith('??') ? null : git(root, 'diff', '--', fil).stdout;
    return { status: rad.slice(0, 2).trim(), fil, diff };
  }).filter((x) => !/(_komponerat|fsh-generated|komposition\.md|anvandningsfall\.md|komposition\.json)/.test(x.fil));
}

// Skisserna i arbetsytan: användningsfall och delflöden med källtext.
export function skisser(ws, root) {
  const ut = [];
  for (const ig of ws.values()) {
    const dir = path.join(ig.dir, 'input', 'scenarier');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.yaml')).sort()) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      let doc = null;
      try { doc = YAML.parse(text); } catch { doc = null; }
      ut.push({
        ig: ig.id, fil: path.relative(root, path.join(dir, f)), text, doc,
        namn: doc?.anvandningsfall || doc?.delflode || f, typ: doc?.delflode ? 'delflode' : 'anvandningsfall',
      });
    }
  }
  return ut;
}

// IG:ns kompositionsinställningar så som de står i sushi-config.yaml.
export function konfiguration(ws) {
  return Object.fromEntries([...ws.values()].map((ig) => [ig.id, {
    roll: ig.roll, komponerar: ig.komponerar.map((k) => k.paket),
    anvandningsfall: ig.anvandningsfall, valfria: ig.valfriaInformationsmangder,
    forutsattningar: ig.forutsattningar, flodesmonster: ig.flodesmonster || null,
  }]));
}

// ---- skrivning

// Ersätter extensions med en viss url i sushi-config.yaml med nya, på samma
// plats som de gamla stod (annars sist), och behåller allt annat.
function sattExtensions(doc, url, nya) {
  const lista = doc.get('extension') || doc.createNode([]);
  if (!doc.has('extension')) doc.set('extension', lista);
  const items = lista.items;
  const forsta = items.findIndex((n) => n.get?.('url') === url);
  const kvar = items.filter((n) => n.get?.('url') !== url);
  const plats = forsta < 0 ? kvar.length : items.slice(0, forsta).filter((n) => n.get?.('url') !== url).length;
  kvar.splice(plats, 0, ...nya.map((x) => doc.createNode({ url, ...x })));
  lista.items = kvar;
}

export function skrivKomposition(ws, igId, k, root) {
  const ig = ws.get(igId);
  if (!ig) throw new Error(`Okänd IG ${igId}`);
  const fil = path.join(ig.dir, 'sushi-config.yaml');
  const doc = YAML.parseDocument(fs.readFileSync(fil, 'utf8'));
  if (k.komponerar) {
    for (const p of k.komponerar) if (!ws.has(p)) throw new Error(`Okänt paket ${p}`);
    sattExtensions(doc, `${EXT}komponerar`, k.komponerar.map((p) => ({
      extension: [{ url: 'paket', valueString: p }, { url: 'version', valueString: ws.get(p).version }],
    })));
    // Konventionspaketet refereras och måste finnas som beroende.
    for (const p of k.komponerar.filter((x) => ws.get(x).roll === 'konvention')) {
      if (!doc.hasIn(['dependencies', p])) doc.setIn(['dependencies', p], ws.get(p).version);
    }
  }
  if (k.anvandningsfall) sattExtensions(doc, `${EXT}anvandningsfall`, k.anvandningsfall.map((v) => ({ valueString: v })));
  if (k.valfria) sattExtensions(doc, `${EXT}valfri-informationsmangd`, k.valfria.map((v) => ({ valueString: v })));
  if (k.forutsattningar) sattExtensions(doc, `${EXT}forutsattning`, k.forutsattningar.map((v) => ({ valueString: v })));
  if (k.flodesmonster !== undefined) {
    const f = k.flodesmonster;
    sattExtensions(doc, `${EXT}flodesmonster`, f && (f.vid || []).length ? [{
      extension: [
        ...f.vid.map((v) => ({ url: 'vid', valueCode: v })),
        ...(f.fore || []).map((v) => ({ url: 'fore', valueString: v })),
        ...(f.foreEnGang ? [{ url: 'foreEnGang', valueBoolean: true }] : []),
        ...(f.foreVarje || []).map((v) => ({ url: 'foreVarje', valueString: v })),
        ...(f.efter || []).map((v) => ({ url: 'efter', valueString: v })),
      ],
    }] : []);
  }
  fs.writeFileSync(fil, doc.toString({ lineWidth: 0 }));
  return path.relative(root, fil);
}

// Systemfilen för ett namn: den befintliga filen eller en ny.
function systemDok(root, namn) {
  if (!SYSTEMNAMN.test(namn || '')) throw new Error(`Ogiltigt systemnamn ${namn}`);
  const dir = path.join(root, 'system');
  fs.mkdirSync(dir, { recursive: true });
  const befintlig = fs.readdirSync(dir).find((f) => /\.ya?ml$/.test(f) && YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8'))?.system === namn);
  const fil = path.join(dir, befintlig || `${namn.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.yaml`);
  const doc = befintlig ? YAML.parseDocument(fs.readFileSync(fil, 'utf8')) : new YAML.Document({ system: namn });
  return { fil, doc, befintlig: !!befintlig };
}
const skrivDok = (root, fil, doc) => {
  fs.writeFileSync(fil, doc.toString({ lineWidth: 0 }));
  return path.relative(root, fil);
};

export function skrivSystem(root, namn, s) {
  const { fil, doc, befintlig } = systemDok(root, namn);
  const satt = (nyckel, v) => {
    if (v === undefined) return;
    if (v === null || (Array.isArray(v) && !v.length && nyckel !== 'roller')) doc.delete(nyckel);
    else doc.set(nyckel, v);
  };
  satt('titel', s.titel);
  satt('produkt', s.produkt);
  if (s.organisation) satt('organisation', { namn: s.organisation.namn, ...(s.organisation.hsaId ? { hsaId: s.organisation.hsaId } : {}) });
  satt('andpunkter', s.andpunkter);
  satt('roller', s.roller);
  satt('tillval', s.tillval);
  if (s.informationsmangder !== undefined) {
    const m = Object.fromEntries(Object.entries(s.informationsmangder || {}).filter(([, v]) => v?.length));
    satt('informationsmangder', Object.keys(m).length ? m : null);
  }
  if (!befintlig && !doc.has('nulage')) doc.set('nulage', { katalog: 'nulage/t2-katalog.json' });
  return skrivDok(root, fil, doc);
}

// ---- anslutningar

// Konsumentroller per tjänst: tjänsteaktörer med klient- men inga
// serverförmågor. Det är dem en klient kan ansluta sig som.
export function konsumentroller(manifests) {
  return Object.fromEntries(Object.values(manifests).filter((m) => m.ig.roll === 'tjanst')
    .map((m) => [m.ig.id, m.kravprofiler.map((k) => k.aktor).filter((a) => arKonsumentroll(m, a))]));
}

// En begäran från anslutningsflödet, kontrollerad mot IG:erna.
// Systemets uppgifter i en begäran: namn, titel, produkt och organisation.
function lasSystemdel(b, root) {
  if (!SYSTEMNAMN.test(b.system || '')) throw new Error('Systemnamnet ska vara bokstäver och siffror, t.ex. VardappY');
  if (b.produkt && root && !loadProdukter(root).some((p) => p.produkt === b.produkt)) throw new Error(`Produkten ${b.produkt} finns inte`);
  if (b.organisation?.hsaId && !HSA_ID.test(b.organisation.hsaId)) throw new Error(`Ogiltigt HSA-id ${b.organisation.hsaId}, t.ex. SE2321000099-EXMP`);
  const organisation = b.organisation?.namn ? { namn: b.organisation.namn, ...(b.organisation.hsaId ? { hsaId: b.organisation.hsaId } : {}) } : undefined;
  return { system: b.system, titel: b.titel || b.system, ...(b.produkt ? { produkt: b.produkt } : {}), organisation };
}

// Adressatbegränsning: '*' (alla) eller HSA-id för logiska adressater.
function lasAdressater(lista) {
  const a = (lista || []).map((x) => String(x).trim()).filter(Boolean);
  if (!a.length || a.includes('*')) return null;
  for (const x of a) if (!HSA_ID.test(x)) throw new Error(`Ogiltig adressat ${x}: ange HSA-id, t.ex. SE2321000099-EXMP, eller * för alla`);
  return [...new Set(a)];
}

function lasBegaran(b, manifests, root = null) {
  const sys = lasSystemdel(b, root);
  if (!b.roller?.length) throw new Error('Välj minst en tjänst att konsumera');
  const roller = b.roller.map((r) => {
    const m = manifests[r.tjanst];
    if (!m) throw new Error(`${r.tjanst} finns inte`);
    if (!arKonsumentroll(m, r.aktor)) throw new Error(`${r.aktor} är ingen konsumentroll i ${r.tjanst}`);
    const giltiga = (m.informationsmangder || []).map((i) => i.nyckel);
    const val = r.informationsmangder?.length ? r.informationsmangder : null;
    for (const n of val || []) if (!giltiga.includes(n)) throw new Error(`${n} är ingen informationsmängd i ${r.tjanst}`);
    const adressater = lasAdressater(r.adressater);
    return { tjanst: r.tjanst, aktor: r.aktor, ...(val ? { informationsmangder: val } : {}), ...(adressater ? { adressater } : {}) };
  });
  return { sys, roller };
}

// Vad anslutningen skulle ge i testmiljön: behörigheter per roll, scopes,
// klient-CapabilityStatement och WSO2-plan. Skriver ingenting.
export function forhandsgranskaAnslutning(b, manifests, root = null) {
  const { sys, roller } = lasBegaran(b, manifests, root);
  const { behorigheter, fel } = behorigheterForSystem(sys, manifests, roller);
  return {
    behorigheter, fel,
    scopes: sammanfogaScopes(behorigheter.flatMap((x) => x.scopes)),
    klientCs: klientCapabilityStatement(sys, behorigheter, { miljo: 'test' }),
    wso2: wso2Plan(sys, behorigheter, roller.map((r) => ({ ...r, miljo: 'test', status: 'behorig' })), { miljo: 'test' }),
  };
}

// Historik och bevis skrivs en rad per post.
function satAnslutningar(doc, lista) {
  const nod = doc.createNode(lista);
  for (const post of nod.items) {
    for (const k of ['historik', 'bevis']) for (const x of post.get(k, true)?.items || []) x.flow = true;
    for (const k of ['informationsmangder', 'adressater']) {
      const n = post.get(k, true);
      if (n) n.flow = true;
    }
  }
  doc.set('anslutningar', nod);
}

// Testmiljön: rollerna läggs till systemet (som skapas om det inte finns) och
// varje anslutning i test förs begärd → behörig direkt. Taket kommer från
// IG:erna; bara konsumentroller kan begäras här.
// Ett nytt system får titel, produkt och organisation; ett befintligt behåller sina.
function nyttSystem(doc, befintlig, sys) {
  if (befintlig) return;
  doc.set('titel', sys.titel);
  if (sys.produkt) doc.set('produkt', sys.produkt);
  if (sys.organisation) doc.set('organisation', sys.organisation);
}

// Begärd → behörig i test för rollerna; befintliga får sina val uppdaterade.
function behorigITest(ansl, roller, { av, datum }) {
  for (const r of roller) {
    const mal = { tjanst: r.tjanst, aktor: r.aktor, miljo: 'test' };
    const finns = ansl.find((a) => a.miljo === 'test' && a.tjanst === r.tjanst && a.aktor === r.aktor);
    if (finns?.status === 'aterkallad') throw new Error(`${r.aktor} i ${r.tjanst} är återkallad i test; den öppnas inte igen härifrån`);
    if (!finns) ansl = overga(ansl, mal, 'begard', { av, datum, informationsmangder: r.informationsmangder, adressater: r.adressater });
    else {
      ansl = ansl.map((a) => {
        if (a !== finns) return a;
        const { adressater, ...utan } = a;
        return { ...utan, ...(r.informationsmangder ? { informationsmangder: r.informationsmangder } : {}), ...(r.adressater ? { adressater: r.adressater } : {}) };
      });
    }
    if (ansl.find((a) => a.miljo === 'test' && a.tjanst === r.tjanst && a.aktor === r.aktor).status === 'begard') {
      ansl = overga(ansl, mal, 'behorig', { av: 'automatiskt i testmiljön', datum });
    }
  }
  return ansl;
}

export function anslutKlientTest(root, b, manifests, { datum } = {}) {
  const { sys, roller } = lasBegaran(b, manifests, root);
  const { fil, doc, befintlig } = systemDok(root, sys.system);
  const nu = doc.toJS() || {};
  nyttSystem(doc, befintlig, sys);
  const sysRoller = [...(nu.roller || [])];
  for (const r of roller) if (!sysRoller.some((x) => x.tjanst === r.tjanst && x.aktor === r.aktor)) sysRoller.push({ tjanst: r.tjanst, aktor: r.aktor });
  const ansl = behorigITest(nu.anslutningar || [], roller, { av: sys.organisation?.namn || (befintlig ? nu.organisation?.namn : null) || sys.system, datum });
  doc.set('roller', sysRoller);
  satAnslutningar(doc, ansl);
  return skrivDok(root, fil, doc);
}

// ---- producenter

// Producentroller per tjänst, med informationsmängderna de tillhandahåller.
export function producentroller(manifests) {
  return Object.fromEntries(Object.values(manifests).filter((m) => m.ig.roll === 'tjanst').map((m) => [m.ig.id,
    m.kravprofiler.map((k) => k.aktor).filter((a) => arProducentroll(m, a))
      .map((a) => ({ aktor: a, informationsmangder: producentMangder(m, a).map((i) => ({ nyckel: i.nyckel, titel: i.titel, krav: i.krav })) }))]));
}

// En producentbegäran: systemet (med organisation och HSA-id), adressen och rollerna.
function lasProducentbegaran(root, b, manifests) {
  const sys = lasSystemdel(b, root);
  const { doc, befintlig } = systemDok(root, sys.system);
  const nu = befintlig ? doc.toJS() : {};
  const organisation = befintlig ? nu.organisation : sys.organisation;
  if (!organisation?.hsaId) throw new Error('Producenten behöver en organisation med HSA-id');
  if (!b.roller?.length) throw new Error('Välj minst en tjänst att producera för');
  for (const r of b.roller) if (!arProducentroll(manifests[r.tjanst] || { informationsmangder: [] }, r.aktor)) throw new Error(`${r.aktor} är ingen producentroll i ${r.tjanst}`);
  const roller = b.roller.map((r) => ({ tjanst: r.tjanst, aktor: r.aktor, informationsmangder: r.informationsmangder || [] }));
  return { sys: { ...sys, titel: befintlig ? nu.titel || sys.system : sys.titel, organisation }, nu, befintlig, katalog: nu.nulage?.katalog || STANDARDKATALOG, roller };
}

export function forhandsgranskaProducentAnslutning(root, b, manifests) {
  const { sys, katalog, roller } = lasProducentbegaran(root, b, manifests);
  const r = forhandsgranskaProducent(root, { ...sys, adress: b.adress, roller }, manifests, katalog);
  const { behorigheter, fel } = behorigheterForSystem(sys, manifests, roller.map((x) => ({ tjanst: x.tjanst, aktor: x.aktor })));
  return {
    ...r, katalog, behorigheter, fel,
    scopes: sammanfogaScopes(behorigheter.flatMap((x) => x.scopes)),
    wso2: wso2Plan(sys, behorigheter, roller.map((x) => ({ tjanst: x.tjanst, aktor: x.aktor, miljo: 'test', status: 'behorig' })), { miljo: 'test' }),
  };
}

// Testmiljön: anslutningspunkt, tjänsteinstans, organisation och medlemskap i
// testmiljöns katalog; rollerna, adressen och de valda informationsmängderna
// i systemet; anslutningarna i test begärd → behörig.
export function anslutProducentTest(root, b, manifests, { datum } = {}) {
  const { sys, nu, befintlig, katalog, roller } = lasProducentbegaran(root, b, manifests);
  const reg = registreraProducent(root, { ...sys, adress: b.adress, roller }, manifests, katalog);
  const { fil, doc } = systemDok(root, sys.system);
  nyttSystem(doc, befintlig, sys);
  const sysRoller = [...(nu.roller || [])];
  for (const r of roller) if (!sysRoller.some((x) => x.tjanst === r.tjanst && x.aktor === r.aktor)) sysRoller.push({ tjanst: r.tjanst, aktor: r.aktor });
  doc.set('roller', sysRoller);
  doc.set('andpunkter', [...new Set([...(nu.andpunkter || []), b.adress])]);
  const mangder = { ...(nu.informationsmangder || {}) };
  for (const r of roller) {
    const m = manifests[r.tjanst];
    const valda = producentMangder(m, r.aktor).filter((i) => i.krav === 'obligatorisk' || r.informationsmangder.includes(i.nyckel)).map((i) => i.nyckel);
    mangder[r.tjanst] = [...new Set([...(mangder[r.tjanst] || []), ...valda])];
  }
  doc.set('informationsmangder', mangder);
  if (!nu.nulage?.katalog) doc.set('nulage', { ...(nu.nulage || {}), katalog: katalog });
  const ansl = behorigITest(nu.anslutningar || [], roller.map((r) => ({ tjanst: r.tjanst, aktor: r.aktor })), { av: sys.organisation?.namn || sys.system, datum });
  satAnslutningar(doc, ansl);
  return { filer: [skrivDok(root, fil, doc), reg.fil], andringar: reg.andringar };
}

// Ändra vägval: ny anropsadress i katalogen och i systemet.
export function bytProducentAdress(root, { system, fran, till }) {
  const { fil, doc, befintlig } = systemDok(root, system);
  if (!befintlig) throw new Error(`Systemet ${system} finns inte`);
  const nu = doc.toJS();
  const r = bytAdress(root, fran, till, nu.nulage?.katalog || STANDARDKATALOG);
  doc.set('andpunkter', [...new Set((nu.andpunkter || []).map((a) => (a === fran ? till : a)))]);
  return { filer: [skrivDok(root, fil, doc), r.fil], antal: r.antal };
}

// Nästa steg (eller återkallelse) för en anslutning. I testmiljöläget bara i test.
// I testmiljöläget: alla steg i test, och i produktion bara ansökan.
export function skrivAnslutningsstatus(root, b, { studiomiljo = null, datum } = {}) {
  if (studiomiljo === 'test' && b.miljo !== 'test' && !(b.miljo === 'prod' && b.status === 'ansokt')) {
    throw new Error('Testmiljöläget ändrar bara anslutningar i test; i produktion kan det bara ansöka');
  }
  const { fil, doc, befintlig } = systemDok(root, b.system);
  if (!befintlig) throw new Error(`Systemet ${b.system} finns inte`);
  const ansl = overga(doc.toJS().anslutningar || [], { tjanst: b.tjanst, aktor: b.aktor, miljo: b.miljo }, b.status,
    { av: b.av || (studiomiljo === 'test' ? 'studio (test)' : 'studio'), datum, bevis: (b.bevis || []).filter((x) => x?.typ), root });
  satAnslutningar(doc, ansl);
  return skrivDok(root, fil, doc);
}

// Skissen som YAML; den inledande kommentaren i en befintlig fil behålls.
export function skissText(doc, gammal = null) {
  const d = new YAML.Document(doc);
  d.commentBefore = gammal ? YAML.parseDocument(gammal).commentBefore : ' Skapad i ig-composer studio. Kompileras till ExampleScenario och Requirements.';
  return d.toString({ lineWidth: 0 });
}

export function skrivSkiss(root, fil, doc) {
  if (!SKISS.test(fil)) throw new Error(`Skisser ligger i <katalog>/<ig>/input/scenarier/<namn>.yaml, inte ${fil}`);
  if (!doc || !(doc.anvandningsfall || doc.delflode)) throw new Error('Skissen måste ha anvandningsfall eller delflode');
  if (!Array.isArray(doc.steg)) throw new Error('Skissen måste ha steg');
  const full = path.join(root, fil);
  if (!fs.existsSync(path.join(root, fil.split('/').slice(0, 2).join('/'), 'sushi-config.yaml'))) throw new Error(`${fil} ligger inte i en IG`);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, skissText(doc, fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null));
  return fil;
}

// Tjänstens tillämpning (input/tillampning.yaml): överstyr bindningen av en
// aktivitet till en interaktion.
export function skrivTillampning(ws, igId, b, root) {
  const ig = ws.get(igId);
  if (!ig || ig.roll !== 'tjanst') throw new Error(`${igId} är ingen tjänst`);
  if (!b.flode || !b.steg) throw new Error('Ange flode och steg');
  const fil = path.join(ig.dir, 'input', 'tillampning.yaml');
  const doc = fs.existsSync(fil) ? YAML.parseDocument(fs.readFileSync(fil, 'utf8')) : new YAML.Document({});
  if (!doc.contents) doc.contents = doc.createNode({});
  if (!fs.existsSync(fil)) doc.commentBefore = ' Tillämpning: bindningar av aktiviteter i de logiska flödena till interaktioner,\n där den härledda bindningen inte räcker. <flöde>: { <steg-id eller nr>: { operation, resurstyp } }';
  if (b.ta_bort) {
    doc.deleteIn([b.flode, String(b.steg)]);
    if (doc.getIn([b.flode])?.items?.length === 0) doc.delete(b.flode);
  } else {
    doc.setIn([b.flode, String(b.steg)], { operation: b.operation || null, ...(b.resurstyp !== undefined ? { resurstyp: b.resurstyp } : {}) });
  }
  // Utan bindningar kvar behövs ingen fil.
  if (!doc.contents?.items?.length) fs.rmSync(fil, { force: true });
  else fs.writeFileSync(fil, doc.toString({ lineWidth: 0 }));
  return path.relative(root, fil);
}

// ---- server

export async function startaStudio({ root, port = 4900, vard = '127.0.0.1', miljo = null, verktyg }) {
  const { loadWorkspace, viewData, renderView, komponeraAlla, bygg, loadManifests } = verktyg;
  if (miljo && miljo !== 'test') throw new Error(`Studion har bara testmiljöläge (--miljo test), inte ${miljo}`);
  const sida = () => {
    const ws = loadWorkspace(root);
    const data = viewData(ws, root);
    data.studio = {
      miljo, skisser: skisser(ws, root), konfiguration: konfiguration(ws), andringar: andringar(root), system: loadSystems(root),
      konsumentroller: konsumentroller(data.manifest), producentroller: producentroller(data.manifest),
      produkter: loadProdukter(root).map(({ fil, ...p }) => p), organisationer: organisationer(root),
    };
    return renderView(data);
  };
  // Det som inte får skrivas i testmiljöläget.
  const REDIGERING = /^\/api\/(system\/|skiss$|komposition\/|tillampning\/|aterstall$|bygg$)/;
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const kropp = (req) => new Promise((ok, fel) => {
    let t = '';
    req.on('data', (c) => { t += c; if (t.length > 2e6) fel(new Error('För stor')); });
    req.on('end', () => { try { ok(t ? JSON.parse(t) : {}); } catch (e) { fel(e); } });
  });
  // Efter en ändring: komponera om alla IG:ar (utan SUSHI) och rapportera.
  const efter = (fil) => {
    const r = komponeraAlla(loadWorkspace(root));
    return { fil, fel: r.flatMap((x) => x.fel.map((f) => `${x.ig}: ${f}`)), varningar: r.flatMap((x) => x.varningar.map((f) => `${x.ig}: ${f}`)) };
  };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://studio');
    try {
      // Bara anrop från studion själv får skriva.
      if (req.method !== 'GET' && req.headers['x-studio'] !== '1') return json(res, 403, { fel: 'Saknar X-Studio' });
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(sida());
      }
      if (miljo === 'test' && req.method !== 'GET' && REDIGERING.test(u.pathname)) {
        return json(res, 403, { fel: 'Inte i testmiljöläget: där ansluts klienter, IG:ar och flöden redigeras inte' });
      }
      if (req.method === 'POST' && u.pathname === '/api/anslut/forhandsgranska') {
        return json(res, 200, forhandsgranskaAnslutning(await kropp(req), loadManifests(loadWorkspace(root)), root));
      }
      if (req.method === 'POST' && u.pathname === '/api/anslut/producent/forhandsgranska') {
        return json(res, 200, forhandsgranskaProducentAnslutning(root, await kropp(req), loadManifests(loadWorkspace(root))));
      }
      if (req.method === 'POST' && u.pathname === '/api/anslut/producent') {
        if (miljo !== 'test') return json(res, 403, { fel: 'Producenter ansluts i testmiljöläget (studio --miljo test)' });
        const r = anslutProducentTest(root, await kropp(req), loadManifests(loadWorkspace(root)));
        return json(res, 200, { fil: r.filer.join(', '), andringar: r.andringar.length, fel: [], varningar: [] });
      }
      if (req.method === 'POST' && u.pathname === '/api/producent/adress') {
        const r = bytProducentAdress(root, await kropp(req));
        return json(res, 200, { fil: r.filer.join(', '), fel: [], varningar: [] });
      }
      const testa = u.pathname.match(/^\/api\/produkt\/([^/]+)\/testa$/);
      if (req.method === 'POST' && testa) {
        const b = await kropp(req);
        const ws = loadWorkspace(root);
        const manifests = loadManifests(ws);
        const produkt = loadProdukter(root).find((p) => p.produkt === decodeURIComponent(testa[1]));
        if (!produkt) return json(res, 400, { fel: `Produkten ${testa[1]} finns inte` });
        const adress = b.adress || (produkt.foljsamhet?.kalla === 'referensimplementation' ? produkt.foljsamhet.adress : null);
        if (!/^https?:\/\/\S+$/.test(adress || '')) return json(res, 400, { fel: 'Ange referensimplementationens adress' });
        const { roller, ejTestbara } = referensroller(produkt, manifests, b.roller || []);
        if (!roller.length) return json(res, 400, { fel: 'Inga producentroller att testa: ansök om produktgodkännande för en roll först' });
        const r = await testaReferens({ ws, manifests, root, regler: verktyg.loadRules?.(ws).system || {}, produkt, adress, roller, ejTestbara });
        return json(res, 200, { fil: skrivProdukttest(root, r), status: r.status, fel: r.fel ? [r.fel] : [], varningar: [] });
      }
      const godk = u.pathname.match(/^\/api\/produkt\/([^/]+)\/godkannande$/);
      if (req.method === 'POST' && godk) {
        return json(res, 200, { fil: skrivProduktGodkannande(root, decodeURIComponent(godk[1]), await kropp(req), { studiomiljo: miljo }), fel: [], varningar: [] });
      }
      if (req.method === 'PUT' && u.pathname.startsWith('/api/produkt/')) {
        return json(res, 200, { fil: skrivProdukt(root, decodeURIComponent(u.pathname.slice(13)), await kropp(req)), fel: [], varningar: [] });
      }
      if (req.method === 'POST' && u.pathname === '/api/organisation') {
        return json(res, 200, { fil: registreraOrganisation(root, await kropp(req)), fel: [], varningar: [] });
      }
      if (req.method === 'POST' && u.pathname === '/api/anslut') {
        if (miljo !== 'test') return json(res, 403, { fel: 'Klienter ansluts i testmiljöläget (studio --miljo test)' });
        const b = await kropp(req);
        return json(res, 200, { fil: anslutKlientTest(root, b, loadManifests(loadWorkspace(root))), fel: [], varningar: [] });
      }
      if (req.method === 'POST' && u.pathname === '/api/anslutning/status') {
        return json(res, 200, { fil: skrivAnslutningsstatus(root, await kropp(req), { studiomiljo: miljo }), fel: [], varningar: [] });
      }
      if (req.method === 'PUT' && u.pathname.startsWith('/api/system/')) {
        return json(res, 200, efter(skrivSystem(root, decodeURIComponent(u.pathname.slice(12)), await kropp(req))));
      }
      if (req.method === 'PUT' && u.pathname === '/api/skiss') {
        const b = await kropp(req);
        return json(res, 200, efter(skrivSkiss(root, b.fil, b.doc)));
      }
      if (req.method === 'POST' && u.pathname === '/api/yaml') {
        return json(res, 200, { text: skissText((await kropp(req)).doc) });
      }
      if (req.method === 'PUT' && u.pathname.startsWith('/api/komposition/')) {
        return json(res, 200, efter(skrivKomposition(loadWorkspace(root), decodeURIComponent(u.pathname.slice(17)), await kropp(req), root)));
      }
      if (req.method === 'PUT' && u.pathname.startsWith('/api/tillampning/')) {
        return json(res, 200, efter(skrivTillampning(loadWorkspace(root), decodeURIComponent(u.pathname.slice(17)), await kropp(req), root)));
      }
      if (req.method === 'POST' && u.pathname === '/api/aterstall') {
        const { fil } = await kropp(req);
        if (!andringar(root).some((a) => a.fil === fil)) return json(res, 400, { fel: `${fil} är inte ändrad` });
        const r = andringar(root).find((a) => a.fil === fil).status === '??' ? (fs.rmSync(path.join(root, fil)), { status: 0 }) : git(root, 'checkout', '--', fil);
        return json(res, r.status === 0 ? 200 : 500, r.status === 0 ? efter(fil) : { fel: r.stderr });
      }
      if (req.method === 'POST' && u.pathname === '/api/bygg') {
        return json(res, 200, bygg());
      }
      return json(res, 404, { fel: `${req.method} ${u.pathname} finns inte` });
    } catch (e) {
      return json(res, 400, { fel: e.message });
    }
  });
  await new Promise((ok) => server.listen(port, vard, ok));
  return server;
}
