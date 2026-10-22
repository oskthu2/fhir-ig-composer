// Läsadapter mot en verklig realisering av T2 (som referensrealiseringen på
// infopeak), beskriven i miljoer/<namn>.yaml. Adaptern ger en miljö för
// testköraren (se federation.mjs) i läsläge: förutsättningarna verifieras mot
// katalogerna, inget skrivs.
//
// Systemen härleds ur katalogerna: varje organisation med en anslutningspunkt
// som implementerar någon av tjänstens informationsmängder blir ett system med
// tjänstens källsystemsroll, de informationsmängder den implementerar och
// tillvalet engagemangsindexerad om anslutningspunkten anger det.
//
// Tjänstens specifikationer jämförs dessutom med de externa specifikationer
// informationsmängderna motsvarar (ögonblicksbilder i externa/<miljö>).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { hamtaKatalog } from './federation.mjs';
import { lasKatalog, specFor, matcha, utanVersion, versionAv } from './t2.mjs';

export function lasMiljo(root, namn) {
  const fil = path.join(root, 'miljoer', `${namn}.yaml`);
  if (!fs.existsSync(fil)) throw new Error(`Miljön ${namn} finns inte (${path.relative(root, fil)})`);
  return YAML.parse(fs.readFileSync(fil, 'utf8'));
}

export function adapterMiljo(konf) {
  let token = null;
  let utgar = 0;
  const hamtaToken = async () => {
    if (!token || Date.now() > utgar - 30000) {
      const svar = await fetch(`${konf.bas}${konf.token}`, { method: 'POST' });
      if (!svar.ok) throw new Error(`Ingen token från ${konf.bas}${konf.token}: HTTP ${svar.status}`);
      const j = await svar.json();
      token = j.access_token;
      const tid = typeof j.expires_at === 'number' ? (j.expires_at < 1e12 ? j.expires_at * 1000 : j.expires_at) : Date.parse(j.expires_at || '');
      utgar = Number.isFinite(tid) ? tid : Date.now() + 5 * 60 * 1000;
    }
    return token;
  };
  const adress = (a) => {
    for (const r of konf.adresser || []) if (a?.startsWith(r.fran)) return r.till + a.slice(r.fran.length);
    return a;
  };
  return {
    namn: konf.namn, titel: konf.titel, bas: konf.bas, skriv: false,
    stod: new Map(Object.entries(konf.stod || {}).map(([aktor, p]) => [aktor, `${konf.bas}${p}`])),
    adress,
    katalogHeaders: async () => ({ authorization: `Bearer ${await hamtaToken()}` }),
    // Realiseringen har ingen separat utfärdare: gatewayns token används som intyg.
    intyg: async () => hamtaToken(),
    federationsKarta: konf.federationer || {},
    testpatient: konf.testpatient,
    systemUrl: (sys) => adress(sys.andpunkter?.[0]),
  };
}

const aktorKedja = (m, namn) => {
  const ut = [];
  const besok = (n) => {
    if (!n || ut.includes(n)) return;
    ut.push(n);
    for (const d of m.aktorer[n]?.derivedFrom || []) besok(d);
  };
  besok(namn);
  return ut;
};

export async function systemFranKatalog(miljo, manifests, tjanster, regler = {}) {
  const registreringsroll = regler.registreringsroll || 'TjanstekatalogRegistrerare';
  const k = lasKatalog(await hamtaKatalog(miljo));
  const ut = [];
  for (const o of k.organisationer) {
    const egna = k.andpunkter.filter((e) => e.aktiv && e.org === o.ref);
    if (!egna.length) continue;
    const sys = {
      system: o.id, titel: o.namn, organisation: { namn: o.namn, hsaId: o.hsaId },
      andpunkter: [], roller: [], tillval: [], informationsmangder: {}, harleddFranKatalog: true,
    };
    for (const id of tjanster) {
      const m = manifests[id];
      if (!m) continue;
      const implementerar = (e, i) => matcha(e.implements, specFor(i)).status !== 'saknas';
      const mangder = (m.informationsmangder || []).filter((i) => egna.some((e) => implementerar(e, i)));
      const kp = m.kravprofiler.find((x) => x.forfader.some((f) => f.namn === registreringsroll));
      if (!mangder.length || !kp) continue;
      sys.roller.push({ tjanst: id, aktor: kp.aktor });
      sys.informationsmangder[id] = mangder.map((i) => i.nyckel);
      const traff = egna.filter((e) => mangder.some((i) => implementerar(e, i)));
      for (const e of traff) if (!sys.andpunkter.includes(e.adress)) sys.andpunkter.push(e.adress);
      if (traff.some((e) => e.indexerad)) {
        const kedja = [kp.aktor, ...kp.forfader.map((f) => f.namn)];
        const t = Object.keys(m.aktorer).find((n) => kedja.includes(m.aktorer[n].tillvalFor) && aktorKedja(m, n).includes('Engagemangsproducent'));
        if (t) sys.tillval.push(t);
      }
    }
    if (sys.roller.length) ut.push(sys);
  }
  return ut;
}

// ------------------------------------------------------------------ externa specifikationer

const lasExterna = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [])
  .map((f) => ({ fil: f, cs: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }))
  .filter((x) => x.cs.resourceType === 'CapabilityStatement');

