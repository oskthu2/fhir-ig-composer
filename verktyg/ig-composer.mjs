#!/usr/bin/env node
// ig-composer – komponerar Ineras FHIR-IG:ar av byggblock, federationer och
// konventioner, styrt av globala regler (konventioner/regler.yaml) och
// extensions på IG:ar och artefakter. Körs före SUSHI.
//
//   ig-composer komponera <ig-katalog>      komponera en IG (före SUSHI)
//   ig-composer efterbehandla <ig-katalog>  rätta SUSHI-resultatet (efter SUSHI)
//   ig-composer bygg                        allt ovan + SUSHI för alla IG:ar
//   ig-composer installera <ig-katalog>     lägg SUSHI-resultatet i lokal FHIR-cache
//   ig-composer matris                      skriv matrisen innehåll × federation
//   ig-composer vy                          skriv vy.html: interaktiv matris från komposition.json
//   ig-composer system                      summera krav per system (system/*.yaml), gap mot nuläge
//                                           och testlista; skriver rapport/<system>.md
//   ig-composer federation testa            bygg en mockad federation, kör förutsättningar och
//                                           användningsfall mot den; skriver federation.json och
//                                           rapport/federation.md
//   ig-composer federation testa --mot <miljö>
//                                           kör i läsläge mot en verklig T2-realisering
//                                           (miljoer/<miljö>.yaml); skriver federation-<miljö>.json
//                                           och rapport/federation-<miljö>.md
//   ig-composer federation starta [--port N] starta den mockade federationen och låt den köra
//   ig-composer register publicera|lista [--server URL]
//                                           publicera IG:arnas definitioner i ett FHIR-register (HAPI R5,
//                                           standard FHIR_REGISTER eller http://localhost:8080/fhir)
//   ig-composer mermaid <fil|url> [--server URL] [--rubrik]
//                                           diagram ur ett flöde: ExampleScenario (sekvens) eller
//                                           PlanDefinition (simbanor); fil eller kanonisk URL i registret
//   ig-composer studio [--port N]           lokal server: vyn med redigering av system, användningsfall
//                                           och komposition
//   ig-composer externa hamta [--mot <miljö>] hämta de externa specifikationerna (basic auth
//                                           från INFOPEAK_ANVANDARE/INFOPEAK_LOSENORD)
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
import { composeScenarios } from './scenario.mjs';
import { loadSystems, analyseSystem, renderReport } from './system.mjs';
import { byggFederation, testaFederation, korFederation, renderFederationReport } from './federation.mjs';
import { anvandningsfallSida, mermaidFranScenario, arbetsflodesSida, mermaidFranPlan } from './mermaid.mjs';
import { startaStudio } from './studio.mjs';
import { behorighetFor, behorigheterForRoll, arKonsumentroll } from './behorighet.mjs';
import { KEDJA, STATUS_TITEL } from './anslutning.mjs';
import { loadProdukter } from './systemregister.mjs';
import { referensroller, startaReferens, testaReferens, skrivProdukttest, lasProdukttester } from './produkttest.mjs';
import { registerUrl, publiceraRegister, listaRegister, scenarioFranRegister } from './register.mjs';
import { lasMiljo, adapterMiljo, systemFranKatalog, jamforSpecifikationer, hamtaExterna } from './infopeak.mjs';

