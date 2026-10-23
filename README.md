# fhir-ig-composer

[![Bygg och testa](https://github.com/oskthu2/fhir-ig-composer/actions/workflows/bygg.yml/badge.svg)](https://github.com/oskthu2/fhir-ig-composer/actions/workflows/bygg.yml)

Komposition av FHIR-IG:ar – prototyp.

Prototyp för att komponera Ineras IG:ar av återanvändbara delar: **byggblock** (kliniskt innehåll), **federationer** (juridiskt utrymme, säkerhetsmetadata och stödtjänster) och **tjänster** (en cell i matrisen innehåll × federation). Kraven på ett system härleds från de **systemroller** (R5 `ActorDefinition`) som det antar.

Allt är FHIR R5. Arv uttrycks med FHIR:s egna mekanismer (`Parent`, `imposeProfile`, `ActorDefinition.derivedFrom`, `CapabilityStatement.imports`, `Requirements.derivedFrom`, obligations). Det som FHIR inte täcker – kopiering av interna byggblock, RuleSets och federationsmönster – sköts av verktyget `ig-composer` enligt globala regler och extensions på IG:ar och artefakter.

Tjänster i prototypen:

| Innehåll ↓ · Federation → | SVOD | Individuell tillgång | Patientöversiktsfederationen (T2) |
|---|---|---|---|
| **Patientöversikt** | NPÖ | 1177 Journal | |
| **Labbsvar** | *kandidat* | 1177 Journal | |
| **Patientöversikt (T2)** | | | Patientöversikt (T2) |

Innehållsspecifikationerna (byggblocken) är rader, eftersom de blir många, och federationerna kolumner.

Patientöversikt (T2) motsvarar referensrealiseringen av RIVTA T2 på infopeak och kan testas mot den (se *Två lägen*).

(`node verktyg/ig-composer.mjs matris` tar fram matrisen ur IG:arna.)

## Kom igång

| Sätt | Vad du får | Så här |
|---|---|---|
| **Bara titta** | Vyn (`vy.html`), utan redigering | Actions → *Bygg och testa* → senaste körningen → artefakten **matrisvy** → öppna `vy.html` |
| **Codespaces** | Studion, mocken och definitionsregistret i webbläsaren, inget att installera | *Code* → *Codespaces* → *Create codespace*. Studion öppnas på port 4900 när bygget är klart. |
| **Docker lokalt** | Samma sak på din dator; behövs mot interna testmiljöer | `docker compose up` → http://localhost:4900/ (studio) och http://localhost:8080/fhir (register) |
| **Node lokalt** | Allt utom registret | Node ≥ 20 och `npm i -g fsh-sushi@3`, sedan kommandona under *Bygga* och `node verktyg/ig-composer.mjs studio` |

Devcontainern (`.devcontainer/`) och `docker-compose.yml` beskriver samma miljö: tjänsten `studio` (Node, SUSHI, git; i devcontainern även Java och Jekyll för IG Publisher) med arbetsytan monterad, och tjänsten `register` (HAPI FHIR R5). Studion skriver i dina filer, så ändringar syns i `git status` som vanligt.

## Kravmodell: användningsfall, scenarier och spårbarhet

Kravmodellen följer kedjan i ISO/TR 19669: från kravspecifikation (användningsfall, scenarier, informationsbehov) via harmonisering (profiler, förmågor) till det som en tjänst publicerar och en ändpunkt i drift implementerar. Allt uttrycks i FHIR R5:

| Begrepp | FHIR | Var |
|---|---|---|
| Aktör, person eller system | `ActorDefinition` | Byggblock och federationer |
| Informationsbehov | Logisk modell (`Logical`) | Byggblock (i verkligheten från informationsunderlaget) |
| Harmonisering | `* insert Realiserar(Informationsbehov)` på profilen | Byggblock och tjänster |
| Logiskt arbetsflöde (användningsfall, delflöde) | `PlanDefinition` (`workflow-definition`), kompilerat från skissformatet | Byggblock och federationer, `input/scenarier/*.yaml` |
| Tillämpat flöde | `ExampleScenario`, med `tillampar` till arbetsflödet och `specifikation` per steg | Tjänster och stödtjänster |
| Tillämpning | Bindning av aktivitet till interaktion, härledd eller i `input/tillampning.yaml` | Tjänster |
| Stödtjänst | `ActorDefinition` + förmågor i federationen | Federationer |
| Invävning | Federationens extension `flodesmonster` | Federationer |
| Urval | Extension `anvandningsfall` på tjänstens IG | Tjänster |
| Krav per deltagande aktör | `Requirements`, en sats per steg, `satisfiedBy` till profil och förmåga | Genereras |

### Två nivåer: logiska arbetsflöden och tillämpning

Flödena skissas som ren arbetsflödesmodellering, och tillämpas där det tekniska hör hemma:

| Nivå | Var | Vad skissen anger | FHIR |
|---|---|---|---|
| **Logisk** (konceptuell och logisk) | Byggblock och federationer | Aktiviteter, roller, information, ordning och alternativ. Inga FHIR-interaktioner. | `PlanDefinition`, `type = workflow-definition`: `actor` med roller (`ActorDefinition`), `action` med aktivitet (`code`), utförare och mottagare (`participant`), information (`input`/`output` med den logiska modellen), ordning (`relatedAction`), alternativ och delflöden (`definitionCanonical`) |
| **Tillämpad** | Tjänster, stödtjänsten (T2/tjänstekatalogen) | Varje aktivitet bunden till en interaktion och den specifikation den följer | `ExampleScenario` med `tillampar` → arbetsflödet, och per steg `specifikation` → `CapabilityStatement` (tjänstens API per informationsmängd eller stödtjänstens API) och `bindning` |

Aktiviteterna är ett litet ordförråd (`konventioner`: CodeSystem `aktivitet`): *hämta, lämna, registrera, uppdatera, kontrollera, meddela, visa, utföra*. Ett logiskt flöde skrivs så här:

```yaml
anvandningsfall: VardpersonalPatientoversikt
nyckel: PO
titel: Vårdpersonal tar del av patientens vårdkontakter och fasta kontakter
aktorer:
  vardpersonal: Vardpersonal        # person
  journal: PSKonsument
  kalla: PSProducent
informationsbehov:
  vardkontakt: VardkontaktInfo      # logisk modell
steg:
  - titel: Journalsystemet söker patientens vårdkontakter
    fran: journal                   # utförare
    till: kalla                     # mottagare
    hamtar: vardkontakt             # = aktivitet: hamta, information: vardkontakt
    alternativ:
      - titel: Källsystemet svarar inte
        steg: [ ... ]
  - titel: Konsumenten loggar åtkomsten
    fran: konsument
    till: logg
    aktivitet: lamna
```

`operation` och `resurstyp` i ett logiskt flöde ger fel (`tillampningILogisktFlode`). Stödtjänsten T2 har tillämpade flöden: tjänstekatalogens, medlemskatalogens och engagemangsindexets interaktioner är själva specifikationen.

**Tillämpningen** i en tjänst binder varje aktivitet till en interaktion i mottagarens förmågor:

| Aktivitet | Interaktion (första som mottagaren har) |
|---|---|
| hämta, kontrollera | `search-type`, `read` på informationens resurstyp; utan information den enda resurstyp mottagaren har, annars `search-system` |
| lämna, meddela | `create` |
| registrera | `create`, `update` |
| uppdatera | `update` |
| visa, utföra | ingen |

Specifikationen blir tjänstens API för informationsmängden (t.ex. `VardkontaktAPI`, som kan motsvara en extern specifikation), annars mottagarens förmåga (t.ex. `TjanstekatalogCS`). Där härledningen inte räcker anger tjänsten bindningen i `input/tillampning.yaml`, per källflöde och steg (`id` eller nummer):

```yaml
# 1177 Journal: federationens "ta reda på vad källsystemet stödjer" görs med capability discovery.
AnslutaKallsystemIndividuell:
  formagor:
    operation: capabilities
```

En aktivitet som inte går att binda ger varningen `obundenAktivitet`. Fliken **Tillämpning** i en tjänst visar varje aktivitet med interaktion, specifikation och varifrån bindningen kommer, och i studion går den att överstyra.

En federation väver in delflöden (också skrivna i skissformatet) före och efter steg med vissa aktiviteter (`flodesmonster`, `vid: hamta`). SVOD väver in *Verifiera patientrelation* före första hämtningen och *Tillämpa spärr och logga åtkomst* efter varje hämtning. Ett delflödes aktör med `binder: fran` är samma deltagare som avsändaren i steget som delflödet vävs in vid. Aktören får då båda rollerna, till exempel PSKonsument + SVODKonsument, och tjänsten måste ha en tjänsteaktör som spelar båda.

`ig-composer` gör för varje IG:

1. **Kompilerar** användningsfallen och de delflöden som används: i byggblock och federationer till `PlanDefinition`, i tjänster och stödtjänster till `ExampleScenario`. Invävda steg blir `step.workflow` med `invavd-av`.
1. **Tillämpar** (i en tjänst): binder varje aktivitet till interaktion och specifikation, enligt tabellen ovan och tjänstens `input/tillampning.yaml`.
2. **Harmoniserar** varje informationsbehov till den profil som realiserar det, helst en exponerad profil.
3. **Binder** scenarioaktörer till roller och, i en tjänst, till den tjänsteaktör som spelar dem.
4. **Genererar** `Requirements` per användningsfall och deltagande systemaktör: en sats per steg, med `satisfiedBy` till profilen och aktörens förmåga, och `reference` till scenariot. Kraven hamnar i kravprofilen för tjänsteaktörerna.
5. **Kontrollerar täckningen** (regler `scenarier.tackning`):
   - rollen finns som ActorDefinition;
   - informationsbehovet finns och har en profil;
   - en tjänsteaktör spelar varje systemaktör;
   - avsändare och mottagare har interaktionen i sina förmågor (i en tjänst);
   - logiska flöden anger inga interaktioner, och tjänstens aktiviteter går att binda.

I matrisvyn har varje tjänst och byggblock fliken **Användningsfall** med sekvensdiagram (invävda steg markerade), spårbarhet från kravsats till profil och förmåga, och täckning.

Kedjan i FHIR: `PlanDefinition` (logiskt) ← `ExampleScenario` (tillämpat, `tillampar`) → `Requirements` (per aktör) → `satisfiedBy` profil och `CapabilityStatement` → tjänsteaktör (`ActorDefinition.derivedFrom`) → i tjänstekatalogen `TKAPIInstance.instantiates` → ändpunkt.

## Förutsättningar och stödtjänster: T2-mönstret

Alla federationer bygger på samma samverkansmönster (RIVTA T2), som stödtjänsten **T2-samverkan** (`stodtjanster/t2`, `inera.st.t2`) beskriver. Den har stödtjänsterna *tjänstekatalog*, *federationsmedlemskatalog*, *engagemangsindex*, *åtkomstintygstjänst* och *federationsoperatör*. Deras förmågor instansierar (`instantiates`) katalogtjänsternas publicerade specifikationer. Den har också deltagarrollerna `TjanstekatalogRegistrerare`, `T2Konsument`, `Engagemangsproducent` och `Federationsmedlem`, och flödena:

| Användningsfall / delflöde | Innehåll |
|---|---|
| Bli medlem | ansökan; operatören registrerar organisationen och medlemskapet i federationsmedlemskatalogen |
| Registrera ändpunkt | anslutningspunkt med `implements` per informationsmängd, och tjänsteinstans per specifikation |
| Anmäla engagemang | producenten anmäler engagemang (patient + vårdgivare) |
| T2-uppslag *(delflöde)* | tjänstesökning (T1) på specifikationen, medlemsverifiering (F1), åtkomstintyg |
| Engagemangsuppslag *(delflöde)* | konsumenten hämtar patientens engagemang; producenter utan engagemangsindexering anropas alltid |

Federationerna väver in mönstret med `flodesmonster`: `fore` (engagemangsuppslag, en gång med `foreEnGang`), `foreVarje` (T2-uppslag före varje hämtning) och `efter` (t.ex. SVOD:s spärr och loggning). Förutsättningarna anges med `forutsattning` och ingår i varje tjänst i federationen:

| Federation | Förutsättningar |
|---|---|
| SVOD | Bli medlem, Ansluta källsystem (inkluderar Registrera ändpunkt), Anmäla engagemang (tillval), Ansluta konsument |
| Individuell tillgång | Bli medlem, Ansluta källsystem |
| Patientöversiktsfederationen (T2) | Bli medlem, Ansluta källsystem, Anmäla engagemang (tillval) |

Federationernas källsystemsroller härleds från `TjanstekatalogRegistrerare` och `Federationsmedlem`, och konsumentrollerna från `T2Konsument` och `Federationsmedlem`. Aktörer som tillhandahålls av en federation eller stödtjänst markeras med `* insert Stodtjanst` och spelas inte av tjänsternas system.

**Tillval** är roller som ett system kan anta utöver en grundroll: `* insert TillvalFor(SVODKallsystem)` på `SVODEngagemangsindexerad`. Ett scenario med en tillvalsroll spelas av de tjänsteaktörer som spelar grundrollen, och det är systemet som väljer tillvalet.

### Informationsmängder

En tjänst får en genererad specifikation per **informationsmängd**: per exponerad profil som realiserar ett informationsbehov (`<Informationsbehov>API`, t.ex. `VardkontaktAPI`). Det är mot den en anslutningspunkt registreras och T1 söker. Om informationsbehovet motsvarar en externt publicerad specifikation (`* insert ExternSpecifikation(url|version)` på den logiska modellen) instansierar den genererade specifikationen den, och registreringen sker mot den externa. En informationsmängd är obligatorisk, eller valfri med extensionen `valfri-informationsmangd` på tjänsten (NPÖ: Fast kontakt, Patientöversikt (T2): Uppmärksamhetsinformation). Källsystemens förmågor importerar de obligatoriska.

I skissformatet kan ett användningsfall **inkludera** ett annat:

```yaml
steg:
  - inkludera: RegistreraAndpunkt
    roller: { registrerare: kalla, katalog: katalog }
```

Den inkluderade aktören binds till en aktör i det inkluderande fallet, som då spelar båda rollerna. I FHIR blir det `action.definitionCanonical` i arbetsflödet och `step.workflow` i det tillämpade scenariot.

Förmågor läses och genereras per `rest`-block, alltså per läge. Ett källsystem är server för kliniskt innehåll men klient mot tjänstekatalogen och engagemangsindexet. Täckningskontrollen kräver interaktionen som klient hos avsändaren och som server hos mottagaren.

## Systemperspektiv: summan av krav, test och gap

Ett konkret system antar ofta flera roller i olika tjänster och användningsfall. `system/*.yaml` beskriver det:

```yaml
system: JournalX
titel: Journalsystem X
andpunkter: [https://fhir.journalx.region-exempel.se/r5]
roller:
  - { tjanst: inera.tjanst.npo, aktor: NPOKallsystem }
  - { tjanst: inera.tjanst.npo, aktor: NPOKonsument }
  - { tjanst: inera.tjanst.journal1177, aktor: Journal1177KallsystemMarkande }
organisation: { namn: Region Exempel, hsaId: SE2321000099-EXMP }
nulage:
  formaga: nulage/journalx-metadata.json  # CapabilityStatement kind=instance (GET [bas]/metadata)
  katalog: nulage/t2-katalog.json         # T2-katalogerna: organisationer, medlemskap, anslutningspunkter, tjänsteinstanser, engagemang
tillval: []                               # t.ex. [SVODEngagemangsindexerad]
informationsmangder:                      # valda per tjänst; utan val: obligatoriska + valfria som nuläget har
  inera.tjanst.npo: [VardkontaktInfo]
```

`ig-composer system` (efter `bygg`) tar fram följande per system, och skriver `rapport/<system>.md`:

- **Summan av API-krav** per läge och resurstyp, över alla roller. Interaktioner, sökparametrar och profiler kommer från tjänsteaktörernas förmågor och allt de importerar. Den mest specifika profilen räcker: `VardkontaktNPO` ersätter NPÖ:s `Vardkontakt`. Samma profil i två tjänster (samma `kopierad-fran`) visas som en profil med två kanoniska URL:er, och systemet måste ange båda.
- **Elementkrav, verksamhetskrav och scenariosteg** som systemet deltar i, inklusive förutsättningarna.
- **Gap mot nuläget:** saknade resurstyper, interaktioner, sökparametrar och profiler i systemets CapabilityStatement.
- **Informationsmängder och tillval:** per roll vilka informationsmängder som är obligatoriska, valfria och valda. En vald informationsmängd ger serverkrav, elementkrav och scenariosteg; en valfri som inte är vald ger inga. Ett tillval blir en egen roll med sina förmågor, krav och förutsättningar.
- **Registreringar i T2-katalogerna:** medlemskap i federationen per medlemsroll, en anslutningspunkt (med tjänsteinstans) per vald informationsmängd per registrerarroll, och engagemangsindexering för tillvalet. Status: registrerad, annan version eller saknas.
- **Testlista:** varje krav en gång, med de roller som ställer det. API-krav och anslutningar får status från nuläget, övriga krav är manuella.

I matrisvyn finns systemen under **System**. Välj vilka av systemets roller som ska summeras, så räknas kraven, gapet och testlistan om. API-kraven kan grupperas per resurstyp, roll eller status, och testlistan kan laddas ner.

Exempelsystemen visar olika lägen:
- **Journalsystem X:** CareTeam saknas som server (1177 Journal kräver Fast kontakt; i NPÖ är den valfri och inte vald); sökparametern `date` och 1177:s Vårdkontakt-profil saknas; klientförmåga för T1, F1, engagemang och Subscription saknas; medlemskapet i Individuell tillgång saknas och 1177-registreringen gäller en äldre version.
- **1177 invånarplattform:** klientförmåga för T2-uppslagen saknas.
- **Labbsystem L:** inget nuläge inlämnat, så API-gapet är okänt; varken medlemskap eller registrering.
- **Primärvårdssystem P:** källsystem och konsument i Patientöversikt (T2) med tillvalet engagemangsindexerad; läkemedel är inte registrerat än och uppmärksamhetsinformation inte vald.

## Två lägen: mockad federation och läsadapter

```sh
node verktyg/ig-composer.mjs federation testa                  # mockad federation: bygger, kör och stänger
node verktyg/ig-composer.mjs federation starta --port 4800     # låter mocken köra
node verktyg/ig-composer.mjs federation testa --mot infopeak   # läsläge mot referensrealiseringen
```

Samma testkörare kör användningsfallen mot en *miljö*. Körningen går som en konsument enligt T2: engagemangsuppslag, tjänstesökning (T1) på informationsmängdens specifikation, medlemsverifiering (F1) och åtkomstintyg. Sedan anropas de producenter som återstår, med intyget som Bearer-token. Producenter som är engagemangsindexerade men saknar engagemang för patienten hoppas över, och för systemet under test anges varför det inte hittas.

### Mockad federation

`ig-composer` bygger en federation i minnet ur de komponerade IG:arna och systemregistret:

| Ändpunkt | Vad | Kan |
|---|---|---|
| `/stod/<Aktör>` | Stödtjänster: tjänstekatalog, federationsmedlemskatalog, engagemangsindex, åtkomstintygstjänst (`POST token`), SVOD:s patientrelation, logg och prenumeration | Det deras CapabilityStatements säger; katalogerna filtrerar på T2:s sökparametrar |
| `/referens/<tjänst>/<Aktör>` | Referensimplementation per källsystemsroll, medlem och registrerad för alla informationsmängder | Summan av rollens server-krav. Data är tjänstens exempel. Kräver åtkomstintyg. |
| `/system/<System>` | Varje system i `system/` | Exakt det systemets nuläge säger: andra interaktioner ger 405, andra sökparametrar 400, utan nuläge 501. Kräver åtkomstintyg. |

Katalogerna fylls med systemens nuläge (`t2-katalog.json`, med adresser till mocken) och referensimplementationerna. `federation testa` kör nuläget live, sedan förutsättningarna, som skriver till katalogerna (det som redan finns skrivs inte igen), sedan användningsfallen och till sist nuläget live igen. Resultatet hamnar i `federation.json` och `rapport/federation.md`. I exemplet:
- Förutsättningarna stänger registreringsgapen: medlemskap, anslutningspunkter per informationsmängd och tjänsteinstanser.
- Journalsystem X svarar 400 på `date`. Som konsument saknar det klientförmågan för T1, F1 och engagemangsuppslaget.
- Primärvårdssystem P hittas med T1, är medlem, har engagemang för testpatienten och svarar med åtkomstintyg. Som konsument saknar det klientförmåga för Flag.
- Labbsystem L kan inte provas eftersom nuläget saknas.

### Läsadapter mot infopeak

`miljoer/infopeak.yaml` beskriver referensrealiseringen av T2 på `demo.inera.infopeak.se`: tokenadressen, katalogernas sökvägar, omskrivningen av anslutningspunkternas gatewayadresser, federationens organisation (`inera.fed.pot2` → `Organization/fed-po`), testpatienten och vilka tjänster som testas. Adaptern **skriver aldrig**. Förutsättningarna verifieras mot katalogerna: organisationen, medlemskapet, anslutningspunkten med de valda informationsmängderna, tjänsteinstansen och engagemanget.

Systemen härleds ur katalogen. Varje organisation med en anslutningspunkt som implementerar någon av tjänstens informationsmängder (via `ExternSpecifikation`) blir ett system med källsystemsrollen, de informationsmängder den implementerar och tillvalet engagemangsindexerad om anslutningspunkten anger det. Resultatet för Patientöversikt (T2): **Demoregion** (diagnoser, läkemedel, uppmärksamhet) och **Grannregionen** (diagnoser, läkemedel; uppmärksamhet är valfri och hoppas över). Båda klarar förutsättningarna och patientöversikten.

Körningen jämför också tjänstens specifikation per informationsmängd med den externa den motsvarar. Ögonblicksbilder (CC0) ligger i `externa/infopeak/`. Avvikelserna visar till exempel att de externa är FHIR 4.0.1, har sökparametern `recorder` och kräver även `Patient` och `Practitioner`. Resultatet skrivs till `federation-infopeak.json` och `rapport/federation-infopeak.md`, och i matrisvyn som *System i referensrealiseringen* med flikarna Federationstest och Specifikationer.

Inga inloggningsuppgifter finns i repot. Katalogerna och producenterna nås med en token från realiseringens tokenadress. För att hämta nya ögonblicksbilder från IG-sajterna (basic auth) sätter man miljövariablerna:

```sh
INFOPEAK_ANVANDARE=… INFOPEAK_LOSENORD=… node verktyg/ig-composer.mjs externa hamta
```

I CI körs läsadaptern bara på begäran (`workflow_dispatch` med `infopeak: true`), så att bygget inte beror på en extern miljö.

Testköraren prövar flöden och kontrakt: interaktioner, sökparametrar, profiler som anges i `meta.profile`, registreringar och att mottagare går att hitta. Den validerar inte resursernas innehåll mot profilerna.

## Studio: redigera system, användningsfall och komposition

```sh
node verktyg/ig-composer.mjs studio            # http://127.0.0.1:4900/ (STUDIO_VARD=0.0.0.0 i container)
```

Studion är matrisvyn med redigering. Källan är fortsatt filerna i git: studion skriver dem, med kommentarer och ordning bevarade, komponerar om alla IG:ar utan SUSHI (någon sekund) och visar resultatet. Längst upp står ändrade filer med diff och *återställ*, kvittot från senaste sparningen (fel och varningar från kompositionen) och en knapp för hela bygget med SUSHI.

- **System** (*Redigera systemet*, *＋ Nytt system*): titel, organisation med HSA-id, ändpunkter, roller per tjänst, tillval som hör till de valda rollerna och informationsmängder (obligatoriska låsta, valfria valbara, eller *som nuläget*). Efter sparning visas den nya summan av krav, gapet och testlistan direkt.
- **Användningsfall och delflöden** (*Redigera skissen*, *＋ Nytt användningsfall*, *＋ Nytt delflöde*): aktörer väljs bland IG:ns `ActorDefinition`, informationsbehov bland de logiska modellerna, steg med utförare, mottagare, aktivitet och information. I tillämpade flöden (stödtjänster) även interaktion och resurstyp; steg som hämtas in i ett logiskt flöde behåller bara aktiviteten.
- **Tillämpning** (fliken *Tillämpning* i en tjänst): bindningen per aktivitet, med *Bind till* för att överstyra den härledda; sparas i tjänstens `input/tillampning.yaml`. Krav kan hämtas ur kravkatalogen, användningsfall kan inkluderas, och steg kan hämtas från en annan skiss (aktörer och informationsbehov följer med). YAML går att förhandsgranska.
- **Komposition** (*Redigera kompositionen*): vilka paket IG:n komponerar; för en tjänst vilka användningsfall den har och vilka informationsmängder som är valfria; för en federation förutsättningar och flödesmönster.

Skrivningar kräver huvudet `X-Studio`, så att en annan webbsida inte kan skriva via studion. Studion lyssnar bara på 127.0.0.1 om inte `STUDIO_VARD` säger annat.

## Flöden: en styrande källa, två diagram

Ett flöde skrivs en gång i skissformatet (för hand eller i studion) och kompileras till FHIR. Allt annat utgår från de resurserna:

- **IG:ns webbsidor:** efter SUSHI genererar `bygg` (och `efterbehandla`) en sida med ett diagram per flöde och lägger in den i ImplementationGuide-resursen och menyn. IG Publisherns mall renderar Mermaid.
  - Byggblock och federationer får sidan *Arbetsflöden*: **simbanediagram** ur `PlanDefinition`, med en bana per utförare och en nod per aktivitet med information och mottagare. Delflöden visas som underprocesser och alternativ som streckade grenar.
  - Tjänster och stödtjänster får sidan *Användningsfall*: **sekvensdiagram** ur `ExampleScenario` med interaktionerna. Invävda delflöden expanderas och ramas in, och delflödets aktörer binds till huvudflödets.
- **Verktyget:** kravspårning, systemanalys, tillämpning och testkörning använder samma modell.
- **Registret:** `ig-composer mermaid <kanonisk URL>` ritar diagrammet direkt ur definitionsregistret (`PlanDefinition` eller `ExampleScenario`), och för en fil med `ig-composer mermaid <fil>`.

`PlanDefinition` med `type = workflow-definition` är FHIR:s resurs för fördefinierade arbetsflöden: vilka åtgärder som görs, av vem, i vilken ordning och med vilken information. `ExampleScenario` beskriver interaktionerna mellan system med `operation`, initiator och mottagare. Kraven ligger i `Requirements`, rollerna i `ActorDefinition` och API:erna i `CapabilityStatement`.

## Definitionsregister: IG:arnas definitioner som API

```sh
node verktyg/ig-composer.mjs register publicera [--server URL]   # standard FHIR_REGISTER eller http://localhost:8080/fhir
node verktyg/ig-composer.mjs register lista [--server URL]
```

Tjänstekatalogen gör anslutningspunkter sökbara som API (`Endpoint`). Registret gör samma sak för specifikationerna: alla IG:ars definitioner (profiler, logiska modeller, `ActorDefinition`, `CapabilityStatement`, `Requirements`, `ExampleScenario`, `ImplementationGuide` …) publiceras i en FHIR-server, HAPI R5 i `docker-compose.yml`. Varje IG skrivs i en transaktion med villkorad uppdatering på `url` och `version`, så att en ny körning uppdaterar i stället för att skapa dubbletter. Varje resurs taggas med IG:n den kommer från. Exempel ingår inte.

Då kan man till exempel:
- hämta en tjänsts informationsmängder: `CapabilityStatement?url=https://fhir.inera.se/ig/po-t2/CapabilityStatement/DiagnosAPI`
- se vilka aktörer en IG har: `ActorDefinition?_tag=https://fhir.inera.se/ig/conventions/CodeSystem/ig|inera.tjanst.npo`
- rita ett flöde: `ig-composer mermaid https://fhir.inera.se/ig/npo/ExampleScenario/VardpersonalPatientoversikt`

CI startar HAPI som tjänst, testar registret och publicerar alla IG:ar i det.

Visionen är att registret blir källan som tjänster, system och verktyg läser ifrån, i stället för paket i repon. Git är fortsatt platsen där ändringar skrivs och granskas: studion skriver filer, bygget publicerar i registret. Nästa steg är att verktyget kan komponera från registret (`--fran-register`), så att byggblock och federationer inte behöver finnas i samma arbetsyta, och att varje tjänsts specifikationer per informationsmängd också registreras i tjänstekatalogen.

## Interaktiv matrisvy

```sh
node verktyg/ig-composer.mjs bygg   # skriver komposition.json i varje IG
node verktyg/ig-composer.mjs vy     # skriver vy.html
```

`vy.html` är en fristående sida (ingen server, inga externa beroenden) som läser in alla IG:ars `komposition.json`. CI laddar upp den som byggartefakten *matrisvy*. I vyn kan man:

- klicka på en **tjänst** i matrisen för dess kravprofiler per systemroll (härledning, förmågor, elementkrav filtrerbara per aktör med egen/ärvd/bas-härkomst, verksamhetskrav), vad som kommer med varifrån, exponerade profiler, komponerade paket och diagnostik;
- klicka på en **domän, federation eller ett byggblock** för var det används (direkt eller via andra byggblock) och vilka av dess artefakter som finns i vilka IG:ar – underlag för konsekvensanalys vid versionsbyte;
- **söka** efter en artefakt, aktör eller ett paket och se alla IG:ar där den finns, med läge (lokal, kopierad, genererad, refererad, utelämnat) och kedja;
- se och kopiera **Mermaid** för varje användningsfall (samma diagram som på IG:ns sida *Användningsfall*).

Valet ligger i adressens `#`-del, så en länk till en vy går att dela.

```
.
├── konventioner/              inera.build.conventions  (konvention, publik)
│   └── regler.yaml            globala kompositionsregler
├── byggblock/
│   ├── fastakontakter/        inera.bb.fastakontakter  (byggblock, intern)
│   ├── patientoversikt/       inera.bb.patientoversikt (byggblock, intern) – komponerar Fasta kontakter
│   ├── labbsvar/              inera.bb.labbsvar        (byggblock, intern)
│   └── po-t2/                 inera.bb.pot2            (byggblock, intern) – diagnoser, läkemedel, uppmärksamhet
├── federationer/
│   ├── svod/                  inera.fed.svod           (federation, intern)  – komponerar T2-samverkan
│   ├── individuell/           inera.fed.individuell    (federation, intern)  – komponerar T2-samverkan
│   └── po-t2/                 inera.fed.pot2           (federation, intern)  – komponerar T2-samverkan
├── stodtjanster/
│   └── t2/                    inera.st.t2              (stödtjänst, intern)  – kataloger, intyg, operatör
├── tjanster/
│   ├── npo/                   inera.tjanst.npo         (tjänst, publik)   – SVOD × Patientöversikt
│   ├── journal1177/           inera.tjanst.journal1177 (tjänst, publik)   – Individuell tillgång × (Patientöversikt + Labbsvar)
│   └── po-t2/                 inera.tjanst.pot2        (tjänst, publik)   – Patientöversiktsfederationen × Patientöversikt (T2)
├── system/                    konkreta system: roller, tillval, informationsmängder, ändpunkter och nuläge
│   └── nulage/                CapabilityStatement (kind=instance) och T2-katalogerna
├── miljoer/                   verkliga T2-realiseringar för läsadaptern (infopeak.yaml)
├── externa/                   ögonblicksbilder av externa specifikationer (CC0)
├── verktyg/                   ig-composer (Node ≥ 20): komposition, studio, mock, läsadapter, register, Mermaid
├── .devcontainer/             Codespaces och VS Code Dev Containers
├── Dockerfile                 studion i en container
└── docker-compose.yml         studio + definitionsregister (HAPI FHIR R5)
```

Varje katalog under `konventioner/`, `byggblock/`, `federationer/`, `stodtjanster/` och `tjanster/` är en egen IG. Här är **verktyget och konventionerna** hemma. Byggblock, federationer och tjänster ligger i samma repo så länge det är en prototyp, så att allt går att bygga från början till slut. Längre fram kan de bli egna repon som komponeras hit via arbetsytan, eller läses från definitionsregistret.


## Bygga

CI (`.github/workflows/bygg.yml`) kör samma sak vid varje push och pull request: `bygg` för alla IG:ar, verktygets tester (med HAPI som definitionsregister), systemrapporter, federationstestet, publicering i registret, `matris` och `vy`.

```sh
npm install -g fsh-sushi
cd verktyg && npm ci && cd ..
node verktyg/ig-composer.mjs bygg         # alla IG:ar i beroendeordning
node verktyg/ig-composer.mjs matris       # matris.md: innehåll × federation
cd verktyg && npm test                    # verktygets tester
```

`bygg` gör för varje IG: `komponera` → `sushi build` → `efterbehandla`. Publika paket som andra IG:ar komponerar (konventionspaketet) byggs med `--snapshot` och installeras i den lokala FHIR-cachen så att de kan refereras. En enskild IG byggs fullt ut så här:

```sh
node verktyg/ig-composer.mjs komponera tjanster/npo
(cd tjanster/npo && sushi build .)
node verktyg/ig-composer.mjs efterbehandla tjanster/npo
(cd tjanster/npo && java -jar publisher.jar -ig . -no-sushi)
```

IG Publisher måste köras med `-no-sushi`, annars kör den SUSHI igen och efterbehandlingen försvinner.

## Konfiguration

Tre nivåer. Den mest specifika vinner.

1. **Globala regler** – [`konventioner/regler.yaml`](konventioner/regler.yaml).
2. **IG-nivå** – extensions på ImplementationGuide i `sushi-config.yaml`:

   ```yaml
   extension:
     - url: https://fhir.inera.se/ig/conventions/StructureDefinition/ig-roll
       valueCode: tjanst                 # byggblock | federation | tjanst | konvention
     - url: https://fhir.inera.se/ig/conventions/StructureDefinition/publicering
       valueCode: publik                 # intern | publik
     - url: https://fhir.inera.se/ig/conventions/StructureDefinition/komponerar
       extension:
         - url: paket
           valueString: inera.bb.patientoversikt
         - url: version
           valueString: 0.1.0
         # - url: inkludering           # överstyr global regel: kopiera | referera
         #   valueCode: referera
   ```

   En federation anger också sitt mönster med `federationsmonster` (`ruleset`, `profilprefix`).

3. **Artefaktnivå** – `* insert Kompositionsanvisning(#exkludera)` i en profil, aktör, CapabilityStatement eller Requirements.

Konfigurationen hamnar i den publicerade ImplementationGuide-resursen, så det går att se hur IG:n är komponerad.

## Regler som verktyget tillämpar

| Regel | Effekt |
|---|---|
| `inkludering` | Interna beroenden kopieras, publika refereras via `dependencies`. Verktyget kontrollerar att `dependencies` stämmer. |
| `kopiering.kanoniskOmskrivning` | Kopierade artefakter får mottagarens canonical; hårdkodade URL:er till källan skrivs om. |
| `kopiering.sparaUrsprung` | Varje kopierad definition får `kopierad-fran` = källans `url\|version`. |
| `kopiering.exempel` | Exempel från byggblock kopieras inte; tjänsten har egna som validerar mot tjänsteprofilerna. |
| `kopiering.ruleSetsAlltid` | RuleSets och alias kopieras även från refererade paket (FSH delar dem inte mellan paket). |
| `federation.genereraMonsterprofiler` | `<prefix><Resurstyp>` genereras från federationens RuleSet för varje resurstyp tjänsten exponerar. |
| `federation.basPaKopieradeProfiler` | Kopierade profiler som exponeras oförändrade får federationens profil som `Bas`. |
| `federation.basPaLokalaProfiler` | Lokala tjänsteprofiler måste själva ange `* insert Bas(...)` (fel eller varning). |
| `federation.tillatenYta` | Federationsmönstret får bara begränsa `meta` och `extension`, så att multipelt arv aldrig krockar på kliniska element. |
| `lager` | Byggblock får inte komponera federationer, federationer inte byggblock; en tjänst ligger i exakt en federation. |
| `aktorer.tjanstaktorKraver` | En tjänsteaktör måste härledas från både ett byggblock och federationen. |
| `aktorer.genereraFormagor` | `<Aktör>CS` genereras: `imports` av alla förfäders förmågor, plus tjänstens profiler per resurstyp. |
| `aktorer.genereraKrav` | `<Aktör>Krav` genereras med `derivedFrom` till förfädernas Requirements. |

## Multipelt arv

`* insert Bas(Profil)` är det enda stället där multipelt arv uttrycks. I dag blir det `imposeProfile` ur Extensions Pack, som valideraren kontrollerar. När multipelt arv tas upp officiellt i FHIR/FSH ändras bara RuleSet `Bas` i konventionspaketet.

Begränsning i dag: med `imposeProfile` ärvs inte tilläggsbasens slice-namn, så `extension[vardenhet]` går inte att använda i en instans av `VardkontaktNPO`. Federationen erbjuder därför alias (`$svod-vardenhet`) och RuleSet `SVODExempelmetadata` för exempel.

## Obligations och efterbehandling

Elementkrav per systemroll skrivs `* element insert Obligation(#SHALL:populate, Aktor)`. Två saker i dagens verktygskedja kräver hantering:

- **SUSHI:s mjuka index** (`[+]`) räknar inte med obligations som elementet ärver. En obligation i en härledd profil skriver då över den ärvda, och differentialen får med ärvda obligations som IG Publisher sedan dubblerar. `ig-composer efterbehandla` reducerar därför varje differential till profilens egna obligations efter SUSHI. (`Bas` har inte problemet; den adresserar `imposeProfile` via alias.)
- **Ärvda metadata-extensions.** SUSHI och IG Publisher kopierar profilnivåns extensions till härledda profiler. `kopierad-fran` och `kompositionsanvisning` gäller bara artefakten själv. Extension-definitionerna har därför `snapshot-behavior = ignore` (läses av IG Publisher), och efterbehandlingen tar bort dem ur SUSHI:s utdata.

## Validering

NPÖ har byggts med IG Publisher 3.0.1 (`-no-sushi` efter `komponera` → `sushi` → `efterbehandla`). Före kravmodellen: **0 fel, 48 varningar**. 23 av varningarna är `kopierad-fran` som pekar på interna byggblock som inte publiceras, vilket är väntat. Resten är vanliga för Ineras IG:ar: HSA-OID:n saknar definition, kanoniska länkar i Requirements-narrativ, bindningar i bas-FHIR och OID för terminologi. Obligations i snapshoten för Vårdkontakt NPÖ blir de ärvda (PSProducent, PSKonsument) plus den egna (NPOKallsystem).

Med kravmodell, förutsättningar och stödtjänster: NPÖ **6 fel, 120 varningar**, 1177 Journal **4 fel, 106 varningar**. Alla fel är samma mallfel, ett per ExampleScenario. IG-mallen `fhir2.base.template` lägger i `layout-examplescenario.html` en `<h4>` direkt under sidans `<h2>`, och IG Publishers kontroll av rubriknivåer (WCAG) räknar det som fel. Det går inte att rätta från en IG, utan mallen behöver rättas. Varningarna gäller nästan bara referenser som inte går att slå upp, och de är väntade:
- `kopierad-fran` mot interna byggblock;
- tjänstekatalogens profiler (`tk-endpoint`, `tk-api-instance`), eftersom IG:n Tjänstekatalogen inte är publicerad än;
- kanoniska länkar i narrativen för Requirements.

1177 Journal före kravmodellen: **0 fel, 62 varningar**, varav 32 är `kopierad-fran` mot interna byggblock. Resten är av samma slag som för NPÖ, plus IG Publishers rekommendation att labbsvar har `performer`.

## Utdata

För varje komponerad IG (allt genereras och är git-ignorerat):

- `input/fsh/_komponerat/` – kopierad FSH per källpaket och `_genererat.fsh` (federationsprofiler, förmågor, krav, ExampleScenario och Requirements från skissformatet).
- `input/pagecontent/komposition.md` – sidan *Komposition*: komponerade paket, exponerade profiler, **kravprofil per systemroll** (elementkrav längs arvskedja och baser, verksamhetskrav) och *vad kommer med var*.
- `komposition.json` – samma sak maskinläsbart, underlag för visualisering.
- `input/pagecontent/anvandningsfall.md` – sidan *Användningsfall* med sekvensdiagram (Mermaid) ur IG:ns ExampleScenario, genererad efter SUSHI.

## NPÖ och 1177 Journal

| | NPÖ | 1177 Journal |
|---|---|---|
| Federation | SVOD | Individuell tillgång |
| Domäner | Patientöversikt (+ Fasta kontakter) | Patientöversikt (+ Fasta kontakter), Labbsvar |
| Federationens krav per resurs | vårdenhet och vårdgivare (spärr), `meta.source` | säkerhetsetikett NOPAT i `meta.security` |
| Egna profiler | Vårdkontakt NPÖ (kontaktuppgift 1..1) | inga – domänernas profiler exponeras oförändrade med federationens bas |
| Tjänsteaktörer | källsystem, konsument | märkande källsystem, filtrerande källsystem, invånartjänst |

Federationen Individuell tillgång låter källsystemet antingen *märka* information som inte får visas för invånaren eller *filtrera bort* den. Det är två systemroller i federationen, och därför två källsystemsroller i 1177 Journal. Det märkande källsystemets kravprofil får obligation på `meta.security` och kravet IND-M-1, medan det filtrerande källsystemets profil i stället får IND-F-1. Båda importerar samma förmågor.

## De två specialfallen

- **Fasta kontakter** är ett internt byggblock som inte är en tjänst. Det kopieras in i Patientöversikt och vidare in i NPÖ med `kopierad-fran`. Aktören `FKProducent` finns kvar i kedjan, så NPÖ-källsystemets kravprofil visar FK:s krav.
- **Vårdkontakt NPÖ** skärper domänens Vårdkontakt (kontaktuppgift 1..1) och har SVOD:s metadata som ytterligare bas. Domänens Vårdkontakt exponeras då inte längre av tjänsten.

## Nästa steg

- Komponera från definitionsregistret (`--fran-register`) i stället för från arbetsytan.
- Studion: redigera alternativ i steg, profiler och förmågor; öppna en pull request direkt från studion.
- Dela upp i egna repon och lägg `ig-composer` som steg i `fhir-ig-workflows`.
- Loggåtkomst som byggblock i 1177 Journal, och journalanteckningar i båda tjänsterna.
- Registrera tjänsternas genererade specifikationer per informationsmängd (`kind=requirements`) i tjänstekatalogen.
- Läsadaptern mot fler miljöer (testmiljöer i WSO2 APIM), och ett skrivläge för testmiljöer där förutsättningarna får registreras.
- Riktiga åtkomstintyg: utfärdaren som anslutningspunkten anvisar, i stället för gatewayns token.
- Härleda konsumentroller ur katalogen (registrerade klienter) så att även konsumentsidan kan provas mot en realisering.
- Validera svaren mot profilerna (FHIR-valideraren) i federationstestet.
- Testskript: generera `TestScript` per system ur testlistan.
- Avlämningsyta: `ig-composer leverera` med låsfil, kanaler (utkast, kandidat, fastställd) och ändringsrapport per systemroll, så att ändringar inte slår igenom i tjänsterna direkt.
- Härleda tjänsternas förmågor ur scenariernas operationer, i stället för handskrivna förmågor i byggblocken.
- Täckning vidare mot test (`TestScript` per aktör) och drift (ändpunkter i tjänstekatalogen).
- Regel för kandidater att lyfta: samma skärpning i flera tjänster → lyft till byggblocket.
