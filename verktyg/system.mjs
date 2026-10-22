// Systemperspektivet: ett konkret system antar roller (tjänsteaktörer) i en
// eller flera tjänster. Här summeras kraven över alla roller – förmågor,
// elementkrav, verksamhetskrav och scenariosteg – och jämförs med systemets
// nuläge: dess CapabilityStatement (kind=instance) och dess API-instanser i
// tjänstekatalogen. Resultatet är underlag för test och för gapanalys.
//
// Varje krav bär med sig vilka roller som ställer det, så att vyn kan vrida
// på urvalet av roller och räkna om summan och gapet.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export function loadSystems(root) {
  const dir = path.join(root, 'system');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()
    .map((f) => ({ ...YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8')), fil: path.join('system', f) }));
}

const add = (map, key, val) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(val);
};
const utan = (url) => String(url).split('|')[0];
// Profiler med samma källa (kopierad-fran) är samma profil med olika kanoniska
// URL:er i olika tjänster; i text visas de en gång med antal URL:er.
const profilText = (lista) => {
  const perKalla = new Map();
  for (const p of lista) {
    if (!perKalla.has(p.kalla || p.url)) perKalla.set(p.kalla || p.url, { namn: p.namn, urls: new Set() });
    perKalla.get(p.kalla || p.url).urls.add(p.url);
  }
  return [...perKalla.values()].map((x) => (x.urls.size > 1 ? `${x.namn} (${x.urls.size} kanoniska URL:er)` : x.namn)).join(', ');
};
const version = (url) => String(url).split('|')[1] || null;

function readJson(root, rel) {
  if (!rel) return null;
  const file = path.join(root, 'system', rel);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}

// Nuläge: läge → { system, resurser: typ → { interaktioner, sokparametrar, profiler } }
function lasNulage(cs) {
  if (!cs) return null;
  const lagen = {};
  for (const r of cs.rest || []) {
    const l = (lagen[r.mode] ||= { system: new Set(), resurser: {} });
    for (const i of r.interaction || []) l.system.add(i.code);
    for (const res of r.resource || []) {
      const x = (l.resurser[res.type] ||= { interaktioner: new Set(), sokparametrar: new Set(), profiler: new Set() });
      for (const i of res.interaction || []) x.interaktioner.add(i.code);
      for (const s of res.searchParam || []) x.sokparametrar.add(s.name);
      for (const p of [res.profile, ...(res.supportedProfile || [])].filter(Boolean)) x.profiler.add(utan(p));
    }
  }
  return { lagen, instantiates: cs.instantiates || [], software: cs.software, implementation: cs.implementation };
}

// Status för ett API-krav givet en uppsättning delkrav med finns-flaggor.
export function apiStatus(item, aktivaRoller) {
  const aktiv = (x) => !aktivaRoller || x.roller.some((r) => aktivaRoller.has(r));
  const delar = [...item.interaktioner, ...item.sokparametrar, ...item.profiler].filter(aktiv);
  if (!delar.length && !item.roller.some((r) => !aktivaRoller || aktivaRoller.has(r))) return null;
  if (delar.some((d) => d.finns === null) || item.typFinns === null) return 'okänt';
  if (!item.typFinns) return 'saknas';
  return delar.every((d) => d.finns) ? 'ok' : 'delvis';
}

// kallor: { nulageCs, exportBundle } ersätter filerna i sys.nulage, t.ex. när
// nuläget hämtas live från en (mockad) federation.
export function analyseSystem(sys, manifests, root, regler = {}, kallor = {}) {
  const fel = [];
  const registreringsroll = regler.registreringsroll || 'TjanstekatalogRegistrerare';

  const roller = (sys.roller || []).map((r) => {
    const m = manifests[r.tjanst];
    if (!m) {
      fel.push(`${r.tjanst} saknar komposition.json – kör ig-composer bygg`);
      return null;
    }
    const kp = m.kravprofiler.find((k) => k.aktor === r.aktor);
    if (!kp) {
      fel.push(`${r.aktor} är ingen tjänsteaktör i ${r.tjanst}`);
      return null;
    }
    return {
      id: `${r.tjanst}#${r.aktor}`, tjanst: r.tjanst, tjanstTitel: m.ig.titel, version: m.ig.version,
      aktor: r.aktor, titel: kp.aktorTitel || r.aktor, forfader: kp.forfader.map((f) => f.namn), m, kp,
    };
  }).filter(Boolean);

  const nulageCs = 'nulageCs' in kallor ? kallor.nulageCs : readJson(root, sys.nulage?.formaga);
  if (nulageCs === undefined) fel.push(`Nulägesfilen ${sys.nulage.formaga} finns inte`);
  const nulage = lasNulage(nulageCs);

  // ---- Förmågor: läge|typ → interaktioner, sökparametrar, profiler, med roller
  const api = new Map();
  const post = (lage, typ) => {
    const k = `${lage}|${typ}`;
    if (!api.has(k)) api.set(k, { lage, typ, roller: new Set(), interaktioner: new Map(), sokparametrar: new Map(), profiler: new Map() });
    return api.get(k);
  };
  const stangning = (m, namn, seen = new Set()) => {
    if (!namn || seen.has(namn) || !m.formagor[namn]) return seen;
    seen.add(namn);
    for (const i of m.formagor[namn].imports) stangning(m, i, seen);
    return seen;
  };
  for (const r of roller) {
    const egna = new Map(); // läge|typ → profiler för just denna roll
    for (const csNamn of stangning(r.m, r.kp.formagor)) {
      for (const blk of r.m.formagor[csNamn].rest) {
        if (!blk.mode) continue;
        if (blk.system.length) {
          const p = post(blk.mode, '*');
          p.roller.add(r.id);
          for (const c of blk.system) add(p.interaktioner, c, r.id);
        }
        for (const [typ, v] of Object.entries(blk.resurser)) {
          const p = post(blk.mode, typ);
          p.roller.add(r.id);
          for (const c of v.interaktioner) add(p.interaktioner, c, r.id);
          for (const s of v.sokparametrar) add(p.sokparametrar, s, r.id);
          for (const pr of v.profiler) {
            const k = `${blk.mode}|${typ}`;
            if (!egna.has(k)) egna.set(k, new Map());
            egna.get(k).set(pr.url, pr);
          }
        }
      }
    }
    // Den mest specifika profilen räcker: en profil som en annan profil i samma
    // post härleds från tas bort (VardkontaktNPO ersätter Vardkontakt).
    for (const [k, prof] of egna) {
      const namn = [...prof.values()].map((x) => x.namn);
      for (const pr of prof.values()) {
        const harBarn = namn.some((n) => (r.m.profiler[n]?.forfader || []).includes(pr.namn));
        if (harBarn) continue;
        const p = api.get(k);
        if (!p.profiler.has(pr.url)) p.profiler.set(pr.url, { ...pr, tjanst: r.tjanst, roller: new Set() });
        p.profiler.get(pr.url).roller.add(r.id);
      }
    }
  }
  const apiUt = [...api.values()].map((p) => {
    const n = nulage?.lagen[p.lage];
    const nr = p.typ === '*' ? n : n?.resurser[p.typ];
    const finns = (set, v) => (nulage ? !!set?.has(v) : null);
    return {
      lage: p.lage, typ: p.typ, roller: [...p.roller],
      typFinns: nulage ? !!nr : null,
      interaktioner: [...p.interaktioner].map(([kod, rs]) => ({ kod, roller: [...rs], finns: finns(p.typ === '*' ? n?.system : nr?.interaktioner, kod) })),
      sokparametrar: [...p.sokparametrar].map(([namn, rs]) => ({ namn, roller: [...rs], finns: finns(nr?.sokparametrar, namn) })),
      profiler: [...p.profiler.values()].map((pr) => ({ namn: pr.namn, url: pr.url, kalla: pr.kalla, tjanst: pr.tjanst, roller: [...pr.roller], finns: finns(nr?.profiler, pr.url) })),
    };
  }).sort((a, b) => a.lage.localeCompare(b.lage) || a.typ.localeCompare(b.typ));
  for (const a of apiUt) a.status = apiStatus(a);

  // ---- Elementkrav, verksamhetskrav och scenariosteg, med roller
  const element = new Map();
  const krav = new Map();
  const scenarier = [];
  for (const r of roller) {
    for (const o of r.kp.element) {
      const pr = r.m.profiler[o.profil] || { kalla: o.profil, url: o.profil };
      const k = `${pr.kalla}|${o.element}|${o.kod}`;
      if (!element.has(k)) element.set(k, { element: o.element, kod: o.kod, kalla: pr.kalla, profiler: new Map(), roller: new Set(), aktorer: new Set() });
      const e = element.get(k);
      e.profiler.set(pr.url, { namn: o.profil, kalla: pr.kalla, tjanst: r.tjanst });
      e.roller.add(r.id);
      e.aktorer.add(o.aktor);
    }
    for (const q of r.kp.krav) {
      const art = r.m.artefakter.find((a) => a.namn === q.kalla);
      const k = `${art?.kopieradFran ? utan(art.kopieradFran) : `${r.tjanst}/${q.kalla}`}|${q.nyckel}`;
      if (!krav.has(k)) krav.set(k, { nyckel: q.nyckel, krav: q.krav, styrka: q.styrka, kalla: q.kalla, roller: new Set() });
      krav.get(k).roller.add(r.id);
    }
    for (const u of r.m.anvandningsfall || []) {
      if (u.typ !== 'anvandningsfall' || u.endastInkluderad) continue;
      const banor = u.aktorer.filter((b) => b.spelasAv.includes(r.aktor)).map((b) => b.nyckel);
      if (!banor.length) continue;
      const steg = [];
      const samla = (lista) => {
        for (const s of lista) {
          if (s.typ === 'operation' && (banor.includes(s.fran) || banor.includes(s.till))) {
            steg.push({
              nr: s.nr, titel: s.titel, operation: s.operation, resurstyp: s.resurstyp, profil: s.profil, krav: s.krav,
              sida: s.fran === s.till ? 'själv' : banor.includes(s.fran) ? 'avsändare' : 'mottagare',
            });
          }
          samla((s.alternativ || []).flatMap((a) => a.steg));
        }
      };
      samla(u.steg);
      scenarier.push({ roll: r.id, tjanst: r.tjanst, anvandningsfall: u.namn, titel: u.titel, forutsattning: u.forutsattning, banor, steg });
    }
  }
  const elementUt = [...element.values()].map((e) => ({ ...e, profiler: [...e.profiler].map(([url, p]) => ({ url, ...p })), roller: [...e.roller], aktorer: [...e.aktorer] }));
  const kravUt = [...krav.values()].map((q) => ({ ...q, roller: [...q.roller] }));

  // ---- Anslutningar: förväntade API-instanser mot registrerade i tjänstekatalogen
  const exportBundle = 'exportBundle' in kallor ? kallor.exportBundle : readJson(root, sys.nulage?.anslutningar);
  if (exportBundle === undefined) fel.push(`Anslutningsfilen ${sys.nulage.anslutningar} finns inte`);
  const andpunkter = new Set(sys.andpunkter || []);
  const registrerade = (exportBundle?.entry || []).map((e) => e.resource)
    .filter((c) => c?.resourceType === 'CapabilityStatement' && c.kind === 'instance' && andpunkter.has(c.implementation?.url))
    .map((c) => ({ id: c.id, adress: c.implementation.url, beskrivning: c.implementation.description, instantiates: c.instantiates || [] }));
  const forvantade = roller.filter((r) => r.forfader.includes(registreringsroll)).map((r) => {
    const spec = r.m.formagor[r.kp.formagor];
    const traff = registrerade.flatMap((x) => x.instantiates.map((i) => ({ x, i }))).filter(({ i }) => utan(i) === spec.url);
    const exakt = traff.find(({ i }) => version(i) === r.version);
    return {
      roll: r.id, specifikation: `${spec.url}|${r.version}`,
      status: exakt ? 'registrerad' : traff.length ? 'annan version' : exportBundle ? 'saknas' : 'okänt',
      registrerad: (exakt || traff[0])?.i || null,
      apiInstans: (exakt || traff[0])?.x.id || null,
    };
  });
  const kanda = new Set(forvantade.map((f) => utan(f.specifikation)));
  const ovantade = registrerade.flatMap((x) => x.instantiates.filter((i) => !kanda.has(utan(i))).map((i) => ({ apiInstans: x.id, instantiates: i })));

  // ---- Testlista: summan av krav, deduplicerad över roller
  const testlista = [];
  const lagT = { server: 'Server', client: 'Klient' };
  apiUt.forEach((a, i) => testlista.push({
    id: `API-${i + 1}`, kategori: 'API-förmåga', roller: a.roller, status: a.status,
    text: `${lagT[a.lage] || a.lage}: ${a.typ === '*' ? 'systemnivå' : a.typ} – ${a.interaktioner.map((x) => x.kod).join(', ')}`
      + `${a.sokparametrar.length ? `; sökparametrar ${a.sokparametrar.map((x) => x.namn).join(', ')}` : ''}`
      + `${a.profiler.length ? `; profiler ${profilText(a.profiler)}` : ''}`,
  }));
  forvantade.forEach((f, i) => testlista.push({
    id: `ANS-${i + 1}`, kategori: 'Anslutning', roller: [f.roll], status: f.status === 'registrerad' ? 'ok' : f.status === 'okänt' ? 'okänt' : f.status === 'annan version' ? 'delvis' : 'saknas',
    text: `API-instans i tjänstekatalogen som följer ${f.specifikation}`,
  }));
  elementUt.forEach((e, i) => testlista.push({
    id: `ELM-${i + 1}`, kategori: 'Elementkrav', roller: e.roller, status: 'manuell',
    text: `${e.kod} ${e.element} i ${profilText(e.profiler)}`,
  }));
  kravUt.forEach((q, i) => testlista.push({
    id: `KRV-${i + 1}`, kategori: 'Verksamhetskrav', roller: q.roller, status: 'manuell', text: `${q.nyckel}: ${q.krav}`,
  }));
  scenarier.forEach((s, i) => testlista.push({
    id: `SCN-${i + 1}`, kategori: 'Scenario', roller: [s.roll], status: 'manuell',
    text: `${s.titel}: steg ${s.steg.map((x) => `${x.nr} (${x.sida})`).join(', ')}`,
  }));

  const rakna = (lista, f) => lista.filter(f).length;
  return {
    system: sys.system, titel: sys.titel || sys.system, organisation: sys.organisation, fil: sys.fil,
    andpunkter: sys.andpunkter || [],
    roller: roller.map(({ m, kp, ...r }) => r),
    nulage: { finns: !!nulage, fil: sys.nulage?.formaga || null, software: nulage?.software || null, instantiates: nulage?.instantiates || [] },
    api: apiUt, element: elementUt, krav: kravUt, scenarier,
    anslutningar: { forvantade, registrerade, ovantade, finns: !!exportBundle },
    testlista,
    sammanfattning: {
      roller: roller.length,
      apiOk: rakna(apiUt, (a) => a.status === 'ok'),
      apiGap: rakna(apiUt, (a) => a.status === 'delvis' || a.status === 'saknas'),
      apiOkant: rakna(apiUt, (a) => a.status === 'okänt'),
      anslutningarOk: rakna(forvantade, (f) => f.status === 'registrerad'),
      anslutningarGap: rakna(forvantade, (f) => f.status !== 'registrerad'),
      tester: testlista.length,
    },
    fel,
  };
}

export function renderReport(a) {
  const out = [`# ${a.titel}`, '', `${a.organisation || ''} · roller: ${a.roller.map((r) => `${r.titel} (${r.tjanstTitel})`).join(', ')}`, ''];
  const s = a.sammanfattning;
  out.push(`API-förmåga: ${s.apiOk} ok, ${s.apiGap} med gap, ${s.apiOkant} okända · anslutningar: ${s.anslutningarOk} registrerade, ${s.anslutningarGap} med gap · ${s.tester} tester`, '');
  if (a.fel.length) out.push('## Fel', '', ...a.fel.map((f) => `- ${f}`), '');
  out.push('## Gap i API-förmåga', '');
  const gap = a.api.filter((x) => x.status === 'delvis' || x.status === 'saknas');
  if (!a.nulage.finns) out.push('Inget nuläge inlämnat (CapabilityStatement kind=instance).', '');
  else if (!gap.length) out.push('Inga.', '');
  for (const x of gap) {
    const saknas = [
      ...x.interaktioner.filter((d) => !d.finns).map((d) => d.kod),
      ...x.sokparametrar.filter((d) => !d.finns).map((d) => `sök ${d.namn}`),
      ...x.profiler.filter((d) => !d.finns).map((d) => `profil ${d.url}`),
    ];
    out.push(`- **${x.lage} ${x.typ}** (${x.status}): saknar ${x.typFinns ? saknas.join(', ') : 'resurstypen'}`);
  }
  out.push('', '## Anslutningar i tjänstekatalogen', '', '| Roll | Specifikation | Status | Registrerad |', '|---|---|---|---|');
  for (const f of a.anslutningar.forvantade) out.push(`| ${f.roll} | \`${f.specifikation}\` | ${f.status} | ${f.registrerad ? `\`${f.registrerad}\`` : '–'} |`);
  for (const o of a.anslutningar.ovantade) out.push(`| – | \`${o.instantiates}\` | registrerad utan roll | ${o.apiInstans} |`);
  out.push('', '## Testlista', '', '| Id | Kategori | Test | Status | Krävs av |', '|---|---|---|---|---|');
  for (const t of a.testlista) out.push(`| ${t.id} | ${t.kategori} | ${t.text.replace(/\|/g, '\\|')} | ${t.status} | ${t.roller.join(', ')} |`);
  return out.join('\n') + '\n';
}
