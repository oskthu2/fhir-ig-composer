// En mockad federation byggd ur de komponerade IG:arna och systemregistret,
// och en testkörare som kör användningsfallen mot den.
//
// Mocken består av:
//   /stod/<Aktör>                 stödtjänster (tjänstekatalog, patientindex, loggtjänst …)
//                                 med förmågor enligt sina CapabilityStatements
//   /referens/<tjänst>/<Aktör>    referensimplementation per källsystemsroll: kan
//                                 summan av rollens krav, data = tjänstens exempel
//   /system/<System>              varje system i system/*.yaml: kan exakt det dess
//                                 nuläge (CapabilityStatement kind=instance) säger
//
// Tjänstekatalogen fylls med exporten (systemens nuvarande API-instanser) och
// med referensimplementationerna. Testköraren kör först förutsättningarna
// (anslutning: systemen registrerar sig), sedan användningsfallen. Mottagare
// som är källsystem hittas via tjänstekatalogen, som en riktig konsument gör.

import fs from 'node:fs';
import path from 'node:path';
import { MockFederation, fhir } from './mock.mjs';
import { analyseSystem } from './system.mjs';

const DEFINITIONER = new Set([
  'StructureDefinition', 'ValueSet', 'CodeSystem', 'CapabilityStatement', 'ActorDefinition', 'Requirements',
  'ExampleScenario', 'ImplementationGuide', 'SearchParameter', 'OperationDefinition', 'ConceptMap',
]);
const TK_API_INSTANS = 'https://fhir.inera.se/ig/tjanstekatalog/StructureDefinition/tk-api-instance';
const RESURS_OPS = new Set(['read', 'search-type', 'create', 'update']);
const SYSTEM_OPS = new Set(['search-system']);
const utan = (u) => String(u).split('|')[0];

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
      mock.laggTill(sokvag, instansCs(m, a.formagor, `Mock: ${a.titel}`, `${mock.bas}${sokvag}`));
      plats.stod.set(namn, mock.url(sokvag));
    }
  }

  // Referensimplementationer per källsystemsroll (tjänsteaktör med server-krav).
  for (const m of tjanster) {
    const data = exempel(ws.get(m.ig.id));
    for (const kp of m.kravprofiler) {
      const url = mock.url(`/referens/${m.ig.id.split('.').pop()}/${kp.aktor}`);
      const cs = instansCs(m, kp.formagor, `Referensimplementation: ${kp.aktorTitel}`, url);
      if (!cs.rest[0].resource.length) continue;
      const typer = servertyper(cs);
      mock.laggTill(new URL(url).pathname, cs, data.filter((r) => typer.has(r.resourceType)));
      plats.referens.set(`${m.ig.id}#${kp.aktor}`, { url, spec: `${m.formagor[kp.formagor].url}|${m.ig.version}`, titel: kp.aktorTitel });
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
    mock.laggTill(sokvag, cs, data.filter((r) => typer.has(r.resourceType)));
    plats.system.set(sys.system, url);
    for (const a of sys.andpunkter || []) plats.adresser.set(a, url);
  }

  // Tjänstekatalogen: nuvarande API-instanser (adresser till mocken) och
  // referensimplementationerna.
  const katalogUrl = plats.stod.get('Tjanstekatalog');
  if (katalogUrl) {
    const katalog = mock.andpunkter.get(new URL(katalogUrl).pathname);
    const exportFiler = [...new Set(systems.map((s) => s.nulage?.anslutningar).filter(Boolean))];
    for (const f of exportFiler) {
      const fil = path.join(root, 'system', f);
      if (!fs.existsSync(fil)) continue;
      for (const e of JSON.parse(fs.readFileSync(fil, 'utf8')).entry || []) {
        const r = structuredClone(e.resource);
        if (r.implementation?.url && plats.adresser.has(r.implementation.url)) r.implementation.url = plats.adresser.get(r.implementation.url);
        mock.spara(katalog, r);
      }
    }
    for (const [, ref] of plats.referens) {
      mock.spara(katalog, {
        resourceType: 'CapabilityStatement', meta: { profile: [TK_API_INSTANS] }, status: 'active', date: new Date().toISOString().slice(0, 10),
        kind: 'instance', instantiates: [ref.spec], fhirVersion: '5.0.0', format: ['json'],
        implementation: { description: ref.titel, url: ref.url }, rest: [{ mode: 'server' }],
      });
    }
  }
  return { mock, plats, katalogUrl };
}

// ------------------------------------------------------------------ live-analys

