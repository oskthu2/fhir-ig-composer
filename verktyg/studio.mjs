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
//   POST /api/aterstall            { fil }        git checkout av en fil
//   POST /api/bygg                                hela bygget med SUSHI

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { loadSystems } from './system.mjs';

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

export function skrivSystem(root, namn, s) {
  if (!SYSTEMNAMN.test(namn)) throw new Error(`Ogiltigt systemnamn ${namn}`);
  const dir = path.join(root, 'system');
  const befintlig = fs.readdirSync(dir).find((f) => /\.ya?ml$/.test(f) && YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8'))?.system === namn);
  const fil = path.join(dir, befintlig || `${namn.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.yaml`);
  const doc = befintlig ? YAML.parseDocument(fs.readFileSync(fil, 'utf8')) : new YAML.Document({ system: namn });
  const satt = (nyckel, v) => {
    if (v === undefined) return;
    if (v === null || (Array.isArray(v) && !v.length && nyckel !== 'roller')) doc.delete(nyckel);
    else doc.set(nyckel, v);
  };
  satt('titel', s.titel);
  if (s.organisation) satt('organisation', { namn: s.organisation.namn, ...(s.organisation.hsaId ? { hsaId: s.organisation.hsaId } : {}) });
  satt('andpunkter', s.andpunkter);
  satt('roller', s.roller);
  satt('tillval', s.tillval);
  if (s.informationsmangder !== undefined) {
    const m = Object.fromEntries(Object.entries(s.informationsmangder || {}).filter(([, v]) => v?.length));
    satt('informationsmangder', Object.keys(m).length ? m : null);
  }
  if (!befintlig && !doc.has('nulage')) doc.set('nulage', { katalog: 'nulage/t2-katalog.json' });
  fs.writeFileSync(fil, doc.toString({ lineWidth: 0 }));
  return path.relative(root, fil);
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

// ---- server

export async function startaStudio({ root, port = 4900, vard = '127.0.0.1', verktyg }) {
  const { loadWorkspace, viewData, renderView, komponeraAlla, bygg } = verktyg;
  const sida = () => {
    const ws = loadWorkspace(root);
    const data = viewData(ws, root);
    data.studio = { skisser: skisser(ws, root), konfiguration: konfiguration(ws), andringar: andringar(root), system: loadSystems(root) };
    return renderView(data);
  };
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
