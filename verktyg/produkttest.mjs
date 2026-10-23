// Federationstest mot en produkts referensimplementation.
//
// En produkt vars följsamhet bor i en referensimplementation hos leverantören
// testas där, live: testet bygger den mockade federationen (stödtjänster och
// kataloger), registrerar referensimplementationen som producent (förutsätt-
// ningarna, som vid en riktig anslutning) och kör tjänstens användningsfall
// som konsument mot leverantörens adress. Rapporten blir underlag för
// produktgodkännandet.
//
// Bara producentroller kan testas så; en klientroll prövas när leverantörens
// klient anropar testfederationen. Referensimplementationen behöver godta
// åtkomstintyg från testfederationens utfärdare.
//
// startaReferens tar fram en lokal referensimplementation för rollerna (summan
// av rollernas serverkrav, tjänsternas exempel som data), att peka testet mot
// när leverantörens inte är nåbar, t.ex. i en demo.

import fs from 'node:fs';
import path from 'node:path';
import { MockFederation, fhir } from './mock.mjs';
import { testaFederation, instansCs, exempel, renderFederationReport } from './federation.mjs';
import { arProducentroll, producentMangder } from './systemregister.mjs';
import { klientformagor } from './behorighet.mjs';

const pascal = (s) => String(s).split(/[^A-Za-z0-9]+/).filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1)).join('');

// Rollerna att testa: angivna (tjanst#aktor) eller produktens godkännanden
// som inte är återkallade. Delas i producentroller och övriga.
export function referensroller(produkt, manifests, angivna = []) {
  const valda = angivna.length
    ? angivna.map((x) => { const [tjanst, aktor] = x.split('#'); return { tjanst, aktor }; })
    : (produkt.godkannanden || []).filter((g) => g.status !== 'aterkallad').map(({ tjanst, aktor }) => ({ tjanst, aktor }));
  const roller = [];
  const ejTestbara = [];
  for (const r of valda) {
    const m = manifests[r.tjanst];
    if (!m || !m.kravprofiler.some((k) => k.aktor === r.aktor)) ejTestbara.push({ ...r, orsak: `${r.aktor} är ingen tjänsteaktör i ${r.tjanst}` });
    else if (!arProducentroll(m, r.aktor)) ejTestbara.push({ ...r, orsak: 'klientroll: prövas när leverantörens klient anropar testfederationen' });
    else roller.push({ ...r, titel: m.aktorer[r.aktor]?.titel || r.aktor });
  }
  return { roller, ejTestbara };
}

// En lokal referensimplementation för rollerna, på en egen port.
export async function startaReferens({ ws, manifests, roller, port = 0, titel = 'Referensimplementation (lokal)' }) {
  const mock = new MockFederation();
  await mock.starta(port);
  const sokvag = '/fhir';
  const url = mock.url(sokvag);
  let cs = null;
  const data = [];
  for (const r of roller) {
    const m = manifests[r.tjanst];
    const del = instansCs(m, m.aktorer[r.aktor].formagor, titel, url);
    if (!cs) cs = del;
    else {
      const rest = cs.rest[0];
      for (const res of del.rest[0].resource) if (!rest.resource.some((x) => x.type === res.type)) rest.resource.push(res);
      for (const i of del.rest[0].interaction) if (!rest.interaction.some((x) => x.code === i.code)) rest.interaction.push(i);
    }
    const typer = new Set(del.rest[0].resource.map((x) => x.type));
    data.push(...exempel(ws.get(r.tjanst)).filter((x) => typer.has(x.resourceType)));
    // Klientsidan: producenten registrerar själv sin anslutningspunkt och
    // tjänsteinstans i tjänstekatalogen.
    const k = klientformagor(m, r.aktor);
    let klient = cs.rest.find((x) => x.mode === 'client');
    if (!klient && k.resurser.size) cs.rest.push(klient = { mode: 'client', resource: [] });
    for (const [type, v] of k.resurser) {
      const finns = klient.resource.find((x) => x.type === type);
      const koder = [...v.interaktioner];
      if (finns) for (const code of koder) { if (!finns.interaction.some((i) => i.code === code)) finns.interaction.push({ code }); }
      else klient.resource.push({ type, interaction: koder.map((code) => ({ code })) });
    }
  }
  // Oskyddad: godtar testfederationens åtkomstintyg (kontrollerar dem inte).
  mock.laggTill(sokvag, cs, data, { skyddad: false });
  return { mock, url };
}

