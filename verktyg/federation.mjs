// Testkörning av användningsfallen mot en federation, i två lägen:
//
//   mock      en mockad federation byggd ur de komponerade IG:arna och
//             systemregistret (byggFederation). Förutsättningarna skriver till
//             katalogerna, som en riktig anslutning gör.
//   infopeak  läsadaptern mot en verklig realisering av T2 (se infopeak.mjs).
//             Förutsättningarna verifieras i stället för att skrivas.
//
// Båda lägena beskrivs av en miljö:
//   { namn, titel, bas, skriv, stod: Map(aktör → url), adress(url) → url,
//     katalogHeaders() → headers, intyg(url) → token, federationsKarta,
//     testpatient: { system, varde }, systemUrl(sys) → url }
//
// Mockade ändpunkter:
//   /stod/<Aktör>                 stödtjänster (tjänstekatalog, medlemskatalog,
//                                 engagemangsindex, åtkomstintyg, …) med förmågor
//                                 enligt sina CapabilityStatements
//   /referens/<tjänst>/<Aktör>    referensimplementation per källsystemsroll: kan
//                                 summan av rollens krav, data = tjänstens exempel
//   /system/<System>              varje system i system/*.yaml: kan exakt det dess
//                                 nuläge (CapabilityStatement kind=instance) säger
//
// Testköraren går igenom stegen som en konsument enligt T2: tjänstesökning (T1)
// på informationsmängdens specifikation, medlemsverifiering (F1),
// åtkomstintyg och engagemangsindex, och anropar sedan de producenter som
// återstår.

import fs from 'node:fs';
import path from 'node:path';
import { MockFederation, fhir } from './mock.mjs';
import { analyseSystem } from './system.mjs';
import {
  KATALOG_EXT, HSA, PERSONNUMMER, lasKatalog, specFor, federationsOrg, federationFor, matcha, utanVersion,
} from './t2.mjs';

const DEFINITIONER = new Set([
  'StructureDefinition', 'ValueSet', 'CodeSystem', 'CapabilityStatement', 'ActorDefinition', 'Requirements',
  'ExampleScenario', 'PlanDefinition', 'ActivityDefinition', 'ImplementationGuide', 'SearchParameter', 'OperationDefinition', 'ConceptMap',
]);
const RESURS_OPS = new Set(['read', 'search-type', 'create', 'update']);
const SYSTEM_OPS = new Set(['search-system']);
const STOD = {
  katalog: 'Tjanstekatalog', medlemskatalog: 'Federationsmedlemskatalog', index: 'Engagemangsindex', intyg: 'Atkomstintygstjanst',
};
const KATALOGRESURSER = {
  Endpoint: STOD.katalog, CapabilityStatement: STOD.katalog,
  Organization: STOD.medlemskatalog, OrganizationAffiliation: STOD.medlemskatalog,
  EpisodeOfCare: STOD.index,
};

// IG:ns exempel (instanser som inte är definitioner) från SUSHI:s utdata.
export function exempel(ig) {
  const dir = path.join(ig.dir, 'fsh-generated', 'resources');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter((r) => !DEFINITIONER.has(r.resourceType));
}

const stangning = (m, namn, seen = new Set()) => {
  if (!namn || seen.has(namn) || !m.formagor[namn]) return seen;
  seen.add(namn);
  for (const i of m.formagor[namn].imports) stangning(m, i, seen);
  return seen;
};

// CapabilityStatement (kind=instance) som kan summan av server-kraven i en
// förmåga och allt den importerar.
function instansCs(m, csNamn, titel, url) {
  const resurser = new Map();
  const system = new Set();
  for (const n of stangning(m, csNamn)) {
    for (const blk of m.formagor[n].rest.filter((b) => b.mode === 'server')) {
      for (const c of blk.system) system.add(c);
      for (const [typ, v] of Object.entries(blk.resurser)) {
        const r = resurser.get(typ) || { interaktioner: new Set(), sokparametrar: new Set(), profiler: new Set() };
        v.interaktioner.forEach((x) => r.interaktioner.add(x));
        v.sokparametrar.forEach((x) => r.sokparametrar.add(x));
        v.profiler.forEach((p) => r.profiler.add(p.url));
        resurser.set(typ, r);
      }
    }
  }
  return {
    resourceType: 'CapabilityStatement', status: 'active', date: new Date().toISOString().slice(0, 10), kind: 'instance',
    software: { name: titel }, implementation: { description: titel, url },
    fhirVersion: '5.0.0', format: ['json'],
    rest: [{
      mode: 'server',
      interaction: [...system].map((code) => ({ code })),
      resource: [...resurser].map(([type, r]) => ({
        type,
        interaction: [...r.interaktioner].map((code) => ({ code })),
        searchParam: [...r.sokparametrar].map((name) => ({ name, type: 'token' })),
        supportedProfile: [...r.profiler],
      })),
    }],
  };
}

const servertyper = (cs) => new Set((cs?.rest || []).filter((r) => r.mode === 'server').flatMap((r) => (r.resource || []).map((x) => x.type)));
const idag = () => new Date().toISOString().slice(0, 10);

