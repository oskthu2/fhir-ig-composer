import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import os from 'node:os';
import { loadWorkspace, compose, matrix, postProcess, viewData, renderView, analyseSystems } from './ig-composer.mjs';
import { apiStatus, loadSystems, analyseSystem } from './system.mjs';
import { MockFederation, fhir } from './mock.mjs';
import { testaFederation, byggFederation } from './federation.mjs';
import { systemFranKatalog, jamforSpecifikationer, lasMiljo } from './infopeak.mjs';
import { loadManifests } from './ig-composer.mjs';
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
    ['inera.st.t2', 'kopiera'],
  ]);
});

test('kopierade definitioner får ny canonical och behåller ursprunget', () => {
  const r = npo();
  const fk = r.copied.find((e) => e.name === 'FKKrav');
  assert.equal(fk.origin.kopieradFran, 'https://fhir.inera.se/ig/bb-fastakontakter/Requirements/FKKrav|0.1.0');
  const text = fk.lines.join('\n');
  assert.match(text, /satisfiedBy\[0\] = "https:\/\/fhir\.inera\.se\/ig\/npo\/StructureDefinition\/fast-kontakt"/);
  assert.match(text, /KopieradFranInstans\(https:\/\/fhir\.inera\.se\/ig\/bb-fastakontakter\//);
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
  assert.deepEqual(k.forfader.map((f) => f.name), ['PSProducent', 'FKProducent', 'SVODKallsystem', 'TjanstekatalogRegistrerare', 'Federationsmedlem']);
  // Obligatoriska informationsmängder importeras, den valfria (FastKontakt) inte.
  assert.deepEqual(k.formagor.imports, ['PSProducentCS', 'FKProducentCS', 'SVODKallsystemCS', 'TjanstekatalogRegistrerareCS', 'VardkontaktAPI']);
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
  assert.deepEqual(json.domaner, ['inera.bb.patientoversikt', 'inera.bb.labbsvar', 'inera.bb.pot2']);
  assert.deepEqual(json.rader.find((r) => r.federation === 'inera.fed.pot2').celler.find((c) => c.domän === 'inera.bb.pot2').tjanster, ['inera.tjanst.pot2']);
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
    ['PSProducentCS', 'FKProducentCS', 'LabProducentCS', 'IndividuellKallsystemCS', 'TjanstekatalogRegistrerareCS',
      'VardkontaktAPI', 'FastKontaktAPI', 'LabbsvarAPI']);
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

test('NPÖ: delflöden vävs in – verifiering och engagemang en gång, T2-uppslag före och spärr efter varje hämtning', () => {
  const uc = npoUc().find((u) => u.namn === 'VardpersonalPatientoversikt');
  const huvud = uc.steg.filter((s) => !s.nr.includes('.'));
  assert.deepEqual(huvud.map((s) => (s.typ === 'delflode' ? `[${s.delflode}]` : s.operation || 'ui')), [
    'ui', '[SVODVerifieraPatientrelation]', '[EngagemangsUppslag]', '[T2Uppslag]', 'search-type', '[SVODSparrOchLoggning]',
    '[T2Uppslag]', 'search-type', '[SVODSparrOchLoggning]', 'ui',
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
  assert.deepEqual(a.journal.roller, ['PSKonsument', 'SVODKonsument', 'T2Konsument']);
  assert.deepEqual(a.journal.spelasAv, ['NPOKonsument']);
  assert.deepEqual(a.kalla.spelasAv, ['NPOKallsystem']);
  assert.equal(a.journal.titel, 'NPÖ: konsument');
  assert.ok(a.tgp.stodtjanst && a.logg.stodtjanst && a.katalog.stodtjanst && a.index.stodtjanst);
  assert.equal(a.vardpersonal.typ, 'person');
});

test('NPÖ: krav per aktör, med satisfiedBy till profil och tjänstens förmågor', () => {
  const r = compose(ws.get('inera.tjanst.npo'), loadWorkspace(root), rules);
  const uc = r.anvandningsfall[0];
  const kalla = uc.krav.find((k) => k.bana === 'kalla');
  const po5 = kalla.satser.find((s) => s.nyckel === 'PO-5');
  assert.deepEqual(po5.satisfiedBy.map((u) => u.split('/').pop()), ['vardkontakt-npo', 'NPOKallsystemCS']);
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

// ---------------------------------------------------------------- förutsättningar och system

test('federationens förutsättningar ingår i varje tjänst, med inkluderad registrering', () => {
  const npo = compose(ws.get('inera.tjanst.npo'), loadWorkspace(root), rules);
  const uc = Object.fromEntries(npo.anvandningsfall.map((u) => [u.namn, u]));
  assert.ok(uc.AnslutaKallsystemSVOD.forutsattning && uc.AnslutaKonsumentSVOD.forutsattning);
  assert.ok(uc.RegistreraAndpunkt.endastInkluderad);
  const kalla = uc.AnslutaKallsystemSVOD.aktorer.find((a) => a.nyckel === 'kalla');
  assert.deepEqual(kalla.roller, ['SVODKallsystem', 'TjanstekatalogRegistrerare']);
  assert.deepEqual(kalla.spelasAv, ['NPOKallsystem']);
  assert.deepEqual(uc.AnslutaKallsystemSVOD.steg.map((s) => s.nr), ['1', '1.1', '1.2']);
  assert.ok(uc.AnslutaKallsystemSVOD.aktorer.find((a) => a.nyckel === 'katalog').stodtjanst);
  const j1177 = compose(ws.get('inera.tjanst.journal1177'), loadWorkspace(root), rules);
  assert.ok(j1177.anvandningsfall.some((u) => u.namn === 'AnslutaKallsystemIndividuell' && u.forutsattning));
  assert.deepEqual([...npo.fel, ...j1177.fel, ...npo.varningar, ...j1177.varningar], []);
});

test('tjänsteaktörens genererade förmågor har ett block per läge', () => {
  const r = compose(ws.get('inera.tjanst.npo'), loadWorkspace(root), rules);
  const cs = r.capabilities.get('NPOKallsystemCS');
  assert.deepEqual(cs.rest.map((b) => b.mode), ['server', 'client']);
  assert.ok(cs.imports.includes('TjanstekatalogRegistrerareCS'));
});

const systemen = () => Object.fromEntries(analyseSystems(loadWorkspace(root), root).map((a) => [a.system, a]));

test('system: summan av API-krav över roller, med gap mot nuläget', () => {
  const x = systemen().JournalX;
  assert.deepEqual(x.fel, []);
  const api = (lage, typ) => x.api.find((a) => a.lage === lage && a.typ === typ);
  assert.equal(api('server', 'CareTeam').status, 'saknas');
  const enc = api('server', 'Encounter');
  assert.equal(enc.status, 'delvis');
  assert.deepEqual(enc.sokparametrar.filter((d) => !d.finns).map((d) => d.namn), ['date']);
  // Den mest specifika profilen per tjänst: VardkontaktNPO ersätter NPÖ:s Vardkontakt.
  assert.deepEqual(enc.profiler.map((p) => [p.namn, p.tjanst]).sort(),
    [['Vardkontakt', 'inera.tjanst.journal1177'], ['VardkontaktNPO', 'inera.tjanst.npo']]);
  // NPÖ:s Fast kontakt är valfri och inte vald av JournalX: bara 1177 Journal kräver CareTeam.
  assert.deepEqual(api('server', 'CareTeam').roller, ['inera.tjanst.journal1177#Journal1177KallsystemMarkande']);
  const npo = x.roller.find((r) => r.aktor === 'NPOKallsystem').informationsmangder;
  assert.deepEqual(npo.map((i) => [i.nyckel, i.krav, i.vald]), [['FastKontaktInfo', 'valfri', false], ['VardkontaktInfo', 'obligatorisk', true]]);
});

test('system: en vald valfri informationsmängd ger samma profil med två kanoniska URL:er', () => {
  const sys = loadSystems(root).find((x) => x.system === 'JournalX');
  const x = analyseSystem({ ...sys, informationsmangder: { 'inera.tjanst.npo': ['VardkontaktInfo', 'FastKontaktInfo'] } },
    loadManifests(loadWorkspace(root)), root, rules.system);
  const ct = x.api.find((a) => a.lage === 'server' && a.typ === 'CareTeam');
  assert.equal(ct.profiler.length, 2);
  assert.equal(new Set(ct.profiler.map((p) => p.kalla)).size, 1);
  assert.deepEqual(ct.roller.sort(), ['inera.tjanst.journal1177#Journal1177KallsystemMarkande', 'inera.tjanst.npo#NPOKallsystem']);
  assert.ok(x.anslutningar.forvantade.some((f) => f.informationsmangd === 'FastKontaktInfo' && f.roll.endsWith('#NPOKallsystem') && f.status === 'saknas'));
});

test('system: tillval blir en egen roll med sina krav och förutsättningar', () => {
  const p = systemen().PrimarvardP;
  assert.deepEqual(p.fel, []);
  const t = p.roller.find((r) => r.tillval);
  assert.deepEqual([t.aktor, t.tillvalFor], ['POT2Engagemangsindexerad', 'POT2Producent']);
  assert.ok(p.api.some((a) => a.lage === 'client' && a.typ === 'EpisodeOfCare' && a.roller.includes(t.id)));
  assert.deepEqual(p.scenarier.filter((x) => x.roll === t.id).map((x) => x.anvandningsfall), ['AnmalaEngagemangPOT2']);
  // Utan tillvalet: inget engagemangskrav.
  const sys = loadSystems(root).find((x) => x.system === 'PrimarvardP');
  const utan = analyseSystem({ ...sys, tillval: [] }, loadManifests(loadWorkspace(root)), root, rules.system);
  assert.ok(!utan.scenarier.some((x) => x.anvandningsfall === 'AnmalaEngagemangPOT2'));
  assert.ok(!utan.api.some((a) => a.typ === 'EpisodeOfCare' && a.lage === 'client' && a.interaktioner.some((i) => i.kod === 'create')));
  // Uppmärksamhet är valfri och nuläget saknar Flag: inte vald, inget serverkrav.
  assert.ok(!p.api.some((a) => a.lage === 'server' && a.typ === 'Flag'));
});

test('system: gapet räknas om för ett urval av roller', () => {
  const x = systemen().JournalX;
  const enc = x.api.find((a) => a.lage === 'server' && a.typ === 'Encounter');
  assert.equal(apiStatus(enc, new Set(['inera.tjanst.journal1177#Journal1177KallsystemMarkande'])), 'delvis');
  assert.equal(apiStatus(enc, new Set(['inera.tjanst.npo#NPOKonsument'])), null);
});

test('system: registreringar i T2-katalogerna jämförs med rollerna', () => {
  const s = systemen();
  const f = (sys) => s[sys].anslutningar.forvantade.map((x) => `${x.roll.split('#')[1]} ${x.typ}${x.informationsmangd ? ` ${x.informationsmangd}` : ''}: ${x.status}`);
  assert.deepEqual(f('JournalX'), [
    'NPOKallsystem medlemskap: registrerad',
    'NPOKonsument medlemskap: registrerad',
    'Journal1177KallsystemMarkande medlemskap: saknas',
    'NPOKallsystem anslutningspunkt VardkontaktInfo: registrerad',
    'Journal1177KallsystemMarkande anslutningspunkt VardkontaktInfo: annan version',
    'Journal1177KallsystemMarkande anslutningspunkt FastKontaktInfo: saknas',
    'Journal1177KallsystemMarkande anslutningspunkt LabbsvarInfo: saknas',
  ]);
  assert.ok(s.LabbsystemL.anslutningar.forvantade.every((x) => x.status === 'saknas'));
  assert.deepEqual(f('Invanarplattform'), ['Journal1177Invanartjanst medlemskap: registrerad']);
  assert.deepEqual(f('PrimarvardP').filter((x) => !x.endsWith('registrerad')), ['POT2Producent anslutningspunkt LakemedelInfo: saknas']);
  assert.ok(s.LabbsystemL.api.every((a) => a.status === 'okänt'));
});

test('system: testlistan har varje krav en gång, med alla roller som ställer det', () => {
  const x = systemen().JournalX;
  const elm = x.testlista.filter((t) => t.kategori === 'Elementkrav' && t.text.startsWith('SHALL:populate subject i FastKontakt'));
  assert.equal(elm.length, 1);
  // NPÖ:s Fast kontakt är inte vald av JournalX, så bara 1177 Journal ställer kravet.
  assert.deepEqual(elm[0].roller, ['inera.tjanst.journal1177#Journal1177KallsystemMarkande']);
  assert.ok(x.testlista.some((t) => t.kategori === 'Anslutning' && t.text.startsWith('Aktivt medlemskap')));
  assert.ok(x.testlista.some((t) => t.kategori === 'Scenario' && t.text.startsWith('Ansluta källsystem till SVOD')));
});

// ---------------------------------------------------------------- mockad federation

test('mocken gör bara det ändpunktens CapabilityStatement säger', async () => {
  const mock = new MockFederation();
  await mock.starta();
  try {
    mock.laggTill('/x', {
      resourceType: 'CapabilityStatement', kind: 'instance',
      rest: [{ mode: 'server', resource: [{ type: 'Encounter', interaction: [{ code: 'search-type' }], searchParam: [{ name: 'patient' }] }] }],
    }, [{ resourceType: 'Encounter', id: 'e1', status: 'completed' }]);
    mock.laggTill('/okand', null);
    assert.equal((await fhir(`${mock.bas}/x/Encounter?patient=P`)).json.total, 1);
    assert.equal((await fhir(`${mock.bas}/x/Encounter?date=2026`)).status, 400);
    assert.equal((await fhir(`${mock.bas}/x/CareTeam`)).status, 405);
    assert.equal((await fhir(`${mock.bas}/x/Encounter`, { metod: 'POST', kropp: { resourceType: 'Encounter' } })).status, 405);
    assert.equal((await fhir(`${mock.bas}/x/metadata`)).json.kind, 'instance');
    assert.equal((await fhir(`${mock.bas}/okand/metadata`)).status, 501);
  } finally {
    await mock.stoppa();
  }
});

test('federationstest: förutsättningar stänger registreringsgapet, användningsfallen visar systemens gap', async () => {
  const w = loadWorkspace(root);
  const r = await testaFederation({ ws: w, manifests: loadManifests(w), systems: loadSystems(root), root, regler: rules.system });
  const status = (sys, uc, roll) => r.korningar.find((k) => k.system === sys && k.anvandningsfall === uc && k.roll.endsWith(`#${roll}`))?.status;
  const gap = (lista, sys) => lista.find((x) => x.system === sys).anslutningar.filter((x) => x.status !== 'registrerad').length;
  // Medlemskap, anslutningspunkter och tjänsteinstanser registreras av förutsättningarna.
  assert.equal(gap(r.fore, 'JournalX'), 4);
  for (const sys of ['JournalX', 'LabbsystemL', 'PrimarvardP', 'Invanarplattform']) assert.equal(gap(r.efter, sys), 0, sys);
  // Gap som visar sig vid körning.
  assert.equal(status('JournalX', 'AnslutaKonsumentSVOD', 'NPOKonsument'), 'fel');
  const po = r.korningar.find((k) => k.system === 'JournalX' && k.anvandningsfall === 'VardpersonalPatientoversikt' && k.roll.endsWith('#NPOKallsystem'));
  assert.deepEqual(po.steg.filter((s) => s.status === 'fel').map((s) => s.detaljer[0].http), [400]);
  // Fast kontakt är inte vald av JournalX: steget hoppas över.
  assert.ok(po.steg.some((s) => s.status === 'hoppad' && /inte valt informationsmängden Fast kontakt/.test(s.text)));
  assert.equal(status('JournalX', 'TaDelAvLabbsvar', 'Journal1177KallsystemMarkande'), 'ok');
  assert.equal(status('LabbsystemL', 'TaDelAvLabbsvar', 'Journal1177KallsystemFiltrerande'), 'okänt');
  // PO-T2: källsystemet hittas med T1, är medlem, har engagemang och anropas med åtkomstintyg.
  assert.equal(status('PrimarvardP', 'HamtaPatientoversikt', 'POT2Producent'), 'ok');
  assert.equal(status('PrimarvardP', 'AnmalaEngagemangPOT2', 'POT2Engagemangsindexerad'), 'ok');
  const pp = r.korningar.find((k) => k.system === 'PrimarvardP' && k.anvandningsfall === 'HamtaPatientoversikt' && k.roll.endsWith('#POT2Producent'));
  assert.deepEqual(pp.steg.filter((s) => ['Condition', 'MedicationStatement'].includes(s.resurstyp)).map((s) => s.detaljer.map((d) => d.http)), [[200], [200]]);
  // Konsumentrollen saknar klientförmåga för Flag.
  assert.equal(status('PrimarvardP', 'HamtaPatientoversikt', 'POT2Visning'), 'fel');
  // Invävd loggning når loggtjänsten.
  assert.ok(r.stod.find((x) => x.aktor === 'SVODLoggtjanst').resurser.AuditEvent >= 2);
});

test('mocken: T2-filter, åtkomstintyg och skyddade ändpunkter', async () => {
  const mock = new MockFederation();
  await mock.starta();
  try {
    const cs = (typ, sp) => ({ resourceType: 'CapabilityStatement', kind: 'instance', rest: [{ mode: 'server', resource: [{ type: typ, interaction: [{ code: 'search-type' }], searchParam: sp.map((name) => ({ name })) }] }] });
    const ext = 'https://fhir.inera.se/ig/katalogtjanster/StructureDefinition/implements';
    mock.laggTill('/tk', cs('Endpoint', ['implements', 'status']), [
      { resourceType: 'Endpoint', id: 'a', status: 'active', extension: [{ url: ext, valueCanonical: 'http://x/A|1.0' }] },
      { resourceType: 'Endpoint', id: 'b', status: 'off', extension: [{ url: ext, valueCanonical: 'http://x/A' }] },
    ]);
    mock.laggTill('/intyg', cs('Endpoint', []), [], { utfardare: true });
    mock.laggTill('/prod', cs('Condition', ['patient']), [
      { resourceType: 'Condition', id: 'c1', subject: { identifier: { system: 'pnr', value: '1' } } },
      { resourceType: 'Condition', id: 'c2', subject: { identifier: { system: 'pnr', value: '2' } } },
    ], { skyddad: true });
    assert.equal((await fhir(`${mock.bas}/tk/Endpoint?implements=http://x/A&status=active`)).json.total, 1);
    assert.equal((await fhir(`${mock.bas}/prod/Condition`)).status, 401);
    assert.equal((await fhir(`${mock.bas}/prod/metadata`)).status, 200);
    const token = (await fhir(`${mock.bas}/intyg/token`, { metod: 'POST' })).json.access_token;
    const svar = await fhir(`${mock.bas}/prod/Condition?patient.identifier=pnr|2`, { headers: { authorization: `Bearer ${token}` } });
    assert.deepEqual(svar.json.entry.map((e) => e.resource.id), ['c2']);
  } finally {
    await mock.stoppa();
  }
});

test('läsadaptern härleder system ur T2-katalogerna', async () => {
  const w = loadWorkspace(root);
  const manifests = loadManifests(w);
  // Den mockade federationen står här för en verklig realisering.
  const fed = await byggFederation({ ws: w, manifests, systems: loadSystems(root), root });
  try {
    const sys = await systemFranKatalog(fed.miljo, manifests, ['inera.tjanst.pot2'], rules.system);
    const p = sys.find((x) => x.system === 'region-exempel');
    assert.deepEqual(p.roller, [{ tjanst: 'inera.tjanst.pot2', aktor: 'POT2Producent' }]);
    assert.deepEqual(p.informationsmangder, { 'inera.tjanst.pot2': ['DiagnosInfo'] });
    assert.deepEqual(p.tillval, ['POT2Engagemangsindexerad']);
    assert.deepEqual(p.organisation, { namn: 'Region Exempel', hsaId: 'SE2321000099-EXMP' });
  } finally {
    await fed.mock.stoppa();
  }
});

test('tjänstens specifikationer jämförs med de externa de motsvarar', () => {
  const j = jamforSpecifikationer(root, lasMiljo(root, 'infopeak'), loadManifests(loadWorkspace(root)), ['inera.tjanst.pot2']);
  assert.deepEqual(j.map((x) => x.informationsmangd), ['DiagnosInfo', 'LakemedelInfo', 'UppmarksamhetInfo']);
  const diagnos = j[0].avvikelser.map((a) => `${a.niva}: ${a.text}`);
  assert.ok(diagnos.includes('varning: Den externa specifikationen är FHIR 4.0.1, tjänsten FHIR 5.0.0'));
  assert.ok(diagnos.includes('varning: Condition: den externa har sökparametrarna recorder'));
  assert.ok(diagnos.some((x) => x.startsWith('varning: Den externa kräver även Practitioner')));
  assert.ok(j.every((x) => !x.avvikelser.some((a) => a.niva === 'fel')));
});
