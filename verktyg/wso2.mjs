// WSO2 API Manager-adapter, i torrkörningsläge: tar fram vad som skulle
// skapas för ett system i en miljö, utan att anropa WSO2.
//
//   API (Publisher)     ett per mottagare: tjänstens producentroll eller en
//                       stödtjänst, med operationer och scopes ur IG:erna
//   API Product         ett per roll (tjänst + aktör): rollens operationer
//                       hos alla mottagare, så att en prenumeration = en roll
//   Applikation         ett per system och miljö
//   Prenumerationer     applikationen × rollernas API Products
//   Nycklar             client credentials; SANDBOX i test, PRODUCTION i prod
//
// Bara roller med behörighet i miljön (enligt anslutningens status) ingår;
// återkallade roller ger borttag av prenumerationen. Sökvägarna gäller
// API Manager 4.x (Publisher v4, DevPortal v3) och behöver stämmas av mot
// den installation som används.

import { harBehorighet, ATERKALLAD } from './anslutning.mjs';

const PUBLISHER = '/api/am/publisher/v4';
const DEVPORTAL = '/api/am/devportal/v3';
export const STANDARD = {
  test: { keyType: 'SANDBOX', applikationspolicy: '10PerMin', prenumerationspolicy: 'Bronze', giltighet: 3600, kraverGodkannande: false },
  prod: { keyType: 'PRODUCTION', applikationspolicy: 'Unlimited', prenumerationspolicy: 'Unlimited', giltighet: 900, kraverGodkannande: true },
};

const VERB = {
  'search-type': ['GET', (t) => `/${t}`],
  read: ['GET', (t) => `/${t}/{id}`],
  vread: ['GET', (t) => `/${t}/{id}/_history/{vid}`],
  'history-instance': ['GET', (t) => `/${t}/{id}/_history`],
  'history-type': ['GET', (t) => `/${t}/_history`],
  create: ['POST', (t) => `/${t}`],
  update: ['PUT', (t) => `/${t}/{id}`],
  patch: ['PATCH', (t) => `/${t}/{id}`],
  delete: ['DELETE', (t) => `/${t}/{id}`],
};
const SMART = { 'search-type': 's', read: 'r', vread: 'r', 'history-instance': 'r', 'history-type': 'r', create: 'c', update: 'u', patch: 'u', delete: 'd' };
const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const tjanstSlug = (id) => String(id).split('.').pop();

const operation = (typ, kod) => {
  const v = VERB[kod];
  return v ? { verb: v[0], target: v[1](typ), scope: `system/${typ}.${SMART[kod]}` } : null;
};

const apiNamn = (b, x) => (x.stodtjanst ? x.aktor : `${tjanstSlug(b.tjanst)}-${x.aktor}`);
const produktNamn = (b) => `${tjanstSlug(b.tjanst)}-${b.aktor}`;

