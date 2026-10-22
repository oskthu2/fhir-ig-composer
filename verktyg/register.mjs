// Definitionsregister: IG:arnas definitioner (profiler, logiska modeller,
// aktörer, förmågor, krav, ExampleScenario, ImplementationGuide …) publicerade
// i en FHIR-server (t.ex. HAPI R5) och nåbara som API, i stället för att bara
// ligga som paket i ett repo. Tjänstekatalogen gör samma sak för
// anslutningspunkter; registret gör det för specifikationerna.
//
// Varje definition skrivs med villkorad uppdatering på url och version, så
// att samma definition aldrig finns två gånger och samma körning kan göras om.
// Varje resurs taggas med IG:n den kommer från.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fhir } from './mock.mjs';

export const IG_TAGG = 'https://fhir.inera.se/ig/conventions/CodeSystem/ig';
const DEFINITIONER = new Set([
  'StructureDefinition', 'ValueSet', 'CodeSystem', 'CapabilityStatement', 'ActorDefinition', 'Requirements',
  'ExampleScenario', 'PlanDefinition', 'ActivityDefinition', 'ImplementationGuide', 'SearchParameter', 'OperationDefinition', 'ConceptMap',
]);

export const registerUrl = (flagga) => (flagga || process.env.FHIR_REGISTER || 'http://localhost:8080/fhir').replace(/\/$/, '');

// IG:ns definitioner från SUSHI:s utdata.
export function definitioner(ig) {
  const dir = path.join(ig.dir, 'fsh-generated', 'resources');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter((r) => DEFINITIONER.has(r.resourceType) && r.url);
}

// En transaktion per IG: PUT [typ]?url=…&version=… för varje definition.
// ImplementationGuide-resursens referenser pekas om till transaktionens
// poster (servern sätter egna id); exempel ingår inte i registret.
export function transaktion(ig, resurser) {
  const poster = new Map(resurser.map((r) => [`${r.resourceType}/${r.id}`, `urn:uuid:${crypto.randomUUID()}`]));
  return {
    resourceType: 'Bundle', type: 'transaction',
    entry: resurser.map((r) => {
      const { id, ...utanId } = r;
      const taggar = (r.meta?.tag || []).filter((t) => t.system !== IG_TAGG);
      const kropp = { ...utanId, meta: { ...(r.meta || {}), tag: [...taggar, { system: IG_TAGG, code: ig.id, display: ig.title }] } };
      if (r.resourceType === 'ImplementationGuide' && kropp.definition?.resource) {
        kropp.definition = {
          ...kropp.definition,
          resource: kropp.definition.resource.filter((x) => poster.has(x.reference?.reference))
            .map((x) => ({ ...x, reference: { ...x.reference, reference: poster.get(x.reference.reference) } })),
        };
      }
      const villkor = new URLSearchParams({ url: r.url, ...(r.version ? { version: r.version } : {}) });
      return { fullUrl: poster.get(`${r.resourceType}/${id}`), resource: kropp, request: { method: 'PUT', url: `${r.resourceType}?${villkor}` } };
    }),
  };
}

export async function publiceraRegister({ server, igs }) {
  const ut = [];
  for (const ig of igs) {
    const resurser = definitioner(ig);
    if (!resurser.length) continue;
    const svar = await fhir(server, { metod: 'POST', kropp: transaktion(ig, resurser) });
    const status = (svar.json?.entry || []).map((e) => e.response?.status?.split(' ')[0]);
    ut.push({
      ig: ig.id, antal: resurser.length, http: svar.status,
      skapade: status.filter((s) => s === '201').length, uppdaterade: status.filter((s) => s === '200').length,
      fel: svar.status >= 300 ? (svar.json?.issue || []).map((i) => i.diagnostics).slice(0, 3) : [],
    });
  }
  return ut;
}

// Sökning som följer nästa-länkar.
export async function sok(server, fraga) {
  const ut = [];
  let url = `${server}/${fraga}`;
  for (let i = 0; url && i < 50; i++) {
    // HAPI cachar sökresultat; registret ska alltid läsa det senast publicerade.
    const svar = await fhir(url, { headers: { 'cache-control': 'no-cache' } });
    if (svar.json?.resourceType !== 'Bundle') throw new Error(`${url}: HTTP ${svar.status}`);
    ut.push(...(svar.json.entry || []).map((e) => e.resource));
    url = (svar.json.link || []).find((l) => l.relation === 'next')?.url || null;
  }
  return ut;
}

// Översikt: antal definitioner per IG och resurstyp.
export async function listaRegister(server) {
  const per = new Map();
  for (const typ of DEFINITIONER) {
    for (const r of await sok(server, `${typ}?_count=200&_elements=url,version,meta`)) {
      const ig = (r.meta?.tag || []).find((t) => t.system === IG_TAGG)?.code || '(utan IG)';
      if (!per.has(ig)) per.set(ig, {});
      per.get(ig)[typ] = (per.get(ig)[typ] || 0) + 1;
    }
  }
  return [...per].map(([ig, typer]) => ({ ig, typer })).sort((a, b) => a.ig.localeCompare(b.ig));
}

// Ett flöde ur registret – ExampleScenario (tillämpat) eller PlanDefinition
// (logiskt), efter den kanoniska URL:ens typ – med resolver för delflödena.
export async function scenarioFranRegister(server, url) {
  const cache = new Map();
  const hamta = async (u) => {
    const [bas, version] = u.split('|');
    const typ = /\/PlanDefinition\//.test(bas) ? 'PlanDefinition' : 'ExampleScenario';
    if (!cache.has(u)) cache.set(u, (await sok(server, `${typ}?url=${encodeURIComponent(bas)}${version ? `&version=${encodeURIComponent(version)}` : ''}`))[0] || null);
    return cache.get(u);
  };
  const es = await hamta(url);
  if (!es) return null;
  // Läs in delflödena i förväg, så att resolvern kan vara synkron.
  const koa = [es];
  for (let i = 0; i < koa.length && i < 50; i++) {
    for (const w of JSON.stringify(koa[i]).match(/"(workflow|definitionCanonical)":"[^"]+"/g) || []) {
      const sub = await hamta(w.split('":"')[1].slice(0, -1));
      if (sub && !koa.includes(sub)) koa.push(sub);
    }
  }
  return { es, resolver: (u) => koa.find((x) => x.url === u.split('|')[0]) || null };
}
