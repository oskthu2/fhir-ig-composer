// Publicering: en webbrot för fhir.inera.se där IG:arnas kanoniska URL:er
// fungerar både som webbsidor och som API.
//
//   <ut>/ig/<namn>/                 aktuell version (kopia av den senaste)
//   <ut>/ig/<namn>/<version>/       varje publicerad version
//   <ut>/ig/<namn>/package-list.json   versionerna (HL7:s package-list-format)
//   <ut>/ig/<namn>/package.tgz      FHIR-paketet (även per version)
//   <ut>/package-feed.xml           paketflöde (RSS) som paketregister kan läsa
//   <ut>/index.html                 alla IG:ar
//
// Innehållet tas från IG Publishers utdata (output/) när den finns, annars från
// SUSHI:s (fsh-generated): då blir det resurserna som JSON, en enkel HTML-sida
// per resurs och ett paket. Webbroten serveras av nginx (webb/nginx.conf),
// som väljer HTML, JSON eller XML för en kanonisk URL efter Accept eller
// _format, och skickar /fhir/ till definitionsregistret.
//
// Tidigare versioner i en befintlig webbrot behålls, så webbroten kan byggas på
// över tid (t.ex. genom att hämta den publicerade innan nästa publicering).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const RESURSFIL = /^([A-Z][A-Za-z]+)-([A-Za-z0-9\-.]{1,64})\.json$/;

// Sökvägen i webbroten för en kanonisk URL: https://fhir.inera.se/ig/npo → ig/npo.
export function webbsokvag(canonical, bas) {
  const u = new URL(canonical);
  const b = new URL(bas);
  if (u.host !== b.host) return { sokvag: u.pathname.replace(/^\/|\/$/g, ''), varning: `${canonical} ligger inte under ${bas}` };
  return { sokvag: u.pathname.replace(/^\/|\/$/g, ''), varning: null };
}

const kopiera = (fran, till) => {
  fs.rmSync(till, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(till), { recursive: true });
  fs.cpSync(fran, till, { recursive: true });
};

// En enkel HTML-sida för en resurs, när IG Publishers sidor saknas.
function resurssida(r, igTitel) {
  const titel = r.title || r.name || `${r.resourceType}/${r.id}`;
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)} – ${esc(igTitel)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#22201e;background:#f7f6f4}pre{background:#fff;border:1px solid #dedad4;border-radius:8px;padding:12px;overflow:auto;font-size:13px}a{color:#a33a6a}@media (prefers-color-scheme:dark){body{background:#171615;color:#ecebe8}pre{background:#201f1d;border-color:#3a3734}a{color:#e07aa8}}</style>
</head><body><p><a href="index.html">${esc(igTitel)}</a></p><h1>${esc(titel)}</h1>
<p>${esc(r.resourceType)}${r.url ? ` · <code>${esc(r.url)}</code>` : ''}${r.version ? ` · version ${esc(r.version)}` : ''}${r.status ? ` · ${esc(r.status)}` : ''}</p>
${r.description ? `<p>${esc(r.description)}</p>` : ''}<p><a href="${esc(r.resourceType)}-${esc(r.id)}.json">JSON</a></p>
<pre>${esc(JSON.stringify(r, null, 2))}</pre></body></html>
`;
}

function indexsida(ig, resurser) {
  const rader = resurser.map((r) => `<tr><td>${esc(r.resourceType)}</td><td><a href="${esc(r.resourceType)}-${esc(r.id)}.html">${esc(r.title || r.name || r.id)}</a></td><td><a href="${esc(r.resourceType)}-${esc(r.id)}.json">json</a></td></tr>`).join('\n');
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(ig.title)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#22201e;background:#f7f6f4}td{padding:3px 10px 3px 0}a{color:#a33a6a}@media (prefers-color-scheme:dark){body{background:#171615;color:#ecebe8}a{color:#e07aa8}}</style>
</head><body><p><a href="/">fhir.inera.se</a></p><h1>${esc(ig.title)}</h1><p><code>${esc(ig.canonical)}</code> · ${esc(ig.id)}#${esc(ig.version)} · FHIR ${esc(ig.fhirVersion)}</p>
<p>Utan IG Publishers sidor: resurserna som JSON och en enkel sida per resurs. <a href="package.tgz">Paketet</a> · <a href="package-list.json">versioner</a></p>
<table>${rader}</table></body></html>
`;
}

