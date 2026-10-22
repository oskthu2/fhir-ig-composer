#!/usr/bin/env node
// ig-compose – komponerar Ineras FHIR-IG:ar av byggblock, federationer och
// konventioner, styrt av globala regler (konventioner/regler.yaml) och
// extensions på IG:ar och artefakter. Körs före SUSHI.
//
//   ig-compose komponera <ig-katalog>     komponera en IG (före SUSHI)
//   ig-compose efterbehandla <ig-katalog> rätta SUSHI-resultatet (efter SUSHI)
//   ig-compose bygg                        allt ovan + SUSHI för alla IG:ar
//   ig-compose installera <ig-katalog>    lägg SUSHI-resultatet i lokal FHIR-cache
//   ig-compose matris                      skriv matrisen federation × domän
//
// IG Publisher körs därefter med -no-sushi, så att efterbehandlingen står kvar.
//
// Flagga: --arbetsyta <katalog> (standard: katalogen ovanför verktyg/).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import {
  parseFsh, ruleLines, entityText, appendRules, parseInsert, expandRules, RESOURCE_TYPE,
} from './fsh.mjs';

const EXT = 'https://fhir.inera.se/ig/conventions/StructureDefinition/';
const OUT_FSH = path.join('input', 'fsh', '_komponerat');
const OUT_PAGE = path.join('input', 'pagecontent', 'komposition.md');
const OUT_MANIFEST = 'komposition.json';
// Konventionens RuleSets som verktyget läser i stället för att expandera.
const KEEP = new Set(['Obligation', 'Bas', 'Kompositionsanvisning', 'KopieradFran', 'KopieradFranInstans']);
const SKIP_DIRS = new Set(['node_modules', 'fsh-generated', 'output', 'temp', 'template', 'input-cache', '.git']);

// ---------------------------------------------------------------- arbetsyta

export function loadWorkspace(root) {
  const igs = new Map();
  const walk = (dir) => {
    if (fs.existsSync(path.join(dir, 'sushi-config.yaml'))) {
      const ig = loadIg(dir);
      igs.set(ig.id, ig);
      return;
    }
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory() && !SKIP_DIRS.has(d.name)) walk(path.join(dir, d.name));
    }
  };
  walk(root);
  return igs;
}

function loadIg(dir) {
  const cfg = YAML.parse(fs.readFileSync(path.join(dir, 'sushi-config.yaml'), 'utf8'));
  const exts = cfg.extension || [];
  const ext = (name) => exts.find((e) => e.url === EXT + name);
  const sub = (e, name) => {
    const s = (e?.extension || []).find((x) => x.url === name);
    return s && String(s.valueString ?? s.valueCode);
  };
  const monster = ext('federationsmonster');
  const dependencies = {};
  for (const [id, v] of Object.entries(cfg.dependencies || {})) {
    dependencies[id] = String(typeof v === 'object' ? v.version : v);
  }
  return {
    dir,
    id: cfg.id,
    title: cfg.title,
    canonical: cfg.canonical,
    version: String(cfg.version),
    fhirVersion: String(cfg.fhirVersion),
    roll: ext('ig-roll')?.valueCode,
    publicering: ext('publicering')?.valueCode,
    komponerar: exts.filter((e) => e.url === EXT + 'komponerar').map((e) => ({
      paket: sub(e, 'paket'), version: sub(e, 'version'), inkludering: sub(e, 'inkludering'),
    })),
    monster: monster && { ruleset: sub(monster, 'ruleset'), profilprefix: sub(monster, 'profilprefix') },
    dependencies,
  };
}

function loadRules(ws) {
  const konv = [...ws.values()].find((ig) => ig.roll === 'konvention');
  if (!konv) throw new Error('Inget konventionspaket (ig-roll = konvention) i arbetsytan');
  return YAML.parse(fs.readFileSync(path.join(konv.dir, 'regler.yaml'), 'utf8'));
}

function ownEntities(ig) {
  const base = path.join(ig.dir, 'input', 'fsh');
  const generated = path.join(ig.dir, OUT_FSH);
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir) || dir === generated) return;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.name.endsWith('.fsh')) files.push(p);
    }
  };
  walk(base);
  return files.sort().flatMap((f) => parseFsh(fs.readFileSync(f, 'utf8'), path.relative(ig.dir, f)));
}

// ---------------------------------------------------------------- komposition

