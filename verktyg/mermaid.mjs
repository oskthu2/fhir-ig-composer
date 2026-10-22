// Sekvensdiagram (Mermaid) ur FHIR ExampleScenario. Den styrande källan för
// ett flöde är ExampleScenario-resursen – kompilerad ur skissformatet, eller
// hämtad ur definitionsregistret – och samma resurs ger både verktygets
// modell och diagrammen på IG:ns webbsidor (IG Publisherns mall renderar
// ```mermaid-block).
//
// Steg som pekar på ett annat ExampleScenario (step.workflow) expanderas om
// resolvern hittar det. Delflödets aktörer binds till huvudflödets aktörer
// som spelar samma roll (ActorDefinition i extensionen scenario-aktor).

const SCENARIO_AKTOR = 'https://fhir.inera.se/ig/conventions/StructureDefinition/scenario-aktor';
const INVAVD_AV = 'https://fhir.inera.se/ig/conventions/StructureDefinition/invavd-av';

// Mermaid tolkar # och ; i meddelanden; radbrytningar avslutar raden.
const text = (s) => String(s ?? '').replace(/[#;]/g, ' ').replace(/\s+/g, ' ').trim();
const id = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');
const roller = (a) => (a.extension || []).filter((e) => e.url === SCENARIO_AKTOR).map((e) => e.valueCanonical);
const ext = (x, url) => (x.extension || []).find((e) => e.url === url);

// resolver(url) → ExampleScenario | null. djup begränsar expansionen.
export function mermaidFranScenario(es, { resolver = () => null, djup = 2, rubrik = false } = {}) {
  const deltagare = new Map(); // nyckel → { titel, typ }
  const rader = [];
  const anvanda = new Set();
  const not = (indrag, nycklar, t) => {
    nycklar.forEach((k) => anvanda.add(k));
    lagg(indrag, `note over ${nycklar.map(id).join(',')}: ${text(t)}`);
  };
  const lagg = (indrag, rad) => rader.push(`${'  '.repeat(indrag)}${rad}`);
  for (const a of es.actor || []) deltagare.set(a.key, { titel: a.title || a.key, typ: a.type, roller: roller(a) });

  // Delflödets aktörer → huvudflödets nycklar.
  const bind = (sub, karta) => {
    const ut = new Map();
    for (const a of sub.actor || []) {
      const r = roller(a);
      // Samma roll, annars samma titel (en tjänst ger aktören tjänsteaktörens titel).
      const traff = [...deltagare].find(([, d]) => d.roller.some((x) => r.includes(x)))
        || [...deltagare].find(([, d]) => a.title && d.titel === a.title);
      if (traff) ut.set(a.key, traff[0]);
      else {
        // Ny deltagare: heter som sin roll, så att samma stödtjänst blir en deltagare.
        const nyckel = r[0]?.split('/').pop() || `${sub.name || 'delflode'}_${a.key}`;
        if (!deltagare.has(nyckel)) deltagare.set(nyckel, { titel: a.title || a.key, typ: a.type, roller: r });
        ut.set(a.key, nyckel);
      }
    }
    return (k) => karta(ut.get(k) || k);
  };

  const operation = (op, nr, karta, indrag) => {
    const fran = karta(op.initiator);
    const till = karta(op.receiver);
    if (!fran || !till) {
      not(indrag, [fran || till || [...deltagare.keys()][0]], `${nr} ${op.title}`);
      return;
    }
    anvanda.add(fran).add(till);
    const typ = op.type?.code ? ` [${op.type.code}]` : '';
    lagg(indrag, `${id(fran)}->>${id(till)}: ${text(`${nr ? `${nr} ` : ''}${op.title}${typ}`)}`);
    if (op.response?.instanceReference) lagg(indrag, `${id(till)}-->>${id(fran)}: ${text(op.response.instanceReference)}`);
  };

  const steg = (lista, karta, indrag, prefix, nivå) => {
    for (const [i, s] of (lista || []).entries()) {
      const nr = prefix ? `${prefix}.${s.number || i + 1}` : s.number || String(i + 1);
      if (s.workflow) {
        const sub = nivå < djup ? resolver(s.workflow) : null;
        const av = ext(s, INVAVD_AV)?.valueString;
        const namn = sub?.title || s.workflow.split('/').pop();
        if (!sub) {
          not(indrag, [[...anvanda][0] || [...deltagare.keys()][0]], `${nr} ↳ ${namn}${av ? ` (${av})` : ''}`);
          continue;
        }
        lagg(indrag, `rect rgba(127, 127, 127, 0.12)`);
        const subKarta = bind(sub, karta);
        const nycklar = (sub.actor || []).map((a) => subKarta(a.key));
        not(indrag + 1, nycklar.length > 1 ? [nycklar[0], nycklar.at(-1)] : nycklar, `${nr} ${namn}${av ? ` (invävt av ${av})` : ''}`);
        steg(sub.process?.[0]?.step, subKarta, indrag + 1, nr, nivå + 1);
        lagg(indrag, 'end');
        continue;
      }
      if (s.process?.length) {
        for (const p of s.process) steg(p.step, karta, indrag, nr, nivå);
        continue;
      }
      if (s.alternative?.length) {
        lagg(indrag, `alt ${text(s.operation?.title || 'Huvudflöde')}`);
        if (s.operation) operation(s.operation, nr, karta, indrag + 1);
        for (const alt of s.alternative) {
          lagg(indrag, `else ${text(alt.title)}`);
          steg(alt.step, karta, indrag + 1, `${nr}.alt`, nivå);
        }
        lagg(indrag, 'end');
        continue;
      }
      if (s.operation) operation(s.operation, nr, karta, indrag);
    }
  };

  steg(es.process?.[0]?.step, (k) => k, 1, '', 0);
  const huvud = ['sequenceDiagram'];
  if (rubrik) huvud.push(`  title ${text(es.title || es.name)}`);
  for (const [k, d] of deltagare) {
    // Deltagare som aldrig används utelämnas.
    if (!anvanda.has(k)) continue;
    huvud.push(`  ${d.typ === 'person' ? 'actor' : 'participant'} ${id(k)} as ${text(d.titel)}`);
  }
  return [...huvud, ...rader].join('\n');
}

// Markdownsida med ett diagram per användningsfall (inte delflöden).
export function anvandningsfallSida(scenarier, resolver, { titel = 'Användningsfall' } = {}) {
  const ut = [`### ${titel}`, '',
    'Diagrammen genereras av ig-composer ur IG:ns ExampleScenario-resurser, som också är källan för kravspårningen och testerna. Invävda delflöden visas inramade.', ''];
  for (const es of scenarier) {
    ut.push(`#### ${es.title || es.name}`, '');
    if (es.purpose) ut.push(es.purpose, '');
    // Rå HTML i stället för ```mermaid: Jekyll sätter klassen bara på <code>,
    // men mallens mermaid-init.js söker pre.language-mermaid code.language-mermaid.
    const kod = mermaidFranScenario(es, { resolver }).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    ut.push(`[ExampleScenario: ${es.name}](ExampleScenario-${es.id}.html)`, '', `<pre class="language-mermaid"><code class="language-mermaid">${kod}</code></pre>`, '');
  }
  return ut.join('\n');
}
