// Systemregistret utöver systemen själva: produkter, organisationer och
// producenternas registreringar i testmiljöns T2-kataloger.
//
//   Produkt       system/produkter/<id>.yaml   { produkt, titel, leverantor,
//                 foljer, foljsamhet, godkannanden }
//                 Det som installeras, t.ex. ett journalsystem. Motsvarar
//                 CapabilityStatement.software. En produkt utlovar inte
//                 följsamhet till Ineras IG:ar utan anger de standarder den
//                 följer (svenska basprofiler, tillitsinfrastrukturens
//                 profiler, europeiska profiler). Följsamheten till en
//                 tjänsteroll bor antingen i en referensimplementation hos
//                 leverantören (testbar adress, passar SaaS och moln) eller i
//                 registret här, med testrapport. Leverantören ansöker om
//                 produktgodkännande per roll; instanserna hos kunderna anger
//                 tjänstens IG i sina CapabilityStatement.
//   Systeminstans system/<namn>.yaml            { system, produkt, organisation, … }
//                 En installation hos en organisation. Motsvarar
//                 CapabilityStatement.implementation.
//   Organisation  Organization i federationsmedlemskatalogen.
//
// Testmiljöns kataloger är katalogfilen som den mockade federationen laddar
// (systemens nulage.katalog, normalt system/nulage/t2-katalog.json). Där
// registrerar studion åt producenten i test: anslutningspunkt (Endpoint) per
// adress med de specifikationer den implementerar, tjänsteinstans
// (CapabilityStatement kind=instance), organisationen och medlemskapet i
// tjänstens federation. I drift gör producenten det själv via katalogens API,
// med scopen rollen har (Endpoint.cu, CapabilityStatement.cu).

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { t2 } from './federation.mjs';
import { lasKatalog, specFor, federationFor, federationsOrg, HSA } from './t2.mjs';
import { serverformagor } from './behorighet.mjs';
import { aktorKedja } from './system.mjs';

export const STANDARDKATALOG = 'nulage/t2-katalog.json';
export const HSA_ID = /^SE\d{10}-[A-Za-z0-9]+$/;
const PRODUKTID = /^[a-z0-9][a-z0-9-]*$/;
const BAS = {
  Organization: 'https://t2.inera.se/fed-katalog/', OrganizationAffiliation: 'https://t2.inera.se/fed-katalog/',
  Endpoint: 'https://t2.inera.se/tjanstekatalog/', CapabilityStatement: 'https://t2.inera.se/tjanstekatalog/',
};
export const kebab = (s) => String(s).replace(/([a-zåäö0-9])([A-ZÅÄÖ])/g, '$1-$2').toLowerCase()
  .replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- produkter