export async function testaReferens({ ws, manifests, root, regler, produkt, adress, roller, ejTestbara = [], port = 0 }) {
  const ut = {
    produkt: produkt.produkt, titel: produkt.titel, adress, genererad: new Date().toISOString(),
    roller, ejTestbara, nabar: false, metadata: null, korningar: [], status: 'ej nåbar',
  };
  if (!roller.length) {
    ut.status = 'inga roller';
    return ut;
  }
  let meta;
  try {
    meta = await fhir(`${adress.replace(/\/$/, '')}/metadata`);
  } catch (e) {
    ut.fel = `${adress}/metadata: ${e.cause?.code || e.message}`;
    return ut;
  }
  ut.nabar = meta.status === 200 && meta.json?.resourceType === 'CapabilityStatement';
  ut.metadata = { http: meta.status, software: meta.json?.software || null, fhirVersion: meta.json?.fhirVersion || null };
  if (!ut.nabar) {
    ut.fel = `${adress}/metadata svarade HTTP ${meta.status} utan CapabilityStatement`;
    return ut;
  }
  // Referensimplementationen som ett system: leverantören som organisation
  // (testidentitet i testfederationen), alla rollernas informationsmängder.
  const sys = {
    system: `Referens${pascal(produkt.produkt)}`, titel: `${produkt.titel} (referensimplementation)`, live: true,
    organisation: { namn: produkt.leverantor || produkt.titel, hsaId: `REF-${produkt.produkt}` },
    andpunkter: [adress], roller: roller.map(({ tjanst, aktor }) => ({ tjanst, aktor })),
    informationsmangder: Object.fromEntries(roller.map((r) => [r.tjanst, producentMangder(manifests[r.tjanst], r.aktor).map((i) => i.nyckel)])),
  };
  const r = await testaFederation({ ws, manifests, systems: [sys], root, regler, port });
  ut.federation = r;
  ut.korningar = r.korningar.map((k) => ({ titel: k.titel, roll: k.roll, tjanst: k.tjanst, forutsattning: k.forutsattning, status: k.status }));
  const st = ut.korningar.map((k) => k.status);
  ut.sammanfattning = Object.fromEntries(['ok', 'fel', 'delvis', 'okänt', 'manuell', 'hoppad'].map((s) => [s, st.filter((x) => x === s).length]));
  ut.status = st.some((x) => ['fel', 'delvis', 'okänt'].includes(x)) ? 'brister' : 'godkänt';
  return ut;
}

export function renderProdukttest(r) {
  const out = [`# Federationstest mot referensimplementationen: ${r.titel}`, '',
    `Adress: ${r.adress} · ${new Date(r.genererad).toLocaleString('sv-SE')} · status: **${r.status}**`, ''];
  if (r.fel) out.push(`Fel: ${r.fel}`, '');
  if (r.roller.length) out.push('Roller som testas:', '', ...r.roller.map((x) => `- ${x.titel} (${x.tjanst})`), '');
  if (r.ejTestbara.length) out.push('Testas inte här:', '', ...r.ejTestbara.map((x) => `- ${x.aktor} (${x.tjanst}): ${x.orsak}`), '');
  if (r.sammanfattning) out.push(`Körningar: ${Object.entries(r.sammanfattning).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(', ')}`, '');
  if (r.federation) out.push(renderFederationReport(r.federation).replace(/^# .*\n/, ''));
  return out.join('\n') + '\n';
}

// Skriver resultatet: produkttest-<id>.json i arbetsytan och rapporten i rapport/.
export function skrivProdukttest(root, r) {
  const { federation, ...kort } = r;
  fs.mkdirSync(path.join(root, 'rapport'), { recursive: true });
  const rapport = path.join('rapport', `produkttest-${r.produkt}.md`);
  fs.writeFileSync(path.join(root, rapport), renderProdukttest(r));
  fs.writeFileSync(path.join(root, `produkttest-${r.produkt}.json`), JSON.stringify({ ...kort, rapport }, null, 2) + '\n');
  return rapport;
}

export function lasProdukttester(root) {
  return Object.fromEntries(fs.readdirSync(root).filter((f) => /^produkttest-.+\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))).map((r) => [r.produkt, r]));
}
