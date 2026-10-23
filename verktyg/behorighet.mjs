// Behörigheter ur IG:erna. En roll (tjänsteaktör) har ett klient-
// CapabilityStatement i tjänstens IG; det säger exakt vilka resurstyper och
// interaktioner rollen behöver som klient. Här översätts det till
//   - mottagare: vilken aktör som tar emot varje anrop (producent eller
//     stödtjänst), härlett ur aktörernas serverförmågor,
//   - scopes enligt SMART v2 (system/<Typ>.<cruds>) per mottagare, och
//   - ett klient-CapabilityStatement för ett konkret system (kind=instance),
//     som instantiates rollernas förmågor.
//
// Taket kommer alltid från IG:n: ett system kan smalna av (välja bort
// informationsmängder) men aldrig få mer än rollens förmågor.

import { stangningAv, aktorKedja } from './system.mjs';
import { analyseraAnslutningar, MILJOER, ATERKALLAD } from './anslutning.mjs';
import { wso2Plan } from './wso2.mjs';

// FHIR-interaktion → SMART v2-behörighet. search-system och capabilities
// har inget typvist scope (sökning över typer täcks av de typvisa).
const SMART = { create: 'c', read: 'r', vread: 'r', 'history-instance': 'r', 'history-type': 'r', update: 'u', patch: 'u', delete: 'd', 'search-type': 's' };
const ORDNING = 'cruds';
const utan = (url) => String(url).split('|')[0];

// Serverförmågor per aktör: typ → interaktioner, över aktörens hela kedja av
// importerade CapabilityStatements.
function serverformagor(m, aktor) {
  const cs = m.aktorer[aktor]?.formagor;
  const ut = new Map();
  if (!cs) return ut;
  for (const n of stangningAv(m, [cs])) {
    for (const b of m.formagor[n].rest.filter((x) => x.mode === 'server')) {
      for (const [typ, v] of Object.entries(b.resurser)) {
        if (!ut.has(typ)) ut.set(typ, new Set());
        for (const i of v.interaktioner) ut.get(typ).add(i);
      }
    }
  }
  return ut;
}

// Klientförmågor för en roll: typ → { interaktioner, profiler }, plus
// systemnivåns interaktioner.
export function klientformagor(m, aktor) {
  const cs = m.aktorer[aktor]?.formagor;
  const resurser = new Map();
  const system = new Set();
  if (!cs) return { resurser, system };
  for (const n of stangningAv(m, [cs])) {
    for (const b of m.formagor[n].rest.filter((x) => x.mode === 'client')) {
      for (const i of b.system) system.add(i);
      for (const [typ, v] of Object.entries(b.resurser)) {
        if (!resurser.has(typ)) resurser.set(typ, { interaktioner: new Set(), profiler: new Map() });
        const r = resurser.get(typ);
        for (const i of v.interaktioner) r.interaktioner.add(i);
        for (const p of v.profiler) r.profiler.set(utan(p.url), p);
      }
    }
  }
  return { resurser, system };
}

// En konsumentroll har klientförmågor men inga serverförmågor.
export function arKonsumentroll(m, aktor) {
  const k = klientformagor(m, aktor);
  return k.resurser.size > 0 && serverformagor(m, aktor).size === 0;
}

// Vem tar emot anropet typ/interaktion i tjänsten? Tjänsteaktörer före
// stödtjänster; annars de mest specifika aktörerna (inte förfäder till en
// annan kandidat). Rollen själv och dess förfäder räknas inte.
export function mottagareFor(m, aktor, typ, interaktion) {
  const egna = new Set(aktorKedja(m, aktor));
  const tjanstens = new Set(m.kravprofiler.map((k) => k.aktor));
  const alla = Object.keys(m.aktorer).filter((a) => !egna.has(a) && m.aktorer[a].typ !== 'person');
  const medTyp = alla.filter((a) => serverformagor(m, a).has(typ));
  const exakt = medTyp.filter((a) => serverformagor(m, a).get(typ).has(interaktion));
  const kandidater = exakt.length ? exakt : medTyp;
  const tj = kandidater.filter((a) => tjanstens.has(a));
  if (tj.length) return tj;
  const st = kandidater.filter((a) => m.aktorer[a].stodtjanst);
  if (st.length) return st;
  return kandidater.filter((a) => !kandidater.some((b) => b !== a && aktorKedja(m, b).slice(1).includes(a)));
}