// Bygger ett FHIR-paket av SUSHI:s utdata.
function packa(ig, resursKatalog, ut) {
  const tmp = fs.mkdtempSync(path.join(path.dirname(ut), '.paket-'));
  const pkg = path.join(tmp, 'package');
  fs.mkdirSync(pkg, { recursive: true });
  for (const f of fs.readdirSync(resursKatalog).filter((x) => x.endsWith('.json'))) fs.copyFileSync(path.join(resursKatalog, f), path.join(pkg, f));
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({
    name: ig.id, version: ig.version, canonical: ig.canonical, url: ig.canonical, title: ig.title,
    fhirVersions: [ig.fhirVersion], dependencies: ig.dependencies || {}, type: 'fhir.ig', license: 'CC0-1.0',
  }, null, 2));
  const r = spawnSync('tar', ['-czf', ut, '-C', tmp, 'package']);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`Kunde inte packa ${ig.id}: ${r.stderr}`);
}

function uppdateraPackageList(fil, ig, { datum, status }) {
  const pl = fs.existsSync(fil) ? JSON.parse(fs.readFileSync(fil, 'utf8')) : { 'package-id': ig.id, title: ig.title, canonical: ig.canonical, list: [] };
  pl.title = ig.title;
  pl.list = (pl.list || []).filter((v) => v.version !== 'current' && v.version !== ig.version).map((v) => ({ ...v, current: false }));
  pl.list.unshift(
    { version: 'current', desc: 'Senaste bygget', path: ig.canonical, status: 'ci-build', current: true },
    { version: ig.version, date: datum, desc: `${ig.title} ${ig.version}`, path: `${ig.canonical}/${ig.version}`, status, fhirversion: ig.fhirVersion, current: true },
  );
  fs.writeFileSync(fil, JSON.stringify(pl, null, 2) + '\n');
  return pl;
}