async function liveAnalys(fed, systems, manifests, root, regler) {
  const katalog = fed.katalogUrl ? (await fhir(`${fed.katalogUrl}/CapabilityStatement`)).json : null;
  const ut = [];
  for (const sys of systems) {
    const url = fed.plats.system.get(sys.system);
    const meta = await fhir(`${url}/metadata`);
    const a = analyseSystem({ ...sys, andpunkter: [url] }, manifests, root, regler, {
      nulageCs: meta.status === 200 ? meta.json : null,
      exportBundle: katalog,
    });
    ut.push({ system: sys.system, sammanfattning: a.sammanfattning, anslutningar: a.anslutningar.forvantade, api: a.api, analys: a });
  }
  return ut;
}

// ------------------------------------------------------------------ testkörning

function kroppFor(typ, { sys, sysUrl, spec }) {
  const nu = new Date().toISOString();
  switch (typ) {
    case 'Endpoint':
      return {
        resourceType: 'Endpoint', status: 'active', name: sys.titel, address: sysUrl,
        connectionType: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/endpoint-connection-type', code: 'hl7-fhir-rest' }] }],
      };
    case 'CapabilityStatement':
      return {
        resourceType: 'CapabilityStatement', meta: { profile: [TK_API_INSTANS] }, status: 'active', date: nu.slice(0, 10), kind: 'instance',
        instantiates: spec ? [spec] : [], fhirVersion: '5.0.0', format: ['json'],
        implementation: { description: `${sys.titel}`, url: sysUrl }, rest: [{ mode: 'server' }],
      };
    case 'List':
      return { resourceType: 'List', status: 'current', mode: 'working', title: `Patienter hos ${sys.titel}`, entry: [{ item: { reference: 'Patient/exempel' } }] };
    case 'AuditEvent':
      return {
        resourceType: 'AuditEvent', action: 'R', recorded: nu,
        code: { coding: [{ system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110110', display: 'Patient Record' }] },
        agent: [{ who: { display: sys.titel } }], source: { observer: { display: sys.titel } }, entity: [{ what: { reference: 'Patient/exempel' } }],
      };
    case 'Subscription':
      return {
        resourceType: 'Subscription', status: 'requested', topic: 'https://fhir.inera.se/ig/svod/SubscriptionTopic/ny-data', endpoint: sysUrl, content: 'id-only',
        channelType: { system: 'http://terminology.hl7.org/CodeSystem/subscription-channel-type', code: 'rest-hook' },
      };
    default:
      return { resourceType: typ };
  }
}

const VARDEN = { patient: 'Patient/exempel', subject: 'Patient/exempel', date: 'ge2026-01-01', category: 'laboratory', target: 'Encounter/exempel' };

// Sökparametrar som mottagarrollen ska stödja för resurstypen (summan i tjänsten).
function sokparametrar(m, roller, typ) {
  const ut = new Set();
  for (const r of roller) {
    const a = m.aktorer[r];
    for (const n of stangning(m, a?.formagor)) {
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
  if (op === 'capabilities') return true;
  const rest = (cs.rest || []).filter((r) => r.mode === 'client');
  if (SYSTEM_OPS.has(op)) return rest.some((r) => (r.interaction || []).some((i) => i.code === op));
  return rest.some((r) => (r.resource || []).some((x) => x.type === typ && (x.interaction || []).some((i) => i.code === op)));
}

async function korScenario(fed, sys, sysCs, part, manifests) {
  const m = manifests[part.tjanst];
  const u = m.anvandningsfall.find((x) => x.namn === part.anvandningsfall);
  const sysUrl = fed.plats.system.get(sys.system);
  const katalog = fed.katalogUrl ? (await fhir(`${fed.katalogUrl}/CapabilityStatement`)).json : null;
  const rollAktor = part.roll.split('#')[1];
  const egenSpec = `${m.formagor[m.aktorer[rollAktor]?.formagor]?.url}|${m.ig.version}`;

  // Deltagare per scenarioaktör.
  const deltagare = new Map();
  for (const b of u.aktorer) {
    if (part.banor.includes(b.nyckel)) deltagare.set(b.nyckel, { typ: 'system', urls: [sysUrl], titel: sys.titel });
    else if (b.stodtjanst) {
      const r = b.roller.find((x) => fed.plats.stod.has(x));
      deltagare.set(b.nyckel, { typ: 'stödtjänst', urls: r ? [fed.plats.stod.get(r)] : [], titel: b.titel });
    } else if (b.typ === 'person') deltagare.set(b.nyckel, { typ: 'person', urls: [], titel: b.titel });
    else {
      // Andra system hittas via tjänstekatalogen: API-instanser som följer
      // någon av de tjänsteaktörer som spelar rollen.
      const specs = new Set(b.spelasAv.map((a) => `${m.formagor[m.aktorer[a]?.formagor]?.url}|${m.ig.version}`));
      const urls = (katalog?.entry || []).map((e) => e.resource)
        .filter((c) => (c.instantiates || []).some((i) => specs.has(i)))
        .map((c) => c.implementation?.url).filter(Boolean);
      deltagare.set(b.nyckel, { typ: 'federation', urls: [...new Set(urls)], titel: b.titel, roller: b.roller, specs: [...specs] });
    }
  }

  const resultat = [];
  const steg = u.steg.filter((s) => s.typ === 'operation');
  for (const s of steg) {
    const fran = deltagare.get(s.fran);
    const till = deltagare.get(s.till);
    const r = { nr: s.nr, titel: s.titel, operation: s.operation, resurstyp: s.resurstyp, fran: fran?.titel, till: till?.titel, detaljer: [] };
    resultat.push(r);
    if (!s.operation) {
      r.status = s.krav ? 'manuell' : 'hoppad';
      r.text = s.krav ? 'Verksamhetskrav, verifieras manuellt' : 'Användarinteraktion';
      continue;
    }
    if (!RESURS_OPS.has(s.operation) && !SYSTEM_OPS.has(s.operation) && s.operation !== 'capabilities') {
      r.status = 'hoppad';
      r.text = `Operationen ${s.operation} körs inte av mocken`;
      continue;
    }
    // Avsändaren: systemet måste ha klientförmågan enligt sitt nuläge.
    let antagen = false;
    if (fran?.typ === 'system') {
      const kan = klientKan(sysCs, s.operation, s.resurstyp);
      if (kan === false) {
        r.status = 'fel';
        r.text = `${sys.titel} saknar ${s.operation}${s.resurstyp ? ` på ${s.resurstyp}` : ''} som klient i sitt CapabilityStatement`;
        continue;
      }
      antagen = kan === null;
    }
    if (till?.typ === 'person') {
      r.status = 'hoppad';
      r.text = 'Visas för användaren';
      continue;
    }
    if (!till?.urls.length) {
      r.status = 'fel';
      r.text = till?.typ === 'federation'
        ? `Ingen mottagare i tjänstekatalogen följer ${till.specs.join(', ')}`
        : 'Ingen mottagare i mocken';
      continue;
    }
    const profilUrl = s.profil ? m.profiler[s.profil]?.url : null;
    for (const url of till.urls) {
      let svar;
      let anrop;
      if (s.operation === 'search-type') {
        const roller = till.typ === 'system' ? [rollAktor] : (u.aktorer.find((b) => b.nyckel === s.till)?.spelasAv || []);
        const q = new URLSearchParams(sokparametrar(m, roller.length ? roller : [], s.resurstyp).map((p) => [p, VARDEN[p] || 'x']));
        anrop = `GET ${s.resurstyp}${q.size ? `?${q}` : ''}`;
        svar = await fhir(`${url}/${s.resurstyp}${q.size ? `?${q}` : ''}`);
      } else if (s.operation === 'read') {
        anrop = `GET ${s.resurstyp}/exempel`;
        svar = await fhir(`${url}/${s.resurstyp}/exempel`);
      } else if (s.operation === 'create' || s.operation === 'update') {
        const spec = s.resurstyp === 'CapabilityStatement' ? egenSpec : null;
        anrop = `POST ${s.resurstyp}`;
        svar = await fhir(`${url}/${s.resurstyp}`, { metod: 'POST', kropp: kroppFor(s.resurstyp, { sys, sysUrl, spec }) });
      } else if (s.operation === 'search-system') {
        anrop = 'GET ?patient=Patient/exempel';
        svar = await fhir(`${url}?patient=Patient/exempel`);
      } else {
        anrop = 'GET metadata';
        svar = await fhir(`${url}/metadata`);
      }
      const d = { url, anrop, http: svar.status };
      if (svar.status >= 200 && svar.status < 300) {
        d.status = antagen ? 'antagen' : 'ok';
        if (svar.json?.resourceType === 'Bundle') {
          const resurser = (svar.json.entry || []).map((e) => e.resource);
          d.text = `${resurser.length} träffar`;
          if (profilUrl && s.operation === 'search-type') {
            const med = resurser.filter((x) => (x.meta?.profile || []).map(utan).includes(profilUrl)).length;
            d.text += `, ${med} med profilen ${s.profil}`;
            if (!med) d.status = 'delvis';
          }
        } else if (svar.json?.id) d.text = `${svar.json.resourceType}/${svar.json.id}`;
      } else {
        // 501 från mocken betyder att systemets nuläge saknas: okänt, inte fel.
        d.status = svar.status === 501 ? 'okänt' : 'fel';
        d.text = svar.json?.issue?.[0]?.diagnostics || `HTTP ${svar.status}`;
      }
      r.detaljer.push(d);
    }
    const st = r.detaljer.map((d) => d.status);
    r.status = ['fel', 'delvis', 'okänt', 'antagen'].find((x) => st.includes(x)) || 'ok';
    if (antagen) r.text = `${sys.titel}s klientförmåga är okänd (nuläge saknas) och antas`;
  }
  const st = resultat.map((x) => x.status);
  return {
    system: sys.system, roll: part.roll, tjanst: part.tjanst, anvandningsfall: u.namn, titel: u.titel, forutsattning: !!u.forutsattning,
    status: ['fel', 'delvis', 'okänt'].find((x) => st.includes(x)) || (st.every((x) => ['hoppad', 'manuell'].includes(x)) ? 'manuell' : 'ok'),
    steg: resultat,
  };
}

export async function testaFederation({ ws, manifests, systems, root, regler, port = 0, behall = false }) {
  const fed = await byggFederation({ ws, manifests, systems, root, port });
  try {
    const fore = await liveAnalys(fed, systems, manifests, root, regler);
    const korningar = [];
    // Fas 1: förutsättningarna (anslutning), fas 2: övriga användningsfall.
    for (const fas of [true, false]) {
      for (const sys of systems) {
        const a = fore.find((x) => x.system === sys.system).analys;
        const cs = (await fhir(`${fed.plats.system.get(sys.system)}/metadata`)).json;
        const sysCs = cs?.resourceType === 'CapabilityStatement' ? cs : null;
        for (const part of a.scenarier.filter((p) => !!p.forutsattning === fas)) {
          korningar.push(await korScenario(fed, sys, sysCs, part, manifests));
        }
      }
    }
    const efter = await liveAnalys(fed, systems, manifests, root, regler);
    const stod = [...fed.plats.stod].map(([aktor, url]) => {
      const a = fed.mock.andpunkter.get(new URL(url).pathname);
      return {
        aktor, url,
        anrop: a.logg.length,
        resurser: Object.fromEntries([...a.resurser].map(([t, mp]) => [t, mp.size])),
      };
    });
    const ut = {
      bas: fed.mock.bas,
      genererad: new Date().toISOString(),
      andpunkter: [...fed.mock.andpunkter.values()].map((a) => ({ sokvag: a.sokvag, nulage: !!a.cs, anrop: a.logg.length })),
      fore: fore.map(({ analys, ...x }) => x),
      efter: efter.map(({ analys, ...x }) => x),
      korningar,
      stod,
    };
    return behall ? { ...ut, fed } : ut;
  } finally {
    if (!behall) await fed.mock.stoppa();
  }
}

export function renderFederationReport(r) {
  const out = ['# Federationstest mot mockad federation', '', `Mock: ${r.bas} · ${r.andpunkter.length} ändpunkter · ${r.korningar.length} körningar`, ''];
  out.push('## Anslutningar före och efter förutsättningarna', '', '| System | Före | Efter |', '|---|---|---|');
  for (const f of r.fore) {
    const e = r.efter.find((x) => x.system === f.system);
    const txt = (lista) => lista.map((x) => `${x.roll.split('#')[1]}: ${x.status}`).join('<br>') || '–';
    out.push(`| ${f.system} | ${txt(f.anslutningar)} | ${txt(e.anslutningar)} |`);
  }
  out.push('', '## Körningar', '');
  for (const k of r.korningar) {
    out.push(`### ${k.system} – ${k.titel} (${k.status})`, '', `Roll ${k.roll}${k.forutsattning ? ' · förutsättning' : ''}`, '', '| Steg | Från → till | Operation | Status | Resultat |', '|---|---|---|---|---|');
    for (const s of k.steg) {
      const res = s.detaljer.length ? s.detaljer.map((d) => `${d.anrop} → ${d.http}${d.text ? ` (${d.text})` : ''}`).join('<br>') : (s.text || '');
      out.push(`| ${s.nr} ${s.titel} | ${s.fran || ''} → ${s.till || ''} | ${[s.operation, s.resurstyp].filter(Boolean).join(' ')} | ${s.status} | ${String(res).replace(/\|/g, '\\|')} |`);
    }
    out.push('');
  }
  out.push('## Stödtjänster', '', '| Stödtjänst | Anrop | Resurser |', '|---|---|---|');
  for (const s of r.stod) out.push(`| ${s.aktor} | ${s.anrop} | ${Object.entries(s.resurser).map(([t, n]) => `${t}: ${n}`).join(', ') || '–'} |`);
  return out.join('\n') + '\n';
}