// Scopes för samma typ slås ihop: system/Endpoint.cu + system/Endpoint.s →
// system/Endpoint.cus.
export function sammanfogaScopes(lista) {
  const per = new Map();
  for (const s of lista) {
    const [, typ, p] = String(s).match(/^system\/([A-Za-z]+)\.([cruds]+)$/) || [];
    if (!typ) continue;
    per.set(typ, new Set([...(per.get(typ) || []), ...p]));
  }
  return [...per].sort((a, b) => a[0].localeCompare(b[0])).map(([typ, p]) => `system/${typ}.${[...p].sort((a, b) => ORDNING.indexOf(a) - ORDNING.indexOf(b)).join('')}`);
}

const scope = (typ, koder) => {
  const p = [...new Set([...koder].map((k) => SMART[k]).filter(Boolean))].sort((a, b) => ORDNING.indexOf(a) - ORDNING.indexOf(b)).join('');
  return p ? `system/${typ}.${p}` : null;
};

// Behörigheterna för en roll i en tjänst. valda: informationsmängder som
// systemet valt (nycklar); utan val gäller alla. Resurstyper som bara hör
// till bortvalda informationsmängder tas bort.
export function behorigheterForRoll(m, aktor, valda = null) {
  const { resurser, system } = klientformagor(m, aktor);
  const mangder = m.informationsmangder || [];
  const bortvalda = new Set(valda ? mangder.filter((i) => !valda.includes(i.nyckel)).map((i) => i.resurstyp) : []);
  for (const i of mangder) if (valda?.includes(i.nyckel)) bortvalda.delete(i.resurstyp);
  for (const t of [...bortvalda]) if (!resurser.has(t)) bortvalda.delete(t);
  const perMottagare = new Map();
  const utanMottagare = [];
  const operationer = [];
  for (const [typ, r] of [...resurser].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (bortvalda.has(typ)) continue;
    const koder = r.interaktioner.size ? [...r.interaktioner] : ['search-type'];
    for (const kod of koder) {
      const till = mottagareFor(m, aktor, typ, kod);
      operationer.push({ typ, interaktion: kod, mottagare: till, profiler: [...r.profiler.values()].map((p) => p.url) });
      if (!till.length) utanMottagare.push(`${typ} ${kod}`);
      for (const t of till) {
        if (!perMottagare.has(t)) perMottagare.set(t, new Map());
        const x = perMottagare.get(t);
        if (!x.has(typ)) x.set(typ, new Set());
        x.get(typ).add(kod);
      }
    }
  }
  const mottagare = [...perMottagare].map(([a, typer]) => ({
    aktor: a, titel: m.aktorer[a]?.titel || a, stodtjanst: !!m.aktorer[a]?.stodtjanst,
    scopes: [...typer].map(([typ, koder]) => scope(typ, koder)).filter(Boolean),
    interaktioner: [...typer].flatMap(([typ, koder]) => [...koder].map((k) => ({ typ, kod: k }))),
  })).sort((a, b) => Number(a.stodtjanst) - Number(b.stodtjanst) || a.aktor.localeCompare(b.aktor));
  return {
    tjanst: m.ig.id, tjanstTitel: m.ig.titel, version: m.ig.version, aktor, titel: m.aktorer[aktor]?.titel || aktor,
    formagor: m.aktorer[aktor]?.formagor ? m.formagor[m.aktorer[aktor].formagor].url : null,
    systemInteraktioner: [...system], operationer, mottagare,
    scopes: [...new Set(mottagare.flatMap((x) => x.scopes))].sort(),
    utanMottagare,
    bortvalda: [...bortvalda].sort(),
  };
}