// Resurser för T2-katalogerna.
export const t2 = {
  organisation: (id, namn, hsaId) => ({
    resourceType: 'Organization', ...(id ? { id } : {}), meta: { profile: [`${KATALOG_EXT}katalog-organisation`] }, active: true, name: namn,
    ...(hsaId ? { identifier: [{ system: HSA, value: hsaId }] } : {}),
  }),
  medlemskap: (fedRef, orgRef) => ({
    resourceType: 'OrganizationAffiliation', meta: { profile: [`${KATALOG_EXT}katalog-medlemskap`] },
    extension: [{ url: `${KATALOG_EXT}tillitsniva`, valueCode: 'loa3' }],
    active: true, period: { start: idag() }, organization: { reference: fedRef }, participatingOrganization: { reference: orgRef },
    code: [{ coding: [{ system: 'https://fhir.inera.se/ig/katalogtjanster/CodeSystem/federationsroller', code: 'member' }] }],
  }),
  andpunkt: (namn, adress, orgRef, specs, indexerad) => ({
    resourceType: 'Endpoint', meta: { profile: [`${KATALOG_EXT}katalog-anslutningspunkt`] },
    extension: [
      ...(indexerad ? [{ url: `${KATALOG_EXT}engagemangsindexerad`, valueBoolean: true }] : []),
      ...specs.map((s) => ({ url: `${KATALOG_EXT}implements`, valueCanonical: s })),
    ],
    status: 'active', name: namn,
    connectionType: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/endpoint-connection-type', code: 'hl7-fhir-rest' }] }],
    managingOrganization: { reference: orgRef }, address: adress,
  }),
  instans: (namn, adress, orgRef, specs) => ({
    resourceType: 'CapabilityStatement', meta: { profile: [`${KATALOG_EXT}katalog-tjansteinstans`] },
    status: 'active', date: idag(), kind: 'instance', instantiates: specs, fhirVersion: '5.0.0', format: ['json'],
    implementation: { description: namn, url: adress, custodian: { reference: orgRef } },
  }),
  engagemang: (patient, hsaId) => ({
    resourceType: 'EpisodeOfCare', meta: { profile: [`${KATALOG_EXT}engagemang-minimal`] }, status: 'active',
    patient: { identifier: patient }, managingOrganization: { identifier: { system: HSA, value: hsaId } },
  }),
};

// ------------------------------------------------------------------ mockad federation

export async function byggFederation({ ws, manifests, systems, root, port = 0 }) {
  const mock = new MockFederation();
  await mock.starta(port);
  const tjanster = Object.values(manifests).filter((m) => m.ig.roll === 'tjanst');
  const plats = { stod: new Map(), referens: new Map(), system: new Map(), adresser: new Map() };

  // Stödtjänster: en mock per stödtjänstaktör, gemensam för alla tjänster.
  for (const m of tjanster) {
    for (const [namn, a] of Object.entries(m.aktorer)) {
      if (!a.stodtjanst || plats.stod.has(namn)) continue;
      const sokvag = `/stod/${namn}`;
      mock.laggTill(sokvag, instansCs(m, a.formagor, `Mock: ${a.titel}`, `${mock.bas}${sokvag}`), [], { utfardare: namn === STOD.intyg });
      plats.stod.set(namn, mock.url(sokvag));
    }
  }
  const stodAndpunkt = (aktor) => (plats.stod.has(aktor) ? mock.andpunkter.get(new URL(plats.stod.get(aktor)).pathname) : null);
  const seeda = (r) => {
    const a = stodAndpunkt(KATALOGRESURSER[r.resourceType]);
    if (a) mock.spara(a, r);
  };

  // Referensimplementationer per källsystemsroll (tjänsteaktör med server-krav).
  // De är medlemmar och registrerade för alla tjänstens informationsmängder,
  // utan engagemangsindexering (anropas alltid).
  seeda(t2.organisation('referens', 'Referensimplementationer (mock)', 'SE0000000000-REF'));
  const fedRefs = new Set();
  for (const m of tjanster) {
    const data = exempel(ws.get(m.ig.id));
    const fed = federationFor(m);
    for (const kp of m.kravprofiler) {
      const url = mock.url(`/referens/${m.ig.id.split('.').pop()}/${kp.aktor}`);
      const cs = instansCs(m, kp.formagor, `Referensimplementation: ${kp.aktorTitel}`, url);
      if (!cs.rest[0].resource.length) continue;
      const typer = servertyper(cs);
      mock.laggTill(new URL(url).pathname, cs, data.filter((r) => typer.has(r.resourceType)), { skyddad: true });
      const specs = (m.informationsmangder || []).filter((i) => typer.has(i.resurstyp)).map(specFor);
      plats.referens.set(`${m.ig.id}#${kp.aktor}`, { url, specs, titel: kp.aktorTitel });
      seeda(t2.andpunkt(`Referensimplementation: ${kp.aktorTitel}`, url, 'Organization/referens', specs, false));
      seeda(t2.instans(`Referensimplementation: ${kp.aktorTitel}`, url, 'Organization/referens', specs));
    }
    if (fed && !fedRefs.has(fed)) {
      fedRefs.add(fed);
      seeda(t2.medlemskap(federationsOrg(fed), 'Organization/referens'));
    }
  }

  // Systemen: kan exakt det deras nuläge säger. Data = exemplen från de tjänster
  // där systemet har en roll, för de resurstyper det själv säger att det har.
  for (const sys of systems) {
    const sokvag = `/system/${sys.system}`;
    const url = mock.url(sokvag);
    const fil = sys.nulage?.formaga && path.join(root, 'system', sys.nulage.formaga);
    const cs = fil && fs.existsSync(fil) ? JSON.parse(fs.readFileSync(fil, 'utf8')) : null;
    if (cs) cs.implementation = { ...(cs.implementation || {}), url };
    const typer = servertyper(cs);
    const data = [...new Set((sys.roller || []).map((r) => r.tjanst))].flatMap((t) => (ws.get(t) ? exempel(ws.get(t)) : []));
    mock.laggTill(sokvag, cs, data.filter((r) => typer.has(r.resourceType)), { skyddad: true });
    plats.system.set(sys.system, url);
    for (const a of sys.andpunkter || []) plats.adresser.set(a, url);
  }

  // T2-katalogerna: systemens nuläge (adresser till mocken) och
  // federationernas organisationer.
  const filer = [...new Set(systems.map((s) => s.nulage?.katalog).filter(Boolean))];
  for (const f of filer) {
    const fil = path.join(root, 'system', f);
    if (!fs.existsSync(fil)) continue;
    for (const e of JSON.parse(fs.readFileSync(fil, 'utf8')).entry || []) {
      const r = structuredClone(e.resource);
      if (r.address && plats.adresser.has(r.address)) r.address = plats.adresser.get(r.address);
      if (r.implementation?.url && plats.adresser.has(r.implementation.url)) r.implementation.url = plats.adresser.get(r.implementation.url);
      seeda(r);
    }
  }
  const fmk = stodAndpunkt(STOD.medlemskatalog);
  for (const fed of new Set(tjanster.map(federationFor).filter(Boolean))) {
    const id = federationsOrg(fed).split('/')[1];
    if (fmk && !fmk.resurser.get('Organization')?.has(id)) {
      const titel = manifests[fed]?.ig.titel?.replace(/^Federation: /, '') || fed;
      seeda({ resourceType: 'Organization', id, active: true, name: titel, type: [{ text: 'Informationsfederation' }] });
    }
  }

  const miljo = {
    namn: 'mock', titel: 'Mockad federation', bas: mock.bas, skriv: true,
    stod: plats.stod,
    adress: (a) => a,
    katalogHeaders: async () => ({}),
    intyg: async (url) => (await fhir(`${url}/token`, { metod: 'POST' })).json?.access_token || null,
    federationsKarta: {},
    testpatient: { system: PERSONNUMMER, varde: '191212121212' },
    systemUrl: (sys) => plats.system.get(sys.system),
  };
  return { mock, plats, miljo };
}

