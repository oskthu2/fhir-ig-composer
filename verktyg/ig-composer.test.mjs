import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import os from 'node:os';
import { loadWorkspace, compose, matrix, postProcess, viewData, renderView } from './ig-composer.mjs';
import { parseFsh, expandRules } from './fsh.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ws = loadWorkspace(root);
const rules = YAML.parse(fs.readFileSync(path.join(root, 'konventioner', 'regler.yaml'), 'utf8'));
const npo = () => compose(ws.get('inera.tjanst.npo'), loadWorkspace(root), rules);

test('NPÖ komponeras utan fel', () => {
  const r = npo();
  assert.deepEqual(r.fel, []);
  assert.deepEqual(r.plan.map((p) => [p.ig.id, p.mode]), [
    ['inera.build.conventions', 'referera'],
    ['inera.bb.patientoversikt', 'kopiera'],
    ['inera.bb.fastakontakter', 'kopiera'],
    ['inera.fed.svod', 'kopiera'],
  ]);
});

test('kopierade definitioner får ny canonical och behåller ursprunget', () => {
  const r = npo();
  const fk = r.copied.find((e) => e.name === 'FKKrav');
  assert.equal(fk.origin.kopieradFran, 'https://fhir.inera.se/ig/fastakontakter/Requirements/FKKrav|0.1.0');
  const text = fk.lines.join('\n');
  assert.match(text, /satisfiedBy\[0\] = "https:\/\/fhir\.inera\.se\/ig\/npo\/StructureDefinition\/fast-kontakt"/);
  assert.match(text, /KopieradFranInstans\(https:\/\/fhir\.inera\.se\/ig\/fastakontakter\//);
});

test('exempel och artefakter från refererade paket kopieras inte', () => {
  const r = npo();
  assert.ok(!r.copied.some((e) => e.meta.Usage === '#example'));
  assert.ok(r.copied.filter((e) => e.origin.paket === 'inera.build.conventions').every((e) => ['RuleSet', 'Alias'].includes(e.kind)));
});

test('federationen ger en bas per exponerad resurstyp', () => {
  const r = npo();
  assert.deepEqual(r.generated.filter((e) => e.kind === 'Profile').map((e) => e.name).sort(),
    ['SVODMetadataCareTeam', 'SVODMetadataEncounter']);
  assert.equal(r.copied.find((e) => e.name === 'FastKontakt').origin.injiceradBas, 'SVODMetadataCareTeam');
  assert.ok(!r.exposed.some((p) => p.name === 'Vardkontakt'), 'Vardkontakt skärps av VardkontaktNPO');
});

test('tjänsteaktörens kravprofil följer derivedFrom och baser', () => {
  const k = npo().kravprofiler.find((x) => x.aktor.name === 'NPOKallsystem');
  assert.deepEqual(k.forfader.map((f) => f.name), ['PSProducent', 'FKProducent', 'SVODKallsystem']);
  assert.deepEqual(k.formagor.imports, ['PSProducentCS', 'FKProducentCS', 'SVODKallsystemCS']);
  const kontakt = k.element.filter((o) => o.profil.name === 'VardkontaktNPO' && o.element === 'extension[kontaktuppgift]');
  assert.deepEqual(kontakt.map((o) => o.kod), ['SHALL:populate', 'SHOULD:populate-if-known']);
  assert.ok(k.element.some((o) => o.aktor === 'SVODKallsystem' && o.kalla.name === 'SVODMetadataEncounter'));
});

test('lagerregeln stoppar ett byggblock som komponerar en federation', () => {
  const w = loadWorkspace(root);
  const pso = w.get('inera.bb.patientoversikt');
  pso.komponerar.push({ paket: 'inera.fed.svod', version: '0.1.0' });
  const r = compose(pso, w, rules);
  assert.ok(r.fel.some((f) => f.includes('lager.byggblock')));
});

test('lokal tjänsteprofil utan federationens bas ger fel', () => {
  const w = loadWorkspace(root);
  const ig = w.get('inera.tjanst.npo');
  const r = compose(ig, w, { ...rules, federation: { ...rules.federation, basPaLokalaProfiler: 'fel' } });
  assert.deepEqual(r.fel, []);
  // Utan Bas-raden i VardkontaktNPO ska regeln slå till.
  const file = path.join(ig.dir, 'input', 'fsh', 'vardkontakt-npo.fsh');
  const orig = fs.readFileSync(file, 'utf8');
  try {
    fs.writeFileSync(file, orig.replace(/^\* insert Bas\(.*\)\n/m, ''));
    const r2 = compose(ig, loadWorkspace(root), rules);
    assert.ok(r2.fel.some((f) => f.includes('VardkontaktNPO saknar federationens bas')));
  } finally {
    fs.writeFileSync(file, orig);
  }
});

test('matrisen placerar tjänsterna i rätt celler', () => {
  const { json } = matrix(ws);
  assert.deepEqual(json.domaner, ['inera.bb.patientoversikt', 'inera.bb.labbsvar']);
  const cell = (fed, dom) => json.rader.find((r) => r.federation === fed).celler.find((c) => c.domän === dom).tjanster;
  assert.deepEqual(cell('inera.fed.svod', 'inera.bb.patientoversikt'), ['inera.tjanst.npo']);
  assert.deepEqual(cell('inera.fed.svod', 'inera.bb.labbsvar'), []);
  assert.deepEqual(cell('inera.fed.individuell', 'inera.bb.patientoversikt'), ['inera.tjanst.journal1177']);
  assert.deepEqual(cell('inera.fed.individuell', 'inera.bb.labbsvar'), ['inera.tjanst.journal1177']);
});

test('1177 Journal: två domäner, federationens bas på alla exponerade profiler', () => {
  const r = compose(ws.get('inera.tjanst.journal1177'), loadWorkspace(root), rules);
  assert.deepEqual(r.fel, []);
  assert.deepEqual(r.exposed.map((p) => p.name).sort(), ['FastKontakt', 'Labbsvar', 'Vardkontakt']);
  assert.ok(r.exposed.every((p) => p.origin.injiceradBas?.startsWith('IndividuellMetadata')));
});

test('1177 Journal: märkande och filtrerande källsystem får olika krav', () => {
  const r = compose(ws.get('inera.tjanst.journal1177'), loadWorkspace(root), rules);
  const k = (n) => r.kravprofiler.find((x) => x.aktor.name === n);
  const keys = (n) => k(n).krav.flatMap((q) => q.statements.map((s) => s.key));
  const security = (n) => k(n).element.filter((o) => o.element === 'meta.security');
  assert.ok(keys('Journal1177KallsystemMarkande').includes('IND-M-1'));
  assert.ok(!keys('Journal1177KallsystemMarkande').includes('IND-F-1'));
  assert.ok(keys('Journal1177KallsystemFiltrerande').includes('IND-F-1'));
  assert.equal(security('Journal1177KallsystemMarkande').length, 3);
  assert.equal(security('Journal1177KallsystemFiltrerande').length, 0);
  // Gemensam förfader importeras en gång.
  assert.deepEqual(k('Journal1177KallsystemMarkande').formagor.imports,
    ['PSProducentCS', 'FKProducentCS', 'LabProducentCS', 'IndividuellKallsystemCS']);
});

test('RuleSet-expansion ger sökvägar med kontext', () => {
  const [rs, p] = parseFsh([
    'RuleSet: M(x)', '* meta.source 1..1', '* extension[a] insert Obligation(#SHALL:populate, {x})',
    'Profile: P', 'Parent: Encounter', '* subject insert M(Akt)',
  ].join('\n'), 't.fsh');
  const out = expandRules(p, new Map([['M', rs]]), new Set(['Obligation']));
  assert.deepEqual(out.map((r) => r.path), ['subject.meta.source', 'subject.extension[a]']);
  assert.deepEqual(out[1].insert.args, ['#SHALL:populate', 'Akt']);
});

test('efterbehandlingen tar bort ärvda obligations ur differentialen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-composer-'));
  const res = path.join(dir, 'fsh-generated', 'resources');
  fs.mkdirSync(res, { recursive: true });
  const ob = (code, actor) => ({
    url: 'http://hl7.org/fhir/StructureDefinition/obligation',
    extension: [{ url: 'code', valueCode: code }, { url: 'actor', valueCanonical: actor }],
  });
  const sd = (id, base, obs) => ({
    resourceType: 'StructureDefinition', id, url: `http://x/${id}`, baseDefinition: base,
    differential: { element: [{ id: 'Encounter.subject', path: 'Encounter.subject', extension: obs }] },
  });
  // Så här ser SUSHI:s resultat ut: B:s egna obligation har skrivit över A:s första.
  fs.writeFileSync(path.join(res, 'StructureDefinition-A.json'), JSON.stringify(sd('A', 'http://hl7.org/fhir/StructureDefinition/Encounter', [ob('SHALL:populate', 'a1'), ob('SHALL:display', 'a2')])));
  fs.writeFileSync(path.join(res, 'StructureDefinition-B.json'), JSON.stringify(sd('B', 'http://x/A', [ob('SHALL:populate', 'b1'), ob('SHALL:display', 'a2')])));
  assert.equal(postProcess(dir), 1);
  const b = JSON.parse(fs.readFileSync(path.join(res, 'StructureDefinition-B.json'), 'utf8'));
  assert.deepEqual(b.differential.element[0].extension, [ob('SHALL:populate', 'b1')]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('vyn bäddar in data utan att kunna avsluta script-elementet', () => {
  const data = viewData(ws, root);
  assert.ok(data.igs.some((i) => i.id === 'inera.tjanst.npo' && i.roll === 'tjanst'));
  assert.deepEqual(data.matris, matrix(ws).json);
  data.igs.push({ id: 'x', titel: '</script><script>alert(1)</script>' });
  const html = renderView(data);
  assert.ok(!html.includes('/*__DATA__*/null'));
  assert.equal(html.match(/<\/script>/g).length, 1);
  const json = html.match(/const DATA = (.*);\n/)[1];
  assert.equal(JSON.parse(json).igs.at(-1).titel, '</script><script>alert(1)</script>');
});

// ---------------------------------------------------------------- kravmodell

const npoUc = () => compose(ws.get('inera.tjanst.npo'), loadWorkspace(root), rules).anvandningsfall;

test('NPÖ: SVOD:s delflöden vävs in – verifiering en gång, spärr och loggning efter varje hämtning', () => {
  const uc = npoUc().find((u) => u.namn === 'VardpersonalPatientoversikt');
  const huvud = uc.steg.filter((s) => !s.nr.includes('.'));
  assert.deepEqual(huvud.map((s) => (s.typ === 'delflode' ? `[${s.delflode}]` : s.operation || 'ui')), [
    'ui', '[SVODVerifieraPatientrelation]', 'search-type', '[SVODSparrOchLoggning]', 'search-type', '[SVODSparrOchLoggning]', 'ui',
  ]);
  assert.ok(uc.steg.filter((s) => s.delflode).every((s) => s.invavd === 'inera.fed.svod'));
});

test('NPÖ: informationsbehov harmoniseras till tjänstens profiler', () => {
  const uc = npoUc().find((u) => u.namn === 'VardpersonalPatientoversikt');
  assert.deepEqual(uc.informationsbehov.map((i) => [i.modell, i.profil]),
    [['VardkontaktInfo', 'VardkontaktNPO'], ['FastKontaktInfo', 'FastKontakt']]);
});

test('NPÖ: scenarioaktörer binds till roller och tjänsteaktörer, stödtjänster känns igen', () => {
  const a = Object.fromEntries(npoUc()[0].aktorer.map((x) => [x.nyckel, x]));
  assert.deepEqual(a.journal.roller, ['PSKonsument', 'SVODKonsument']);
  assert.deepEqual(a.journal.spelasAv, ['NPOKonsument']);
  assert.deepEqual(a.kalla.spelasAv, ['NPOKallsystem']);
  assert.equal(a.journal.titel, 'NPÖ: konsument');
  assert.ok(a.tgp.stodtjanst && a.logg.stodtjanst);
  assert.equal(a.vardpersonal.typ, 'person');
});

test('NPÖ: krav per aktör, med satisfiedBy till profil och tjänstens förmågor', () => {
  const r = compose(ws.get('inera.tjanst.npo'), loadWorkspace(root), rules);
  const uc = r.anvandningsfall[0];
  const kalla = uc.krav.find((k) => k.bana === 'kalla');
  const po3 = kalla.satser.find((s) => s.nyckel === 'PO-3');
  assert.deepEqual(po3.satisfiedBy.map((u) => u.split('/').pop()), ['vardkontakt-npo', 'NPOKallsystemCS']);
  // Delflödenas krav finns invävda i användningsfallets, inte som egna Requirements i tjänsten.
  assert.ok(uc.krav.find((k) => k.bana === 'journal').satser.some((s) => s.nyckel === 'SVOD-PR-2.1'));
  assert.deepEqual(r.anvandningsfall.filter((u) => u.typ === 'delflode').flatMap((u) => u.krav), []);
  // Kravprofilen för NPÖ: konsument tar med scenariokraven.
  const kp = r.kravprofiler.find((k) => k.aktor.name === 'NPOKonsument');
  assert.ok(kp.krav.some((q) => q.name === 'VardpersonalPatientoversiktJournalKrav'));
  assert.deepEqual(r.fel, []);
  assert.deepEqual(r.varningar, []);
});

test('byggblocket kompilerar sitt användningsfall utan invävning', () => {
  const r = compose(ws.get('inera.bb.patientoversikt'), loadWorkspace(root), rules);
  const uc = r.anvandningsfall.find((u) => u.namn === 'VardpersonalPatientoversikt');
  assert.ok(!uc.steg.some((s) => s.typ === 'delflode'));
  assert.deepEqual(uc.informationsbehov.map((i) => i.profil), ['Vardkontakt', 'FastKontakt']);
});

test('täckningen hittar okänd roll, okänt informationsbehov och saknad förmåga', () => {
  const fil = path.join(root, 'byggblock', 'patientoversikt', 'input', 'scenarier', 'zz-test.yaml');
  fs.writeFileSync(fil, YAML.stringify({
    anvandningsfall: 'TestFall', nyckel: 'T', titel: 'Test',
    aktorer: { a: 'PSKonsument', b: 'FinnsInte', c: 'PSProducent' },
    informationsbehov: { x: 'OkandInfo' },
    steg: [
      { titel: 'okänd', fran: 'a', till: 'b', operation: 'read', hamtar: 'x' },
      { titel: 'saknad förmåga', fran: 'a', till: 'c', operation: 'delete', resurstyp: 'Encounter' },
    ],
  }));
  try {
    const r = compose(ws.get('inera.bb.patientoversikt'), loadWorkspace(root), rules);
    assert.ok(r.fel.some((f) => f.includes('rollen FinnsInte')));
    assert.ok(r.fel.some((f) => f.includes('OkandInfo') && f.includes('logisk modell')));
    assert.ok(r.varningar.some((f) => f.includes('saknar delete på Encounter')));
  } finally {
    fs.rmSync(fil);
  }
});