function paketflode(paket, bas) {
  const items = paket.map((p) => `  <item>
    <title>${esc(p.id)}#${esc(p.version)}</title>
    <description>${esc(p.title)}</description>
    <link>${esc(p.canonical)}/${esc(p.version)}/package.tgz</link>
    <guid isPermaLink="true">${esc(p.canonical)}/${esc(p.version)}/package.tgz</guid>
    <dc:creator>Inera AB</dc:creator>
    <fhir:version>${esc(p.fhirVersion)}</fhir:version>
    <fhir:kind>IG</fhir:kind>
    <pubDate>${new Date(p.datum).toUTCString()}</pubDate>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:fhir="http://hl7.org/fhir/feed" version="2.0">
<channel>
  <title>FHIR-paket från Inera</title>
  <link>${esc(bas)}/package-feed.xml</link>
  <description>FHIR-paket för Ineras IG:ar</description>
  <generator>ig-composer</generator>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

function rotsida(igs, bas) {
  const ROLL = { konvention: 'Konvention', byggblock: 'Byggblock', federation: 'Federation', stodtjanst: 'Stödtjänst', tjanst: 'Tjänst' };
  const rader = igs.map((x) => `<tr><td>${esc(ROLL[x.roll] || x.roll)}</td><td><a href="/${esc(x.sokvag)}/">${esc(x.title)}</a></td><td><code>${esc(x.id)}#${esc(x.version)}</code></td><td>${x.kalla === 'publisher' ? 'IG Publisher' : 'SUSHI'}</td><td><a href="/${esc(x.sokvag)}/package-list.json">versioner</a></td></tr>`).join('\n');
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FHIR-specifikationer från Inera</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:1040px;margin:24px auto;padding:0 16px;color:#22201e;background:#f7f6f4}td,th{padding:4px 12px 4px 0;text-align:left}a{color:#a33a6a}code{font-size:13px}@media (prefers-color-scheme:dark){body{background:#171615;color:#ecebe8}a{color:#e07aa8}}</style>
</head><body><h1>FHIR-specifikationer från Inera</h1>
<p>Varje kanonisk URL, t.ex. <code>${esc(bas)}/ig/npo/StructureDefinition/…</code>, ger webbsidan i en webbläsare och resursen som JSON med <code>Accept: application/fhir+json</code> eller <code>?_format=json</code>. Sökning i alla definitioner: <code>${esc(bas)}/fhir/StructureDefinition?url=…</code>. Paketflöde: <a href="/package-feed.xml">package-feed.xml</a>.</p>
<table><tr><th>Roll</th><th>IG</th><th>Paket</th><th>Byggd med</th><th></th></tr>
${rader}</table></body></html>
`;
}

export function publicera({ igs, ut, bas = 'https://fhir.inera.se', datum = new Date().toISOString().slice(0, 10) }) {
  fs.mkdirSync(ut, { recursive: true });
  const resultat = [];
  const varningar = [];
  for (const ig of igs) {
    const { sokvag, varning } = webbsokvag(ig.canonical, bas);
    if (varning) varningar.push(varning);
    const output = path.join(ig.dir, 'output');
    const resursKatalog = path.join(ig.dir, 'fsh-generated', 'resources');
    const kalla = fs.existsSync(path.join(output, 'index.html')) ? 'publisher' : fs.existsSync(resursKatalog) ? 'sushi' : null;
    if (!kalla) { varningar.push(`${ig.id}: varken output/ eller fsh-generated/ – kör bygg`); continue; }
    const versionDir = path.join(ut, sokvag, ig.version);
    if (kalla === 'publisher') {
      kopiera(output, versionDir);
    } else {
      fs.rmSync(versionDir, { recursive: true, force: true });
      fs.mkdirSync(versionDir, { recursive: true });
      const resurser = [];
      for (const f of fs.readdirSync(resursKatalog).filter((x) => RESURSFIL.test(x))) {
        const r = JSON.parse(fs.readFileSync(path.join(resursKatalog, f), 'utf8'));
        fs.copyFileSync(path.join(resursKatalog, f), path.join(versionDir, f));
        fs.writeFileSync(path.join(versionDir, f.replace(/\.json$/, '.html')), resurssida(r, ig.title));
        resurser.push(r);
      }
      resurser.sort((a, b) => a.resourceType.localeCompare(b.resourceType) || String(a.id).localeCompare(String(b.id)));
      fs.writeFileSync(path.join(versionDir, 'index.html'), indexsida(ig, resurser));
      packa(ig, resursKatalog, path.join(versionDir, 'package.tgz'));
    }
    // Aktuell version: versionens innehåll direkt under IG:ns sökväg; andra
    // versionskataloger och package-list.json lämnas kvar.
    const igDir = path.join(ut, sokvag);
    const versioner = new Set();
    const plFil = path.join(igDir, 'package-list.json');
    if (fs.existsSync(plFil)) for (const v of JSON.parse(fs.readFileSync(plFil, 'utf8')).list || []) versioner.add(v.version);
    versioner.add(ig.version);
    for (const f of fs.readdirSync(igDir)) {
      if (versioner.has(f) || f === 'package-list.json') continue;
      fs.rmSync(path.join(igDir, f), { recursive: true, force: true });
    }
    for (const f of fs.readdirSync(versionDir)) fs.cpSync(path.join(versionDir, f), path.join(igDir, f), { recursive: true });
    const pl = uppdateraPackageList(plFil, ig, { datum, status: ig.publicering === 'publik' ? 'draft' : 'ci-build' });
    resultat.push({ id: ig.id, title: ig.title, roll: ig.roll, version: ig.version, fhirVersion: ig.fhirVersion, canonical: ig.canonical, sokvag, kalla, datum, versioner: pl.list.filter((v) => v.version !== 'current').map((v) => v.version) });
  }
  // Paketflödet tar med alla versioner som finns i webbroten.
  const paket = resultat.flatMap((r) => {
    const pl = JSON.parse(fs.readFileSync(path.join(ut, r.sokvag, 'package-list.json'), 'utf8'));
    return pl.list.filter((v) => v.version !== 'current').map((v) => ({ ...r, version: v.version, datum: v.date || r.datum }));
  });
  fs.writeFileSync(path.join(ut, 'package-feed.xml'), paketflode(paket, bas));
  fs.writeFileSync(path.join(ut, 'index.html'), rotsida(resultat, bas));
  return { resultat, varningar };
}