// Jämför tjänstens specifikation per informationsmängd med den externa den
// motsvarar: FHIR-version, resurstyper, interaktioner, sökparametrar och profiler.
export function jamforSpecifikationer(root, konf, manifests, tjanster, fhirVersion = '5.0.0') {
  const dir = path.join(root, konf.externa?.katalog || path.join('externa', konf.namn));
  const externa = lasExterna(dir);
  const ut = [];
  for (const id of tjanster) {
    const m = manifests[id];
    for (const i of (m?.informationsmangder || []).filter((x) => x.motsvarar)) {
      const avvikelser = [];
      const av = (niva, text) => avvikelser.push({ niva, text });
      const ext = externa.find((x) => x.cs.url === utanVersion(i.motsvarar));
      const egen = m.formagor[i.namn];
      const rad = { tjanst: id, informationsmangd: i.nyckel, titel: i.titel, egen: `${i.url}|${i.version}`, extern: i.motsvarar, kalla: ext ? path.join(path.relative(root, dir), ext.fil) : null, avvikelser };
      ut.push(rad);
      if (!ext) {
        av('fel', `Ingen ögonblicksbild av ${i.motsvarar} i ${path.relative(root, dir)}`);
        continue;
      }
      if (versionAv(i.motsvarar) && ext.cs.version !== versionAv(i.motsvarar)) av('varning', `Den externa specifikationen har version ${ext.cs.version}, informationsmängden anger ${versionAv(i.motsvarar)}`);
      if (ext.cs.fhirVersion && ext.cs.fhirVersion !== fhirVersion) av('varning', `Den externa specifikationen är FHIR ${ext.cs.fhirVersion}, tjänsten FHIR ${fhirVersion}`);
      const extServer = (ext.cs.rest || []).find((r) => r.mode === 'server') || {};
      const egenServer = egen?.rest.find((b) => b.mode === 'server') || { resurser: {}, system: [] };
      const sysSaknas = (extServer.interaction || []).map((x) => x.code).filter((c) => !egenServer.system.includes(c));
      if (sysSaknas.length) av('info', `Den externa kräver även systeminteraktionerna ${sysSaknas.join(', ')}`);
      const sakerhet = (extServer.security?.service || []).flatMap((s) => (s.coding || []).map((c) => c.code));
      if (sakerhet.length) av('info', `Den externa anger säkerhetstjänsten ${sakerhet.join(', ')}; tjänsten anger den på aktörens förmågor`);
      for (const r of extServer.resource || []) {
        const e = egenServer.resurser[r.type];
        const extInt = (r.interaction || []).map((x) => x.code);
        if (!e) {
          av('varning', `Den externa kräver även ${r.type} (${extInt.join(', ')}), som saknas i tjänstens specifikation`);
          continue;
        }
        const saknasInt = extInt.filter((c) => !e.interaktioner.includes(c));
        const extraInt = e.interaktioner.filter((c) => !extInt.includes(c));
        if (saknasInt.length) av('varning', `${r.type}: den externa kräver ${saknasInt.join(', ')}`);
        if (extraInt.length) av('info', `${r.type}: tjänsten kräver även ${extraInt.join(', ')}`);
        const extSok = (r.searchParam || []).map((x) => x.name);
        const saknasSok = extSok.filter((n) => !e.sokparametrar.includes(n));
        const extraSok = e.sokparametrar.filter((n) => !extSok.includes(n));
        if (saknasSok.length) av('varning', `${r.type}: den externa har sökparametrarna ${saknasSok.join(', ')}`);
        if (extraSok.length) av('fel', `${r.type}: tjänsten kräver sökparametrarna ${extraSok.join(', ')}, som den externa saknar`);
        const extProf = [r.profile, ...(r.supportedProfile || [])].filter(Boolean);
        if (extProf.length) av('info', `${r.type}: den externa anger profilen ${extProf.join(', ')}; tjänsten ${e.profiler.map((p) => p.url).join(', ') || 'ingen'}`);
      }
      for (const typ of Object.keys(egenServer.resurser)) {
        if (!(extServer.resource || []).some((r) => r.type === typ)) av('fel', `Tjänsten kräver ${typ}, som den externa specifikationen inte har`);
      }
    }
  }
  return ut;
}

// Hämtar de externa specifikationernas paket (basic auth från miljövariabler)
// och lägger deras CapabilityStatements i externa/<miljö>.
export async function hamtaExterna(root, konf) {
  const anvandare = process.env.INFOPEAK_ANVANDARE;
  const losenord = process.env.INFOPEAK_LOSENORD;
  if (!anvandare || !losenord) throw new Error('Sätt INFOPEAK_ANVANDARE och INFOPEAK_LOSENORD för att hämta de externa specifikationerna');
  const dir = path.join(root, konf.externa?.katalog || path.join('externa', konf.namn));
  fs.mkdirSync(dir, { recursive: true });
  const auth = `Basic ${Buffer.from(`${anvandare}:${losenord}`).toString('base64')}`;
  const ut = [];
  for (const url of konf.externa?.paket || []) {
    const svar = await fetch(url, { headers: { authorization: auth } });
    if (!svar.ok) throw new Error(`${url}: HTTP ${svar.status}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'externa-'));
    try {
      const tgz = path.join(tmp, 'package.tgz');
      fs.writeFileSync(tgz, Buffer.from(await svar.arrayBuffer()));
      const tar = spawnSync('tar', ['-xzf', tgz, '-C', tmp], { encoding: 'utf8' });
      if (tar.status !== 0) throw new Error(`${url}: kunde inte packa upp (${tar.stderr})`);
      const pkg = path.join(tmp, 'package');
      for (const f of fs.readdirSync(pkg).filter((x) => /^CapabilityStatement-.*\.json$/.test(x))) {
        const cs = JSON.parse(fs.readFileSync(path.join(pkg, f), 'utf8'));
        if (cs.kind !== 'requirements') continue;
        fs.copyFileSync(path.join(pkg, f), path.join(dir, f));
        ut.push(path.join(path.relative(root, dir), f));
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return ut;
}