// Klient-CapabilityStatement (kind=instance) för ett konkret system och dess
// roller. instantiates pekar på rollernas förmågor i tjänste-IG:erna.
export function klientCapabilityStatement(sys, behorigheter, { miljo = 'test', datum = new Date().toISOString().slice(0, 10) } = {}) {
  const perTyp = new Map();
  const system = new Set();
  for (const b of behorigheter) {
    for (const i of b.systemInteraktioner) system.add(i);
    for (const o of b.operationer) {
      if (!perTyp.has(o.typ)) perTyp.set(o.typ, { koder: new Set(), profiler: new Set() });
      perTyp.get(o.typ).koder.add(o.interaktion);
      for (const p of o.profiler) perTyp.get(o.typ).profiler.add(p);
    }
  }
  const namn = String(sys.system).replace(/[^A-Za-z0-9]/g, '');
  return {
    resourceType: 'CapabilityStatement',
    id: `${namn}-klient-${miljo}`.toLowerCase(),
    name: `${namn}Klient${miljo[0].toUpperCase()}${miljo.slice(1)}`,
    title: `Klientförmåga: ${sys.titel || sys.system} (${miljo})`,
    status: 'draft',
    date: datum,
    publisher: sys.organisation?.namn || undefined,
    description: `Genererad av ig-composer ur rollernas klientförmågor: ${behorigheter.map((b) => `${b.titel} i ${b.tjanstTitel}`).join(', ')}.`,
    kind: 'instance',
    instantiates: behorigheter.map((b) => b.formagor && `${b.formagor}|${b.version}`).filter(Boolean),
    software: { name: sys.titel || sys.system },
    implementation: { description: `${sys.titel || sys.system} i miljön ${miljo}` },
    fhirVersion: '5.0.0',
    format: ['json'],
    rest: [{
      mode: 'client',
      resource: [...perTyp].sort((a, b) => a[0].localeCompare(b[0])).map(([typ, v]) => ({
        type: typ,
        ...(v.profiler.size ? { supportedProfile: [...v.profiler].sort() } : {}),
        interaction: [...v.koder].sort().map((code) => ({ code })),
      })),
      ...(system.size ? { interaction: [...system].sort().map((code) => ({ code })) } : {}),
    }],
  };
}

// Alla behörigheter för ett system: en post per roll. Rollen kan smalna av med
// informationsmangder (anslutningens val); systemets informationsmangder
// gäller vad det tillhandahåller som server och påverkar inte klientsidan.
export function behorigheterForSystem(sys, manifests, roller = sys.roller || []) {
  const fel = [];
  const ut = [];
  for (const r of roller) {
    const m = manifests[r.tjanst];
    if (!m) { fel.push(`${r.tjanst} saknar komposition.json`); continue; }
    if (!m.kravprofiler.some((k) => k.aktor === r.aktor)) { fel.push(`${r.aktor} är ingen tjänsteaktör i ${r.tjanst}`); continue; }
    ut.push(behorigheterForRoll(m, r.aktor, r.informationsmangder || null));
  }
  return { behorigheter: ut, fel };
}

// Allt om ett systems anslutningar för vyn och CLI:t: anslutningarna med
// statuskedja och, per miljö med anslutningar, behörigheterna per roll,
// klient-CapabilityStatement och WSO2-planen (torrkörning).
export function behorighetFor(sys, manifests) {
  const anslutningar = analyseraAnslutningar(sys, manifests);
  const miljoer = {};
  for (const miljo of MILJOER) {
    const iMiljo = (sys.anslutningar || []).filter((a) => a.miljo === miljo);
    if (!iMiljo.length) continue;
    const { behorigheter, fel } = behorigheterForSystem(sys, manifests,
      iMiljo.map((a) => ({ tjanst: a.tjanst, aktor: a.aktor, informationsmangder: a.informationsmangder })));
    const giltiga = behorigheter.filter((b) => iMiljo.find((a) => a.tjanst === b.tjanst && a.aktor === b.aktor)?.status !== ATERKALLAD);
    miljoer[miljo] = {
      behorigheter, fel,
      scopes: sammanfogaScopes(behorigheter.filter((b) => giltiga.includes(b)).flatMap((b) => b.scopes)),
      klientCs: giltiga.length ? klientCapabilityStatement(sys, giltiga, { miljo }) : null,
      wso2: wso2Plan(sys, behorigheter, sys.anslutningar, { miljo }),
    };
  }
  return { anslutningar, miljoer };
}
