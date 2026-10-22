// En mockad FHIR-federation i minnet: flera ändpunkter i samma HTTP-server,
// var och en med ett eget CapabilityStatement (kind=instance) och egna
// resurser. En ändpunkt gör bara det dess CapabilityStatement säger:
// interaktioner och sökparametrar som inte finns ger 405 respektive 400, så
// att mocken av ett system speglar systemets nuläge.

import http from 'node:http';

const outcome = (code, text) => ({
  resourceType: 'OperationOutcome',
  issue: [{ severity: 'error', code, diagnostics: text }],
});

// Parametrar som inte är sökparametrar och därför alltid tillåts.
const RESULTAT_PARAMETRAR = new Set(['_count', '_format', '_summary', '_sort', '_elements', '_total']);

export class MockFederation {
  constructor() {
    this.andpunkter = new Map(); // bas-sökväg → { cs, resurser: Map(typ → Map(id → resurs)), logg: [] }
    this.server = null;
    this.bas = null;
  }

  // cs: CapabilityStatement (kind=instance) eller null om nuläge saknas.
  laggTill(sokvag, cs, resurser = []) {
    const a = { sokvag, cs, resurser: new Map(), logg: [], nasta: 1 };
    for (const r of resurser) this.spara(a, structuredClone(r));
    this.andpunkter.set(sokvag, a);
    return a;
  }

  url(sokvag) {
    return `${this.bas}${sokvag}`;
  }

  spara(a, r) {
    if (!a.resurser.has(r.resourceType)) a.resurser.set(r.resourceType, new Map());
    r.id ||= `${r.resourceType.toLowerCase()}-${a.nasta++}`;
    r.meta = { ...(r.meta || {}), versionId: String(Number(r.meta?.versionId || 0) + 1), lastUpdated: new Date().toISOString() };
    a.resurser.get(r.resourceType).set(r.id, r);
    return r;
  }

  // Vad ändpunkten säger att den kan, som server.
  formaga(a, typ) {
    const rest = (a.cs?.rest || []).find((r) => r.mode === 'server');
    if (!rest) return null;
    if (!typ) return { interaktioner: new Set((rest.interaction || []).map((i) => i.code)), sokparametrar: null };
    const res = (rest.resource || []).find((x) => x.type === typ);
    if (!res) return null;
    return {
      interaktioner: new Set((res.interaction || []).map((i) => i.code)),
      sokparametrar: new Set((res.searchParam || []).map((s) => s.name)),
    };
  }

  async starta(port = 0) {
    this.server = http.createServer((req, res) => this.hantera(req, res));
    await new Promise((ok) => this.server.listen(port, '127.0.0.1', ok));
    this.bas = `http://127.0.0.1:${this.server.address().port}`;
    return this.bas;
  }

  async stoppa() {
    if (this.server) await new Promise((ok) => this.server.close(ok));
  }