// sys: systemet; behorigheter: behorigheterForRoll per roll (med tjanst,
// aktor); anslutningar: systemets anslutningar (alla miljöer).
export function wso2Plan(sys, behorigheter, anslutningar, { miljo = 'test', installningar = {} } = {}) {
  const inst = { ...STANDARD[miljo], ...installningar };
  if (!STANDARD[miljo]) throw new Error(`Okänd miljö ${miljo}`);
  const iMiljo = (anslutningar || []).filter((a) => a.miljo === miljo);
  const anslutningFor = (b) => iMiljo.find((a) => a.tjanst === b.tjanst && a.aktor === b.aktor);
  const med = behorigheter.filter((b) => { const a = anslutningFor(b); return a && harBehorighet(a); });
  const vantar = behorigheter.filter((b) => { const a = anslutningFor(b); return a && !harBehorighet(a) && a.status !== ATERKALLAD; });
  const aterkallade = behorigheter.filter((b) => anslutningFor(b)?.status === ATERKALLAD);

  // API:er per mottagare, med de operationer någon av rollerna behöver.
  const apier = new Map();
  for (const b of med) {
    for (const x of b.mottagare) {
      const namn = apiNamn(b, x);
      if (!apier.has(namn)) {
        apier.set(namn, {
          name: namn, version: x.stodtjanst ? '1.0.0' : b.version,
          context: x.stodtjanst ? `/stod/${kebab(x.aktor)}` : `/${tjanstSlug(b.tjanst)}/${kebab(x.aktor)}`,
          mottagare: x.aktor, mottagareTitel: x.titel, stodtjanst: x.stodtjanst, tjanst: x.stodtjanst ? null : b.tjanst,
          operations: new Map(),
        });
      }
      for (const i of x.interaktioner) {
        const o = operation(i.typ, i.kod);
        if (o) apier.get(namn).operations.set(`${o.verb} ${o.target}`, o);
      }
    }
  }
  const apiUt = [...apier.values()].map((a) => {
    const ops = [...a.operations.values()].sort((p, q) => p.target.localeCompare(q.target) || p.verb.localeCompare(q.verb));
    return {
      ...a,
      operations: ops.map((o) => ({ verb: o.verb, target: o.target, scopes: [o.scope] })),
      scopes: [...new Set(ops.map((o) => o.scope))].sort().map((name) => ({ scope: { name, displayName: name }, shared: false })),
    };
  }).sort((a, b) => Number(a.stodtjanst) - Number(b.stodtjanst) || a.name.localeCompare(b.name));

  const produkter = med.map((b) => ({
    name: produktNamn(b), context: `/produkt/${tjanstSlug(b.tjanst)}/${kebab(b.aktor)}`,
    tjanst: b.tjanst, aktor: b.aktor, titel: `${b.titel} (${b.tjanstTitel})`,
    policies: [inst.prenumerationspolicy],
    apis: b.mottagare.map((x) => ({
      name: apiNamn(b, x),
      operations: x.interaktioner.map((i) => operation(i.typ, i.kod)).filter(Boolean).map((o) => ({ verb: o.verb, target: o.target })),
    })),
  }));

  const applikation = {
    name: `${sys.system}-${miljo}`,
    throttlingPolicy: inst.applikationspolicy,
    tokenType: 'JWT',
    description: `${sys.titel || sys.system} (${miljo}), skapad av ig-composer`,
    attributes: { system: sys.system, ...(sys.organisation?.hsaId ? { hsaId: sys.organisation.hsaId } : {}) },
  };
  // WSO2 utfärdar bara scopes som finns på de prenumererade API:ernas
  // operationer, så nyckeln begär operationsscopen (ett per bokstav).
  const scopes = [...new Set(apiUt.flatMap((a) => a.operations.flatMap((o) => o.scopes)))].sort();
  const nycklar = { keyType: inst.keyType, grantTypesToBeSupported: ['client_credentials'], scopes, validityTime: inst.giltighet };
  const prenumerationer = produkter.map((p) => ({ applikation: applikation.name, apiProdukt: p.name, throttlingPolicy: inst.prenumerationspolicy, kraverGodkannande: inst.kraverGodkannande }));
  const borttag = aterkallade.map((b) => ({ applikation: applikation.name, apiProdukt: produktNamn(b) }));

  const anrop = [
    ...apiUt.map((a) => ({ metod: 'POST', sokvag: `${PUBLISHER}/apis`, beskrivning: `API ${a.name} (${a.mottagareTitel}), om det inte finns`, kropp: { name: a.name, context: a.context, version: a.version, operations: a.operations, scopes: a.scopes } })),
    ...produkter.map((p) => ({ metod: 'POST', sokvag: `${PUBLISHER}/api-products`, beskrivning: `API Product ${p.name}, om den inte finns`, kropp: { name: p.name, context: p.context, policies: p.policies, apis: p.apis } })),
    ...(produkter.length ? [
      { metod: 'POST', sokvag: `${DEVPORTAL}/applications`, beskrivning: `Applikation ${applikation.name}`, kropp: applikation },
      { metod: 'POST', sokvag: `${DEVPORTAL}/subscriptions/multiple`, beskrivning: `${prenumerationer.length} prenumerationer${inst.kraverGodkannande ? ' (väntar på godkännande i arbetsflödet)' : ''}`, kropp: prenumerationer.map((p) => ({ applicationId: '{applicationId}', apiId: `{${p.apiProdukt}}`, throttlingPolicy: p.throttlingPolicy })) },
      { metod: 'POST', sokvag: `${DEVPORTAL}/applications/{applicationId}/generate-keys`, beskrivning: `Nycklar (${nycklar.keyType}, client credentials)`, kropp: nycklar },
    ] : []),
    ...borttag.map((b) => ({ metod: 'DELETE', sokvag: `${DEVPORTAL}/subscriptions/{${b.apiProdukt}}`, beskrivning: `Ta bort prenumerationen på ${b.apiProdukt} (återkallad)` })),
  ];

  return {
    miljo, torrkorning: true, system: sys.system,
    applikation: produkter.length ? applikation : null,
    apier: apiUt, apiProdukter: produkter, prenumerationer, nycklar: produkter.length ? nycklar : null, borttag,
    vantar: vantar.map((b) => ({ tjanst: b.tjanst, aktor: b.aktor, status: anslutningFor(b).status })),
    anrop,
    anmarkningar: [
      'Torrkörning: inga anrop görs mot WSO2.',
      'Sökvägarna gäller API Manager 4.x (Publisher v4, DevPortal v3); stäm av mot er installation.',
      'Scopenamnen följer SMART v2 (system/Typ.cruds); kontrollera att er version tillåter / och . i scopenamn, annars behöver de mappas.',
      'Bara API:er bakom Ineras gateway skyddas av WSO2. Producenter som exponerar egna API:er kontrollerar åtkomstintygets scopes själva.',
    ],
  };
}
