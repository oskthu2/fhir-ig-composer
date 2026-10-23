import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import os from 'node:os';
import { loadWorkspace, compose, matrix, postProcess, viewData, renderView, analyseSystems, flodessida, komponeraAlla } from './ig-composer.mjs';
import { mermaidFranScenario, mermaidFranPlan } from './mermaid.mjs';
import { transaktion, definitioner, IG_TAGG, publiceraRegister, scenarioFranRegister } from './register.mjs';
import { startaStudio, skrivKomposition, skrivSystem, skrivSkiss, skrivTillampning } from './studio.mjs';
import { apiStatus, loadSystems, analyseSystem } from './system.mjs';
import { MockFederation, fhir } from './mock.mjs';
import { testaFederation, byggFederation } from './federation.mjs';
import { systemFranKatalog, jamforSpecifikationer, lasMiljo } from './infopeak.mjs';
import { loadManifests } from './ig-composer.mjs';
import { parseFsh, expandRules } from './fsh.mjs';
import { behorigheterForRoll, behorigheterForSystem, klientCapabilityStatement, arKonsumentroll, sammanfogaScopes } from './behorighet.mjs';
import { overga, nastaStatus } from './anslutning.mjs';
import { wso2Plan } from './wso2.mjs';
import { forhandsgranskaAnslutning, forhandsgranskaProducentAnslutning, anslutProducentTest, bytProducentAdress } from './studio.mjs';
import { publicera, webbsokvag } from './publicera.mjs';
import { spawnSync } from 'node:child_process';
import { referensroller, startaReferens, testaReferens, renderProdukttest } from './produkttest.mjs';
import { loadProdukter, skrivProdukt, skrivProduktGodkannande, registreraOrganisation, organisationer } from './systemregister.mjs';

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
  // Byggblock som tjänsterna använder först, sedan fristående kandidater; delblock (fasta kontakter) inte alls.
  assert.deepEqual(json.domaner.slice(0, 3), ['inera.bb.patientoversikt', 'inera.bb.labbsvar', 'inera.bb.pot2']);
  assert.ok(['inera.bb.inkorg', 'inera.bb.vaccinationer', 'inera.bb.remisser'].every((d) => json.domaner.includes(d)));
  assert.ok(!json.domaner.includes('inera.bb.fastakontakter'));
  assert.ok(json.rader.every((r) => r.celler.find((c) => c.domän === 'inera.bb.inkorg').tjanster.length === 0));
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
    // Ett byggblock har logiska flöden: interaktioner hör hemma i tjänsten.
    assert.ok(r.fel.some((f) => f.includes('TestFall steg 1: read är en tillämpning')));
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

// ---------------------------------------------------------------- flöden, register och studio

const esKatalog = (ig) => path.join(root, ig, 'fsh-generated', 'resources');
const lasEs = (ig) => fs.readdirSync(esKatalog(ig)).filter((f) => f.startsWith('ExampleScenario-')).map((f) => JSON.parse(fs.readFileSync(path.join(esKatalog(ig), f), 'utf8')));