// ------------------------------------------------------------------ katalogerna live

export async function hamtaKatalog(miljo) {
  const headers = await miljo.katalogHeaders();
  const ut = [];
  for (const [typ, aktor] of Object.entries(KATALOGRESURSER)) {
    const bas = miljo.stod.get(aktor);
    if (!bas) continue;
    const svar = await fhir(`${bas}/${typ}?_count=500`, { headers });
    if (svar.json?.resourceType === 'Bundle') ut.push(svar.json);
  }
  return ut;
}

async function liveAnalys(miljo, systems, manifests, root, regler) {
  const katalog = await hamtaKatalog(miljo);
  const headers = await miljo.katalogHeaders();
  const ut = [];
  for (const sys of systems) {
    const url = miljo.systemUrl(sys);
    const meta = url ? await fhir(`${url}/metadata`, { headers }) : { status: 0 };
    const cs = meta.status === 200 && meta.json?.resourceType === 'CapabilityStatement' ? meta.json : null;
    const andpunkter = miljo.namn === 'mock' ? [url] : sys.andpunkter;
    const a = analyseSystem({ ...sys, andpunkter }, manifests, root, regler, {
      nulageCs: cs, katalog, federationsKarta: miljo.federationsKarta,
    });
    ut.push({ system: sys.system, sammanfattning: a.sammanfattning, anslutningar: a.anslutningar.forvantade, api: a.api, analys: a, cs });
  }
  return ut;
}

// ------------------------------------------------------------------ testkörning

const VARDEN = { patient: 'Patient/exempel', subject: 'Patient/exempel', date: 'ge2026-01-01', category: 'laboratory', target: 'Encounter/exempel' };

// Sökparametrar som mottagarrollen ska stödja för resurstypen (summan i tjänsten).
function sokparametrar(m, roller, typ) {
  const ut = new Set();
  for (const r of roller) {
    for (const n of stangning(m, m.aktorer[r]?.formagor)) {
      for (const blk of m.formagor[n].rest.filter((b) => b.mode === 'server')) {
        for (const p of blk.resurser[typ]?.sokparametrar || []) ut.add(p);
      }
    }
  }
  return [...ut];
}

// Kan systemet (enligt sitt nuläge) initiera operationen som klient?
function klientKan(cs, op, typ) {
  if (!cs) return null;
  if (op === 'capabilities' || op === 'token') return true;
  const rest = (cs.rest || []).filter((r) => r.mode === 'client');
  if (SYSTEM_OPS.has(op)) return rest.some((r) => (r.interaction || []).some((i) => i.code === op));
  return rest.some((r) => (r.resource || []).some((x) => x.type === typ && (x.interaction || []).some((i) => i.code === op)));
}