const EXT = 'https://fhir.inera.se/ig/conventions/StructureDefinition/';
const OUT_FSH = path.join('input', 'fsh', '_komponerat');
const OUT_PAGE = path.join('input', 'pagecontent', 'komposition.md');
const OUT_MANIFEST = 'komposition.json';
// Konventionens RuleSets som verktyget läser i stället för att expandera.
const KEEP = new Set(['Obligation', 'Bas', 'Realiserar', 'Stodtjanst', 'TillvalFor', 'ExternSpecifikation', 'Kompositionsanvisning', 'KopieradFran', 'KopieradFranInstans']);
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
  const flode = ext('flodesmonster');
  const subs = (e, name) => (e?.extension || []).filter((x) => x.url === name);
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
    flodesmonster: flode && {
      vid: subs(flode, 'vid').map((x) => x.valueCode),
      fore: subs(flode, 'fore').map((x) => x.valueString),
      foreEnGang: subs(flode, 'foreEnGang')[0]?.valueBoolean === true,
      foreVarje: subs(flode, 'foreVarje').map((x) => x.valueString),
      efter: subs(flode, 'efter').map((x) => x.valueString),
    },
    valfriaInformationsmangder: exts.filter((e) => e.url === EXT + 'valfri-informationsmangd').map((e) => e.valueString),
    anvandningsfall: exts.filter((e) => e.url === EXT + 'anvandningsfall').map((e) => e.valueString),
    forutsattningar: exts.filter((e) => e.url === EXT + 'forutsattning').map((e) => e.valueString),
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
          `Description: "Genererad av ig-composer från federationsmönstret ${ruleset} i ${fed.id}#${fed.version}. Ytterligare bas (Bas) för tjänstens profiler av typen ${type}."`,
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

  // 5a. Informationsmängder: en specifikation per exponerad profil som
  // realiserar ett informationsbehov. Den motsvarar en extern specifikation om
  // informationsbehovet anger en (ExternSpecifikation).
  const realiserarTidigt = (p) => expandRules(p, ruleSets, KEEP)
    .filter((r) => r.insert?.name === 'Realiserar' && !r.path).map((r) => r.insert.args[0]);
  const informationsmangder = [];
  if (ig.roll === 'tjanst' && rules.informationsmangder?.generera) {
    const today = new Date().toISOString().slice(0, 10);
    const logiska = new Map(all.filter((e) => e.kind === 'Logical').map((e) => [e.name, e]));
    const stodCs = new Set(all.filter((e) => e.kind === 'Instance' && e.meta.InstanceOf === 'ActorDefinition')
      .map(readActor).filter((a) => a.stodtjanst).map((a) => a.capabilities));
    const serverCs = all.filter((e) => e.kind === 'Instance' && e.meta.InstanceOf === 'CapabilityStatement' && !stodCs.has(e.name))
      .map(readCapability).flatMap((c) => c.rest.filter((b) => b.mode === 'server'));
    const spTyp = (n) => ({ patient: 'reference', subject: 'reference', recorder: 'reference', organization: 'reference', target: 'reference', date: 'date', url: 'uri' }[n] || 'token');
    for (const p of exposed) {
      let lm = null;
      for (let q = p, i = 0; q && i < 20 && !lm; q = parentOf(q), i++) lm = realiserarTidigt(q)[0] || null;
      if (!lm) continue;
      const modell = logiska.get(lm);
      const extern = modell && expandRules(modell, ruleSets, KEEP).find((r) => r.insert?.name === 'ExternSpecifikation' && !r.path)?.insert.args[0];
      const typ = baseType(p);
      const interaktioner = [...new Set(serverCs.flatMap((b) => b.resurser[typ]?.interaktioner || []))];
      const sok = [...new Set(serverCs.flatMap((b) => b.resurser[typ]?.sokparametrar || []))];
      const namn = `${lm.replace(/Info$/, '')}${rules.informationsmangder.suffix || 'API'}`;
      const titel = (modell?.meta.Title || lm).replace(/^Informationsbehov: /, '');
      const krav = ig.valfriaInformationsmangder.includes(lm) ? 'valfri' : 'obligatorisk';
      const text = [
        `Instance: ${namn}`,
        'InstanceOf: CapabilityStatement',
        'Usage: #definition',
        `Title: "Informationsmängd: ${titel}"`,
        `Description: "Genererad av ig-composer: specifikation för informationsmängden ${titel} i ${ig.title} (${krav}).${extern ? ` Motsvarar ${extern}.` : ''}"`,
        `* name = "${namn}"`,
        `* title = "Informationsmängd: ${titel}"`,
        '* status = #draft',
        `* date = "${today}"`,
        '* kind = #requirements',
        ...(extern ? [`* instantiates[0] = "${extern}"`] : []),
        `* fhirVersion = #${ig.fhirVersion}`,
        '* format[0] = #json',
        '* rest[0].mode = #server',
        `* rest[=].resource[0].type = #${typ}`,
        `* rest[=].resource[=].profile = Canonical(${p.name})`,
        ...interaktioner.map((c) => `* rest[=].resource[=].interaction[+].code = #${c}`),
        ...sok.flatMap((n) => [`* rest[=].resource[=].searchParam[+].name = "${n}"`, `* rest[=].resource[=].searchParam[=].type = #${spTyp(n)}`]),
      ].join('\n');
      if (names.has(namn)) fel.push(`Informationsmängdens specifikation ${namn} krockar med en artefakt i ${names.get(namn).origin.paket}`);
      const [e] = parseFsh(text, OUT_FSH);
      e.origin = { paket: ig.id, lage: 'genererad' };
      generated.push(e);
      informationsmangder.push({
        nyckel: lm, namn, id: e.id, titel, krav, resurstyp: typ, profil: p.name,
        url: `${ig.canonical}/CapabilityStatement/${e.id}`, version: ig.version, motsvarar: extern || null,
      });
    }
    for (const lm of ig.valfriaInformationsmangder) {
      if (!informationsmangder.some((i) => i.nyckel === lm)) varningar.push(`Den valfria informationsmängden ${lm} finns inte bland tjänstens profiler`);
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
        const ancCs = [...new Set(anc.map((x) => x.actor?.capabilities).filter((c) => capabilities.has(c)))];
        // Ett rest-block per läge (en källsystemsroll är t.ex. server för
        // kliniskt innehåll men klient mot tjänstekatalogen).
        const lagen = [...new Set(ancCs.flatMap((c) => capabilities.get(c).rest.map((blk) => blk.mode)).filter(Boolean))];
        const servertyper = new Set(ancCs.flatMap((c) => capabilities.get(c).rest.filter((blk) => blk.mode === 'server').flatMap((blk) => Object.keys(blk.resurser))));
        // Obligatoriska informationsmängder importeras; valfria väljer systemet.
        const mangder = informationsmangder.filter((i) => servertyper.has(i.resurstyp));
        const mangdImports = mangder.filter((i) => i.krav === 'obligatorisk').map((i) => i.namn);
        const valfria = mangder.filter((i) => i.krav === 'valfri').map((i) => i.namn);
        const rest = [];
        for (const lage of lagen) {
          rest.push(`* rest[+].mode = #${lage}`, `* rest[=].documentation = "Tjänstens profiler för ${a.title} (${lage}). Interaktioner och sökparametrar följer av de importerade förmågorna."`);
          const types = [...new Set(ancCs.flatMap((c) => capabilities.get(c).rest.filter((blk) => blk.mode === lage).flatMap((blk) => Object.keys(blk.resurser))))];
          for (const type of types) {
            const prof = exposed.filter((p) => baseType(p) === type);
            if (!prof.length) continue;
            rest.push(`* rest[=].resource[+].type = #${type}`);
            if (prof.length === 1) rest.push(`* rest[=].resource[=].profile = Canonical(${prof[0].name})`);
            else for (const p of prof) rest.push(`* rest[=].resource[=].supportedProfile[+] = Canonical(${p.name})`);
          }
        }
        const text = [
          `Instance: ${csName}`,
          'InstanceOf: CapabilityStatement',
          'Usage: #definition',
          `Title: "Förmågor: ${a.title}"`,
          `Description: "Genererad av ig-composer. Importerar förmågorna hos aktörens förfäder och anger tjänstens profiler.${valfria.length ? ` Valfria informationsmängder: ${valfria.join(', ')}.` : ''}"`,
          `* name = "${csName}"`,
          `* title = "Förmågor: ${a.title}"`,
          '* status = #draft',
          `* date = "${today}"`,
          '* kind = #requirements',
          `* fhirVersion = #${ig.fhirVersion}`,
          '* format[0] = #json',
          ...ancCs.map((c) => `* imports[+] = Canonical(${c})`),
          ...mangdImports.map((c) => `* imports[+] = Canonical(${c})`),
          ...(rest.length ? rest : ['* rest[+].mode = #server']),
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
            `Description: "Genererad av ig-composer. Härleds från kraven på aktörens förfäder."`,
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

  // 6. Kravmodell: användningsfall och delflöden → ExampleScenario och
  // Requirements, med invävning, harmonisering och täckningskontroll.
  const realiserar = (p) => expandRules(p, ruleSets, KEEP)
    .filter((r) => r.insert?.name === 'Realiserar' && !r.path)
    .map((r) => r.insert.args[0]);
  // Tjänstens tillämpning: bindningar som överstyr de härledda.
  const tillampningFil = path.join(ig.dir, 'input', 'tillampning.yaml');
  const tillampning = fs.existsSync(tillampningFil) ? YAML.parse(fs.readFileSync(tillampningFil, 'utf8')) || {} : {};
  const scenarier = composeScenarios({
    ig, rules, plan, ws, informationsmangder, tillampning,
    fed: federationer[0]?.ig,
    entities: all,
    actors, ancestorsOf, capabilities,
    serviceActors: ig.roll === 'tjanst' ? localActors : [],
    profiles, exposed, parentOf, baseType, realiserar,
    rollOf: (e) => (e ? rollOf(e) : undefined),
    report: (niva, text) => warnOrFail(niva, text),
  });
  for (const { text, namn } of scenarier.genererat) {
    if (names.has(namn)) fel.push(`Det genererade namnet ${namn} krockar med en artefakt i ${names.get(namn).origin.paket}`);
    const [e] = parseFsh(text, OUT_FSH);
    e.origin = { paket: ig.id, lage: 'genererad' };
    generated.push(e);
    if (e.meta.InstanceOf === 'Requirements') requirements.push(readRequirements(e));
  }

  // 7. Kravprofil per systemroll: obligations längs arvskedjan och baserna.
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
    anvandningsfall: scenarier.modell, informationsmangder, requirements, baseType, basesOf, parentOf, fel, varningar,
    actors, capabilities, profileByRef, profiles,
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
    type: rules.map((r) => r.match(/^type\s*=\s*#(\w+)/)?.[1]).find(Boolean) || 'system',
    stodtjanst: rules.some((r) => /^insert Stodtjanst\b/.test(r)),
    tillvalFor: rules.map((r) => r.match(/^insert TillvalFor\((\w+)\)/)?.[1]).find(Boolean) || null,
    derivedFrom: rules.filter((r) => /^derivedFrom(\[[^\]]*\])?\s*=/.test(r)).map((r) => canonicalArg(r.replace(/^[^=]*=\s*/, ''))),
    capabilities: rules.filter((r) => /^capabilities\s*=/.test(r)).map((r) => canonicalArg(r.replace(/^[^=]*=\s*/, '')))[0],
  };
}

function readCapability(e) {
  // Förmågor per rest-block: läge (server/client), resurstyper med
  // interaktioner, sökparametrar och profiler, samt systeminteraktioner.
  const rest = [];
  let ri = -1;
  let res = null;
  const idx = (tok, len, cur) => (tok === '+' ? len : tok === '=' ? cur : Number(tok));
  for (const r of ruleLines(e)) {
    const m = r.match(/^rest\[([^\]]*)\](.*)$/);
    if (!m) continue;
    ri = idx(m[1], rest.length, ri);
    rest[ri] ||= { mode: null, resurser: {}, system: [] };
    const blk = rest[ri];
    const rem = m[2];
    let x;
    if ((x = rem.match(/^\.mode\s*=\s*#(\w+)/))) blk.mode = x[1];
    else if ((x = rem.match(/^\.interaction\[[^\]]*\]\.code\s*=\s*#([\w-]+)/))) blk.system.push(x[1]);
    else if ((x = rem.match(/^\.resource\[[^\]]*\]\.type\s*=\s*#(\w+)/))) {
      res = blk.resurser[x[1]] ||= { interaktioner: [], sokparametrar: [], profiler: [] };
    } else if (res && (x = rem.match(/^\.resource\[[^\]]*\]\.interaction\[[^\]]*\]\.code\s*=\s*#([\w-]+)/))) res.interaktioner.push(x[1]);
    else if (res && (x = rem.match(/^\.resource\[[^\]]*\]\.searchParam\[[^\]]*\]\.name\s*=\s*"(.*)"/))) res.sokparametrar.push(x[1]);
    else if (res && (x = rem.match(/^\.resource\[[^\]]*\]\.(?:profile|supportedProfile\[[^\]]*\])\s*=\s*(.+)$/))) res.profiler.push(canonicalArg(x[1].trim()));
  }
  const interactions = {};
  for (const blk of rest) for (const [t, v] of Object.entries(blk.resurser)) (interactions[t] ||= []).push(...v.interaktioner);
  return {
    entity: e,
    name: e.name,
    id: e.id,
    rest,
    mode: rest[0]?.mode,
    types: [...new Set(rest.flatMap((blk) => Object.keys(blk.resurser)))],
    interactions,
    systemInteractions: rest.flatMap((blk) => blk.system),
    imports: ruleLines(e).filter((r) => /^imports(\[[^\]]*\])?\s*=/.test(r)).map((r) => canonicalArg(r.replace(/^[^=]*=\s*/, ''))),
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
  const header = (what) => `// Genererad av ig-composer – ändra inte för hand.\n// ${what}\n\n`;

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
  out.push('<!-- Genererad av ig-composer – ändra inte för hand. -->');
  out.push('', `Denna sida genereras av verktyget \`ig-composer\` före varje bygge. Den visar vad som kommer med i ${r.ig.title} och varifrån, och den härledda kravprofilen för varje systemroll som IG:n definierar.`);

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

  if (r.anvandningsfall.length) {
    const logisk = r.anvandningsfall[0].niva === 'logisk';
    out.push('', '### Användningsfall och delflöden', '', logisk
      ? 'Logiska arbetsflöden, kompilerade från skissformatet till PlanDefinition (workflow-definition) och Requirements. Aktiviteterna binds till interaktioner i tjänsterna.'
      : 'Tillämpade flöden, kompilerade från skissformatet till ExampleScenario och Requirements. Varje aktivitet är bunden till en interaktion och den specifikation den följer. Steg markerade *invävt* kommer från federationens flödesmönster.');
    for (const u of r.anvandningsfall) {
      out.push('', `#### ${u.titel}`, '', `${u.typ === 'anvandningsfall' ? 'Användningsfall' : 'Delflöde'} [${u.namn}](${u.resurs || 'ExampleScenario'}-${u.namn}.html) från ${code(u.paket)}.${u.tillampar ? ` Tillämpar ${code(u.tillampar)}.` : ''}${u.syfte ? ` ${u.syfte}` : ''}`, '');
      const bana = (k) => u.aktorer.find((a) => a.nyckel === k)?.titel || k;
      for (const st of u.steg) {
        const vad = st.typ === 'delflode' ? `*invävt:* ${st.titel} (${code(st.invavd)})` : `${st.titel}${st.fran ? ` – ${bana(st.fran)} → ${bana(st.till)}` : ''}${st.aktivitet && !st.operation ? ` (${st.aktivitet})` : ''}${st.operation ? ` (${st.aktivitet ? `${st.aktivitet} → ` : ''}${code(st.operation)}${st.profil ? `, ${st.profil}` : st.resurstyp ? `, ${st.resurstyp}` : ''}${st.specifikation ? `, enligt [${st.specifikation}](CapabilityStatement-${st.specifikation}.html)` : ''})` : ''}`;
        out.push(`${'   '.repeat(st.nr.split('.').length - 1)}${st.nr.split('.').length > 1 ? '-' : '1.'} ${st.nr}: ${vad}`);
      }
      if (u.krav.length) out.push('', `Krav: ${u.krav.map((k) => `[${k.namn}](Requirements-${k.namn}.html)`).join(', ')}.`);
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

function titleOf(e) {
  const rule = ruleLines(e).find((r) => /^title\s*=/.test(r));
  return e.meta.Title || rule?.replace(/^title\s*=\s*"(.*)"$/, '$1') || e.name;
}

// Källan för en artefakt: kopierad-fran utan version, annars den egna URL:en.
// Samma källa i två tjänster betyder samma profil med två kanoniska URL:er.
function kallaAv(e, canonical, typ) {
  return e.origin.kopieradFran ? e.origin.kopieradFran.split('|')[0] : `${canonical}/${typ}/${e.id}`;
}

function profilRef(r, ref) {
  if (ref.startsWith('$')) ref = r.aliases.get(ref)?.aliasValue || ref;
  const p = r.profileByRef.get(ref);
  if (!p) return { namn: ref, url: ref, kalla: ref };
  const url = `${r.ig.canonical}/StructureDefinition/${p.id}`;
  return { namn: p.name, url, kalla: p.origin.kopieradFran ? p.origin.kopieradFran.split('|')[0] : url };
}

function forfaderAv(r, p) {
  const ut = [];
  for (let q = r.parentOf(p), i = 0; q && i < 20; q = r.parentOf(q), i++) ut.push(q.name);
  return ut;
}

function manifest(r) {
  const art = (e) => ({
    namn: e.name,
    titel: titleOf(e),
    id: e.id,
    typ: e.kind === 'Instance' ? e.meta.InstanceOf : e.kind,
    paket: e.origin.paket,
    lage: e.origin.lage,
    via: e.origin.via || [],
    kopieradFran: e.origin.kopieradFran,
    injiceradBas: e.origin.injiceradBas,
  });
  return {
    ig: { id: r.ig.id, titel: r.ig.title, version: r.ig.version, canonical: r.ig.canonical, roll: r.ig.roll, publicering: r.ig.publicering },
    paket: r.plan.map((p) => ({
      id: p.ig.id, titel: p.ig.title, version: p.ig.version, roll: p.ig.roll, inkludering: p.mode, via: p.via,
    })),
    artefakter: [...r.local, ...r.copied, ...r.generated].filter((e) => e.kind !== 'Alias').map(art),
    refererat: r.refererat.map(art),
    utelamnat: r.utelamnat.map((u) => ({ ...art(u.e), skal: u.skal })),
    exponerade: r.exposed.map((p) => ({
      profil: p.name, resurstyp: r.baseType(p), parent: p.meta.Parent, baser: r.basesOf(p).map((b) => b.name),
    })),
    kravprofiler: r.kravprofiler.map((k) => ({
      aktor: k.aktor.name,
      aktorTitel: k.aktor.title,
      forfader: k.forfader.map((f) => ({ namn: f.name, titel: f.actor?.title, paket: f.actor?.entity.origin.paket, djup: f.depth })),
      formagor: k.formagor?.name,
      importerar: k.formagor?.imports || [],
      element: k.element.map((o) => ({ profil: o.profil.name, element: o.element, kod: o.kod, aktor: o.aktor, definieratI: o.kalla.name })),
      krav: k.krav.flatMap((req) => req.statements.map((s) => ({ nyckel: s.key, krav: s.requirement, styrka: s.conformance, kalla: req.name }))),
    })),
    anvandningsfall: r.anvandningsfall,
    informationsmangder: r.informationsmangder,
    // Alla krav med sina aktörer (för tillval i systemperspektivet).
    kravkatalog: r.requirements.map((q) => ({ namn: q.name, aktorer: q.actors, satser: q.statements.map((x) => ({ nyckel: x.key, krav: x.requirement, styrka: x.conformance })) })),
    // Underlag för systemperspektivet (ig-composer system, vy).
    formagor: Object.fromEntries([...r.capabilities.values()].map((c) => [c.name, {
      id: c.id,
      url: `${r.ig.canonical}/CapabilityStatement/${c.id}`,
      kalla: kallaAv(c.entity, r.ig.canonical, 'CapabilityStatement'),
      imports: c.imports,
      rest: c.rest.map((blk) => ({
        mode: blk.mode,
        system: blk.system,
        resurser: Object.fromEntries(Object.entries(blk.resurser).map(([t, v]) => [t, {
          interaktioner: v.interaktioner,
          sokparametrar: v.sokparametrar,
          profiler: v.profiler.map((ref) => profilRef(r, ref)),
        }])),
      })),
    }])),
    profiler: Object.fromEntries(r.profiles.map((p) => [p.name, {
      ...profilRef(r, p.name),
      forfader: forfaderAv(r, p),
    }])),
    aktorer: Object.fromEntries([...r.actors.values()].map((a) => [a.name, {
      titel: a.title, typ: a.type, stodtjanst: a.stodtjanst, tillvalFor: a.tillvalFor, derivedFrom: a.derivedFrom,
      formagor: a.capabilities, paket: a.entity.origin.paket,
    }])),
    diagnostik: { fel: r.fel, varningar: r.varningar },
  };
}

// ---------------------------------------------------------------- matris

export function matrix(ws) {
  const tjanster = [...ws.values()].filter((ig) => ig.roll === 'tjanst');
  const federationer = [...ws.values()].filter((ig) => ig.roll === 'federation');
  const byggblock = [...ws.values()].filter((ig) => ig.roll === 'byggblock');
  const anvanda = [...new Set(tjanster.flatMap((t) => t.komponerar
    .map((k) => ws.get(k.paket)).filter((d) => d?.roll === 'byggblock').map((d) => d.id)))];
  // Fristående byggblock (som ingen tjänst eller annat byggblock komponerar)
  // blir kandidatrader; delblock som bara ingår i ett annat byggblock visas inte.
  const delblock = new Set(byggblock.flatMap((b) => b.komponerar.map((k) => k.paket)));
  const kandidater = byggblock.filter((b) => !anvanda.includes(b.id) && !delblock.has(b.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'sv')).map((b) => b.id);
  const domaner = [...anvanda, ...kandidater];
  const cells = federationer.map((f) => ({
    federation: f.id,
    celler: domaner.map((d) => ({
      domän: d,
      tjanster: tjanster.filter((t) => t.komponerar.some((k) => k.paket === f.id)
        && t.komponerar.some((k) => k.paket === d)).map((t) => t.id),
    })),
  }));
  // Innehåll (byggblock) som rader, eftersom de blir många; federationer som kolumner.
  const cell = (d, f) => cells.find((r) => r.federation === f).celler.find((c) => c.domän === d).tjanster;
  const md = [
    '<!-- Genererad av ig-composer matris – ändra inte för hand. -->',
    '# Matris: innehåll × federation', '',
    `| Innehåll | ${federationer.map((f) => f.title).join(' | ')} |`,
    `|---|${federationer.map(() => '---').join('|')}|`,
    ...domaner.map((d) => `| ${ws.get(d).title} | ${federationer.map((f) => cell(d, f.id).map((t) => ws.get(t).title).join('<br>') || 'kandidat').join(' | ')} |`),
  ].join('\n');
  return { json: { domaner, federationer: federationer.map((f) => f.id), rader: cells }, md: md + '\n' };
}

// ---------------------------------------------------------------- vy

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Data till den interaktiva matrisvyn: arbetsytans IG:ar, matrisen och varje
// IG:s komposition.json (som skrivs av komponera/bygg).
export function loadManifests(ws) {
  const manifest = {};
  for (const ig of ws.values()) {
    const file = path.join(ig.dir, OUT_MANIFEST);
    if (fs.existsSync(file)) manifest[ig.id] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return manifest;
}

// Följsamheten per roll för en systeminstans: produktens godkännande för
// rollen och om instansens CapabilityStatement anger tjänstens IG (eller
// rollens förmågor).
function foljsamhetFor(a, produkt, manifests) {
  const utan = (u) => String(u).split('|')[0];
  return a.roller.filter((r) => !r.tillval).map((r) => {
    const m = manifests[r.tjanst];
    const ig = m ? `${m.ig.canonical}/ImplementationGuide/${m.ig.id}` : null;
    const cs = m?.aktorer[r.aktor]?.formagor ? m.formagor[m.aktorer[r.aktor].formagor]?.url : null;
    const deklarerat = [...a.nulage.implementationGuide, ...a.nulage.instantiates].map(utan);
    const g = (produkt?.godkannanden || []).find((x) => x.tjanst === r.tjanst && x.aktor === r.aktor) || null;
    return {
      roll: r.id, tjanst: r.tjanst, aktor: r.aktor, titel: r.titel, ig,
      igDeklarerad: a.nulage.finns ? deklarerat.includes(ig) || deklarerat.includes(cs) : null,
      produktgodkannande: g ? g.status : null,
      kalla: produkt?.foljsamhet?.kalla || null,
    };
  });
}

export function analyseSystems(ws, root, manifest = loadManifests(ws)) {
  const regler = loadRules(ws).system || {};
  const produkter = loadProdukter(root);
  return loadSystems(root).map((sys) => {
    const produkt = sys.produkt ? produkter.find((p) => p.produkt === sys.produkt) || null : null;
    const a = analyseSystem(sys, manifest, root, regler);
    if (sys.produkt && !produkt) a.fel.push(`Produkten ${sys.produkt} finns inte i system/produkter`);
    return {
      ...a, produkt: produkt && { id: produkt.produkt, titel: produkt.titel, leverantor: produkt.leverantor || null },
      foljsamhet: foljsamhetFor(a, produkt, manifest),
      behorighet: behorighetFor({ ...sys, produktInfo: produkt }, manifest),
    };
  });
}

// Komponerar alla IG:ar i byggordning, utan SUSHI (studions snabba varv).
export function komponeraAlla(ws) {
  const rules = loadRules(ws);
  return buildOrder(ws).filter((ig) => ig.komponerar.length).map((ig) => {
    const r = compose(ig, ws, rules);
    writeOutputs(r);
    return { ig: ig.id, fel: r.fel, varningar: r.varningar };
  });
}

// Sekvensdiagram per IG och ExampleScenario, ur SUSHI:s utdata.
function mermaidPerIg(ws) {
  const ut = {};
  for (const ig of ws.values()) {
    const dir = path.join(ig.dir, 'fsh-generated', 'resources');
    if (!fs.existsSync(dir)) continue;
    const alla = fs.readdirSync(dir).filter((f) => /^(ExampleScenario|PlanDefinition)-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    const resolver = (u) => alla.find((x) => x.url === u.split('|')[0]) || null;
    if (alla.length) {
      ut[ig.id] = Object.fromEntries(alla.map((r) => [r.name, r.resourceType === 'PlanDefinition' ? mermaidFranPlan(r, { resolver }) : mermaidFranScenario(r, { resolver })]));
    }
  }
  return ut;
}

export function viewData(ws, root) {
  const manifest = loadManifests(ws);
  return {
    genererad: new Date().toISOString(),
    igs: [...ws.values()].map((ig) => ({
      id: ig.id, titel: ig.title, version: ig.version, roll: ig.roll, publicering: ig.publicering,
      katalog: path.relative(root, ig.dir), komponerar: ig.komponerar,
    })),
    matris: matrix(ws).json,
    manifest,
    mermaid: mermaidPerIg(ws),
    system: analyseSystems(ws, root, manifest),
    produkter: loadProdukter(root).map(({ fil, ...p }) => p),
    // Scopes per tjänsteaktör, ur klientförmågorna i tjänstens IG.
    behorigheter: Object.fromEntries(Object.values(manifest).filter((m) => m.ig.roll === 'tjanst').map((m) => [m.ig.id,
      m.kravprofiler.map((k) => ({ ...behorigheterForRoll(m, k.aktor), konsument: arKonsumentroll(m, k.aktor) }))])),
    federation: fs.existsSync(path.join(root, 'federation.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'federation.json'), 'utf8')) : null,
    // Körningar mot verkliga T2-realiseringar (federation testa --mot <miljö>).
    miljoer: fs.readdirSync(root).filter((f) => /^federation-.+\.json$/.test(f)).sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))),
    // Federationstest mot produkternas referensimplementationer.
    produkttester: lasProdukttester(root),
  };
}

// Lägger in datat i mallen. "<" escapas så att data aldrig kan avsluta
// script-elementet.
export function renderView(data) {
  const mall = fs.readFileSync(path.join(HERE, 'vy', 'mall.html'), 'utf8');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  if (!mall.includes('/*__DATA__*/null')) throw new Error('Mallen saknar platshållaren /*__DATA__*/null');
  return mall.replace('/*__DATA__*/null', () => json);
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

// Sidan med flödena, genererad efter SUSHI: i ett logiskt paket ett
// simbanediagram per arbetsflöde (PlanDefinition), i en tjänst eller
// stödtjänst ett sekvensdiagram per användningsfall (ExampleScenario). Sidan
// och menyvalet läggs till i SUSHI:s ImplementationGuide och meny.
// Returnerar antalet diagram.
export function flodessida(igDir) {
  const res = path.join(igDir, 'fsh-generated', 'resources');
  if (!fs.existsSync(res)) return 0;
  const las = (prefix) => fs.readdirSync(res).filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(res, f), 'utf8')));
  const planer = las('PlanDefinition-');
  const logisk = planer.length > 0;
  const scenarier = logisk ? planer : las('ExampleScenario-');
  if (!scenarier.length) return 0;
  // Användningsfall, inte delflöden: enligt manifestet, annars de som inget annat pekar på.
  const manifestFil = path.join(igDir, OUT_MANIFEST);
  const manifest = fs.existsSync(manifestFil) ? JSON.parse(fs.readFileSync(manifestFil, 'utf8')) : null;
  const typ = new Map((manifest?.anvandningsfall || []).map((u) => [u.namn, u]));
  const anropade = new Set(scenarier.flatMap((es) => JSON.stringify(es).match(/"(workflow|definitionCanonical)":"[^"]+"/g) || []).map((w) => w.split('":"')[1].slice(0, -1).split('|')[0]));
  const valda = scenarier.filter((es) => (typ.size ? typ.get(es.name)?.typ === 'anvandningsfall' && !typ.get(es.name)?.endastInkluderad : !anropade.has(es.url)))
    .sort((a, b) => Number(!!typ.get(a.name)?.forutsattning) - Number(!!typ.get(b.name)?.forutsattning) || a.name.localeCompare(b.name));
  if (!valda.length) return 0;
  const resolver = (url) => scenarier.find((x) => x.url === url.split('|')[0]) || null;
  const sidtitel = logisk ? 'Arbetsflöden' : 'Användningsfall';
  fs.writeFileSync(path.join(igDir, 'input', 'pagecontent', 'anvandningsfall.md'), logisk ? arbetsflodesSida(valda, resolver) : anvandningsfallSida(valda, resolver));
  const igFil = fs.readdirSync(res).find((f) => f.startsWith('ImplementationGuide-'));
  if (igFil) {
    const igJson = JSON.parse(fs.readFileSync(path.join(res, igFil), 'utf8'));
    const sidor = igJson.definition.page.page ||= [];
    if (!sidor.some((p) => p.name === 'anvandningsfall.html')) {
      sidor.splice(1, 0, { sourceUrl: 'anvandningsfall.html', name: 'anvandningsfall.html', title: sidtitel, generation: 'markdown' });
      fs.writeFileSync(path.join(res, igFil), JSON.stringify(igJson, null, 2) + '\n');
    }
  }
  const meny = path.join(igDir, 'fsh-generated', 'includes', 'menu.xml');
  if (fs.existsSync(meny)) {
    const xml = fs.readFileSync(meny, 'utf8');
    if (!xml.includes('anvandningsfall.html')) {
      fs.writeFileSync(meny, xml.replace(/(\s*<li>\s*<a href="artifacts\.html">)/, `\n  <li>\n    <a href="anvandningsfall.html">${sidtitel}</a>\n  </li>$1`));
    }
  }
  return valda.length;
}

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

function skrivKorningar(r) {
  const per = {};
  const tecken = { ok: '✓', fel: '✕', delvis: '~', okänt: '?', manuell: '·' };
  for (const k of r.korningar) (per[k.system] ||= []).push(`${tecken[k.status] || '~'} ${k.titel} (${k.roll.split('#')[1]})`);
  for (const [sys, lista] of Object.entries(per)) console.log(`${sys}:\n  ${lista.join('\n  ')}`);
  for (const f of r.fore) {
    const e = r.efter.find((x) => x.system === f.system);
    console.log(`${f.system}: anslutningar före ${f.sammanfattning.anslutningarOk}/${f.anslutningar.length}, efter ${e.sammanfattning.anslutningarOk}/${e.anslutningar.length}`);
  }
}

// Hämtar det senaste från origin och gör det som ändringarna kräver: npm ci
// om beroendena ändrats, bygg om IG:arna eller verktyget ändrats, och omstart
// av studiorna (startloopen i devcontainern startar dem igen). Ändras miljön
// själv (devcontainer, compose, Dockerfile) behöver containern byggas om.
function uppdatera(root, tvingaBygg) {
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
  const fore = git('rev-parse', 'HEAD').stdout.trim();
  const lokala = git('status', '--porcelain').stdout.trim().split('\n').filter(Boolean);
  if (lokala.length) console.log(`Lokala ändringar (${lokala.length} filer) behålls; git vägrar bara om hämtade ändringar rör samma filer.`);
  const pull = git('pull', '--ff-only');
  process.stdout.write(pull.stdout);
  if (pull.status !== 0) {
    console.error(pull.stderr.trim());
    console.error('Hämtningen gick inte igenom. Committa eller återställ de lokala ändringarna (studions lista Ändrade filer) och försök igen.');
    return 1;
  }
  const efter = git('rev-parse', 'HEAD').stdout.trim();
  const andrade = fore === efter ? [] : git('diff', '--name-only', fore, efter).stdout.trim().split('\n').filter(Boolean);
  console.log(fore === efter ? 'Redan senaste versionen.' : `${fore.slice(0, 7)} → ${efter.slice(0, 7)}: ${andrade.length} filer ändrade.`);
  const rör = (re) => andrade.some((f) => re.test(f));
  let status = 0;
  if (rör(/^verktyg\/package(-lock)?\.json$/) || !fs.existsSync(path.join(root, 'verktyg', 'node_modules'))) {
    console.log('Beroendena har ändrats: npm ci …');
    const npm = spawnSync('npm', ['ci', '--prefix', 'verktyg'], { cwd: root, stdio: 'inherit' });
    if (npm.status !== 0) return 1;
  }
  const saknasManifest = [...loadWorkspace(root).values()].some((ig) => ig.komponerar.length && !fs.existsSync(path.join(ig.dir, OUT_MANIFEST)));
  if (tvingaBygg || saknasManifest || rör(/^(konventioner|byggblock|federationer|stodtjanster|tjanster)\//) || rör(/^verktyg\/.*\.mjs$/)) {
    console.log('Bygger IG:arna (SUSHI) …');
    // Det nya verktyget, i en egen process.
    const b = spawnSync(process.execPath, [path.join(root, 'verktyg', 'ig-composer.mjs'), 'bygg', '--arbetsyta', root], { cwd: root, stdio: 'inherit' });
    if (b.status !== 0) { console.error('Bygget hade fel; se ovan.'); status = 1; }
  }
  // Studiorna i startloopen (devcontainern) startar om inom några sekunder.
  // Mönstret träffar bara node-processerna, inte loopens sh, vars
  // kommandorad också innehåller "ig-composer.mjs studio".
  const stopp = spawnSync('pkill', ['-f', '^[^ ]*node .*ig-composer[.]mjs studio']);
  console.log(stopp.status === 0 ? 'Studiorna startas om; ladda om sidan i webbläsaren om några sekunder.' : 'Ingen studio körde. Ladda om sidan när du startat den.');
  if (rör(/^(\.devcontainer\/|docker-compose[^/]*\.ya?ml$|Dockerfile$)/)) {
    console.log('Miljön har ändrats (devcontainer, compose eller Dockerfile): bygg om containern, Ctrl+Shift+P → Codespaces: Rebuild Container.');
  }
  return status;
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
    console.log(`Efterbehandling: ${postProcess(path.resolve(target || '.'))} rättelser, ${flodessida(path.resolve(target || '.'))} flödesdiagram`);
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
  if (cmd === 'system') {
    const analyser = analyseSystems(ws, root).filter((a) => !target || a.system === target);
    const dir = path.join(root, 'rapport');
    fs.mkdirSync(dir, { recursive: true });
    let status = 0;
    for (const a of analyser) {
      fs.writeFileSync(path.join(dir, `${a.system}.md`), renderReport(a));
      const s = a.sammanfattning;
      console.log(`${a.titel}: ${s.roller} roller · API ${s.apiOk} ok / ${s.apiGap} gap / ${s.apiOkant} okänt · anslutningar ${s.anslutningarOk} ok / ${s.anslutningarGap} gap · ${s.tester} tester`);
      for (const f of a.fel) console.error(`  fel: ${f}`);
      if (a.fel.length) status = 1;
    }
    console.log(`Rapporter i ${dir}`);
    return status;
  }
  if (cmd === 'uppdatera') return uppdatera(root, args.includes('--bygg'));
  if (['anslutning', 'scopes', 'klient', 'wso2'].includes(cmd)) {
    const manifests = loadManifests(ws);
    const miljoFlagga = args.indexOf('--miljo');
    const miljo = miljoFlagga >= 0 ? args[miljoFlagga + 1] : 'test';
    // scopes <tjänst> [aktör]: per tjänsteaktör, direkt ur IG:n.
    if (cmd === 'scopes' && manifests[target]) {
      const m = manifests[target];
      const aktor = args[2] && !args[2].startsWith('--') ? args[2] : null;
      for (const k of m.kravprofiler.filter((x) => !aktor || x.aktor === aktor)) {
        const r = behorigheterForRoll(m, k.aktor);
        console.log(`${r.titel} (${k.aktor})${arKonsumentroll(m, k.aktor) ? ' · konsumentroll' : ''}`);
        for (const x of r.mottagare) console.log(`  → ${x.titel}: ${x.scopes.join(' ')}`);
        if (!r.mottagare.length) console.log('  inga klientanrop');
      }
      return 0;
    }
    const systemen = loadSystems(root).filter((x) => !target || x.system === target);
    if (target && !systemen.length) throw new Error(`${target} är varken ett system eller en tjänst`);
    for (const sys of systemen) {
      const b = behorighetFor(sys, manifests);
      if (cmd === 'anslutning') {
        console.log(`${sys.titel || sys.system}:`);
        for (const a of b.anslutningar) {
          const kedja = a.kedja.map((k) => (k.status === a.status ? `[${k.titel}]` : k.titel)).join(' → ');
          console.log(`  ${a.miljo.padEnd(4)} ${a.tjanstTitel} · ${a.titel}: ${kedja}${a.status === 'aterkallad' ? ` (${STATUS_TITEL.aterkallad})` : ''}`
            + `${a.kraverBevis ? ` · nästa steg kräver ${a.kraverBevis}` : ''}${a.fel.length ? ` · fel: ${a.fel.join('; ')}` : ''}`);
        }
        if (!b.anslutningar.length) console.log('  inga anslutningar');
        continue;
      }
      if (!KEDJA[miljo]) throw new Error(`Okänd miljö ${miljo} (${Object.keys(KEDJA).join(', ')})`);
      const x = b.miljoer[miljo];
      if (!x) { console.log(`${sys.titel || sys.system}: inga anslutningar i ${miljo}`); continue; }
      if (cmd === 'scopes') {
        console.log(`${sys.titel || sys.system} (${miljo}): ${x.scopes.join(' ')}`);
        for (const r of x.behorigheter) {
          console.log(`  ${r.titel} i ${r.tjanstTitel}`);
          for (const y of r.mottagare) console.log(`    → ${y.titel}: ${y.scopes.join(' ')}`);
        }
      }
      if (cmd === 'klient') console.log(JSON.stringify(x.klientCs, null, 2));
      if (cmd === 'wso2') {
        const fil = path.join(root, 'rapport', `wso2-${sys.system}-${miljo}.json`);
        fs.mkdirSync(path.dirname(fil), { recursive: true });
        fs.writeFileSync(fil, JSON.stringify(x.wso2, null, 2) + '\n');
        console.log(`${sys.titel || sys.system} (${miljo}, torrkörning): ${x.wso2.apier.length} API:er, ${x.wso2.apiProdukter.length} API Products, ${x.wso2.prenumerationer.length} prenumerationer${x.wso2.borttag.length ? `, ${x.wso2.borttag.length} borttag` : ''}${x.wso2.vantar.length ? `, ${x.wso2.vantar.length} väntar på behörighet` : ''}`);
        for (const a of x.wso2.anrop) console.log(`  ${a.metod.padEnd(6)} ${a.sokvag}  ${a.beskrivning}`);
        console.log(`  → ${path.relative(root, fil)}`);
      }
    }
    return 0;
  }
  const motFlagga = args.indexOf('--mot');
  const mot = motFlagga >= 0 ? args[motFlagga + 1] : null;
  const serverFlagga = args.indexOf('--server');
  const server = registerUrl(serverFlagga >= 0 ? args[serverFlagga + 1] : null);
  if (cmd === 'studio') {
    const portFlagga = args.indexOf('--port');
    const port = portFlagga >= 0 ? Number(args[portFlagga + 1]) : Number(process.env.STUDIO_PORT || 4900);
    const vard = process.env.STUDIO_VARD || '127.0.0.1';
    const bygg = () => {
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'bygg', '--arbetsyta', root], { encoding: 'utf8' });
      return { status: r.status, logg: `${r.stdout}${r.stderr}`.split('\n').slice(-60).join('\n') };
    };
    const miljoFlagga = args.indexOf('--miljo');
    const miljo = miljoFlagga >= 0 ? args[miljoFlagga + 1] : process.env.STUDIO_MILJO || null;
    return startaStudio({ root, port, vard, miljo, verktyg: { loadWorkspace, viewData, renderView, komponeraAlla, bygg, loadManifests, loadRules } }).then(() => {
      console.log(`Studio${miljo === 'test' ? ' i testmiljöläge' : ''} på http://${vard === '0.0.0.0' ? 'localhost' : vard}:${port}/ (Ctrl+C för att stoppa)`);
      return new Promise(() => {});
    });
  }
  if (cmd === 'register' && target === 'publicera') {
    return publiceraRegister({ server, igs: buildOrder(ws) }).then((ut) => {
      for (const r of ut) console.log(`${r.ig}: ${r.antal} definitioner → HTTP ${r.http} (${r.skapade} nya, ${r.uppdaterade} uppdaterade)${r.fel.length ? `\n  ${r.fel.join('\n  ')}` : ''}`);
      console.log(`Registret: ${server}`);
      return ut.some((r) => r.http >= 300) ? 1 : 0;
    });
  }
  if (cmd === 'register' && target === 'lista') {
    return listaRegister(server).then((ut) => {
      for (const r of ut) console.log(`${r.ig}: ${Object.entries(r.typer).map(([t, n]) => `${t} ${n}`).join(', ')}`);
      return 0;
    });
  }
  if (cmd === 'mermaid' && target) {
    const rubrik = args.includes('--rubrik');
    if (fs.existsSync(target)) {
      const dir = path.dirname(path.resolve(target));
      const alla = fs.readdirSync(dir).filter((f) => /^(ExampleScenario|PlanDefinition)-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      const r = JSON.parse(fs.readFileSync(target, 'utf8'));
      const resolver = (u) => alla.find((x) => x.url === u.split('|')[0]) || null;
      console.log(r.resourceType === 'PlanDefinition' ? mermaidFranPlan(r, { resolver }) : mermaidFranScenario(r, { resolver, rubrik }));
      return 0;
    }
    return scenarioFranRegister(server, target).then((r) => {
      if (!r) throw new Error(`ExampleScenario ${target} finns inte i ${server}`);
      console.log(r.es.resourceType === 'PlanDefinition' ? mermaidFranPlan(r.es, { resolver: r.resolver }) : mermaidFranScenario(r.es, { resolver: r.resolver, rubrik }));
      return 0;
    });
  }
  if (cmd === 'externa' && target === 'hamta') {
    return hamtaExterna(root, lasMiljo(root, mot || 'infopeak')).then((filer) => {
      for (const f of filer) console.log(`  ${f}`);
      console.log(`Hämtade ${filer.length} externa specifikationer`);
      return 0;
    });
  }
  // Federationstest mot en produkts referensimplementation.
  const flaggor = (namn) => args.flatMap((a, i) => (a === namn ? [args[i + 1]] : []));
  if (cmd === 'federation' && target === 'testa' && args.includes('--produkt')) {
    const id = flaggor('--produkt')[0];
    const produkt = loadProdukter(root).find((p) => p.produkt === id);
    if (!produkt) throw new Error(`Produkten ${id} finns inte`);
    const adress = flaggor('--adress')[0] || (produkt.foljsamhet?.kalla === 'referensimplementation' ? produkt.foljsamhet.adress : null);
    if (!adress) throw new Error(`${produkt.titel} har ingen referensimplementation; ange --adress`);
    const manifests = loadManifests(ws);
    const { roller, ejTestbara } = referensroller(produkt, manifests, flaggor('--roll'));
    if (!roller.length) throw new Error('Inga producentroller att testa; ange --roll tjänst#aktör eller ansök om produktgodkännande för en roll');
    return testaReferens({ ws, manifests, root, regler: loadRules(ws).system || {}, produkt, adress, roller, ejTestbara }).then((r) => {
      const rapport = skrivProdukttest(root, r);
      console.log(`${produkt.titel} → ${adress}: ${r.status}${r.fel ? ` (${r.fel})` : ''}`);
      for (const k of r.korningar) console.log(`  ${k.status.padEnd(8)} ${k.titel} (${k.roll.split('#')[1]})`);
      for (const x of ejTestbara) console.log(`  testas inte: ${x.aktor} – ${x.orsak}`);
      console.log(`Skrev produkttest-${id}.json och ${rapport}`);
      return r.status === 'godkänt' ? 0 : 1;
    });
  }
  // En lokal referensimplementation för roller (eller en produkts godkännanden).
  if (cmd === 'referens' && target === 'starta') {
    const manifests = loadManifests(ws);
    const produkt = flaggor('--produkt').length ? loadProdukter(root).find((p) => p.produkt === flaggor('--produkt')[0]) : { godkannanden: [] };
    if (!produkt) throw new Error(`Produkten ${flaggor('--produkt')[0]} finns inte`);
    const { roller } = referensroller(produkt, manifests, flaggor('--roll'));
    if (!roller.length) throw new Error('Ange --roll tjänst#aktör (en producentroll) eller --produkt med godkännanden');
    const port = Number(flaggor('--port')[0] || 4810);
    return startaReferens({ ws, manifests, roller, port, titel: `${produkt.titel || 'Referensimplementation'} (lokal referensimplementation)` }).then(({ url }) => {
      console.log(`Referensimplementation för ${roller.map((r) => r.titel).join(', ')} på ${url} (Ctrl+C för att stoppa)`);
      return new Promise(() => {});
    });
  }
  if (cmd === 'federation' && target === 'testa' && mot) {
    const konf = lasMiljo(root, mot);
    const miljo = adapterMiljo(konf);
    const manifests = loadManifests(ws);
    const regler = loadRules(ws).system || {};
    const tjanster = konf.tjanster || Object.values(manifests).filter((m) => m.ig.roll === 'tjanst').map((m) => m.ig.id);
    return systemFranKatalog(miljo, manifests, tjanster, regler).then(async (systems) => {
      console.log(`${miljo.titel}: ${systems.length} system härledda ur katalogen`);
      const r = await korFederation({ miljo, manifests, systems, root, regler });
      r.specifikationer = jamforSpecifikationer(root, konf, manifests, tjanster, ws.get(tjanster[0])?.fhirVersion);
      fs.writeFileSync(path.join(root, `federation-${mot}.json`), JSON.stringify(r, null, 2) + '\n');
      fs.mkdirSync(path.join(root, 'rapport'), { recursive: true });
      fs.writeFileSync(path.join(root, 'rapport', `federation-${mot}.md`), renderFederationReport(r));
      skrivKorningar(r);
      for (const j of r.specifikationer) {
        console.log(`${j.titel}: ${j.avvikelser.map((a) => a.niva).filter((n) => n !== 'info').length} avvikelser mot ${j.extern}`);
      }
      console.log(`Skrev federation-${mot}.json och rapport/federation-${mot}.md`);
      return 0;
    });
  }
  if (cmd === 'federation') {
    const portFlagga = args.indexOf('--port');
    const port = portFlagga >= 0 ? Number(args[portFlagga + 1]) : 0;
    const underlag = { ws, manifests: loadManifests(ws), systems: loadSystems(root), root, regler: loadRules(ws).system || {} };
    if (target === 'starta') {
      return byggFederation({ ...underlag, port: port || 4800 }).then(({ mock }) => {
        console.log(`Mockad federation på ${mock.bas} (Ctrl+C för att stoppa):`);
        for (const a of mock.andpunkter.values()) console.log(`  ${mock.url(a.sokvag)}${a.cs ? '' : '  (nuläge saknas)'}`);
        return new Promise(() => {});
      });
    }
    return testaFederation({ ...underlag, port }).then((r) => {
      fs.writeFileSync(path.join(root, 'federation.json'), JSON.stringify(r, null, 2) + '\n');
      fs.mkdirSync(path.join(root, 'rapport'), { recursive: true });
      fs.writeFileSync(path.join(root, 'rapport', 'federation.md'), renderFederationReport(r));
      skrivKorningar(r);
      console.log('Skrev federation.json och rapport/federation.md');
      return 0;
    });
  }
  if (cmd === 'vy') {
    const data = viewData(ws, root);
    const saknas = [...ws.values()].filter((ig) => ig.komponerar.length && !data.manifest[ig.id]).map((ig) => ig.id);
    if (saknas.length) console.warn(`varning: saknar komposition.json för ${saknas.join(', ')} – kör bygg först`);
    const file = path.join(root, 'vy.html');
    fs.writeFileSync(file, renderView(data));
    console.log(`Skrev ${file} (${Object.keys(data.manifest).length} IG:ar med komposition.json)`);
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
      const diagram = flodessida(ig.dir);
      if (diagram) console.log(`  flödessidan: ${diagram} diagram (PlanDefinition eller ExampleScenario)`);
      if (installeras(ig)) console.log(`  installerad i ${installLocal(ig.dir)}`);
    }
    return status;
  }
  console.log('Användning: ig-composer komponera|efterbehandla|installera <ig-katalog> | bygg | matris | vy | system [namn] | anslutning [system] | scopes <system|tjänst> [aktör] [--miljo test|prod] | klient|wso2 [system] [--miljo test|prod] | studio [--port N] [--miljo test] | uppdatera [--bygg] | federation testa|starta [--port N] [--arbetsyta <katalog>]');
  return cmd ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  Promise.resolve().then(() => main(process.argv))
    .then((kod) => { process.exitCode = kod; })
    .catch((err) => {
      console.error(`ig-composer: ${err.message}`);
      process.exitCode = 2;
    });
}