  async hantera(req, res) {
    const svara = (status, body, extra = {}) => {
      res.writeHead(status, { 'content-type': 'application/fhir+json; charset=utf-8', ...extra });
      res.end(body === undefined ? '' : JSON.stringify(body, null, 2));
    };
    try {
      const u = new URL(req.url, 'http://mock');
      if (u.pathname === '/' || u.pathname === '/_mock') {
        return svara(200, { andpunkter: [...this.andpunkter.keys()].map((s) => ({ sokvag: s, url: this.url(s), nulage: !!this.andpunkter.get(s).cs })) });
      }
      const sokvag = [...this.andpunkter.keys()].filter((s) => u.pathname === s || u.pathname.startsWith(`${s}/`)).sort((x, y) => y.length - x.length)[0];
      if (!sokvag) return svara(404, outcome('not-found', `Ingen ändpunkt på ${u.pathname}`));
      const a = this.andpunkter.get(sokvag);
      const delar = u.pathname.slice(sokvag.length).split('/').filter(Boolean);
      let kropp = null;
      if (req.method === 'POST' || req.method === 'PUT') {
        const text = await new Promise((ok) => { let t = ''; req.on('data', (c) => { t += c; }); req.on('end', () => ok(t)); });
        kropp = text ? JSON.parse(text) : null;
      }
      const logga = (interaktion, status) => a.logg.push({ tid: new Date().toISOString(), metod: req.method, sokvag: u.pathname + u.search, interaktion, status });

      // Nuläge saknas: ändpunkten kan inte avgöra något.
      if (!a.cs) {
        logga('okänd', 501);
        return svara(501, outcome('not-supported', 'Systemets nuläge (CapabilityStatement) är inte inlämnat'));
      }
      if (delar[0] === 'metadata' && req.method === 'GET') {
        logga('capabilities', 200);
        return svara(200, a.cs);
      }
      const kontroll = (typ, interaktion, params) => {
        const f = this.formaga(a, typ);
        if (!f || !f.interaktioner.has(interaktion)) {
          logga(interaktion, 405);
          svara(405, outcome('not-supported', `${interaktion}${typ ? ` på ${typ}` : ''} stöds inte enligt ändpunktens CapabilityStatement`));
          return false;
        }
        const okanda = params ? [...params.keys()].filter((p) => !RESULTAT_PARAMETRAR.has(p) && f.sokparametrar && !f.sokparametrar.has(p)) : [];
        if (okanda.length) {
          logga(interaktion, 400);
          svara(400, outcome('not-supported', `Sökparametrarna ${okanda.join(', ')} stöds inte för ${typ}`));
          return false;
        }
        return true;
      };
      const bundle = (lista) => ({
        resourceType: 'Bundle', type: 'searchset', total: lista.length,
        entry: lista.map((r) => ({ fullUrl: `${this.url(sokvag)}/${r.resourceType}/${r.id}`, resource: r, search: { mode: 'match' } })),
      });

      // search-system: GET [bas]?…
      if (!delar.length && req.method === 'GET') {
        if (!kontroll(null, 'search-system')) return;
        logga('search-system', 200);
        return svara(200, bundle([...a.resurser.values()].flatMap((m) => [...m.values()])));
      }
      const [typ, id] = delar;
      if (req.method === 'GET' && !id) {
        if (!kontroll(typ, 'search-type', u.searchParams)) return;
        let lista = [...(a.resurser.get(typ)?.values() || [])];
        // Mocken filtrerar bara på kategori; övriga värden ignoreras.
        const kategori = u.searchParams.get('category');
        if (kategori) lista = lista.filter((r) => JSON.stringify(r.category || []).includes(kategori.split('|').pop()));
        logga('search-type', 200);
        return svara(200, bundle(lista));
      }
      if (req.method === 'GET' && id) {
        if (!kontroll(typ, 'read')) return;
        const r = a.resurser.get(typ)?.get(id);
        logga('read', r ? 200 : 404);
        return r ? svara(200, r) : svara(404, outcome('not-found', `${typ}/${id} finns inte`));
      }
      if (req.method === 'POST' && !id) {
        if (!kontroll(typ, 'create')) return;
        if (kropp?.resourceType !== typ) return svara(400, outcome('invalid', `Förväntade ${typ}`));
        const r = this.spara(a, { ...kropp, id: undefined });
        logga('create', 201);
        return svara(201, r, { location: `${this.url(sokvag)}/${typ}/${r.id}/_history/${r.meta.versionId}` });
      }
      if (req.method === 'PUT' && id) {
        if (!kontroll(typ, 'update')) return;
        const r = this.spara(a, { ...kropp, id });
        logga('update', 200);
        return svara(200, r);
      }
      logga('okänd', 400);
      return svara(400, outcome('not-supported', `${req.method} ${u.pathname} stöds inte av mocken`));
    } catch (err) {
      svara(500, outcome('exception', err.message));
    }
  }
}

export async function fhir(url, { metod = 'GET', kropp } = {}) {
  const svar = await fetch(url, {
    method: metod,
    headers: { accept: 'application/fhir+json', ...(kropp ? { 'content-type': 'application/fhir+json' } : {}) },
    body: kropp ? JSON.stringify(kropp) : undefined,
  });
  const text = await svar.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: svar.status, json };
}