test('Mermaid ur ExampleScenario: invävda delflöden expanderas, alternativ och svar ritas', () => {
  const alla = lasEs('tjanster/npo');
  const es = alla.find((x) => x.name === 'VardpersonalPatientoversikt');
  const mm = mermaidFranScenario(es, { resolver: (u) => alla.find((x) => x.url === u.split('|')[0]) });
  const rader = mm.split('\n');
  assert.equal(rader[0], 'sequenceDiagram');
  assert.ok(rader.includes('  actor vardpersonal as Vårdpersonal'));
  assert.ok(mm.includes('note over journal,Tjanstekatalog') || mm.includes('Tjanstekatalog as Tjänstekatalogen'));
  assert.ok(rader.some((r) => r.trim() === 'journal->>Tjanstekatalog: 4.1 Tjänstesökning (T1) på specifikation och logisk adress [search-type]'));
  assert.ok(rader.some((r) => r.trim().startsWith('alt ')) && rader.some((r) => r.trim().startsWith('else Källsystemet svarar inte')));
  assert.ok(rader.includes('    kalla-->>journal: vardkontakt') && rader.includes('  kalla-->>journal: fastkontakt'));
  // Utan resolver blir delflödena noteringar.
  assert.ok(mermaidFranScenario(es).includes('↳ Tjänstesökning') || mermaidFranScenario(es).includes('↳ T2Uppslag'));
  // Tecken som Mermaid tolkar tas bort.
  assert.ok(!mermaidFranScenario({ actor: [{ key: 'a', title: 'A#1;' }, { key: 'b', title: 'B' }], process: [{ step: [{ operation: { title: 'x; y #z', initiator: 'a', receiver: 'b' } }] }] }).match(/[#;]/));
});

test('sidan Användningsfall genereras ur ExampleScenario och läggs i IG:n', () => {
  const dir = path.join(root, 'tjanster', 'po-t2');
  const sida = fs.readFileSync(path.join(dir, 'input', 'pagecontent', 'anvandningsfall.md'), 'utf8');
  assert.equal((sida.match(/<pre class="language-mermaid"><code class="language-mermaid">sequenceDiagram/g) || []).length, 4);
  assert.ok(!/<code class="language-mermaid">[^<]*>>/.test(sida), 'pilarna är HTML-kodade');
  const igJson = JSON.parse(fs.readFileSync(path.join(dir, 'fsh-generated', 'resources', 'ImplementationGuide-inera.tjanst.pot2.json'), 'utf8'));
  assert.ok(igJson.definition.page.page.some((p) => p.name === 'anvandningsfall.html'));
  assert.match(fs.readFileSync(path.join(dir, 'fsh-generated', 'includes', 'menu.xml'), 'utf8'), /anvandningsfall\.html/);
  // Idempotent: en andra körning dubblerar inte sidan.
  assert.equal(flodessida(dir), 4);
  const igJson2 = JSON.parse(fs.readFileSync(path.join(dir, 'fsh-generated', 'resources', 'ImplementationGuide-inera.tjanst.pot2.json'), 'utf8'));
  assert.equal(igJson2.definition.page.page.filter((p) => p.name === 'anvandningsfall.html').length, 1);
});

test('registret: en transaktion per IG med villkorad uppdatering, IG:ns referenser pekas om', () => {
  const ig = ws.get('inera.tjanst.pot2');
  const t = transaktion(ig, definitioner(ig));
  assert.equal(t.type, 'transaction');
  assert.ok(t.entry.every((e) => e.request.method === 'PUT' && /^\w+\?url=/.test(e.request.url) && !e.resource.id));
  assert.ok(t.entry.every((e) => e.resource.meta.tag.some((x) => x.system === IG_TAGG && x.code === 'inera.tjanst.pot2')));
  assert.ok(!t.entry.some((e) => ['Condition', 'MedicationStatement', 'Flag'].includes(e.resource.resourceType)), 'exempel ingår inte');
  const igRes = t.entry.find((e) => e.resource.resourceType === 'ImplementationGuide').resource;
  const fullUrls = new Set(t.entry.map((e) => e.fullUrl));
  assert.ok(igRes.definition.resource.length > 0 && igRes.definition.resource.every((r) => fullUrls.has(r.reference.reference)));
});

test('registret mot HAPI (sätt FHIR_REGISTER_TEST)', { skip: !process.env.FHIR_REGISTER_TEST }, async () => {
  const server = process.env.FHIR_REGISTER_TEST;
  const igs = [ws.get('inera.bb.pot2')];
  const [forsta] = await publiceraRegister({ server, igs });
  assert.equal(forsta.http, 200);
  const [andra] = await publiceraRegister({ server, igs });
  assert.equal(andra.uppdaterade, andra.antal, 'en ny körning uppdaterar i stället för att skapa');
  // Byggblocket har ett logiskt arbetsflöde: PlanDefinition och simbanor.
  const r = await scenarioFranRegister(server, 'https://fhir.inera.se/ig/bb-pot2/PlanDefinition/HamtaPatientoversikt');
  assert.equal(r.es.resourceType, 'PlanDefinition');
  assert.match(mermaidFranPlan(r.es, { resolver: r.resolver }), /hämtar diagnos från Patientöversikt \(T2\): producent/);
  // Tjänsten har det tillämpade flödet: ExampleScenario och sekvens.
  await publiceraRegister({ server, igs: [ws.get('inera.tjanst.pot2')] });
  const t = await scenarioFranRegister(server, 'https://fhir.inera.se/ig/po-t2/ExampleScenario/HamtaPatientoversikt');
  assert.match(mermaidFranScenario(t.es, { resolver: t.resolver }), /konsument->>producent: 4 Konsumenten söker patientens diagnoser \[search-type\]/);
});

// Studion arbetar på en kopia av arbetsytan.
const kopieraArbetsyta = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
  const hoppa = new Set(['node_modules', 'output', 'temp', 'template', 'input-cache', '.git', 'rapport']);
  fs.cpSync(root, dir, { recursive: true, filter: (f) => !hoppa.has(path.basename(f)) });
  return dir;
};

test('studion skriver komposition, system och skisser och bevarar resten av filen', () => {
  const dir = kopieraArbetsyta();
  try {
    const w = loadWorkspace(dir);
    const fil = path.join(dir, 'tjanster', 'po-t2', 'sushi-config.yaml');
    const fore = fs.readFileSync(fil, 'utf8');
    skrivKomposition(w, 'inera.tjanst.pot2', { anvandningsfall: ['HamtaPatientoversikt', 'Extra'], valfria: [] }, dir);
    const efter = fs.readFileSync(fil, 'utf8');
    const ig2 = loadWorkspace(dir).get('inera.tjanst.pot2');
    assert.deepEqual(ig2.anvandningsfall, ['HamtaPatientoversikt', 'Extra']);
    assert.deepEqual(ig2.valfriaInformationsmangder, []);
    assert.deepEqual(ig2.komponerar.map((k) => k.paket), ['inera.build.conventions', 'inera.bb.pot2', 'inera.fed.pot2']);
    assert.equal(efter.split('\n').filter((r) => r.startsWith('pages:') || r.startsWith('menu:')).length, 2);
    assert.ok(fore.includes('valfri-informationsmangd') && !efter.includes('valfri-informationsmangd'));
    // Flödesmönster på en federation.
    skrivKomposition(w, 'inera.fed.pot2', { flodesmonster: { vid: ['search-type'], fore: [], foreEnGang: false, foreVarje: ['T2Uppslag'], efter: [] } }, dir);
    assert.deepEqual(loadWorkspace(dir).get('inera.fed.pot2').flodesmonster, { vid: ['search-type'], fore: [], foreEnGang: false, foreVarje: ['T2Uppslag'], efter: [] });
    // System: befintlig fil behåller kommentarer, ny fil skapas.
    skrivSystem(dir, 'JournalX', { tillval: ['SVODEngagemangsindexerad'] });
    const jx = fs.readFileSync(path.join(dir, 'system', 'journalx.yaml'), 'utf8');
    assert.match(jx, /^# Ett konkret system/);
    assert.match(jx, /tillval:\n {2}- SVODEngagemangsindexerad/);
    assert.equal(skrivSystem(dir, 'VardsystemY', { titel: 'Vårdsystem Y', roller: [{ tjanst: 'inera.tjanst.pot2', aktor: 'POT2Producent' }] }), path.join('system', 'vardsystem-y.yaml'));
    assert.throws(() => skrivSystem(dir, '../x', {}), /Ogiltigt systemnamn/);
    // Skisser: bara i en IG:s scenariokatalog.
    assert.throws(() => skrivSkiss(dir, 'system/x.yaml', { anvandningsfall: 'X', steg: [] }), /scenarier/);
    skrivSkiss(dir, 'byggblock/po-t2/input/scenarier/ny.yaml', { anvandningsfall: 'Ny', aktorer: { a: 'POKonsument' }, steg: [{ titel: 't', fran: 'a', till: 'a' }] });
    assert.match(fs.readFileSync(path.join(dir, 'byggblock', 'po-t2', 'input', 'scenarier', 'ny.yaml'), 'utf8'), /^# Skapad i ig-composer studio/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('studions server: kräver X-Studio för att skriva, och visar ändringen efter omkomponering', async () => {
  const dir = kopieraArbetsyta();
  const server = await startaStudio({ root: dir, port: 0, verktyg: { loadWorkspace, viewData, renderView, komponeraAlla, bygg: () => ({ status: 0, logg: '' }) } });
  const bas = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${bas}/api/system/JournalX`, { method: 'PUT', body: '{}' })).status, 403);
    const svar = await fetch(`${bas}/api/system/PrimarvardP`, {
      method: 'PUT', headers: { 'x-studio': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ informationsmangder: { 'inera.tjanst.pot2': ['DiagnosInfo', 'LakemedelInfo', 'UppmarksamhetInfo'] } }),
    });
    const r = await svar.json();
    assert.equal(svar.status, 200);
    assert.deepEqual(r.fel, []);
    const html = await (await fetch(`${bas}/`)).text();
    const data = JSON.parse(html.match(/const DATA = (.*);\n/)[1]);
    const p = data.system.find((a) => a.system === 'PrimarvardP');
    assert.ok(p.roller.find((x) => x.aktor === 'POT2Producent').informationsmangder.every((i) => i.vald));
    assert.ok(data.studio.skisser.some((x) => x.namn === 'HamtaPatientoversikt'));
    assert.equal(data.studio.konfiguration['inera.fed.pot2'].roll, 'federation');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- logiska och tillämpade flöden

const lasRes = (ig, prefix) => fs.readdirSync(esKatalog(ig)).filter((f) => f.startsWith(prefix)).map((f) => JSON.parse(fs.readFileSync(path.join(esKatalog(ig), f), 'utf8')));

test('logiska flöden: byggblock och federationer får PlanDefinition (workflow-definition) med aktiviteter', () => {
  assert.deepEqual(lasRes('byggblock/patientoversikt', 'ExampleScenario-'), []);
  const pd = lasRes('byggblock/patientoversikt', 'PlanDefinition-').find((x) => x.name === 'VardpersonalPatientoversikt');
  assert.equal(pd.type.coding[0].code, 'workflow-definition');
  assert.deepEqual(pd.action.map((a) => a.code?.coding[0].code || null), [null, 'hamta', 'hamta', 'visa']);
  const hamta = pd.action[1];
  assert.deepEqual(hamta.participant.map((p) => p.actorId), ['journal', 'kalla']);
  assert.equal(hamta.output[0].requirement.profile[0], 'https://fhir.inera.se/ig/bb-patientoversikt/StructureDefinition/VardkontaktInfo');
  // Ordningen: varje åtgärd efter den föregående, med giltiga id (pld-4).
  const ids = new Set(pd.action.map((a) => a.id));
  assert.ok(pd.action.slice(1).every((a) => ids.has(a.relatedAction[0].targetId) && a.relatedAction[0].relationship === 'after'));
  // Alternativ som grupp under åtgärden.
  assert.equal(hamta.selectionBehavior, 'at-most-one');
  assert.match(hamta.action[0].title, /^Alternativ: Källsystemet svarar inte/);
  // Federationens förutsättning inkluderar stödtjänstens flöde.
  const ak = lasRes('federationer/svod', 'PlanDefinition-').find((x) => x.name === 'AnslutaKallsystemSVOD');
  assert.match(ak.action[0].definitionCanonical, /PlanDefinition\/RegistreraAndpunkt$/);
  // Simbanor i diagrammet.
  const mm = mermaidFranPlan(pd);
  assert.match(mm, /^flowchart LR/);
  assert.match(mm, /subgraph bana_journal \["Patientöversikt: konsument"\]/);
  assert.match(mm, /hämtar vårdkontakt från Patientöversikt: producent/);
  assert.match(mm, /a_2 -\. "Källsystemet svarar inte" \.->/);
});

test('tillämpning: tjänsten binder aktiviteterna till interaktioner och specifikationer', () => {
  const npo = compose(ws.get('inera.tjanst.npo'), loadWorkspace(root), rules);
  const uc = npo.anvandningsfall.find((u) => u.namn === 'VardpersonalPatientoversikt');
  assert.equal(uc.niva, 'tillampad');
  assert.equal(uc.tillampar, 'https://fhir.inera.se/ig/bb-patientoversikt/PlanDefinition/VardpersonalPatientoversikt|0.1.0');
  const steg = (nr) => uc.steg.find((s) => s.nr === nr);
  assert.deepEqual([steg('5').aktivitet, steg('5').operation, steg('5').resurstyp, steg('5').specifikation, steg('5').bindning],
    ['hamta', 'search-type', 'Encounter', 'VardkontaktAPI', 'harledd']);
  // Federationens logiska delflöden binds mot stödtjänsternas förmågor.
  assert.deepEqual([steg('2.1').operation, steg('2.1').specifikation], ['search-system', 'SVODPatientrelationstjanstCS']);
  assert.deepEqual([steg('6.2').aktivitet, steg('6.2').operation, steg('6.2').resurstyp], ['lamna', 'create', 'AuditEvent']);
  // Stödtjänstens tillämpade flöde (T1) behåller sin interaktion och följer tjänstekatalogens förmåga.
  assert.deepEqual([steg('4.1').bindning, steg('4.1').specifikation], ['flode', 'TjanstekatalogCS']);
  // ExampleScenario pekar på arbetsflödet och på specifikationen per steg.
  const es = lasEs('tjanster/npo').find((x) => x.name === 'VardpersonalPatientoversikt');
  assert.equal(es.extension.find((e) => e.url.endsWith('/tillampar')).valueCanonical, uc.tillampar);
  const s5 = es.process[0].step.find((x) => x.number === '5');
  assert.equal(s5.extension.find((e) => e.url.endsWith('/specifikation')).valueCanonical, 'https://fhir.inera.se/ig/npo/CapabilityStatement/VardkontaktAPI');
  assert.equal(s5.extension.find((e) => e.url.endsWith('/bindning')).valueCode, 'harledd');
  // 1177 Journal binder "kontrollera" till capability discovery i sin tillämpning.
  const j = compose(ws.get('inera.tjanst.journal1177'), loadWorkspace(root), rules);
  const ak = j.anvandningsfall.find((u) => u.namn === 'AnslutaKallsystemIndividuell').steg.find((s) => s.id === 'formagor');
  assert.deepEqual([ak.aktivitet, ak.operation, ak.bindning], ['kontrollera', 'capabilities', 'tillampning']);
  assert.deepEqual([...npo.fel, ...npo.varningar, ...j.fel, ...j.varningar], []);
});

test('studion skriver och tar bort en bindning i tjänstens tillämpning', () => {
  const dir = kopieraArbetsyta();
  try {
    const w = loadWorkspace(dir);
    skrivTillampning(w, 'inera.tjanst.npo', { flode: 'SVODVerifieraPatientrelation', steg: '1', operation: 'search-type', resurstyp: 'Consent' }, dir);
    const fil = path.join(dir, 'tjanster', 'npo', 'input', 'tillampning.yaml');
    assert.deepEqual(YAML.parse(fs.readFileSync(fil, 'utf8')), { SVODVerifieraPatientrelation: { 1: { operation: 'search-type', resurstyp: 'Consent' } } });
    const r = compose(loadWorkspace(dir).get('inera.tjanst.npo'), loadWorkspace(dir), rules);
    const s = r.anvandningsfall.find((u) => u.namn === 'VardpersonalPatientoversikt').steg.find((x) => x.nr === '2.1');
    assert.deepEqual([s.operation, s.resurstyp, s.bindning], ['search-type', 'Consent', 'tillampning']);
    skrivTillampning(loadWorkspace(dir), 'inera.tjanst.npo', { flode: 'SVODVerifieraPatientrelation', steg: '1', ta_bort: true }, dir);
    assert.ok(!fs.existsSync(fil), 'utan bindningar tas filen bort');
    assert.throws(() => skrivTillampning(w, 'inera.bb.pot2', { flode: 'x', steg: '1' }, dir), /ingen tjänst/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- anslutningar och behörigheter

test('scopes ur IG:n: mottagare per anrop, SMART v2, och avsmalning med informationsmängder', () => {
  const m = loadManifests(loadWorkspace(root))['inera.tjanst.npo'];
  const b = behorigheterForRoll(m, 'NPOKonsument');
  const till = Object.fromEntries(b.mottagare.map((x) => [x.aktor, x.scopes]));
  assert.deepEqual(till.NPOKallsystem, ['system/CareTeam.s', 'system/Encounter.s', 'system/Provenance.s']);
  assert.deepEqual(till.Tjanstekatalog, ['system/Endpoint.s']);
  assert.deepEqual(till.SVODLoggtjanst, ['system/AuditEvent.c']);
  assert.deepEqual(b.utanMottagare, []);
  assert.ok(arKonsumentroll(m, 'NPOKonsument'));
  assert.ok(!arKonsumentroll(m, 'NPOKallsystem'), 'källsystemet har serverförmågor');
  const smal = behorigheterForRoll(m, 'NPOKonsument', ['VardkontaktInfo']);
  assert.deepEqual(smal.bortvalda, ['CareTeam']);
  assert.ok(!smal.scopes.includes('system/CareTeam.s'));
  assert.deepEqual(sammanfogaScopes(['system/Endpoint.cu', 'system/Endpoint.s', 'system/Flag.s']), ['system/Endpoint.cus', 'system/Flag.s']);
});

test('klient-CapabilityStatement: kind=instance, mode=client, instantiates rollernas förmågor', () => {
  const manifests = loadManifests(loadWorkspace(root));
  const sys = { system: 'VardappY', titel: 'Vårdapp Y', organisation: { namn: 'Region Y' } };
  const { behorigheter, fel } = behorigheterForSystem(sys, manifests, [{ tjanst: 'inera.tjanst.npo', aktor: 'NPOKonsument' }, { tjanst: 'inera.tjanst.pot2', aktor: 'POT2Visning' }]);
  assert.deepEqual(fel, []);
  const cs = klientCapabilityStatement(sys, behorigheter, { miljo: 'test', datum: '2026-10-23' });
  assert.equal(cs.kind, 'instance');
  assert.equal(cs.rest[0].mode, 'client');
  assert.deepEqual(cs.instantiates, ['https://fhir.inera.se/ig/npo/CapabilityStatement/NPOKonsumentCS|0.1.0', 'https://fhir.inera.se/ig/po-t2/CapabilityStatement/POT2VisningCS|0.1.0']);
  assert.deepEqual(cs.rest[0].resource.find((r) => r.type === 'Condition').interaction, [{ code: 'search-type' }]);
  assert.ok(cs.implementation.description);
});

test('statuskedjan: inga hopp, bevis krävs, produktion kräver testad i test', () => {
  const mal = { tjanst: 'inera.tjanst.npo', aktor: 'NPOKonsument', miljo: 'test' };
  assert.throws(() => overga([], mal, 'behorig'), /börjar som begärd/);
  let a = overga([], mal, 'begard', { av: 'x', datum: '2026-10-23' });
  assert.throws(() => overga(a, mal, 'testad'), /hoppar över/);
  a = overga(a, mal, 'behorig', { av: 'automatiskt' });
  assert.throws(() => overga(a, mal, 'testad'), /kräver bevis av typen testrapport/);
  const prod = { ...mal, miljo: 'prod' };
  assert.throws(() => overga(a, prod, 'ansokt'), /testad i testmiljön/);
  a = overga(a, mal, 'testad', { bevis: [{ typ: 'testrapport', fil: 'rapport/x.md' }] });
  a = overga(a, prod, 'ansokt');
  assert.throws(() => overga(a, prod, 'godkand'), /beslut/);
  a = overga(a, prod, 'godkand', { bevis: [{ typ: 'beslut', text: 'ok' }] });
  assert.deepEqual(a.map((x) => [x.miljo, x.status]), [['test', 'testad'], ['prod', 'godkand']]);
  assert.deepEqual(a[0].historik.map((h) => h.status), ['begard', 'behorig', 'testad']);
  a = overga(a, prod, 'aterkallad');
  assert.equal(nastaStatus(a[1]), null);
  assert.throws(() => overga(a, { ...mal, miljo: 'stage' }, 'begard'), /Okänd miljö/);
});

test('WSO2-plan (torrkörning): bara behöriga roller, nycklar per miljö, återkallade tas bort', () => {
  const manifests = loadManifests(loadWorkspace(root));
  const sys = { system: 'VardappY', titel: 'Vårdapp Y' };
  const roller = [{ tjanst: 'inera.tjanst.npo', aktor: 'NPOKonsument' }, { tjanst: 'inera.tjanst.pot2', aktor: 'POT2Visning' }, { tjanst: 'inera.tjanst.journal1177', aktor: 'Journal1177Invanartjanst' }];
  const { behorigheter } = behorigheterForSystem(sys, manifests, roller);
  const ansl = [
    { ...roller[0], miljo: 'test', status: 'behorig' },
    { ...roller[1], miljo: 'test', status: 'begard' },
    { ...roller[2], miljo: 'test', status: 'aterkallad' },
  ];
  const plan = wso2Plan(sys, behorigheter, ansl, { miljo: 'test' });
  assert.equal(plan.torrkorning, true);
  assert.deepEqual(plan.apiProdukter.map((p) => p.name), ['npo-NPOKonsument']);
  assert.deepEqual(plan.vantar.map((v) => v.aktor), ['POT2Visning']);
  assert.deepEqual(plan.borttag.map((b) => b.apiProdukt), ['journal1177-Journal1177Invanartjanst']);
  assert.equal(plan.nycklar.keyType, 'SANDBOX');
  assert.ok(plan.nycklar.scopes.every((s) => /^system\/[A-Za-z]+\.[cruds]$/.test(s)), 'nyckeln begär operationsscopen, en bokstav per scope');
  const api = plan.apier.find((a) => a.name === 'npo-NPOKallsystem');
  assert.deepEqual(api.operations.map((o) => `${o.verb} ${o.target}`), ['GET /CareTeam', 'GET /Encounter', 'GET /Provenance']);
  assert.ok(plan.apier.find((a) => a.name === 'Tjanstekatalog').stodtjanst);
  const prod = wso2Plan(sys, behorigheter, [{ ...roller[0], miljo: 'prod', status: 'godkand' }], { miljo: 'prod' });
  assert.equal(prod.nycklar.keyType, 'PRODUCTION');
  assert.ok(prod.prenumerationer.every((p) => p.kraverGodkannande));
});

test('systemanalysen bär anslutningarna per miljö', () => {
  const j = analyseSystems(loadWorkspace(root), root).find((a) => a.system === 'JournalX');
  const ans = j.behorighet.anslutningar;
  assert.deepEqual(ans.map((a) => `${a.miljo}:${a.aktor}:${a.status}`), ['test:NPOKallsystem:testad', 'prod:NPOKallsystem:ansluten', 'test:NPOKonsument:behorig']);
  assert.ok(ans.every((a) => !a.fel.length));
  assert.equal(ans[2].kraverBevis, 'testrapport');
  assert.ok(j.behorighet.miljoer.test.klientCs);
  assert.deepEqual(j.behorighet.miljoer.prod.wso2.apiProdukter.map((p) => p.name), ['npo-NPOKallsystem']);
});

test('studion i testmiljöläge: anslut klient, bara test, ingen redigering', async () => {
  const dir = kopieraArbetsyta();
  const verktyg = { loadWorkspace, viewData, renderView, komponeraAlla, loadManifests, bygg: () => ({ status: 0, logg: '' }) };
  const test = await startaStudio({ root: dir, port: 0, miljo: 'test', verktyg });
  const vanlig = await startaStudio({ root: dir, port: 0, verktyg });
  const anrop = (server, metod, sokvag, body) => fetch(`http://127.0.0.1:${server.address().port}${sokvag}`, {
    method: metod, headers: { 'x-studio': '1', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const begaran = { system: 'VardappY', titel: 'Vårdapp Y', organisation: { namn: 'Region Y' }, roller: [{ tjanst: 'inera.tjanst.npo', aktor: 'NPOKonsument', informationsmangder: ['VardkontaktInfo'] }] };
  try {
    const html = await (await fetch(`http://127.0.0.1:${test.address().port}/`)).text();
    const data = JSON.parse(html.match(/const DATA = (.*);\n/)[1]);
    assert.equal(data.studio.miljo, 'test');
    assert.deepEqual(data.studio.konsumentroller['inera.tjanst.npo'], ['NPOKonsument']);
    assert.equal((await anrop(test, 'PUT', '/api/system/JournalX', {})).status, 403, 'system redigeras inte i testläget');
    assert.equal((await anrop(vanlig, 'POST', '/api/anslut', begaran)).status, 403, 'klienter ansluts bara i testläget');
    assert.equal((await anrop(test, 'POST', '/api/anslut', { ...begaran, roller: [{ tjanst: 'inera.tjanst.npo', aktor: 'NPOKallsystem' }] })).status, 400, 'bara konsumentroller');
    const f = await (await anrop(test, 'POST', '/api/anslut/forhandsgranska', begaran)).json();
    assert.ok(!f.scopes.includes('system/CareTeam.s'));
    assert.equal(f.wso2.nycklar.keyType, 'SANDBOX');
    assert.equal((await anrop(test, 'POST', '/api/anslut', begaran)).status, 200);
    const sys = loadSystems(dir).find((s) => s.system === 'VardappY');
    assert.deepEqual(sys.roller, [{ tjanst: 'inera.tjanst.npo', aktor: 'NPOKonsument' }]);
    assert.deepEqual(sys.anslutningar.map((a) => [a.miljo, a.status, a.informationsmangder]), [['test', 'behorig', ['VardkontaktInfo']]]);
    assert.deepEqual(sys.anslutningar[0].historik.map((h) => h.av), ['Region Y', 'automatiskt i testmiljön']);
    const status = (server, b) => anrop(server, 'POST', '/api/anslutning/status', { system: 'VardappY', tjanst: 'inera.tjanst.npo', aktor: 'NPOKonsument', ...b });
    assert.equal((await status(test, { miljo: 'test', status: 'testad', bevis: [{ typ: 'testrapport', fil: 'rapport/finns-inte.md' }] })).status, 400);
    fs.mkdirSync(path.join(dir, 'rapport'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'rapport', 'test.md'), '# test\n');
    assert.equal((await status(test, { miljo: 'test', status: 'testad', bevis: [{ typ: 'testrapport', fil: 'rapport/test.md' }] })).status, 200);
    assert.equal((await status(test, { miljo: 'prod', status: 'ansokt' })).status, 200, 'testläget kan ansöka om produktion');
    assert.equal((await status(test, { miljo: 'prod', status: 'godkand', bevis: [{ typ: 'beslut', text: 'ok' }] })).status, 400, 'men inte godkänna');
    assert.equal((await status(vanlig, { miljo: 'prod', status: 'godkand', bevis: [{ typ: 'beslut', text: 'ok' }] })).status, 200);
    const text = fs.readFileSync(path.join(dir, 'system', 'vardapp-y.yaml'), 'utf8');
    assert.match(text, /- \{ status: testad, datum: [0-9-]+, av: studio \(test\) \}/, 'historiken skrivs en rad per post');
  } finally {
    test.close();
    vanlig.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- systemregistret: produkter, producenter, adressater

test('anslut producent (test): anslutningspunkt, tjänsteinstans, organisation och medlemskap i testmiljöns katalog', () => {
  const dir = kopieraArbetsyta();
  try {
    const manifests = loadManifests(loadWorkspace(dir));
    const begaran = {
      system: 'VardsystemY', titel: 'Vårdsystem Y', produkt: 'journalsystem-x', organisation: { namn: 'Region Y', hsaId: 'SE2321000123-REGY' },
      adress: 'https://fhir.y.se/r5', roller: [{ tjanst: 'inera.tjanst.npo', aktor: 'NPOKallsystem', informationsmangder: ['FastKontaktInfo'] }],
    };
    const f = forhandsgranskaProducentAnslutning(dir, begaran, manifests);
    assert.deepEqual(f.andringar.map((a) => `${a.atgard} ${a.resurs.resourceType}`), ['skapa Organization', 'skapa OrganizationAffiliation', 'skapa Endpoint', 'skapa CapabilityStatement']);
    assert.ok(f.scopes.includes('system/Endpoint.cu'), 'producenten registrerar själv i drift');
    assert.throws(() => forhandsgranskaProducentAnslutning(dir, { ...begaran, roller: [{ tjanst: 'inera.tjanst.npo', aktor: 'NPOKonsument' }] }, manifests), /ingen producentroll/);
    assert.throws(() => forhandsgranskaProducentAnslutning(dir, { ...begaran, adress: 'ftp://x' }, manifests), /http/);
    anslutProducentTest(dir, begaran, manifests);
    const sys = loadSystems(dir).find((s) => s.system === 'VardsystemY');
    assert.equal(sys.produkt, 'journalsystem-x');
    assert.deepEqual(sys.andpunkter, ['https://fhir.y.se/r5']);
    assert.deepEqual(sys.informationsmangder['inera.tjanst.npo'].sort(), ['FastKontaktInfo', 'VardkontaktInfo']);
    assert.deepEqual(sys.anslutningar.map((a) => [a.aktor, a.miljo, a.status]), [['NPOKallsystem', 'test', 'behorig']]);
    // Systemanalysen ser registreringarna i katalogen.
    const a = analyseSystems(loadWorkspace(dir), dir).find((x) => x.system === 'VardsystemY');
    assert.ok(a.anslutningar.forvantade.length >= 3);
    assert.ok(a.anslutningar.forvantade.every((x) => x.status === 'registrerad'), JSON.stringify(a.anslutningar.forvantade.map((x) => [x.typ, x.status])));
    assert.equal(a.produkt.titel, 'Journalsystem X');
    // Igen: inget nytt skapas.
    assert.deepEqual(forhandsgranskaProducentAnslutning(dir, begaran, manifests).andringar, []);
    // Ändra vägval.
    bytProducentAdress(dir, { system: 'VardsystemY', fran: 'https://fhir.y.se/r5', till: 'https://fhir2.y.se/r5' });
    const k = JSON.parse(fs.readFileSync(path.join(dir, 'system', 'nulage', 't2-katalog.json'), 'utf8'));
    assert.equal(k.entry.find((e) => e.resource.id === 'ep-vardsystem-y').resource.address, 'https://fhir2.y.se/r5');
    assert.deepEqual(loadSystems(dir).find((s) => s.system === 'VardsystemY').andpunkter, ['https://fhir2.y.se/r5']);
    assert.throws(() => bytProducentAdress(dir, { system: 'VardsystemY', fran: 'https://finns.inte', till: 'https://x.se' }), /Ingen anslutningspunkt/);
    // Organisationer.
    assert.throws(() => registreraOrganisation(dir, { namn: 'Region Y', hsaId: 'SE2321000123-REGY' }), /finns redan/);
    assert.throws(() => registreraOrganisation(dir, { namn: 'X', hsaId: 'fel' }), /Ogiltigt HSA-id/);
    registreraOrganisation(dir, { namn: 'Region Z', hsaId: 'SE2321000124-REGZ' });
    assert.ok(organisationer(dir).some((o) => o.hsaId === 'SE2321000124-REGZ'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('produkter: standarder, följsamhetens källa och produktgodkännande per roll', () => {
  const dir = kopieraArbetsyta();
  try {
    skrivProdukt(dir, 'takecare', { titel: 'TakeCare', leverantor: 'CGM', foljer: [{ titel: 'HL7 Sweden basprofiler', paket: 'hl7se.fhir.base' }] });
    const p = () => loadProdukter(dir).find((x) => x.produkt === 'takecare');
    assert.deepEqual(p().foljer, [{ titel: 'HL7 Sweden basprofiler', paket: 'hl7se.fhir.base' }]);
    const mal = { tjanst: 'inera.tjanst.npo', aktor: 'NPOKallsystem' };
    assert.throws(() => skrivProduktGodkannande(dir, 'takecare', { ...mal, status: 'ansokt' }), /var följsamheten bor/);
    assert.throws(() => skrivProdukt(dir, 'takecare', { titel: 'TakeCare', foljsamhet: { kalla: 'referensimplementation' } }), /adress/);
    skrivProdukt(dir, 'takecare', { titel: 'TakeCare', foljsamhet: { kalla: 'register' } });
    assert.throws(() => skrivProduktGodkannande(dir, 'takecare', { ...mal, status: 'ansokt' }), /testrapport/);
    fs.mkdirSync(path.join(dir, 'rapport'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'rapport', 'tc.md'), '# test\n');
    skrivProduktGodkannande(dir, 'takecare', { ...mal, status: 'ansokt', bevis: [{ typ: 'testrapport', fil: 'rapport/tc.md' }] }, { studiomiljo: 'test' });
    assert.throws(() => skrivProduktGodkannande(dir, 'takecare', { ...mal, status: 'godkand', bevis: [{ typ: 'beslut', text: 'ok' }] }, { studiomiljo: 'test' }), /bara ansöka/);
    assert.throws(() => skrivProduktGodkannande(dir, 'takecare', { ...mal, status: 'godkand' }), /beslut/);
    skrivProduktGodkannande(dir, 'takecare', { ...mal, status: 'godkand', bevis: [{ typ: 'beslut', text: 'ok' }] });
    assert.deepEqual(p().godkannanden.map((g) => [g.aktor, g.status, g.historik.length]), [['NPOKallsystem', 'godkand', 2]]);
    assert.equal(p().leverantor, undefined, 'leverantören tas bort när den inte anges');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('följsamhet per instans: produktgodkännande och tjänstens IG i CapabilityStatement', () => {
  const a = Object.fromEntries(analyseSystems(loadWorkspace(root), root).map((x) => [x.system, x]));
  const f = (s, aktor) => a[s].foljsamhet.find((x) => x.aktor === aktor);
  assert.equal(f('JournalX', 'NPOKallsystem').produktgodkannande, 'godkand');
  assert.equal(f('JournalX', 'NPOKallsystem').kalla, 'register');
  assert.equal(f('PrimarvardP', 'POT2Producent').produktgodkannande, 'ansokt');
  assert.equal(f('LabbsystemL', 'Journal1177KallsystemFiltrerande').igDeklarerad, null, 'inget nuläge');
  const cs = a.JournalX.behorighet.miljoer.test.klientCs;
  assert.ok(cs.implementationGuide.includes('https://fhir.inera.se/ig/npo/ImplementationGuide/inera.tjanst.npo|0.1.0'));
  assert.equal(cs.software.name, 'Journalsystem X');
});

test('adressatbegränsning: bara HSA-id eller alla, följer med till behörigheter och WSO2-planen', () => {
  const manifests = loadManifests(loadWorkspace(root));
  const roll = { tjanst: 'inera.tjanst.npo', aktor: 'NPOKonsument' };
  assert.throws(() => forhandsgranskaAnslutning({ system: 'VardappY', roller: [{ ...roll, adressater: ['region'] }] }, manifests), /Ogiltig adressat/);
  const alla = forhandsgranskaAnslutning({ system: 'VardappY', roller: [{ ...roll, adressater: ['*'] }] }, manifests);
  assert.deepEqual(alla.behorigheter[0].adressater, ['*']);
  const f = forhandsgranskaAnslutning({ system: 'VardappY', roller: [{ ...roll, adressater: ['SE2321000099-EXMP'] }] }, manifests);
  assert.deepEqual(f.behorigheter[0].adressater, ['SE2321000099-EXMP']);
  assert.deepEqual(f.wso2.prenumerationer[0].adressater, ['SE2321000099-EXMP']);
  assert.ok(f.wso2.anmarkningar.some((x) => /adressater/.test(x)));
  const a = overga([], { ...roll, miljo: 'test' }, 'begard', { adressater: ['SE2321000099-EXMP'] });
  assert.deepEqual(a[0].adressater, ['SE2321000099-EXMP']);
});

test('federationstest mot produktens referensimplementation: live-adress, producentroller, ej nåbar', async () => {
  const w = loadWorkspace(root);
  const manifests = loadManifests(w);
  const produkt = loadProdukter(root).find((p) => p.produkt === 'primarvardssystem-p');
  const { roller, ejTestbara } = referensroller(produkt, manifests, ['inera.tjanst.pot2#POT2Producent', 'inera.tjanst.pot2#POT2Visning']);
  assert.deepEqual(roller.map((r) => r.aktor), ['POT2Producent']);
  assert.match(ejTestbara[0].orsak, /klientroll/);
  const regler = rules.system || {};
  const ref = await startaReferens({ ws: w, manifests, roller });
  try {
    const r = await testaReferens({ ws: w, manifests, root, regler, produkt, adress: ref.url, roller, ejTestbara });
    assert.equal(r.nabar, true);
    assert.equal(r.status, 'godkänt', JSON.stringify(r.korningar));
    assert.ok(r.korningar.some((k) => k.forutsattning) && r.korningar.some((k) => !k.forutsattning));
    // Konsumentstegen gick till referensimplementationens verkliga adress.
    const logg = JSON.stringify(ref.mock.andpunkter.get('/fhir').logg);
    for (const typ of ['Condition', 'MedicationStatement', 'Flag']) assert.match(logg, new RegExp(typ));
    assert.match(renderProdukttest(r), /status: \*\*godkänt\*\*/);
  } finally {
    await ref.mock.stoppa();
  }
  const borta = await testaReferens({ ws: w, manifests, root, regler, produkt, adress: 'http://127.0.0.1:9/fhir', roller });
  assert.equal(borta.status, 'ej nåbar');
  assert.equal(borta.nabar, false);
});

// ---------------------------------------------------------------- publicering

test('publicera: webbrot per kanonisk URL, versioner behålls, paket och paketflöde', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publicera-'));
  try {
    const svod = loadWorkspace(root).get('inera.fed.svod');
    const igDir = path.join(tmp, 'svod');
    fs.cpSync(path.join(svod.dir, 'fsh-generated'), path.join(igDir, 'fsh-generated'), { recursive: true });
    const ig = { ...svod, dir: igDir };
    const ut = path.join(tmp, 'webb');
    const r1 = publicera({ igs: [ig], ut, datum: '2026-10-01' });
    assert.deepEqual(r1.varningar, []);
    assert.equal(r1.resultat[0].sokvag, 'ig/svod');
    assert.equal(r1.resultat[0].kalla, 'sushi');
    for (const f of ['ig/svod/StructureDefinition-svod-vardenhet.json', 'ig/svod/StructureDefinition-svod-vardenhet.html', 'ig/svod/0.1.0/StructureDefinition-svod-vardenhet.json', 'ig/svod/package.tgz', 'ig/svod/index.html', 'package-feed.xml', 'index.html']) {
      assert.ok(fs.existsSync(path.join(ut, f)), f);
    }
    const lista = spawnSync('tar', ['-tzf', path.join(ut, 'ig/svod/package.tgz')], { encoding: 'utf8' }).stdout;
    assert.match(lista, /package\/package\.json/);
    // Nästa version: den förra ligger kvar och båda finns i package-list och flödet.
    publicera({ igs: [{ ...ig, version: '0.2.0' }], ut, datum: '2026-11-01' });
    assert.ok(fs.existsSync(path.join(ut, 'ig/svod/0.1.0/StructureDefinition-svod-vardenhet.json')));
    assert.ok(fs.existsSync(path.join(ut, 'ig/svod/0.2.0/package.tgz')));
    const pl = JSON.parse(fs.readFileSync(path.join(ut, 'ig/svod/package-list.json'), 'utf8'));
    assert.deepEqual(pl.list.map((v) => [v.version, v.current]), [['current', true], ['0.2.0', true], ['0.1.0', false]]);
    const flode = fs.readFileSync(path.join(ut, 'package-feed.xml'), 'utf8');
    assert.match(flode, /inera\.fed\.svod#0\.2\.0/);
    assert.match(flode, /inera\.fed\.svod#0\.1\.0/);
    assert.equal(webbsokvag('https://example.org/ig/x', 'https://fhir.inera.se').varning, 'https://example.org/ig/x ligger inte under https://fhir.inera.se');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