export function compose(ig, ws, rules) {
  const fel = [];
  const varningar = [];
  const warnOrFail = (level, msg) => (level === 'varning' ? varningar : fel).push(msg);

  // 1. Lös upp vad som ska med, och hur (regel inkludering + lager).
  const plan = [];
  const seen = new Map();
  const resolve = (owner, via) => {
    for (const dep of owner.komponerar) {
      const src = ws.get(dep.paket);
      if (!src) {
        fel.push(`${owner.id} komponerar ${dep.paket}, som inte finns i arbetsytan`);
        continue;
      }
      if (src.version !== dep.version) {
        fel.push(`${owner.id} komponerar ${src.id}#${dep.version}, men arbetsytan har ${src.version}`);
      }
      const tillatna = rules.lager[owner.roll] || [];
      if (!tillatna.includes(src.roll)) {
        fel.push(`${owner.id} (${owner.roll}) får inte komponera ${src.id} (${src.roll}) – regel lager.${owner.roll}`);
      }
      const mode = dep.inkludering || rules.inkludering[src.publicering];
      if (!mode) {
        fel.push(`${src.id} saknar extension publicering, och ${owner.id} anger ingen inkludering`);
        continue;
      }
      const prev = seen.get(src.id);
      if (prev) {
        if (prev.mode !== mode) fel.push(`${src.id} tas med både som ${prev.mode} och ${mode}`);
        continue;
      }
      const entry = { ig: src, mode, via };
      seen.set(src.id, entry);
      plan.push(entry);
      if (mode === 'kopiera') resolve(src, [...via, src.id]);
    }
  };
  resolve(ig, []);

  const federationer = plan.filter((p) => p.ig.roll === 'federation' && p.via.length === 0);
  if (ig.roll === 'tjanst' && federationer.length !== rules.lager.federationerPerTjanst) {
    fel.push(`En tjänst ska ligga i exakt ${rules.lager.federationerPerTjanst} federation, ${ig.id} komponerar ${federationer.length}`);
  }
  for (const p of plan) {
    const declared = ig.dependencies[p.ig.id];
    if (p.mode === 'referera' && declared !== p.ig.version) {
      fel.push(`${p.ig.id} refereras och måste finnas i dependencies i sushi-config.yaml med version ${p.ig.version}`);
    }
    if (p.mode === 'kopiera' && declared) {
      fel.push(`${p.ig.id} kopieras och ska inte finnas i dependencies i sushi-config.yaml`);
    }
  }

  // 2. Kopiera enligt regler kopiering.* och artefakternas anvisningar.
  const local = ownEntities(ig);
  for (const e of local) e.origin = { paket: ig.id, lage: 'lokal' };
  const copied = [];
  const utelamnat = [];
  const refererat = [];
  const rewrites = plan.filter((p) => p.mode === 'kopiera').map((p) => [`${p.ig.canonical}/`, `${ig.canonical}/`]);
  for (const p of plan) {
    for (const e of ownEntities(p.ig)) {
      e.origin = { paket: p.ig.id, version: p.ig.version, via: p.via };
      if (p.mode === 'referera') {
        if (['RuleSet', 'Alias'].includes(e.kind) && rules.kopiering.ruleSetsAlltid) {
          e.origin.lage = e.kind === 'Alias' ? 'alias' : 'ruleset';
          copied.push(e);
        } else {
          e.origin.lage = 'refererad';
          refererat.push(e);
        }
        continue;
      }
      if (e.kind === 'Instance' && /#example/.test(e.meta.Usage || '') && rules.kopiering.exempel === 'hoppa-over') {
        utelamnat.push({ e, skal: 'exempel (regel kopiering.exempel)' });
        continue;
      }
      const anvisning = ruleLines(e).map(parseInsert).find((i) => i?.name === 'Kompositionsanvisning');
      if (anvisning?.args[0] === '#exkludera') {
        utelamnat.push({ e, skal: 'kompositionsanvisning #exkludera' });
        continue;
      }
      if (rules.kopiering.kanoniskOmskrivning) {
        let text = entityText(e);
        for (const [from, to] of rewrites) text = text.split(from).join(to);
        e.lines = text.split('\n');
      }
      const source = canonicalOf(e, p.ig.canonical);
      if (source && rules.kopiering.sparaUrsprung) {
        e.origin.kopieradFran = `${source}|${p.ig.version}`;
        appendRules(e, [`insert ${e.kind === 'Instance' ? 'KopieradFranInstans' : 'KopieradFran'}(${e.origin.kopieradFran})`]);
      }
      e.origin.lage = { RuleSet: 'ruleset', Alias: 'alias' }[e.kind] || 'kopierad';
      copied.push(e);
    }
  }

  // Alias får förekomma flera gånger med samma värde; övriga namn är unika.
  const aliases = new Map();
  for (const e of [...copied, ...local].filter((x) => x.kind === 'Alias')) {
    const prev = aliases.get(e.name);
    if (prev && prev.aliasValue !== e.aliasValue) fel.push(`Alias ${e.name} har olika värden i ${prev.origin.paket} och ${e.origin.paket}`);
    if (!prev) aliases.set(e.name, e);
  }
  const names = new Map();
  for (const e of [...copied, ...local].filter((x) => x.kind !== 'Alias')) {
    const prev = names.get(e.name);
    if (prev) fel.push(`Namnet ${e.name} finns i både ${prev.origin.paket} och ${e.origin.paket}`);
    names.set(e.name, e);
  }

  const all = [...copied.filter((e) => e.kind !== 'Alias'), ...local.filter((e) => e.kind !== 'Alias')];
  const ruleSets = new Map(all.filter((e) => e.kind === 'RuleSet').map((e) => [e.name, e]));

  // 3. Profiler: vilka exponerar IG:n, och vilken resurstyp har de?
  const profiles = all.filter((e) => e.kind === 'Profile');
  const profileByRef = new Map();
  for (const p of profiles) {
    for (const ref of [p.name, p.id, `${ig.canonical}/StructureDefinition/${p.id}`]) profileByRef.set(ref, p);
  }
  const parentOf = (p) => profileByRef.get(p.meta.Parent);
  const baseType = (p, depth = 0) => {
    const parent = parentOf(p);
    return parent && depth < 20 ? baseType(parent, depth + 1) : p.meta.Parent;
  };
  const superseded = new Set(profiles.map(parentOf).filter(Boolean));
  const rollOf = (e) => ws.get(e.origin.paket)?.roll;
  const exposed = profiles.filter((p) => !superseded.has(p)
    && ['lokal', 'kopierad'].includes(p.origin.lage) && rollOf(p) !== 'federation');

  // 4. Federation: generera mönsterprofiler och lägg till dem som bas.
  const generated = [];
  const fed = federationer[0]?.ig;
  if (ig.roll === 'tjanst' && fed?.monster && rules.federation.genereraMonsterprofiler) {
    const { ruleset, profilprefix } = fed.monster;
    const rs = ruleSets.get(ruleset);
    if (!rs) {
      fel.push(`Federationsmönstret ${ruleset} finns inte i ${fed.id}`);
    } else {
      for (const r of expandRules(rs, ruleSets, KEEP)) {
        const first = r.path.split(/[.[]/)[0];
        if (r.path && !rules.federation.tillatenYta.includes(first)) {
          fel.push(`Federationsmönstret ${ruleset} begränsar ${r.path}; tillåtet är ${rules.federation.tillatenYta.join(', ')} (regel federation.tillatenYta)`);
        }
      }
      const types = [...new Set(exposed.map((p) => baseType(p)))];
      for (const type of types) {
        const name = `${profilprefix}${type}`;
        const text = [
          `Profile: ${name}`,
          `Parent: ${type}`,
          `Id: ${kebab(profilprefix)}-${type.toLowerCase()}`,
          `Title: "${profilprefix}: ${type}"`,
          `Description: "Genererad av ig-compose från federationsmönstret ${ruleset} i ${fed.id}#${fed.version}. Ytterligare bas (Bas) för tjänstens profiler av typen ${type}."`,
          '* ^status = #draft',
          `* insert ${ruleset}`,
        ].join('\n');
        const [e] = parseFsh(text, OUT_FSH);
        e.origin = { paket: fed.id, version: fed.version, lage: 'genererad', monster: ruleset };
        generated.push(e);
        profiles.push(e);
        profileByRef.set(name, e);
      }
      for (const p of exposed) {
        const basName = `${profilprefix}${baseType(p)}`;
        if (p.origin.lage === 'kopierad' && rules.federation.basPaKopieradeProfiler) {
          appendRules(p, [`insert Bas(${basName})`]);
          p.origin.injiceradBas = basName;
        } else if (p.origin.lage === 'lokal') {
          const hasBas = ruleLines(p).map(parseInsert).some((i) => i?.name === 'Bas' && i.args[0] === basName);
          if (!hasBas) {
            warnOrFail(rules.federation.basPaLokalaProfiler,
              `Tjänsteprofilen ${p.name} saknar federationens bas; lägg till "* insert Bas(${basName})" (regel federation.basPaLokalaProfiler)`);
          }
        }
      }
    }
  }

  // 5. Aktörer, förmågor och krav.
  const instancesOf = (type) => [...all, ...generated].filter((e) => e.kind === 'Instance' && e.meta.InstanceOf === type);
  const actors = new Map(instancesOf('ActorDefinition').map((e) => [e.name, readActor(e)]));
  const capabilities = new Map(instancesOf('CapabilityStatement').map((e) => [e.name, readCapability(e)]));
  const requirements = instancesOf('Requirements').map(readRequirements);

  const ancestorsOf = (name) => {
    const out = [];
    const visit = (n, depth) => {
      const a = actors.get(n);
      for (const d of a?.derivedFrom || []) {
        if (!out.some((x) => x.name === d)) {
          out.push({ name: d, depth, actor: actors.get(d) });
          visit(d, depth + 1);
        }
      }
    };
    visit(name, 1);
    return out;
  };

  const localActors = [...actors.values()].filter((a) => a.entity.origin.lage === 'lokal');
  if (ig.roll === 'tjanst') {
    const today = new Date().toISOString().slice(0, 10);
    for (const a of localActors) {
      const anc = ancestorsOf(a.name);
      for (const kravRoll of rules.aktorer.tjanstaktorKraver) {
        if (!anc.some((x) => x.actor && rollOf(x.actor.entity) === kravRoll)) {
          fel.push(`Tjänsteaktören ${a.name} härleds inte från någon aktör i ett ${kravRoll} (regel aktorer.tjanstaktorKraver)`);
        }
      }
      if (rules.aktorer.genereraFormagor) {
        const csName = `${a.name}CS`;
        if (a.capabilities !== csName) {
          fel.push(`Tjänsteaktören ${a.name} ska ha "* capabilities = Canonical(${csName})"; förmågorna genereras (regel aktorer.genereraFormagor)`);
        }
        const ancCs = anc.map((x) => x.actor?.capabilities).filter((c) => capabilities.has(c));
        const modes = [...new Set(ancCs.map((c) => capabilities.get(c).mode).filter(Boolean))];
        if (modes.length > 1) fel.push(`Förfäderna till ${a.name} har förmågor med olika rest.mode: ${modes.join(', ')}`);
        const types = [...new Set(ancCs.flatMap((c) => capabilities.get(c).types))];
        const rest = [];
        for (const type of types) {
          const prof = exposed.filter((p) => baseType(p) === type);
          if (!prof.length) continue;
          rest.push(`* rest[=].resource[+].type = #${type}`);
          if (prof.length === 1) rest.push(`* rest[=].resource[=].profile = Canonical(${prof[0].name})`);
          else for (const p of prof) rest.push(`* rest[=].resource[=].supportedProfile[+] = Canonical(${p.name})`);
        }
        const text = [
          `Instance: ${csName}`,
          'InstanceOf: CapabilityStatement',
          'Usage: #definition',
          `Title: "Förmågor: ${a.title}"`,
          `Description: "Genererad av ig-compose. Importerar förmågorna hos aktörens förfäder och anger tjänstens profiler."`,
          `* name = "${csName}"`,
          `* title = "Förmågor: ${a.title}"`,
          '* status = #draft',
          `* date = "${today}"`,
          '* kind = #requirements',
          `* fhirVersion = #${ig.fhirVersion}`,
          '* format[0] = #json',
          ...ancCs.map((c) => `* imports[+] = Canonical(${c})`),
          `* rest[0].mode = #${modes[0] || 'server'}`,
          `* rest[=].documentation = "Tjänstens profiler för ${a.title}. Interaktioner och sökparametrar följer av de importerade förmågorna."`,
          ...rest,
        ].join('\n');
        const [e] = parseFsh(text, OUT_FSH);
        e.origin = { paket: ig.id, lage: 'genererad' };
        generated.push(e);
        capabilities.set(csName, readCapability(e));
      }
      if (rules.aktorer.genereraKrav) {
        const ancNames = new Set(anc.map((x) => x.name));
        const derived = requirements.filter((r) => r.actors.some((n) => ancNames.has(n)));
        if (derived.length) {
          const text = [
            `Instance: ${a.name}Krav`,
            'InstanceOf: Requirements',
            'Usage: #definition',
            `Title: "Krav: ${a.title}"`,
            `Description: "Genererad av ig-compose. Härleds från kraven på aktörens förfäder."`,
            `* name = "${a.name}Krav"`,
            `* title = "Krav: ${a.title}"`,
            '* status = #draft',
            `* actor[0] = Canonical(${a.name})`,
            ...derived.map((r) => `* derivedFrom[+] = Canonical(${r.name})`),
          ].join('\n');
          const [e] = parseFsh(text, OUT_FSH);
          e.origin = { paket: ig.id, lage: 'genererad' };
          generated.push(e);
        }
      }
    }
  }

  // 6. Kravprofil per systemroll: obligations längs arvskedjan och baserna.
  const obligations = (p) => expandRules(p, ruleSets, KEEP)
    .filter((r) => r.insert?.name === 'Obligation')
    .map((r) => ({ element: r.path, kod: r.insert.args[0].replace(/^#/, ''), aktor: r.insert.args[1] }));
  const basesOf = (p) => expandRules(p, ruleSets, KEEP)
    .filter((r) => r.insert?.name === 'Bas' && !r.path)
    .map((r) => profileByRef.get(r.insert.args[0]))
    .filter(Boolean);
  const lineage = (p, acc = []) => {
    if (!p || acc.includes(p)) return acc;
    acc.push(p);
    lineage(parentOf(p), acc);
    for (const b of basesOf(p)) lineage(b, acc);
    return acc;
  };

  const kravprofiler = localActors.map((a) => {
    const anc = ancestorsOf(a.name);
    const roller = new Set([a.name, ...anc.map((x) => x.name)]);
    const element = [];
    for (const p of exposed) {
      for (const q of lineage(p)) {
        for (const o of obligations(q)) {
          if (roller.has(o.aktor)) element.push({ profil: p, kalla: q, ...o });
        }
      }
    }
    const krav = requirements.filter((r) => r.actors.some((n) => roller.has(n)));
    return { aktor: a, forfader: anc, element, krav, formagor: capabilities.get(a.capabilities) };
  });

  return {
    ig, plan, copied, local, generated, aliases, utelamnat, refererat, exposed, kravprofiler,
    baseType, basesOf, parentOf, fel, varningar,
  };
}

function canonicalOf(e, canonical) {
  if (RESOURCE_TYPE[e.kind]) return `${canonical}/${RESOURCE_TYPE[e.kind]}/${e.id}`;
  if (e.kind === 'Instance' && /#definition/.test(e.meta.Usage || '')) return `${canonical}/${e.meta.InstanceOf}/${e.id}`;
  return null;
}

const canonicalArg = (v) => v.match(/^Canonical\((.+)\)$/)?.[1] ?? v.replace(/^"(.*)"$/, '$1');

function readActor(e) {
  const rules = ruleLines(e);
  const title = rules.find((r) => /^title\s*=/.test(r))?.replace(/^title\s*=\s*"(.*)"$/, '$1') || e.meta.Title || e.name;
  return {
    entity: e,
    name: e.name,
    id: e.id,
    title,
    derivedFrom: rules.filter((r) => /^derivedFrom(\[[^\]]*\])?\s*=/.test(r)).map((r) => canonicalArg(r.replace(/^[^=]*=\s*/, ''))),
    capabilities: rules.filter((r) => /^capabilities\s*=/.test(r)).map((r) => canonicalArg(r.replace(/^[^=]*=\s*/, '')))[0],
  };
}

function readCapability(e) {
  const rules = ruleLines(e);
  return {
    entity: e,
    name: e.name,
    id: e.id,
    mode: rules.map((r) => r.match(/^rest\[[^\]]*\]\.mode\s*=\s*#(\w+)/)?.[1]).find(Boolean),
    types: rules.map((r) => r.match(/\.resource\[[^\]]*\]\.type\s*=\s*#(\w+)/)?.[1]).filter(Boolean),
    imports: rules.filter((r) => /^imports(\[[^\]]*\])?\s*=/.test(r)).map((r) => canonicalArg(r.replace(/^[^=]*=\s*/, ''))),
  };
}

function readRequirements(e) {
  const statements = [];
  let cur = -1;
  for (const r of ruleLines(e)) {
    const m = r.match(/^statement\[([^\]]*)\]\.(\w+)(?:\[[^\]]*\])?\s*=\s*(.+)$/);
    if (!m) continue;
    if (m[1] === '+') cur = statements.length;
    else if (m[1] !== '=') cur = Number(m[1]);
    statements[cur] ||= { conformance: [] };
    const value = m[3].replace(/^"(.*)"$/, '$1');
    if (m[2] === 'conformance') statements[cur].conformance.push(value.replace(/^#/, ''));
    else statements[cur][m[2]] = value;
  }
  return {
    entity: e,
    name: e.name,
    id: e.id,
    actors: ruleLines(e).filter((r) => /^actor(\[[^\]]*\])?\s*=/.test(r)).map((r) => canonicalArg(r.replace(/^[^=]*=\s*/, ''))),
    statements: statements.filter(Boolean),
  };
}

function kebab(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
}

// ---------------------------------------------------------------- utdata

export function writeOutputs(result) {
  const { ig } = result;
  const outDir = path.join(ig.dir, OUT_FSH);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const header = (what) => `// Genererad av ig-compose – ändra inte för hand.\n// ${what}\n\n`;

  const byPackage = new Map();
  for (const e of result.copied.filter((x) => x.kind !== 'Alias')) {
    if (!byPackage.has(e.origin.paket)) byPackage.set(e.origin.paket, []);
    byPackage.get(e.origin.paket).push(e);
  }
  for (const [paket, ents] of byPackage) {
    fs.writeFileSync(path.join(outDir, `${paket}.fsh`),
      header(`Källa: ${paket}`) + ents.map(entityText).join('\n\n') + '\n');
  }
  const copiedAliases = [...result.aliases.values()].filter((a) => a.origin.lage !== 'lokal');
  if (copiedAliases.length) {
    fs.writeFileSync(path.join(outDir, '_alias.fsh'), header('Alias från komponerade paket') + copiedAliases.map(entityText).join('\n') + '\n');
  }
  if (result.generated.length) {
    fs.writeFileSync(path.join(outDir, '_genererat.fsh'),
      header('Federationsprofiler, förmågor och krav för tjänsteaktörer') + result.generated.map(entityText).join('\n\n') + '\n');
  }
  fs.mkdirSync(path.dirname(path.join(ig.dir, OUT_PAGE)), { recursive: true });
  fs.writeFileSync(path.join(ig.dir, OUT_PAGE), renderPage(result));
  fs.writeFileSync(path.join(ig.dir, OUT_MANIFEST), JSON.stringify(manifest(result), null, 2) + '\n');
}

const sdLink = (p) => `[${p.meta.Title || p.name}](StructureDefinition-${p.id}.html)`;
const instLink = (e) => `[${e.meta.Title || e.name}](${e.meta.InstanceOf}-${e.id}.html)`;
// Lodstreck (t.ex. i url|version) escapas så att markdown-tabeller håller.
const code = (s) => `\`${String(s).replace(/\|/g, '\\|')}\``;

function renderPage(r) {
  const out = [];
  out.push('<!-- Genererad av ig-compose – ändra inte för hand. -->');
  out.push('', `Denna sida genereras av verktyget \`ig-compose\` före varje bygge. Den visar vad som kommer med i ${r.ig.title} och varifrån, och den härledda kravprofilen för varje systemroll som IG:n definierar.`);

  out.push('', '### Komponerade paket', '', '| Paket | Version | Roll | Publicering | Inkludering | Via |', '|---|---|---|---|---|---|');
  for (const p of r.plan) {
    out.push(`| ${code(p.ig.id)} | ${p.ig.version} | ${p.ig.roll} | ${p.ig.publicering} | ${p.mode} | ${p.via.map(code).join(' → ') || '–'} |`);
  }

  const fedGen = r.generated.filter((e) => e.kind === 'Profile');
  if (fedGen.length) {
    out.push('', '### Federationens bas', '');
    out.push(`Federationsmönstret ${code(fedGen[0].origin.monster)} från ${code(fedGen[0].origin.paket)} har genererat ${fedGen.map(sdLink).join(', ')}.`);
  }

  out.push('', '### Exponerade profiler', '', 'Profiler som tjänsten exponerar: lokala profiler och kopierade profiler som inte skärps lokalt.', '',
    '| Profil | Resurstyp | Parent | Ytterligare baser | Ursprung |', '|---|---|---|---|---|');
  for (const p of r.exposed) {
    const parent = r.parentOf(p);
    out.push(`| ${sdLink(p)} | ${r.baseType(p)} | ${parent ? sdLink(parent) : p.meta.Parent} | ${r.basesOf(p).map(sdLink).join(', ') || '–'} | ${originText(p)} |`);
  }

  out.push('', '### Kravprofil per systemroll');
  if (!r.kravprofiler.length) out.push('', 'IG:n definierar inga egna aktörer.');
  for (const k of r.kravprofiler) {
    const a = k.aktor;
    out.push('', `#### ${a.title} (${code(a.name)})`, '');
    out.push(`Aktör: ${instLink(a.entity)}. Härleds från:`, '');
    for (const f of k.forfader) {
      const label = f.actor ? `${instLink(f.actor.entity)} – ${code(f.actor.entity.origin.paket)}` : `${f.name} (extern)`;
      out.push(`${'  '.repeat(f.depth - 1)}- ${label}`);
    }
    if (k.formagor) {
      out.push('', `Förmågor: ${instLink(k.formagor.entity)}${k.formagor.imports.length ? `, importerar ${k.formagor.imports.map(code).join(', ')}` : ''}.`);
    }
    out.push('', '**Elementkrav** (obligations längs profilernas arvskedja och baser)', '');
    if (!k.element.length) out.push('Inga.');
    else {
      out.push('| Profil | Element | Krav | Från aktör | Definierat i |', '|---|---|---|---|---|');
      for (const o of k.element) {
        out.push(`| ${sdLink(o.profil)} | ${code(o.element)} | ${code(o.kod)} | ${code(o.aktor)} | ${sdLink(o.kalla)} |`);
      }
    }
    out.push('', '**Verksamhetskrav**', '');
    if (!k.krav.length) out.push('Inga.');
    else {
      out.push('| Nyckel | Krav | Styrka | Källa |', '|---|---|---|---|');
      for (const req of k.krav) {
        for (const s of req.statements) {
          out.push(`| ${code(s.key)} | ${s.requirement || s.label || ''} | ${s.conformance.join(', ')} | ${instLink(req.entity)} |`);
        }
      }
    }
  }

  out.push('', '### Vad kommer med var', '', '| Artefakt | Typ | Ursprung | Läge | Kopierad från |', '|---|---|---|---|---|');
  const rows = [...r.local, ...r.copied, ...r.generated].filter((e) => !['Alias', 'RuleSet'].includes(e.kind));
  for (const e of rows) {
    out.push(`| ${e.name} | ${e.kind === 'Instance' ? e.meta.InstanceOf : e.kind} | ${code(e.origin.paket)} | ${e.origin.lage}${e.origin.injiceradBas ? ` + Bas(${e.origin.injiceradBas})` : ''} | ${e.origin.kopieradFran ? code(e.origin.kopieradFran) : '–'} |`);
  }
  const ruleSets = r.copied.filter((e) => e.kind === 'RuleSet');
  if (ruleSets.length) out.push('', `RuleSets som kopierats in: ${ruleSets.map((e) => `${code(e.name)} (${e.origin.paket})`).join(', ')}.`);
  if (r.utelamnat.length) {
    out.push('', '**Utelämnat:**', '');
    for (const u of r.utelamnat) out.push(`- ${u.e.name} (${code(u.e.origin.paket)}): ${u.skal}`);
  }
  return out.join('\n') + '\n';
}

function originText(e) {
  if (e.origin.lage === 'lokal') return 'lokal';
  return `${e.origin.lage} från ${code(e.origin.paket)}`;
}

function manifest(r) {
  const art = (e) => ({
    namn: e.name,
    id: e.id,
    typ: e.kind === 'Instance' ? e.meta.InstanceOf : e.kind,
    paket: e.origin.paket,
    lage: e.origin.lage,
    via: e.origin.via || [],
    kopieradFran: e.origin.kopieradFran,
    injiceradBas: e.origin.injiceradBas,
  });
  return {
    ig: { id: r.ig.id, version: r.ig.version, roll: r.ig.roll, publicering: r.ig.publicering },
    paket: r.plan.map((p) => ({ id: p.ig.id, version: p.ig.version, roll: p.ig.roll, inkludering: p.mode, via: p.via })),
    artefakter: [...r.local, ...r.copied, ...r.generated].filter((e) => e.kind !== 'Alias').map(art),
    refererat: r.refererat.map(art),
    utelamnat: r.utelamnat.map((u) => ({ ...art(u.e), skal: u.skal })),
    exponerade: r.exposed.map((p) => ({
      profil: p.name, resurstyp: r.baseType(p), parent: p.meta.Parent, baser: r.basesOf(p).map((b) => b.name),
    })),
    kravprofiler: r.kravprofiler.map((k) => ({
      aktor: k.aktor.name,
      forfader: k.forfader.map((f) => ({ namn: f.name, paket: f.actor?.entity.origin.paket, djup: f.depth })),
      formagor: k.formagor?.name,
      importerar: k.formagor?.imports || [],
      element: k.element.map((o) => ({ profil: o.profil.name, element: o.element, kod: o.kod, aktor: o.aktor, definieratI: o.kalla.name })),
      krav: k.krav.flatMap((req) => req.statements.map((s) => ({ nyckel: s.key, krav: s.requirement, styrka: s.conformance, kalla: req.name }))),
    })),
    diagnostik: { fel: r.fel, varningar: r.varningar },
  };
}

// ---------------------------------------------------------------- matris

export function matrix(ws) {
  const tjanster = [...ws.values()].filter((ig) => ig.roll === 'tjanst');
  const federationer = [...ws.values()].filter((ig) => ig.roll === 'federation');
  const domaner = [...new Set(tjanster.flatMap((t) => t.komponerar
    .map((k) => ws.get(k.paket)).filter((d) => d?.roll === 'byggblock').map((d) => d.id)))];
  const cells = federationer.map((f) => ({
    federation: f.id,
    celler: domaner.map((d) => ({
      domän: d,
      tjanster: tjanster.filter((t) => t.komponerar.some((k) => k.paket === f.id)
        && t.komponerar.some((k) => k.paket === d)).map((t) => t.id),
    })),
  }));
  const md = [
    '<!-- Genererad av ig-compose matris – ändra inte för hand. -->',
    '# Matris: federation × domän', '',
    `| Federation | ${domaner.map((d) => ws.get(d).title).join(' | ')} |`,
    `|---|${domaner.map(() => '---').join('|')}|`,
    ...cells.map((row) => `| ${ws.get(row.federation).title} | ${row.celler.map((c) => c.tjanster.map((t) => ws.get(t).title).join('<br>') || 'kandidat').join(' | ')} |`),
  ].join('\n');
  return { json: { domaner, rader: cells }, md: md + '\n' };
}

// ---------------------------------------------------------------- efterbehandling

// Extensions på profilnivå som gäller just den artefakten och inte ska ärvas.
// SUSHI kopierar parentens extensions till en härledd profil.
const NOT_INHERITED = new Set([EXT + 'kopierad-fran', EXT + 'kompositionsanvisning']);

// 1. SUSHI:s mjuka index (^extension[+]) räknar inte med extensions som ett
// element ärver från sin parent. En obligation i en härledd profil skriver
// därför över den ärvda, och differentialen får med ärvda obligations, som
// IG Publisher sedan lägger till en gång till i snapshoten. Här reduceras
// varje differential till profilens egna obligations, och en eventuell
// snapshot från SUSHI (--snapshot) får den fullständiga ärvda listan.
// 2. SUSHI ärver profilnivåns extensions, så en lokal profil med en kopierad
// parent skulle annars se kopierad ut. Sådana extensions tas bort.
const OBLIGATION = 'http://hl7.org/fhir/StructureDefinition/obligation';

export function postProcess(igDir) {
  const res = path.join(igDir, 'fsh-generated', 'resources');
  const sds = new Map();
  for (const f of fs.readdirSync(res).filter((x) => x.startsWith('StructureDefinition-') && x.endsWith('.json'))) {
    const json = JSON.parse(fs.readFileSync(path.join(res, f), 'utf8'));
    sds.set(json.url, { file: path.join(res, f), json, changed: false });
  }
  const isObligation = (x) => x.url === OBLIGATION;
  const memo = new Map();
  let fixed = 0;
  const effective = (url, depth = 0) => {
    if (memo.has(url)) return memo.get(url);
    const sd = sds.get(url);
    const result = new Map();
    if (!sd || depth > 20) return result;
    for (const [id, list] of effective(sd.json.baseDefinition, depth + 1)) result.set(id, [...list]);
    for (const el of sd.json.differential?.element || []) {
      const all = el.extension || [];
      const inherited = (result.get(el.id) || []).map((x) => JSON.stringify(x));
      const own = all.filter(isObligation).filter((x) => !inherited.includes(JSON.stringify(x)));
      const ownKeys = own.map((x) => JSON.stringify(x));
      const reduced = all.filter((x) => !isObligation(x) || ownKeys.includes(JSON.stringify(x)));
      if (reduced.length !== all.length) {
        fixed++;
        sd.changed = true;
        if (reduced.length) el.extension = reduced;
        else delete el.extension;
      }
      if (own.length) result.set(el.id, [...(result.get(el.id) || []), ...own]);
    }
    for (const el of sd.json.snapshot?.element || []) {
      const want = result.get(el.id) || [];
      const others = (el.extension || []).filter((x) => !isObligation(x));
      const current = (el.extension || []).filter(isObligation).map((x) => JSON.stringify(x));
      if (JSON.stringify(current) !== JSON.stringify(want.map((x) => JSON.stringify(x)))) {
        sd.changed = true;
        const ext = [...others, ...want];
        if (ext.length) el.extension = ext;
        else delete el.extension;
      }
    }
    memo.set(url, result);
    return result;
  };
  for (const url of sds.keys()) effective(url);
  for (const sd of sds.values()) {
    const parent = sds.get(sd.json.baseDefinition);
    if (!parent || !sd.json.extension) continue;
    const inherited = (parent.json.extension || []).filter((x) => NOT_INHERITED.has(x.url)).map((x) => JSON.stringify(x));
    const kept = sd.json.extension.filter((x) => !NOT_INHERITED.has(x.url) || !inherited.includes(JSON.stringify(x)));
    if (kept.length !== sd.json.extension.length) {
      fixed++;
      sd.changed = true;
      if (kept.length) sd.json.extension = kept;
      else delete sd.json.extension;
    }
  }
  for (const sd of sds.values()) {
    if (sd.changed) fs.writeFileSync(sd.file, JSON.stringify(sd.json, null, 2) + '\n');
  }
  return fixed;
}

// ---------------------------------------------------------------- lokal installation

export function installLocal(igDir) {
  const ig = loadIg(igDir);
  const res = path.join(igDir, 'fsh-generated', 'resources');
  if (!fs.existsSync(res)) throw new Error(`${ig.id}: kör SUSHI först (${res} saknas)`);
  const fhirHome = process.env.FHIR_HOME || path.join(os.homedir(), '.fhir');
  const target = path.join(fhirHome, 'packages', `${ig.id}#${ig.version}`, 'package');
  fs.rmSync(path.dirname(target), { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const files = [];
  for (const f of fs.readdirSync(res).filter((x) => x.endsWith('.json'))) {
    const json = JSON.parse(fs.readFileSync(path.join(res, f), 'utf8'));
    fs.copyFileSync(path.join(res, f), path.join(target, f));
    files.push({ filename: f, resourceType: json.resourceType, id: json.id, url: json.url, version: json.version, kind: json.kind, type: json.type });
  }
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
    name: ig.id, version: ig.version, canonical: ig.canonical, fhirVersions: [ig.fhirVersion],
    type: 'fhir.ig', dependencies: { 'hl7.fhir.r5.core': ig.fhirVersion },
  }, null, 2));
  fs.writeFileSync(path.join(target, '.index.json'), JSON.stringify({ 'index-version': 1, files }, null, 2));
  return target;
}

// ---------------------------------------------------------------- CLI

function report(result) {
  for (const v of result.varningar) console.warn(`  varning: ${v}`);
  for (const f of result.fel) console.error(`  fel: ${f}`);
  console.log(`  ${result.copied.length} kopierade, ${result.generated.length} genererade, ${result.local.length} lokala; ${result.fel.length} fel, ${result.varningar.length} varningar`);
}

function buildOrder(ws) {
  const order = [];
  const visit = (ig, stack = []) => {
    if (order.includes(ig)) return;
    if (stack.includes(ig)) throw new Error(`Cirkulär komposition: ${[...stack, ig].map((x) => x.id).join(' → ')}`);
    for (const k of ig.komponerar) if (ws.has(k.paket)) visit(ws.get(k.paket), [...stack, ig]);
    order.push(ig);
  };
  for (const ig of ws.values()) visit(ig);
  return order;
}

function main(argv) {
  const args = argv.slice(2);
  const flag = args.indexOf('--arbetsyta');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(flag >= 0 ? args.splice(flag, 2)[1] : path.join(here, '..'));
  const [cmd, target] = args;
  const ws = loadWorkspace(root);

  if (cmd === 'komponera') {
    const dir = path.resolve(target || '.');
    const ig = [...ws.values()].find((x) => path.resolve(x.dir) === dir);
    if (!ig) throw new Error(`${dir} är ingen IG i arbetsytan ${root}`);
    const result = compose(ig, ws, loadRules(ws));
    writeOutputs(result);
    console.log(`${ig.id}:`);
    report(result);
    return result.fel.length ? 1 : 0;
  }
  if (cmd === 'efterbehandla') {
    console.log(`Efterbehandling: ${postProcess(path.resolve(target || '.'))} rättelser`);
    return 0;
  }
  if (cmd === 'installera') {
    console.log(`Installerad i ${installLocal(path.resolve(target || '.'))}`);
    return 0;
  }
  if (cmd === 'matris') {
    const { json, md } = matrix(ws);
    fs.writeFileSync(path.join(root, 'matris.json'), JSON.stringify(json, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'matris.md'), md);
    console.log(md);
    return 0;
  }
  if (cmd === 'bygg') {
    const rules = loadRules(ws);
    // Publika paket som andra IG:ar i arbetsytan komponerar installeras i den
    // lokala FHIR-cachen. De behöver snapshots, som SUSHI bara tar fram på
    // begäran; övriga IG:ar får sina snapshots av IG Publisher.
    const komponerade = new Set([...ws.values()].flatMap((x) => x.komponerar.map((k) => k.paket)));
    const installeras = (ig) => ig.publicering === 'publik' && komponerade.has(ig.id);
    let status = 0;
    for (const ig of buildOrder(ws)) {
      console.log(`${ig.id} (${ig.roll}):`);
      if (ig.komponerar.length) {
        const result = compose(ig, ws, rules);
        writeOutputs(result);
        report(result);
        if (result.fel.length) { status = 1; continue; }
      }
      const sushi = spawnSync('sushi', ['build', '.', ...(installeras(ig) ? ['--snapshot'] : [])], { cwd: ig.dir, encoding: 'utf8' });
      const summary = (sushi.stdout || '').match(/(\d+) Errors?\s+(\d+) Warnings?/);
      console.log(`  SUSHI: ${summary ? `${summary[1]} fel, ${summary[2]} varningar` : `avslutad med kod ${sushi.status}`}`);
      if (sushi.status !== 0) {
        status = 1;
        console.error((sushi.stdout || '').split('\n').filter((l) => /^\s*error/i.test(l)).join('\n'));
        continue;
      }
      const fixed = postProcess(ig.dir);
      if (fixed) console.log(`  efterbehandling: ${fixed} rättelser av ärvda extensions`);
      if (installeras(ig)) console.log(`  installerad i ${installLocal(ig.dir)}`);
    }
    return status;
  }
  console.log('Användning: ig-compose komponera|efterbehandla|installera <ig-katalog> | bygg | matris [--arbetsyta <katalog>]');
  return cmd ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    console.error(`ig-compose: ${err.message}`);
    process.exitCode = 2;
  }
}
