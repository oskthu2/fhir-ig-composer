// Minimal FSH-läsare för kompositionen. Delar upp FSH-text i entiteter
// (Profile, Instance, RuleSet …) utan att tolka reglerna fullt ut; verktyget
// behöver bara metadata, några få regelmönster och möjligheten att lägga
// till regler i slutet av en entitet.

const KEYWORDS = [
  'Alias', 'Profile', 'Extension', 'Logical', 'Resource', 'Instance',
  'ValueSet', 'CodeSystem', 'Invariant', 'Mapping', 'RuleSet',
];
const ENTITY_RE = new RegExp(`^(${KEYWORDS.join('|')})\\s*:\\s*(.+?)\\s*$`);
const META_RE = /^(Parent|Id|Title|Description|InstanceOf|Usage)\s*:\s*(.*?)\s*$/;

// Kanonisk resurstyp per FSH-entitetstyp (för instanser används InstanceOf).
export const RESOURCE_TYPE = {
  Profile: 'StructureDefinition',
  Extension: 'StructureDefinition',
  Logical: 'StructureDefinition',
  Resource: 'StructureDefinition',
  ValueSet: 'ValueSet',
  CodeSystem: 'CodeSystem',
};

export function parseFsh(text, file) {
  const lines = text.split(/\r?\n/);
  const entities = [];
  let current = null;
  let inTripleQuote = false;
  for (const line of lines) {
    const m = !inTripleQuote && line.match(ENTITY_RE);
    if (m) {
      current = newEntity(m[1], m[2], file);
      entities.push(current);
    }
    if (current) current.lines.push(line);
    if (((line.match(/"""/g) || []).length) % 2 === 1) inTripleQuote = !inTripleQuote;
  }
  for (const e of entities) readMetadata(e);
  return entities;
}

function newEntity(kind, rest, file) {
  const e = { kind, file, lines: [], meta: {}, params: [] };
  if (kind === 'Alias') {
    const [name, ...value] = rest.split('=');
    e.name = name.trim();
    e.aliasValue = value.join('=').trim();
  } else if (kind === 'RuleSet') {
    const rm = rest.match(/^([^(\s]+)\s*(?:\((.*)\))?$/);
    e.name = rm[1];
    e.params = rm[2] ? rm[2].split(',').map((p) => p.trim()) : [];
  } else {
    e.name = rest.trim();
  }
  return e;
}

function readMetadata(e) {
  let inTripleQuote = false;
  for (const line of e.lines.slice(1)) {
    const t = line.trim();
    if (!inTripleQuote && t.startsWith('*')) break;
    const m = !inTripleQuote && t.match(META_RE);
    if (m) e.meta[m[1]] = unquote(m[2]);
    if (((line.match(/"""/g) || []).length) % 2 === 1) inTripleQuote = !inTripleQuote;
  }
  if (e.kind === 'Instance') {
    const idRule = ruleLines(e).find((r) => /^id\s*=/.test(r));
    if (idRule) e.meta.Id = unquote(idRule.replace(/^id\s*=\s*/, ''));
  }
  e.id = e.meta.Id || e.name;
}

function unquote(s) {
  return s.replace(/^"(.*)"$/, '$1');
}

// Regelrader utan inledande "* " (fortsättningsrader ingår inte).
export function ruleLines(e) {
  return e.lines.slice(1)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('* '))
    .map((l) => l.slice(2).trim());
}

export function entityText(e) {
  return e.lines.join('\n').replace(/\s+$/, '');
}

export function appendRules(e, rules) {
  const text = entityText(e) + '\n' + rules.map((r) => `* ${r}`).join('\n');
  e.lines = text.split('\n');
}

// Insert-regler: "* [sökväg] insert Namn(arg, …)"
const INSERT_RE = /^(?:(\S+)\s+)?insert\s+([^(\s]+)\s*(?:\((.*)\))?\s*$/;

export function parseInsert(rule) {
  const m = rule.match(INSERT_RE);
  if (!m) return null;
  return {
    path: m[1] || '',
    name: m[2],
    args: m[3] !== undefined ? splitArgs(m[3]) : [],
  };
}

function splitArgs(s) {
  const args = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '' || args.length) args.push(cur.trim());
  return args;
}

// Expanderar insert av RuleSets rekursivt till platta regler med full
// sökväg. Används för att hitta obligations och kontrollera federationsytan.
// RuleSets i `keep` (t.ex. Obligation, Bas) expanderas inte utan returneras
// som insert-poster, eftersom det är dem verktyget letar efter.
export function expandRules(e, ruleSets, keep = new Set(), prefix = '', depth = 0) {
  if (depth > 10) throw new Error(`För djup RuleSet-nästling i ${e.name}`);
  const out = [];
  for (const rule of ruleLines(e)) {
    const ins = parseInsert(rule);
    if (ins && ruleSets.has(ins.name) && !keep.has(ins.name)) {
      const rs = ruleSets.get(ins.name);
      const bound = substitute(rs, ins.args);
      out.push(...expandRules(bound, ruleSets, keep, joinPath(prefix, ins.path), depth + 1));
    } else if (ins) {
      out.push({ path: joinPath(prefix, ins.path), rule: `insert ${ins.name}(${ins.args.join(', ')})`, insert: ins });
    } else {
      const pm = rule.match(/^(\^?\S+)\s*(.*)$/);
      const path = pm && !pm[1].startsWith('^') && !/^(insert|obeys)$/.test(pm[1]) ? pm[1] : '';
      out.push({ path: joinPath(prefix, path), rule });
    }
  }
  return out;
}

function substitute(rs, args) {
  let text = entityText(rs);
  rs.params.forEach((p, i) => {
    text = text.split(`{${p}}`).join(args[i] ?? '');
  });
  const [bound] = parseFsh(text, rs.file);
  return bound;
}

function joinPath(a, b) {
  if (!a) return b;
  if (!b) return a;
  return `${a}.${b}`;
}