export function loadProdukter(root) {
  const dir = path.join(root, 'system', 'produkter');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()
    .map((f) => ({ ...YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8')), fil: path.join('system', 'produkter', f) }));
}

export const KALLOR = ['referensimplementation', 'register'];
export const PRODUKT_KEDJA = ['ansokt', 'godkand'];

export function skrivProdukt(root, id, { titel, leverantor, foljer, foljsamhet }) {
  if (!PRODUKTID.test(id || '')) throw new Error(`Ogiltigt produkt-id ${id} (gemener, siffror och bindestreck)`);
  if (!titel) throw new Error('Produkten behöver ett namn');
  const dir = path.join(root, 'system', 'produkter');
  fs.mkdirSync(dir, { recursive: true });
  const fil = path.join(dir, `${id}.yaml`);
  const doc = fs.existsSync(fil) ? YAML.parseDocument(fs.readFileSync(fil, 'utf8')) : new YAML.Document({ produkt: id });
  if (!fs.existsSync(fil)) doc.commentBefore = ' Produkt: det som installeras hos en eller flera organisationer (CapabilityStatement.software).';
  doc.set('titel', titel);
  if (leverantor) doc.set('leverantor', leverantor);
  else doc.delete('leverantor');
  if (foljer !== undefined) {
    const lista = (foljer || []).filter((f) => f?.titel).map((f) => ({ titel: f.titel, ...(f.paket ? { paket: f.paket } : {}) }));
    if (lista.length) {
      const nod = doc.createNode(lista);
      for (const x of nod.items) x.flow = true;
      doc.set('foljer', nod);
    } else doc.delete('foljer');
  }
  if (foljsamhet !== undefined) {
    if (foljsamhet?.kalla) {
      if (!KALLOR.includes(foljsamhet.kalla)) throw new Error(`Okänd källa ${foljsamhet.kalla} (${KALLOR.join(', ')})`);
      if (foljsamhet.kalla === 'referensimplementation' && !/^https?:\/\/\S+$/.test(foljsamhet.adress || '')) throw new Error('Referensimplementationen behöver en http(s)-adress');
      doc.set('foljsamhet', { kalla: foljsamhet.kalla, ...(foljsamhet.kalla === 'referensimplementation' ? { adress: foljsamhet.adress } : {}) });
    } else doc.delete('foljsamhet');
  }
  fs.writeFileSync(fil, doc.toString({ lineWidth: 0 }));
  return path.relative(root, fil);
}

// Produktgodkännande för en roll: ansökt → godkänd, eller återkallad.
// Ansökan kräver att följsamheten har en källa: referensimplementationens
// adress, eller i registret en testrapport. Godkännandet kräver ett beslut.
export function overgaProdukt(produkt, mal, ny, { av = 'okänd', datum = new Date().toISOString().slice(0, 10), bevis = [], root = null } = {}) {
  if (ny !== 'aterkallad' && !PRODUKT_KEDJA.includes(ny)) throw new Error(`${ny} är ingen status för produktgodkännande (${PRODUKT_KEDJA.join(' → ')})`);
  const lista = (produkt.godkannanden || []).map((g) => ({ ...g }));
  const i = lista.findIndex((g) => g.tjanst === mal.tjanst && g.aktor === mal.aktor);
  const nu = i >= 0 ? lista[i] : null;
  for (const b of bevis) if (b.fil && root && !fs.existsSync(path.join(root, b.fil))) throw new Error(`Bevisfilen ${b.fil} finns inte`);
  const allaBevis = [...(nu?.bevis || []), ...bevis.map((b) => ({ ...b, datum: b.datum || datum }))];
  if (ny === 'ansokt') {
    if (nu && nu.status !== 'aterkallad') throw new Error(`Det finns redan ett produktgodkännande (${nu.status}) för ${mal.aktor}`);
    const k = produkt.foljsamhet?.kalla;
    if (!k) throw new Error('Ange var följsamheten bor (referensimplementation eller register) innan ansökan');
    if (k === 'referensimplementation' && !produkt.foljsamhet.adress) throw new Error('Referensimplementationen saknar adress');
    if (k === 'register' && !allaBevis.some((b) => b.typ === 'testrapport')) throw new Error('Följsamhet i registret kräver en testrapport');
  }
  if (ny === 'godkand') {
    if (nu?.status !== 'ansokt') throw new Error('Bara en ansökan kan godkännas');
    if (!allaBevis.some((b) => b.typ === 'beslut')) throw new Error('Godkännandet kräver ett beslut');
  }
  if (ny === 'aterkallad' && !nu) throw new Error('Det finns inget godkännande att återkalla');
  const post = {
    tjanst: mal.tjanst, aktor: mal.aktor, status: ny,
    historik: [...(ny === 'ansokt' ? [] : nu?.historik || []), { status: ny, datum, av }],
    ...(allaBevis.length ? { bevis: ny === 'ansokt' && nu ? bevis.map((b) => ({ ...b, datum: b.datum || datum })) : allaBevis } : {}),
  };
  if (i >= 0) lista[i] = post;
  else lista.push(post);
  return lista;
}

export function skrivProduktGodkannande(root, id, b, { studiomiljo = null, datum } = {}) {
  if (studiomiljo === 'test' && b.status !== 'ansokt') throw new Error('I testmiljöläget kan leverantören bara ansöka om produktgodkännande');
  const fil = path.join(root, 'system', 'produkter', `${id}.yaml`);
  if (!PRODUKTID.test(id || '') || !fs.existsSync(fil)) throw new Error(`Produkten ${id} finns inte`);
  const doc = YAML.parseDocument(fs.readFileSync(fil, 'utf8'));
  const lista = overgaProdukt(doc.toJS(), { tjanst: b.tjanst, aktor: b.aktor }, b.status, { av: b.av || 'studio', datum, bevis: (b.bevis || []).filter((x) => x?.typ), root });
  const nod = doc.createNode(lista);
  for (const post of nod.items) for (const k of ['historik', 'bevis']) for (const x of post.get(k, true)?.items || []) x.flow = true;
  doc.set('godkannanden', nod);
  fs.writeFileSync(fil, doc.toString({ lineWidth: 0 }));
  return path.relative(root, fil);
}

// ---- katalogen

export const katalogFil = (root, rel = STANDARDKATALOG) => path.join(root, 'system', rel);

function lasBundle(root, rel) {
  const fil = katalogFil(root, rel);
  return fs.existsSync(fil) ? JSON.parse(fs.readFileSync(fil, 'utf8'))
    : { resourceType: 'Bundle', id: 't2-katalog', type: 'collection', timestamp: new Date().toISOString(), entry: [] };
}
function skrivBundle(root, rel, b) {
  const fil = katalogFil(root, rel);
  fs.mkdirSync(path.dirname(fil), { recursive: true });
  b.timestamp = new Date().toISOString();
  fs.writeFileSync(fil, JSON.stringify(b, null, 2) + '\n');
  return path.relative(root, fil);
}
const unikt = (b, typ, onskat) => {
  const finns = (id) => b.entry.some((e) => e.resource.resourceType === typ && e.resource.id === id);
  let id = onskat;
  for (let i = 2; finns(id); i++) id = `${onskat}-${i}`;
  return id;
};
const medId = (r, id) => ({ resourceType: r.resourceType, id, ...r });
const lagg = (b, r) => {
  const i = b.entry.findIndex((e) => e.resource.resourceType === r.resourceType && e.resource.id === r.id);
  const post = { fullUrl: `${BAS[r.resourceType] || 'urn:'}${r.resourceType}/${r.id}`, resource: r };
  if (i >= 0) b.entry[i] = post;
  else b.entry.push(post);
};

// Organisationerna i katalogen (de med HSA-id).
export function organisationer(root, rel = STANDARDKATALOG) {
  return lasKatalog(lasBundle(root, rel)).organisationer.filter((o) => o.hsaId && o.aktiv)
    .map((o) => ({ namn: o.namn, hsaId: o.hsaId, ref: o.ref })).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
}

// Lägger till organisationen om den saknas; ändringar i bundlen b.
function sakraOrganisation(b, { namn, hsaId }) {
  if (!HSA_ID.test(hsaId || '')) throw new Error(`Ogiltigt HSA-id ${hsaId || '(tomt)'}, t.ex. SE2321000099-EXMP`);
  const finns = b.entry.map((e) => e.resource).find((r) => r.resourceType === 'Organization' && (r.identifier || []).some((i) => i.value === hsaId));
  if (finns) return { ref: `Organization/${finns.id}`, ny: null };
  if (!namn) throw new Error('Organisationen behöver ett namn');
  const r = t2.organisation(unikt(b, 'Organization', kebab(namn) || 'organisation'), namn, hsaId);
  lagg(b, r);
  return { ref: `Organization/${r.id}`, ny: r };
}

export function registreraOrganisation(root, org, rel = STANDARDKATALOG) {
  const b = lasBundle(root, rel);
  const r = sakraOrganisation(b, org);
  if (!r.ny) throw new Error(`Organisationen ${org.hsaId} finns redan i katalogen`);
  return skrivBundle(root, rel, b);
}

// ---- producenter

// Informationsmängderna en producentroll tillhandahåller: de vars resurstyp
// rollens serverförmågor omfattar.
export function producentMangder(m, aktor) {
  const typer = serverformagor(m, aktor);
  return (m.informationsmangder || []).filter((i) => typer.has(i.resurstyp));
}
export const arProducentroll = (m, aktor) => producentMangder(m, aktor).length > 0;

// Vad en registrering i testmiljöns kataloger innebär, utan att skriva:
// resurserna som skapas eller uppdateras. roller: [{ tjanst, aktor,
// informationsmangder }]; valfria informationsmängder väljs, obligatoriska
// ingår alltid.
export function producentRegistrering(b, { system, titel, organisation, adress, roller }, manifests, { medlemsroll = 'Federationsmedlem' } = {}) {
  if (!/^https?:\/\/[^\s]+$/.test(adress || '')) throw new Error('Anropsadressen ska vara en http(s)-adress');
  const kopia = structuredClone(b);
  const andringar = [];
  const org = sakraOrganisation(kopia, organisation || {});
  if (org.ny) andringar.push({ atgard: 'skapa', resurs: org.ny });
  const specs = [];
  const federationer = new Set();
  for (const r of roller) {
    const m = manifests[r.tjanst];
    if (!m) throw new Error(`${r.tjanst} finns inte`);
    if (!arProducentroll(m, r.aktor)) throw new Error(`${r.aktor} är ingen producentroll i ${r.tjanst}`);
    const mangder = producentMangder(m, r.aktor);
    for (const n of r.informationsmangder || []) if (!mangder.some((i) => i.nyckel === n)) throw new Error(`${n} är ingen informationsmängd för ${r.aktor}`);
    const valda = mangder.filter((i) => i.krav === 'obligatorisk' || (r.informationsmangder || []).includes(i.nyckel));
    if (!valda.length) throw new Error(`Välj minst en informationsmängd för ${r.aktor}`);
    specs.push(...valda.map(specFor));
    if (aktorKedja(m, r.aktor).includes(medlemsroll)) {
      const fed = federationFor(m);
      if (fed) federationer.add(federationsOrg(fed));
    }
  }
  // Medlemskap i tjänsternas federationer.
  for (const fedRef of federationer) {
    const finns = kopia.entry.map((e) => e.resource).find((r) => r.resourceType === 'OrganizationAffiliation' && r.active !== false
      && r.organization?.reference === fedRef && r.participatingOrganization?.reference === org.ref
      && (r.code || []).some((c) => (c.coding || []).some((x) => x.code === 'member')));
    if (finns) continue;
    const aff = medId(t2.medlemskap(fedRef, org.ref), unikt(kopia, 'OrganizationAffiliation', `aff-${fedRef.split('/')[1].replace(/^fed-/, '')}-${org.ref.split('/')[1]}`));
    lagg(kopia, aff);
    andringar.push({ atgard: 'skapa', resurs: aff });
  }
  // Anslutningspunkt och tjänsteinstans per adress; befintliga utökas.
  const resurs = (typ, f) => kopia.entry.map((e) => e.resource).find((r) => r.resourceType === typ && f(r));
  const ep = resurs('Endpoint', (r) => r.address === adress);
  const unika = [...new Set(specs)];
  if (ep) {
    const har = new Set((ep.extension || []).filter((x) => x.url.endsWith('/implements')).map((x) => x.valueCanonical));
    const nya = unika.filter((s) => !har.has(s));
    if (nya.length) {
      const ut = structuredClone(ep);
      ut.extension = [...(ut.extension || []), ...nya.map((s) => ({ url: 'https://fhir.inera.se/ig/katalogtjanster/StructureDefinition/implements', valueCanonical: s }))];
      lagg(kopia, ut);
      andringar.push({ atgard: 'uppdatera', resurs: ut, nya });
    }
  } else {
    const ny = medId(t2.andpunkt(titel || system, adress, org.ref, unika, false), unikt(kopia, 'Endpoint', `ep-${kebab(system)}`));
    lagg(kopia, ny);
    andringar.push({ atgard: 'skapa', resurs: ny });
  }
  const cs = resurs('CapabilityStatement', (r) => r.kind === 'instance' && r.implementation?.url === adress);
  if (cs) {
    const nya = unika.filter((s) => !(cs.instantiates || []).includes(s));
    if (nya.length) {
      const ut = { ...structuredClone(cs), instantiates: [...(cs.instantiates || []), ...nya] };
      lagg(kopia, ut);
      andringar.push({ atgard: 'uppdatera', resurs: ut, nya });
    }
  } else {
    const epId = resurs('Endpoint', (r) => r.address === adress).id;
    const ny = medId(t2.instans(titel || system, adress, org.ref, unika), unikt(kopia, 'CapabilityStatement', `cs-${epId}`));
    lagg(kopia, ny);
    andringar.push({ atgard: 'skapa', resurs: ny });
  }
  return { bundle: kopia, andringar, specifikationer: unika, organisation: org.ref };
}

export function registreraProducent(root, begaran, manifests, rel = STANDARDKATALOG, opt = {}) {
  const r = producentRegistrering(lasBundle(root, rel), begaran, manifests, opt);
  return { fil: skrivBundle(root, rel, r.bundle), ...r };
}
export function forhandsgranskaProducent(root, begaran, manifests, rel = STANDARDKATALOG, opt = {}) {
  const { bundle, ...r } = producentRegistrering(lasBundle(root, rel), begaran, manifests, opt);
  return r;
}

// Ändra vägval: anslutningspunkterna och tjänsteinstanserna på den gamla
// adressen får den nya.
export function bytAdress(root, fran, till, rel = STANDARDKATALOG) {
  if (!/^https?:\/\/[^\s]+$/.test(till || '')) throw new Error('Den nya adressen ska vara en http(s)-adress');
  const b = lasBundle(root, rel);
  let antal = 0;
  for (const e of b.entry) {
    const r = e.resource;
    if (r.resourceType === 'Endpoint' && r.address === fran) { r.address = till; antal++; }
    if (r.resourceType === 'CapabilityStatement' && r.implementation?.url === fran) { r.implementation.url = till; antal++; }
  }
  if (!antal) throw new Error(`Ingen anslutningspunkt har adressen ${fran}`);
  return { fil: skrivBundle(root, rel, b), antal };
}

export const _test = { lasBundle, HSA };
