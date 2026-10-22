// Systemperspektivet: ett konkret system antar roller (tjänsteaktörer) i en
// eller flera tjänster. Här summeras kraven över alla roller – förmågor,
// elementkrav, verksamhetskrav och scenariosteg – och jämförs med systemets
// nuläge: dess CapabilityStatement (kind=instance) och dess API-instanser i
// tjänstekatalogen. Resultatet är underlag för test och för gapanalys.
//
// Varje krav bär med sig vilka roller som ställer det, så att vyn kan vrida
// på urvalet av roller och räkna om summan och gapet.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { lasKatalog, orgMedHsa, specFor, federationsOrg, federationFor, matcha } from './t2.mjs';

export function loadSystems(root) {
  const dir = path.join(root, 'system');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()
    .map((f) => ({ ...YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8')), fil: path.join('system', f) }));
}

const stangning = (m, namn, seen = new Set()) => {
  if (!namn || seen.has(namn) || !m.formagor[namn]) return seen;
  seen.add(namn);
  for (const i of m.formagor[namn].imports) stangning(m, i, seen);
  return seen;
};
const stangningAv = (m, namn) => namn.reduce((seen, n) => stangning(m, n, seen), new Set());

const add = (map, key, val) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(val);
};
const utan = (url) => String(url).split('|')[0];
// Profiler med samma källa (kopierad-fran) är samma profil med olika kanoniska
// URL:er i olika tjänster; i text visas de en gång med antal URL:er.
const profilText = (lista) => {
  const perKalla = new Map();
  for (const p of lista) {
    if (!perKalla.has(p.kalla || p.url)) perKalla.set(p.kalla || p.url, { namn: p.namn, urls: new Set() });
    perKalla.get(p.kalla || p.url).urls.add(p.url);
  }
  return [...perKalla.values()].map((x) => (x.urls.size > 1 ? `${x.namn} (${x.urls.size} kanoniska URL:er)` : x.namn)).join(', ');
};

function readJson(root, rel) {
  if (!rel) return null;
  const file = path.join(root, 'system', rel);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}

// Nuläge: läge → { system, resurser: typ → { interaktioner, sokparametrar, profiler } }
function lasNulage(cs) {
  if (!cs) return null;
  const lagen = {};
  for (const r of cs.rest || []) {
    const l = (lagen[r.mode] ||= { system: new Set(), resurser: {} });
    for (const i of r.interaction || []) l.system.add(i.code);
    for (const res of r.resource || []) {
      const x = (l.resurser[res.type] ||= { interaktioner: new Set(), sokparametrar: new Set(), profiler: new Set() });
      for (const i of res.interaction || []) x.interaktioner.add(i.code);
      for (const s of res.searchParam || []) x.sokparametrar.add(s.name);
      for (const p of [res.profile, ...(res.supportedProfile || [])].filter(Boolean)) x.profiler.add(utan(p));
    }
  }
  return { lagen, instantiates: cs.instantiates || [], software: cs.software, implementation: cs.implementation };
}

// Status för ett API-krav givet en uppsättning delkrav med finns-flaggor.
export function apiStatus(item, aktivaRoller) {
  const aktiv = (x) => !aktivaRoller || x.roller.some((r) => aktivaRoller.has(r));
  const delar = [...item.interaktioner, ...item.sokparametrar, ...item.profiler].filter(aktiv);
  if (!delar.length && !item.roller.some((r) => !aktivaRoller || aktivaRoller.has(r))) return null;
  if (delar.some((d) => d.finns === null) || item.typFinns === null) return 'okänt';
  if (!item.typFinns) return 'saknas';
  return delar.every((d) => d.finns) ? 'ok' : 'delvis';
}

// En aktör och dess förfäder enligt tjänstens manifest.
const aktorKedja = (m, namn) => {
  const ut = [];
  const besok = (n) => {
    if (!n || ut.includes(n)) return;
    ut.push(n);
    for (const d of m.aktorer[n]?.derivedFrom || []) besok(d);
  };
  besok(namn);
  return ut;
};

// Organisationen som ett system tillhör: namn och HSA-id (eller bara namn).
const organisation = (sys) => (typeof sys.organisation === 'string' ? { namn: sys.organisation } : sys.organisation || {});

// kallor: { nulageCs, katalog, federationsKarta } ersätter filerna i
// sys.nulage, t.ex. när nuläget hämtas live från en federation.
export function analyseSystem(sys, manifests, root, regler = {}, kallor = {}) {
  const fel = [];
  const registreringsroll = regler.registreringsroll || 'TjanstekatalogRegistrerare';
  const medlemsroll = regler.medlemsroll || 'Federationsmedlem';
  const org = organisation(sys);

  const roller = (sys.roller || []).map((r) => {
    const m = manifests[r.tjanst];
    if (!m) {
      fel.push(`${r.tjanst} saknar komposition.json – kör ig-composer bygg`);
      return null;
    }
    const kp = m.kravprofiler.find((k) => k.aktor === r.aktor);
    if (!kp) {
      fel.push(`${r.aktor} är ingen tjänsteaktör i ${r.tjanst}`);
      return null;
    }
    return {
      id: `${r.tjanst}#${r.aktor}`, tjanst: r.tjanst, tjanstTitel: m.ig.titel, version: m.ig.version,
      aktor: r.aktor, titel: kp.aktorTitel || r.aktor, forfader: kp.forfader.map((f) => f.namn), m, kp,
      formagorNamn: [kp.formagor],
    };
  }).filter(Boolean);

  const nulageCs = 'nulageCs' in kallor ? kallor.nulageCs : readJson(root, sys.nulage?.formaga);
  if (nulageCs === undefined) fel.push(`Nulägesfilen ${sys.nulage.formaga} finns inte`);
  const nulage = lasNulage(nulageCs);

  // Tillval: en egen roll per tillval, knuten till den roll den är tillval för.
  for (const t of sys.tillval || []) {
    const grund = roller.filter((r) => !r.tillval && r.m.aktorer[t]?.tillvalFor && [r.aktor, ...r.forfader].includes(r.m.aktorer[t].tillvalFor));
    if (!grund.length) fel.push(`Tillvalet ${t} hör inte till någon av systemets roller`);
    for (const r of grund) {
      const kedja = aktorKedja(r.m, t);
      roller.push({
        id: `${r.tjanst}#${t}`, tjanst: r.tjanst, tjanstTitel: r.tjanstTitel, version: r.version,
        aktor: t, titel: r.m.aktorer[t].titel || t, forfader: kedja.slice(1), tillval: true, tillvalFor: r.aktor, m: r.m, kp: null,
        formagorNamn: kedja.map((n) => r.m.aktorer[n]?.formagor).filter(Boolean),
      });
    }
  }

  // Informationsmängder per roll: de som rollens serverförmågor omfattar.
  // Obligatoriska ingår alltid; valfria enligt systemets val, annars de som
  // nuläget redan har.
  const nuServer = new Set(Object.keys(nulage?.lagen.server?.resurser || {}));
  for (const r of roller.filter((x) => !x.tillval)) {
    const typer = new Set([...stangningAv(r.m, r.formagorNamn)].flatMap((n) => r.m.formagor[n].rest.filter((b) => b.mode === 'server').flatMap((b) => Object.keys(b.resurser))));
    const valda = sys.informationsmangder?.[r.tjanst];
    for (const n of valda || []) {
      if (!(r.m.informationsmangder || []).some((i) => i.nyckel === n)) fel.push(`${n} är ingen informationsmängd i ${r.tjanst}`);
    }
    r.informationsmangder = (r.m.informationsmangder || []).filter((i) => typer.has(i.resurstyp)).map((i) => ({
      nyckel: i.nyckel, namn: i.namn, titel: i.titel, krav: i.krav, resurstyp: i.resurstyp, profil: i.profil,
      spec: specFor(i), egenSpec: `${i.url}|${i.version}`,
      vald: i.krav === 'obligatorisk' || (valda ? valda.includes(i.nyckel) : nuServer.has(i.resurstyp)),
    }));
    const ejValda = r.informationsmangder.filter((i) => !i.vald);
    r.ejValdaTyper = new Set(ejValda.map((i) => i.resurstyp).filter((t) => r.informationsmangder.every((i) => i.resurstyp !== t || !i.vald)));
    r.ejValdaProfiler = new Set(ejValda.map((i) => i.profil));
    r.ejValdaModeller = new Set(ejValda.map((i) => i.nyckel));
  }

  // ---- Förmågor: läge|typ → interaktioner, sökparametrar, profiler, med roller
  const api = new Map();
  const post = (lage, typ) => {
    const k = `${lage}|${typ}`;
    if (!api.has(k)) api.set(k, { lage, typ, roller: new Set(), interaktioner: new Map(), sokparametrar: new Map(), profiler: new Map() });
    return api.get(k);
  };
  for (const r of roller) {
    const egna = new Map(); // läge|typ → profiler för just denna roll
    for (const csNamn of stangningAv(r.m, r.formagorNamn)) {
      for (const blk of r.m.formagor[csNamn].rest) {
        if (!blk.mode) continue;
        if (blk.system.length) {
          const p = post(blk.mode, '*');
          p.roller.add(r.id);
          for (const c of blk.system) add(p.interaktioner, c, r.id);
        }
        for (const [typ, v] of Object.entries(blk.resurser)) {
          if (blk.mode === 'server' && r.ejValdaTyper?.has(typ)) continue;
          const p = post(blk.mode, typ);
          p.roller.add(r.id);
          for (const c of v.interaktioner) add(p.interaktioner, c, r.id);
          for (const s of v.sokparametrar) add(p.sokparametrar, s, r.id);
          for (const pr of v.profiler) {
            const k = `${blk.mode}|${typ}`;
            if (!egna.has(k)) egna.set(k, new Map());
            egna.get(k).set(pr.url, pr);
          }
        }
      }
    }
    // Den mest specifika profilen räcker: en profil som en annan profil i samma
    // post härleds från tas bort (VardkontaktNPO ersätter Vardkontakt).
    for (const [k, prof] of egna) {
      const namn = [...prof.values()].map((x) => x.namn);
      for (const pr of prof.values()) {
        const harBarn = namn.some((n) => (r.m.profiler[n]?.forfader || []).includes(pr.namn));
        if (harBarn) continue;
        const p = api.get(k);
        if (!p.profiler.has(pr.url)) p.profiler.set(pr.url, { ...pr, tjanst: r.tjanst, roller: new Set() });
        p.profiler.get(pr.url).roller.add(r.id);
      }
    }
  }
  const apiUt = [...api.values()].map((p) => {
    const n = nulage?.lagen[p.lage];
    const nr = p.typ === '*' ? n : n?.resurser[p.typ];
    const finns = (set, v) => (nulage ? !!set?.has(v) : null);
    return {
      lage: p.lage, typ: p.typ, roller: [...p.roller],
      typFinns: nulage ? !!nr : null,
      interaktioner: [...p.interaktioner].map(([kod, rs]) => ({ kod, roller: [...rs], finns: finns(p.typ === '*' ? n?.system : nr?.interaktioner, kod) })),
      sokparametrar: [...p.sokparametrar].map(([namn, rs]) => ({ namn, roller: [...rs], finns: finns(nr?.sokparametrar, namn) })),
      profiler: [...p.profiler.values()].map((pr) => ({ namn: pr.namn, url: pr.url, kalla: pr.kalla, tjanst: pr.tjanst, roller: [...pr.roller], finns: finns(nr?.profiler, pr.url) })),
    };
  }).sort((a, b) => a.lage.localeCompare(b.lage) || a.typ.localeCompare(b.typ));
  for (const a of apiUt) a.status = apiStatus(a);

  // ---- Elementkrav, verksamhetskrav och scenariosteg, med roller
  const element = new Map();
  const krav = new Map();
  const scenarier = [];
  for (const r of roller) {
    for (const o of r.kp?.element || []) {
      if (r.ejValdaProfiler?.has(o.profil)) continue;
      const pr = r.m.profiler[o.profil] || { kalla: o.profil, url: o.profil };
      const k = `${pr.kalla}|${o.element}|${o.kod}`;
      if (!element.has(k)) element.set(k, { element: o.element, kod: o.kod, kalla: pr.kalla, profiler: new Map(), roller: new Set(), aktorer: new Set() });
      const e = element.get(k);
      e.profiler.set(pr.url, { namn: o.profil, kalla: pr.kalla, tjanst: r.tjanst });
      e.roller.add(r.id);
      e.aktorer.add(o.aktor);
    }
    // Ett tillvals krav finns i tjänstens kravkatalog.
    const kravlista = r.kp ? r.kp.krav : (r.m.kravkatalog || [])
      .filter((q) => q.aktorer.some((a) => [r.aktor, ...r.forfader].includes(a)))
      .flatMap((q) => q.satser.map((x) => ({ ...x, kalla: q.namn })));
    for (const q of kravlista) {
      const art = r.m.artefakter.find((a) => a.namn === q.kalla);
      const k = `${art?.kopieradFran ? utan(art.kopieradFran) : `${r.tjanst}/${q.kalla}`}|${q.nyckel}`;
      if (!krav.has(k)) krav.set(k, { nyckel: q.nyckel, krav: q.krav, styrka: q.styrka, kalla: q.kalla, roller: new Set() });
      krav.get(k).roller.add(r.id);
    }
    for (const u of r.m.anvandningsfall || []) {
      if (u.typ !== 'anvandningsfall' || u.endastInkluderad) continue;
      // Banor med tillval hör till tillvalsrollen, övriga till grundrollen.
      const banor = u.aktorer.filter((b) => (r.tillval
        ? (b.tillval || []).includes(r.aktor) && b.spelasAv.includes(r.tillvalFor)
        : !(b.tillval || []).length && b.spelasAv.includes(r.aktor))).map((b) => b.nyckel);
      if (!banor.length) continue;
      const steg = [];
      const samla = (lista) => {
        for (const s of lista) {
          // Steg som hämtar en informationsmängd systemet inte valt hoppas över.
          const ejVald = s.modell && r.ejValdaModeller?.has(s.modell) && banor.includes(s.till);
          if (s.typ === 'operation' && !ejVald && (banor.includes(s.fran) || banor.includes(s.till))) {
            steg.push({
              nr: s.nr, titel: s.titel, operation: s.operation, resurstyp: s.resurstyp, profil: s.profil, krav: s.krav,
              sida: s.fran === s.till ? 'själv' : banor.includes(s.fran) ? 'avsändare' : 'mottagare',
            });
          }
          samla((s.alternativ || []).flatMap((a) => a.steg));
        }
      };
      samla(u.steg);
      scenarier.push({ roll: r.id, tjanst: r.tjanst, anvandningsfall: u.namn, titel: u.titel, forutsattning: u.forutsattning, banor, steg });
    }
  }
  const elementUt = [...element.values()].map((e) => ({ ...e, profiler: [...e.profiler].map(([url, p]) => ({ url, ...p })), roller: [...e.roller], aktorer: [...e.aktorer] }));
  const kravUt = [...krav.values()].map((q) => ({ ...q, roller: [...q.roller] }));

  // ---- Anslutningar i T2-katalogerna: medlemskap per federation,
  // anslutningspunkt per vald informationsmängd och engagemangsindexering.
  const katalogKalla = 'katalog' in kallor ? kallor.katalog : readJson(root, sys.nulage?.katalog);
  if (katalogKalla === undefined) fel.push(`Katalogfilen ${sys.nulage.katalog} finns inte`);
  const katalog = katalogKalla ? lasKatalog(katalogKalla) : null;
  const andpunkter = new Set(sys.andpunkter || []);
  const egnaOrg = katalog && orgMedHsa(katalog, org.hsaId);
  const registrerade = katalog ? katalog.andpunkter.filter((e) => andpunkter.has(e.adress)) : [];
  const implementerar = registrerade.flatMap((e) => e.implements);
  const instanser = katalog ? katalog.instanser.filter((c) => andpunkter.has(c.adress)) : [];
  const forvantade = [];
  const harRoll = (r, roll) => [r.aktor, ...r.forfader].includes(roll);
  const medlemskap = new Map(); // federation → roller
  for (const r of roller.filter((x) => !x.tillval && harRoll(x, medlemsroll))) {
    const fed = federationFor(r.m);
    if (fed) (medlemskap.get(fed) || medlemskap.set(fed, []).get(fed)).push(r.id);
  }
  for (const [fed, rs] of medlemskap) {
    const fedRef = federationsOrg(fed, kallor.federationsKarta);
    const aff = katalog && egnaOrg && katalog.medlemskap.find((a) => a.aktiv && a.federation === fedRef && a.medlem === egnaOrg.ref && a.roller.includes('member'));
    for (const roll of rs) {
      forvantade.push({
        typ: 'medlemskap', roll, specifikation: `${fedRef} (${fed})`, federation: fed,
        status: !katalog ? 'okänt' : aff ? 'registrerad' : 'saknas',
        registrerad: aff ? `OrganizationAffiliation/${aff.id}` : null,
        text: !katalog ? null : !org.hsaId ? 'Systemets organisation saknar HSA-id' : !egnaOrg ? `Organisationen ${org.hsaId} finns inte i federationsmedlemskatalogen` : null,
      });
    }
  }
  for (const r of roller.filter((x) => !x.tillval && harRoll(x, registreringsroll))) {
    for (const i of (r.informationsmangder || []).filter((x) => x.vald)) {
      const traff = matcha(implementerar, i.spec);
      const inst = matcha(instanser.flatMap((c) => c.instantiates), i.spec);
      forvantade.push({
        typ: 'anslutningspunkt', roll: r.id, informationsmangd: i.nyckel, specifikation: i.spec,
        status: katalog ? traff.status : 'okänt', registrerad: traff.registrerad,
        apiInstans: inst.status === 'registrerad' ? instanser.find((c) => c.instantiates.includes(inst.registrerad))?.id || null : null,
        text: katalog && traff.status === 'registrerad' && inst.status !== 'registrerad' ? 'Anslutningspunkten finns men tjänsteinstansen saknas' : null,
      });
    }
  }
  for (const r of roller.filter((x) => x.tillval && harRoll(x, 'Engagemangsproducent'))) {
    const indexerad = registrerade.some((e) => e.indexerad);
    const antal = katalog ? katalog.engagemang.filter((e) => e.aktiv && e.hsaId === org.hsaId).length : 0;
    forvantade.push({
      typ: 'engagemangsindexerad', roll: r.id, specifikation: 'Endpoint.extension:engagemangsindexerad = true',
      status: !katalog ? 'okänt' : indexerad ? 'registrerad' : 'saknas',
      registrerad: indexerad ? registrerade.find((e) => e.indexerad).id : null,
      text: katalog ? `${antal} aktiva engagemang för ${org.hsaId || 'organisationen'}` : null,
    });
  }
  const kanda = new Set(forvantade.filter((f) => f.typ === 'anslutningspunkt').map((f) => f.registrerad).filter(Boolean));
  const ovantade = registrerade.flatMap((e) => e.implements.filter((i) => !kanda.has(i)).map((i) => ({ apiInstans: e.id, instantiates: i })));

  // ---- Testlista: summan av krav, deduplicerad över roller
  const testlista = [];
  const lagT = { server: 'Server', client: 'Klient' };
  apiUt.forEach((a, i) => testlista.push({
    id: `API-${i + 1}`, kategori: 'API-förmåga', roller: a.roller, status: a.status,
    text: `${lagT[a.lage] || a.lage}: ${a.typ === '*' ? 'systemnivå' : a.typ} – ${a.interaktioner.map((x) => x.kod).join(', ')}`
      + `${a.sokparametrar.length ? `; sökparametrar ${a.sokparametrar.map((x) => x.namn).join(', ')}` : ''}`
      + `${a.profiler.length ? `; profiler ${profilText(a.profiler)}` : ''}`,
  }));
  const ansText = {
    medlemskap: (f) => `Aktivt medlemskap i federationen ${f.specifikation}`,
    anslutningspunkt: (f) => `Anslutningspunkt i tjänstekatalogen som implementerar ${f.specifikation}, med tjänsteinstans`,
    engagemangsindexerad: () => 'Anslutningspunkten är engagemangsindexerad och engagemangen anmäls',
  };
  forvantade.forEach((f, i) => testlista.push({
    id: `ANS-${i + 1}`, kategori: 'Anslutning', roller: [f.roll], status: f.status === 'registrerad' ? 'ok' : f.status === 'okänt' ? 'okänt' : f.status === 'annan version' ? 'delvis' : 'saknas',
    text: ansText[f.typ](f),
  }));
  elementUt.forEach((e, i) => testlista.push({
    id: `ELM-${i + 1}`, kategori: 'Elementkrav', roller: e.roller, status: 'manuell',
    text: `${e.kod} ${e.element} i ${profilText(e.profiler)}`,
  }));
  kravUt.forEach((q, i) => testlista.push({
    id: `KRV-${i + 1}`, kategori: 'Verksamhetskrav', roller: q.roller, status: 'manuell', text: `${q.nyckel}: ${q.krav}`,
  }));
  scenarier.forEach((s, i) => testlista.push({
    id: `SCN-${i + 1}`, kategori: 'Scenario', roller: [s.roll], status: 'manuell',
    text: `${s.titel}: steg ${s.steg.map((x) => `${x.nr} (${x.sida})`).join(', ')}`,
  }));

  const rakna = (lista, f) => lista.filter(f).length;
  return {
    system: sys.system, titel: sys.titel || sys.system, organisation: org, fil: sys.fil,
    andpunkter: sys.andpunkter || [],
    roller: roller.map(({ m, kp, ejValdaTyper, ejValdaProfiler, ejValdaModeller, ...r }) => r),
    nulage: { finns: !!nulage, fil: sys.nulage?.formaga || null, software: nulage?.software || null, instantiates: nulage?.instantiates || [] },
    api: apiUt, element: elementUt, krav: kravUt, scenarier,
    anslutningar: { forvantade, registrerade, ovantade, finns: !!katalog, organisation: egnaOrg?.ref || null },
    testlista,
    sammanfattning: {
      roller: roller.length,
      apiOk: rakna(apiUt, (a) => a.status === 'ok'),
      apiGap: rakna(apiUt, (a) => a.status === 'delvis' || a.status === 'saknas'),
      apiOkant: rakna(apiUt, (a) => a.status === 'okänt'),
      anslutningarOk: rakna(forvantade, (f) => f.status === 'registrerad'),
      anslutningarGap: rakna(forvantade, (f) => f.status !== 'registrerad'),
      tester: testlista.length,
    },
    fel,
  };
}

export function renderReport(a) {
  const out = [`# ${a.titel}`, '', `${a.organisation.namn || ''}${a.organisation.hsaId ? ` (${a.organisation.hsaId})` : ''} · roller: ${a.roller.map((r) => `${r.titel}${r.tillval ? ' [tillval]' : ''} (${r.tjanstTitel})`).join(', ')}`, ''];
  const s = a.sammanfattning;
  out.push(`API-förmåga: ${s.apiOk} ok, ${s.apiGap} med gap, ${s.apiOkant} okända · anslutningar: ${s.anslutningarOk} registrerade, ${s.anslutningarGap} med gap · ${s.tester} tester`, '');
  if (a.fel.length) out.push('## Fel', '', ...a.fel.map((f) => `- ${f}`), '');
  out.push('## Gap i API-förmåga', '');
  const gap = a.api.filter((x) => x.status === 'delvis' || x.status === 'saknas');
  if (!a.nulage.finns) out.push('Inget nuläge inlämnat (CapabilityStatement kind=instance).', '');
  else if (!gap.length) out.push('Inga.', '');
  for (const x of gap) {
    const saknas = [
      ...x.interaktioner.filter((d) => !d.finns).map((d) => d.kod),
      ...x.sokparametrar.filter((d) => !d.finns).map((d) => `sök ${d.namn}`),
      ...x.profiler.filter((d) => !d.finns).map((d) => `profil ${d.url}`),
    ];
    out.push(`- **${x.lage} ${x.typ}** (${x.status}): saknar ${x.typFinns ? saknas.join(', ') : 'resurstypen'}`);
  }
  out.push('', '## Informationsmängder', '', '| Roll | Informationsmängd | Krav | Vald | Specifikation |', '|---|---|---|---|---|');
  for (const r of a.roller.filter((x) => x.informationsmangder)) {
    for (const i of r.informationsmangder) out.push(`| ${r.id} | ${i.titel} | ${i.krav} | ${i.vald ? 'ja' : 'nej'} | \`${i.spec}\` |`);
  }
  out.push('', '## Anslutningar i T2-katalogerna', '', '| Roll | Typ | Förväntat | Status | Registrerad |', '|---|---|---|---|---|');
  for (const f of a.anslutningar.forvantade) out.push(`| ${f.roll} | ${f.typ} | \`${f.specifikation}\` | ${f.status}${f.text ? ` – ${f.text}` : ''} | ${f.registrerad ? `\`${f.registrerad}\`` : '–'} |`);
  for (const o of a.anslutningar.ovantade) out.push(`| – | \`${o.instantiates}\` | registrerad utan roll | ${o.apiInstans} |`);
  out.push('', '## Testlista', '', '| Id | Kategori | Test | Status | Krävs av |', '|---|---|---|---|---|');
  for (const t of a.testlista) out.push(`| ${t.id} | ${t.kategori} | ${t.text.replace(/\|/g, '\\|')} | ${t.status} | ${t.roller.join(', ')} |`);
  return out.join('\n') + '\n';
}