// Innehåll för andra skrivningar till stödtjänster (logg, prenumeration …).
function kroppFor(typ, sys, sysUrl, patient) {
  const nu = new Date().toISOString();
  const [system, value] = patient.split('|');
  switch (typ) {
    case 'AuditEvent':
      return {
        resourceType: 'AuditEvent', action: 'R', recorded: nu,
        code: { coding: [{ system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110110', display: 'Patient Record' }] },
        agent: [{ who: { display: sys.titel } }], source: { observer: { display: sys.titel } },
        entity: [{ what: { identifier: { system, value } } }],
      };
    case 'Subscription':
      return {
        resourceType: 'Subscription', status: 'requested', topic: 'https://fhir.inera.se/ig/svod/SubscriptionTopic/ny-data', endpoint: sysUrl, content: 'id-only',
        channelType: { system: 'http://terminology.hl7.org/CodeSystem/subscription-channel-type', code: 'rest-hook' },
      };
    case 'List':
      return { resourceType: 'List', status: 'current', mode: 'working', title: `Patienter hos ${sys.titel}`, entry: [{ item: { identifier: { system, value } } }] };
    default:
      return { resourceType: typ };
  }
}

const traffar = (svar) => (svar.json?.resourceType === 'Bundle' ? (svar.json.entry || []).map((e) => e.resource).filter(Boolean) : []);
const ok = (svar) => svar.status >= 200 && svar.status < 300;
const felText = (svar) => svar.json?.issue?.[0]?.diagnostics || `HTTP ${svar.status}`;

async function korScenario(miljo, sys, sysCs, part, manifests, analys) {
  const m = manifests[part.tjanst];
  const u = m.anvandningsfall.find((x) => x.namn === part.anvandningsfall);
  const sysUrl = miljo.systemUrl(sys);
  const roll = analys.roller.find((x) => x.id === part.roll);
  const grund = roll.tillval ? analys.roller.find((x) => x.tjanst === roll.tjanst && x.aktor === roll.tillvalFor) : roll;
  const fed = federationFor(m);
  const fedRef = fed ? federationsOrg(fed, miljo.federationsKarta) : null;
  const headers = await miljo.katalogHeaders();
  const patient = `${miljo.testpatient.system}|${miljo.testpatient.varde}`;
  const valdaMangder = (grund.informationsmangder || []).filter((i) => i.vald);
  const indexerad = analys.roller.some((x) => x.tjanst === part.tjanst && x.tillval && x.forfader.includes('Engagemangsproducent'));
  const mangd = (modell) => (m.informationsmangder || []).find((i) => i.nyckel === modell);

  // Deltagare per scenarioaktör.
  const deltagare = new Map();
  for (const b of u.aktorer) {
    if (part.banor.includes(b.nyckel)) deltagare.set(b.nyckel, { typ: 'system', titel: sys.titel });
    else if (b.stodtjanst) {
      const r = b.roller.find((x) => miljo.stod.has(x));
      deltagare.set(b.nyckel, { typ: 'stödtjänst', roll: r, url: r ? miljo.stod.get(r) : null, titel: b.titel });
    } else if (b.typ === 'person') deltagare.set(b.nyckel, { typ: 'person', titel: b.titel });
    else deltagare.set(b.nyckel, { typ: 'federation', titel: b.titel, spelasAv: b.spelasAv });
  }

  // Organisationer i medlemskatalogen: systemets egen, och producenternas HSA-id.
  const fmk = miljo.stod.get(STOD.medlemskatalog);
  const orgCache = new Map();
  const orgAv = async (ref) => {
    if (!orgCache.has(ref)) {
      const svar = fmk && ref ? await fhir(`${fmk}/${ref}`, { headers }) : { status: 0 };
      orgCache.set(ref, ok(svar) ? lasKatalog(svar.json).organisationer[0] : null);
    }
    return orgCache.get(ref);
  };
  const egenOrg = async () => {
    if (!sys.organisation?.hsaId || !fmk) return null;
    const svar = await fhir(`${fmk}/Organization?identifier=${encodeURIComponent(`${HSA}|${sys.organisation.hsaId}`)}`, { headers });
    return lasKatalog(traffar(svar)).organisationer[0] || null;
  };

  // T2-kontext: kandidater efter T1 och F1, varför andra föll bort, intyg och engagemang.
  const t2ctx = { kandidater: null, bortfall: new Map(), token: null, engagerade: null };

  const resultat = [];
  const steg = u.steg.filter((s) => s.typ === 'operation');
  for (const [i, s] of steg.entries()) {
    const fran = deltagare.get(s.fran);
    const till = deltagare.get(s.till);
    const r = { nr: s.nr, titel: s.titel, operation: s.operation, resurstyp: s.resurstyp, fran: fran?.titel, till: till?.titel, detaljer: [] };
    resultat.push(r);
    const detalj = (url, anrop, svar, extra = {}) => {
      const d = { url, anrop, http: svar.status, status: ok(svar) ? 'ok' : svar.status === 501 ? 'okänt' : 'fel', ...extra };
      if (!ok(svar)) d.text = felText(svar);
      r.detaljer.push(d);
      return d;
    };
    if (!s.operation) {
      r.status = s.krav ? 'manuell' : 'hoppad';
      r.text = s.krav ? 'Verksamhetskrav, verifieras manuellt' : 'Användarinteraktion';
      continue;
    }
    if (!RESURS_OPS.has(s.operation) && !SYSTEM_OPS.has(s.operation) && !['capabilities', 'token'].includes(s.operation)) {
      r.status = 'hoppad';
      r.text = `Operationen ${s.operation} körs inte av testköraren`;
      continue;
    }
    if (s.modell && till?.typ === 'system' && !valdaMangder.some((x) => x.nyckel === s.modell)) {
      r.status = 'hoppad';
      r.text = `${sys.titel} har inte valt informationsmängden ${mangd(s.modell)?.titel || s.modell}`;
      continue;
    }
    // Avsändaren: systemet måste ha klientförmågan enligt sitt nuläge.
    let antagen = false;
    // I läsläge verifieras registreringar i katalogerna; vem som registrerade
    // dem (systemet eller operatören) prövas inte.
    const verifieras = !miljo.skriv && (s.operation === 'create' || s.operation === 'update') && KATALOGRESURSER[s.resurstyp];
    if (fran?.typ === 'system' && !verifieras) {
      const kan = klientKan(sysCs, s.operation, s.resurstyp);
      if (kan === false) {
        r.status = 'fel';
        r.text = `${sys.titel} saknar ${s.operation}${s.resurstyp ? ` på ${s.resurstyp}` : ''} som klient i sitt CapabilityStatement`;
        // Uppslag i stödtjänsterna görs ändå, så att flödet kan fortsätta.
        if (till?.typ !== 'stödtjänst' || s.operation === 'create' || s.operation === 'update') continue;
      }
      antagen = kan === null;
    }
    if (till?.typ === 'person') {
      r.status = 'hoppad';
      r.text = 'Visas för användaren';
      continue;
    }

    if (till?.typ === 'stödtjänst') {
      if (!till.url) {
        r.status = 'fel';
        r.text = `Stödtjänsten ${till.titel} finns inte i ${miljo.titel}`;
        continue;
      }
      if (till.roll === STOD.katalog && s.operation === 'search-type' && s.resurstyp === 'Endpoint') {
        // T1: tjänstesökning på specifikationen för nästa hämtning.
        const nasta = steg.slice(i + 1).find((x) => x.modell && deltagare.get(x.till)?.typ !== 'stödtjänst');
        const im = nasta && mangd(nasta.modell);
        const spec = im ? specFor(im) : null;
        const q = `Endpoint?status=active${spec ? `&implements=${encodeURIComponent(utanVersion(spec))}` : ''}`;
        const svar = await fhir(`${till.url}/${q}`, { headers });
        const kandidater = lasKatalog(traffar(svar)).andpunkter.filter((e) => !spec || matcha(e.implements, spec).status === 'registrerad');
        t2ctx.kandidater = kandidater;
        t2ctx.bortfall = new Map();
        const d = detalj(till.url, `GET ${q}`, svar);
        if (ok(svar)) d.text = `${kandidater.length} anslutningspunkter${spec ? ` implementerar ${spec}` : ''}`;
      } else if (till.roll === STOD.medlemskatalog && s.operation === 'search-type' && s.resurstyp === 'OrganizationAffiliation') {
        // F1: medlemsverifiering per producentorganisation.
        const kvar = [];
        for (const org of [...new Set((t2ctx.kandidater || []).map((e) => e.org))]) {
          const q = `OrganizationAffiliation?participating-organization=${encodeURIComponent(org)}&primary-organization=${encodeURIComponent(fedRef)}&active=true`;
          const svar = await fhir(`${till.url}/${q}`, { headers });
          const medlem = lasKatalog(traffar(svar)).medlemskap.some((a) => a.aktiv && a.roller.includes('member'));
          const d = detalj(till.url, `GET ${q}`, svar);
          if (ok(svar)) d.text = medlem ? `${org} är medlem` : `${org} är inte medlem i ${fedRef}`;
          if (medlem) kvar.push(org);
        }
        for (const e of (t2ctx.kandidater || []).filter((x) => !kvar.includes(x.org))) t2ctx.bortfall.set(e.adress, `${e.org} är inte medlem i ${fedRef}`);
        t2ctx.kandidater = (t2ctx.kandidater || []).filter((e) => kvar.includes(e.org));
        if (!r.detaljer.length) r.text = 'Inga producenter att verifiera';
      } else if (till.roll === STOD.intyg && s.operation === 'token') {
        const token = await miljo.intyg(till.url);
        t2ctx.token = token;
        r.detaljer.push({ url: till.url, anrop: 'POST token', http: token ? 200 : 0, status: token ? 'ok' : 'fel', text: token ? 'Åtkomstintyg utfärdat' : 'Inget åtkomstintyg' });
      } else if (till.roll === STOD.index && s.operation === 'search-type' && s.resurstyp === 'EpisodeOfCare') {
        const q = `EpisodeOfCare?patient-identifier=${encodeURIComponent(patient)}&status=active`;
        const svar = await fhir(`${till.url}/${q}`, { headers });
        t2ctx.engagerade = new Set(lasKatalog(traffar(svar)).engagemang.filter((e) => e.aktiv).map((e) => e.hsaId));
        const d = detalj(till.url, `GET ${q}`, svar);
        if (ok(svar)) d.text = `Engagemang hos ${[...t2ctx.engagerade].join(', ') || 'ingen'}`;
      } else if ((s.operation === 'create' || s.operation === 'update') && KATALOGRESURSER[s.resurstyp]) {
        await registrera({ miljo, sys, sysUrl, s, till, r, detalj, headers, fedRef, egenOrg, valdaMangder, indexerad, patient });
      } else if (s.operation === 'create' || s.operation === 'update') {
        if (!miljo.skriv) {
          r.status = 'hoppad';
          r.text = `Läsläge: ${s.resurstyp} skrivs inte`;
          continue;
        }
        const svar = await fhir(`${till.url}/${s.resurstyp}`, { metod: 'POST', kropp: kroppFor(s.resurstyp, sys, sysUrl, patient) });
        const d = detalj(till.url, `POST ${s.resurstyp}`, svar);
        if (ok(svar)) d.text = `${svar.json.resourceType}/${svar.json.id}`;
      } else {
        const svar = await fhir(`${till.url}/${s.resurstyp || ''}`, { headers });
        detalj(till.url, `GET ${s.resurstyp || ''}`, svar);
      }
    } else {
      // Anrop till producenter: systemet eller federationens övriga.
      let mal;
      if (t2ctx.kandidater) {
        mal = [];
        for (const e of t2ctx.kandidater) {
          if (t2ctx.engagerade && e.indexerad) {
            const hsa = (await orgAv(e.org))?.hsaId;
            if (!t2ctx.engagerade.has(hsa)) {
              t2ctx.bortfall.set(e.adress, `engagemangsindexerad, men inget engagemang för patienten hos ${hsa || e.org}`);
              continue;
            }
          }
          mal.push(e);
        }
      } else {
        // Utan T1 i flödet: alla anslutningspunkter som implementerar någon av
        // tjänstens informationsmängder.
        const tk = miljo.stod.get(STOD.katalog);
        const svar = tk ? await fhir(`${tk}/Endpoint?status=active`, { headers }) : { status: 0 };
        const specs = (m.informationsmangder || []).map(specFor);
        mal = lasKatalog(traffar(svar)).andpunkter.filter((e) => specs.some((x) => matcha(e.implements, x).status === 'registrerad'));
      }
      if (till?.typ === 'system') {
        const egen = mal.filter((e) => miljo.adress(e.adress) === sysUrl);
        if (!egen.length) {
          const orsak = [...t2ctx.bortfall].find(([a]) => miljo.adress(a) === sysUrl)?.[1];
          r.status = 'fel';
          r.text = orsak ? `${sys.titel} hittas inte: ${orsak}` : `${sys.titel} hittas inte med tjänstesökningen (ingen anslutningspunkt för informationsmängden)`;
          continue;
        }
        mal = egen;
      }
      if (!mal.length) {
        r.status = 'delvis';
        r.text = 'Ingen producent att anropa';
        continue;
      }
      const im = s.modell && mangd(s.modell);
      // Vid en extern specifikation gäller den externa profilen, inte tjänstens.
      const profilUrl = s.profil && !im?.motsvarar ? m.profiler[s.profil]?.url : null;
      const intyg = t2ctx.token ? { authorization: `Bearer ${t2ctx.token}` } : {};
      for (const e of mal) {
        const url = miljo.adress(e.adress);
        let svar;
        let anrop;
        if (s.operation === 'search-type') {
          const roller = till.typ === 'system' ? [grund.aktor] : till.spelasAv || [];
          const q = new URLSearchParams(sokparametrar(m, roller, s.resurstyp).map((p) => (p === 'patient' ? ['patient.identifier', patient] : [p, VARDEN[p] || 'x'])));
          anrop = `GET ${s.resurstyp}${q.size ? `?${q}` : ''}`;
          svar = await fhir(`${url}/${s.resurstyp}${q.size ? `?${q}` : ''}`, { headers: intyg });
        } else if (s.operation === 'read') {
          anrop = `GET ${s.resurstyp}/exempel`;
          svar = await fhir(`${url}/${s.resurstyp}/exempel`, { headers: intyg });
        } else if (s.operation === 'search-system') {
          anrop = `GET ?patient.identifier=${patient}`;
          svar = await fhir(`${url}?patient.identifier=${encodeURIComponent(patient)}`, { headers: intyg });
        } else {
          anrop = 'GET metadata';
          svar = await fhir(`${url}/metadata`, { headers: intyg });
        }
        const d = detalj(url, anrop, svar);
        if (ok(svar) && svar.json?.resourceType === 'Bundle') {
          const resurser = traffar(svar);
          d.text = `${resurser.length} träffar`;
          if (profilUrl && s.operation === 'search-type') {
            const med = resurser.filter((x) => (x.meta?.profile || []).map(utanVersion).includes(profilUrl)).length;
            d.text += `, ${med} med profilen ${s.profil}`;
            if (resurser.length && !med) d.status = 'delvis';
          }
        } else if (ok(svar) && svar.json?.id) d.text = `${svar.json.resourceType}/${svar.json.id}`;
        if (d.status === 'ok' && antagen) d.status = 'antagen';
      }
    }
    if (r.status) continue;
    const st = r.detaljer.map((d) => d.status);
    r.status = ['fel', 'delvis', 'okänt', 'antagen'].find((x) => st.includes(x)) || (st.length ? 'ok' : 'hoppad');
    if (antagen) r.text = `${sys.titel}s klientförmåga är okänd (nuläge saknas) och antas`;
  }
  const st = resultat.map((x) => x.status);
  return {
    system: sys.system, roll: part.roll, tjanst: part.tjanst, anvandningsfall: u.namn, titel: u.titel, forutsattning: !!u.forutsattning,
    status: ['fel', 'delvis', 'okänt'].find((x) => st.includes(x)) || (st.every((x) => ['hoppad', 'manuell'].includes(x)) ? 'manuell' : 'ok'),
    steg: resultat,
  };
}

// Förutsättningarnas skrivningar. Det som redan finns skrivs inte igen; i
// läsläge (skriv = false) verifieras bara att det finns.
async function registrera({ miljo, sys, sysUrl, s, till, r, detalj, headers, fedRef, egenOrg, valdaMangder, indexerad, patient }) {
  const org = await egenOrg();
  const hsaId = sys.organisation?.hsaId;
  const skriv = async (kropp, id) => {
    const svar = id
      ? await fhir(`${till.url}/${kropp.resourceType}/${id}`, { metod: 'PUT', kropp: { ...kropp, id } })
      : await fhir(`${till.url}/${kropp.resourceType}`, { metod: 'POST', kropp });
    const d = detalj(till.url, `${id ? 'PUT' : 'POST'} ${kropp.resourceType}${id ? `/${id}` : ''}`, svar);
    if (ok(svar)) d.text = `${svar.json.resourceType}/${svar.json.id}`;
  };
  const verifiera = (finns, text) => {
    r.detaljer.push({ url: till.url, anrop: 'verifiera', http: 200, status: finns ? 'ok' : 'fel', text });
  };
  const sok = async (q) => {
    const svar = await fhir(`${till.url}/${q}`, { headers });
    const d = detalj(till.url, `GET ${q}`, svar);
    if (ok(svar)) d.text = `${traffar(svar).length} träffar`;
    return lasKatalog(traffar(svar));
  };

  if (s.resurstyp === 'Organization') {
    if (!hsaId) return verifiera(false, `${sys.titel} saknar organisationens HSA-id i systemregistret`);
    if (org) return verifiera(true, `${org.ref} (${hsaId}) finns`);
    if (!miljo.skriv) return verifiera(false, `Organisationen ${hsaId} finns inte i medlemskatalogen`);
    return skriv(t2.organisation(null, sys.organisation.namn, hsaId));
  }
  if (!org) return verifiera(false, `Organisationen ${hsaId || '(utan HSA-id)'} finns inte i medlemskatalogen`);
  if (s.resurstyp === 'OrganizationAffiliation') {
    const k = await sok(`OrganizationAffiliation?participating-organization=${encodeURIComponent(org.ref)}&primary-organization=${encodeURIComponent(fedRef)}&active=true`);
    if (k.medlemskap.some((a) => a.roller.includes('member'))) return verifiera(true, `${org.ref} är medlem i ${fedRef}`);
    if (!miljo.skriv) return verifiera(false, `${org.ref} är inte medlem i ${fedRef}`);
    return skriv(t2.medlemskap(fedRef, org.ref));
  }
  const specs = valdaMangder.map((i) => i.spec);
  if (s.resurstyp === 'Endpoint') {
    const k = await sok(`Endpoint?organization=${encodeURIComponent(org.ref)}&status=active`);
    const e = k.andpunkter.find((x) => miljo.adress(x.adress) === sysUrl);
    const saknas = specs.filter((x) => !e || matcha(e.implements, x).status !== 'registrerad');
    const indexOk = !indexerad || e?.indexerad;
    if (e && !saknas.length && indexOk) return verifiera(true, `Anslutningspunkten implementerar de ${specs.length} valda informationsmängderna${indexerad ? ' och är engagemangsindexerad' : ''}`);
    if (!miljo.skriv) return verifiera(false, e ? `Anslutningspunkten saknar ${saknas.join(', ') || 'engagemangsindexering'}` : 'Anslutningspunkten finns inte');
    const behall = (e?.implements || []).filter((x) => !specs.some((y) => utanVersion(y) === utanVersion(x)));
    return skriv(t2.andpunkt(sys.titel, e?.adress || sysUrl, org.ref, [...behall, ...specs], indexerad), e?.id);
  }
  if (s.resurstyp === 'CapabilityStatement') {
    const tk = lasKatalog(traffar(await fhir(`${till.url}/CapabilityStatement?_count=500`, { headers })));
    const inst = tk.instanser.find((c) => miljo.adress(c.adress) === sysUrl);
    const saknas = specs.filter((x) => !inst || matcha(inst.instantiates, x).status !== 'registrerad');
    if (inst && !saknas.length) return verifiera(true, `Tjänsteinstansen ${inst.id} instansierar de valda informationsmängderna`);
    if (!miljo.skriv) return verifiera(false, inst ? `Tjänsteinstansen saknar ${saknas.join(', ')}` : 'Tjänsteinstans saknas');
    const behall = (inst?.instantiates || []).filter((x) => !specs.some((y) => utanVersion(y) === utanVersion(x)));
    return skriv(t2.instans(sys.titel, inst?.adress || sysUrl, org.ref, [...behall, ...specs]), inst?.id);
  }
  if (s.resurstyp === 'EpisodeOfCare') {
    const k = await sok(`EpisodeOfCare?patient-identifier=${encodeURIComponent(patient)}&organization-identifier=${encodeURIComponent(`${HSA}|${hsaId}`)}&status=active`);
    if (k.engagemang.length) return verifiera(true, `Engagemang för testpatienten hos ${hsaId} finns`);
    if (!miljo.skriv) return verifiera(false, `Inget engagemang för testpatienten hos ${hsaId}`);
    const [system, varde] = patient.split('|');
    return skriv(t2.engagemang({ system, value: varde }, hsaId));
  }
  return verifiera(false, `Ingen registrering för ${s.resurstyp}`);
}

export async function korFederation({ miljo, manifests, systems, root, regler }) {
  const fore = await liveAnalys(miljo, systems, manifests, root, regler);
  const korningar = [];
  // Fas 1: förutsättningarna (medlemskap och anslutning), fas 2: övriga användningsfall.
  for (const fas of [true, false]) {
    for (const sys of systems) {
      const f = fore.find((x) => x.system === sys.system);
      for (const part of f.analys.scenarier.filter((p) => !!p.forutsattning === fas)) {
        korningar.push(await korScenario(miljo, sys, f.cs, part, manifests, f.analys));
      }
    }
  }
  const efter = await liveAnalys(miljo, systems, manifests, root, regler);
  return {
    miljo: { namn: miljo.namn, titel: miljo.titel, bas: miljo.bas, skriv: miljo.skriv },
    genererad: new Date().toISOString(),
    system: systems.map((s) => ({ system: s.system, titel: s.titel, organisation: s.organisation, andpunkter: s.andpunkter, roller: s.roller, tillval: s.tillval || [], informationsmangder: s.informationsmangder || null })),
    fore: fore.map(({ analys, cs, ...x }) => x),
    efter: efter.map(({ analys, cs, ...x }) => x),
    korningar,
    // System härledda ur en verklig realisering finns inte i systemregistret;
    // deras analys följer med körningen.
    ...(miljo.namn === 'mock' ? {} : { analyser: efter.map((x) => x.analys) }),
  };
}

export async function testaFederation({ ws, manifests, systems, root, regler, port = 0, behall = false }) {
  const fed = await byggFederation({ ws, manifests, systems, root, port });
  try {
    const ut = await korFederation({ miljo: fed.miljo, manifests, systems, root, regler });
    ut.bas = fed.mock.bas;
    ut.andpunkter = [...fed.mock.andpunkter.values()].map((a) => ({ sokvag: a.sokvag, nulage: !!a.cs, anrop: a.logg.length }));
    ut.stod = [...fed.plats.stod].map(([aktor, url]) => {
      const a = fed.mock.andpunkter.get(new URL(url).pathname);
      return { aktor, url, anrop: a.logg.length, resurser: Object.fromEntries([...a.resurser].map(([t, mp]) => [t, mp.size])) };
    });
    return behall ? { ...ut, fed } : ut;
  } finally {
    if (!behall) await fed.mock.stoppa();
  }
}

export function renderFederationReport(r) {
  const out = [`# Federationstest: ${r.miljo.titel}`, '',
    `${r.miljo.bas} · ${r.miljo.skriv ? 'förutsättningarna skrivs till katalogerna' : 'läsläge: förutsättningarna verifieras'} · ${r.korningar.length} körningar`, ''];
  out.push('## Anslutningar före och efter förutsättningarna', '', '| System | Före | Efter |', '|---|---|---|');
  for (const f of r.fore) {
    const e = r.efter.find((x) => x.system === f.system);
    const txt = (lista) => lista.map((x) => `${x.roll.split('#')[1]} ${x.typ}${x.informationsmangd ? ` ${x.informationsmangd}` : ''}: ${x.status}`).join('<br>') || '–';
    out.push(`| ${f.system} | ${txt(f.anslutningar)} | ${txt(e.anslutningar)} |`);
  }
  if (r.specifikationer?.length) {
    out.push('', '## Tjänstens specifikationer mot de externa', '');
    for (const j of r.specifikationer) {
      out.push(`### ${j.titel} (${j.tjanst})`, '', `\`${j.egen}\` ↔ \`${j.extern}\` (${j.kalla})`, '');
      out.push(...(j.avvikelser.length ? j.avvikelser.map((a) => `- **${a.niva}**: ${a.text}`) : ['Inga avvikelser.']), '');
    }
  }
  out.push('', '## Körningar', '');
  for (const k of r.korningar) {
    out.push(`### ${k.system} – ${k.titel} (${k.status})`, '', `Roll ${k.roll}${k.forutsattning ? ' · förutsättning' : ''}`, '', '| Steg | Från → till | Operation | Status | Resultat |', '|---|---|---|---|---|');
    for (const s of k.steg) {
      const res = [s.text, ...s.detaljer.map((d) => `${d.anrop} → ${d.http}${d.text ? ` (${d.text})` : ''}`)].filter(Boolean).join('<br>');
      out.push(`| ${s.nr} ${s.titel} | ${s.fran || ''} → ${s.till || ''} | ${[s.operation, s.resurstyp].filter(Boolean).join(' ')} | ${s.status} | ${String(res).replace(/\|/g, '\\|')} |`);
    }
    out.push('');
  }
  if (r.stod) {
    out.push('## Stödtjänster', '', '| Stödtjänst | Anrop | Resurser |', '|---|---|---|');
    for (const s of r.stod) out.push(`| ${s.aktor} | ${s.anrop} | ${Object.entries(s.resurser).map(([t, n]) => `${t}: ${n}`).join(', ') || '–'} |`);
  }
  return out.join('\n') + '\n';
}
