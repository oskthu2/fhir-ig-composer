# fhir-ig-composer

[![Bygg och testa](https://github.com/oskthu2/fhir-ig-composer/actions/workflows/bygg.yml/badge.svg)](https://github.com/oskthu2/fhir-ig-composer/actions/workflows/bygg.yml)

Komposition av FHIR-IG:ar – prototyp.

Prototyp för att komponera Ineras IG:ar av återanvändbara delar: **byggblock** (kliniskt innehåll), **federationer** (juridiskt utrymme, säkerhetsmetadata och stödtjänster) och **tjänster** (en cell i matrisen federation × domän). Kraven på ett system härleds från de **systemroller** (R5 `ActorDefinition`) som det antar.

Allt är FHIR R5. Arv uttrycks med FHIR:s egna mekanismer (`Parent`, `imposeProfile`, `ActorDefinition.derivedFrom`, `CapabilityStatement.imports`, `Requirements.derivedFrom`, obligations). Det som FHIR inte täcker – kopiering av interna byggblock, RuleSets och federationsmönster – sköts av verktyget `ig-composer` enligt globala regler och extensions på IG:ar och artefakter.

Tjänster i prototypen:

| | Patientöversikt | Labbsvar |
|---|---|---|
| **SVOD** | NPÖ | *kandidat* |
| **Individuell tillgång** | 1177 Journal | 1177 Journal |

(`node verktyg/ig-composer.mjs matris` tar fram matrisen ur IG:arna.)

## Kravmodell: användningsfall, scenarier och spårbarhet

Kravmodellen följer kedjan i ISO/TR 19669: från kravspecifikation (användningsfall, scenarier, informationsbehov) via harmonisering (profiler, förmågor) till det som en tjänst publicerar och en ändpunkt i drift implementerar. Allt uttrycks i FHIR R5:

| Begrepp | FHIR | Var |
|---|---|---|
| Aktör, person eller system | `ActorDefinition` | Byggblock och federationer |
| Informationsbehov | Logisk modell (`Logical`) | Byggblock (i verkligheten från informationsunderlaget) |
| Harmonisering | `* insert Realiserar(Informationsbehov)` på profilen | Byggblock och tjänster |
| Användningsfall och delflöde | `ExampleScenario`, kompilerat från skissformatet | `input/scenarier/*.yaml` |
| Stödtjänst | `ActorDefinition` + förmågor i federationen | Federationer |
| Invävning | Federationens extension `flodesmonster` | Federationer |
| Urval | Extension `anvandningsfall` på tjänstens IG | Tjänster |
| Krav per deltagande aktör | `Requirements`, en sats per steg, `satisfiedBy` till profil och förmåga | Genereras |

Ett användningsfall skrivs i skissformatet, utan FSH:

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
    fran: journal
    till: kalla
    operation: search-type
    hamtar: vardkontakt
    alternativ:
      - titel: Källsystemet svarar inte
        steg: [ ... ]
```

En federation väver in delflöden (också skrivna i skissformatet) före och efter steg med vissa operationer. SVOD väver in *Verifiera patientrelation* före första hämtningen och *Tillämpa spärr och logga åtkomst* efter varje hämtning. Ett delflödes aktör med `binder: fran` är samma deltagare som avsändaren i steget som delflödet vävs in vid. Aktören får då båda rollerna, till exempel PSKonsument + SVODKonsument, och tjänsten måste ha en tjänsteaktör som spelar båda.

`ig-composer` gör för varje IG:

1. **Kompilerar** de valda användningsfallen och de delflöden som används till `ExampleScenario`. Invävda steg blir `step.workflow` med `invavd-av`.
2. **Harmoniserar** varje informationsbehov till den profil som realiserar det, helst en exponerad profil.
3. **Binder** scenarioaktörer till roller och, i en tjänst, till den tjänsteaktör som spelar dem.
4. **Genererar** `Requirements` per användningsfall och deltagande systemaktör: en sats per steg, med `satisfiedBy` till profilen och aktörens förmåga, och `reference` till scenariot. Kraven hamnar i kravprofilen för tjänsteaktörerna.
5. **Kontrollerar täckningen** (regler `scenarier.tackning`):
   - rollen finns som ActorDefinition;
   - informationsbehovet finns och har en profil;
   - en tjänsteaktör spelar varje systemaktör;
   - avsändare och mottagare har interaktionen i sina förmågor.

I matrisvyn har varje tjänst och byggblock fliken **Användningsfall** med sekvensdiagram (invävda steg markerade), spårbarhet från kravsats till profil och förmåga, och täckning.

Kedjan i FHIR: `ExampleScenario` → `Requirements` (per aktör) → `satisfiedBy` profil och `CapabilityStatement` → tjänsteaktör (`ActorDefinition.derivedFrom`) → i tjänstekatalogen `TKAPIInstance.instantiates` → ändpunkt.

## Förutsättningar och stödtjänster

Att delta i en federation är också användningsfall. En federation anger dem med extensionen `forutsattning`, och de ingår automatiskt i varje tjänst i federationen:

| Federation | Förutsättning | Innehåll |
|---|---|---|
| SVOD | Ansluta källsystem till SVOD | inkluderar *Registrera ändpunkt och API-instanser i tjänstekatalogen*, anmäla patienter till patientindex |
| SVOD | Ansluta konsument till SVOD | prenumerera på ny data |
| Individuell tillgång | Ansluta källsystem för individuell tillgång | inkluderar registreringen; invånartjänsten hämtar källsystemets CapabilityStatement |

**Stödtjänster** (`ig-roll = stodtjanst`) är infrastrukturtjänster med eget API som federationerna bygger på. Tjänstekatalogen är den första. Den har aktörerna `Tjanstekatalog` och `TjanstekatalogRegistrerare` och användningsfallet `RegistreraAndpunkt`. Federationernas källsystemsroller härleds från registreraren, så varje tjänsts källsystem får kravet att registrera sig. Aktörer som tillhandahålls av en federation eller stödtjänst (katalog, patientindex, loggtjänst …) markeras med `* insert Stodtjanst` och spelas inte av tjänsternas system.

I skissformatet kan ett användningsfall **inkludera** ett annat:

```yaml
steg:
  - inkludera: RegistreraAndpunkt
    roller: { registrerare: kalla, katalog: katalog }
```

Den inkluderade aktören binds till en aktör i det inkluderande fallet, som då spelar båda rollerna. I FHIR blir det `step.workflow`.

Förmågor läses och genereras per `rest`-block, alltså per läge. Ett källsystem är server för kliniskt innehåll men klient mot tjänstekatalogen och patientindex. Täckningskontrollen kräver interaktionen som klient hos avsändaren och som server hos mottagaren.

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
nulage:
  formaga: nulage/journalx-metadata.json          # CapabilityStatement kind=instance (GET [bas]/metadata)
  anslutningar: nulage/tjanstekatalog-export.json # API-instanser (TKAPIInstance) från tjänstekatalogen
```

`ig-composer system` (efter `bygg`) tar fram följande per system, och skriver `rapport/<system>.md`:

- **Summan av API-krav** per läge och resurstyp, över alla roller. Interaktioner, sökparametrar och profiler kommer från tjänsteaktörernas förmågor och allt de importerar. Den mest specifika profilen räcker: `VardkontaktNPO` ersätter NPÖ:s `Vardkontakt`. Samma profil i två tjänster (samma `kopierad-fran`) visas som en profil med två kanoniska URL:er, och systemet måste ange båda.
- **Elementkrav, verksamhetskrav och scenariosteg** som systemet deltar i, inklusive förutsättningarna.
- **Gap mot nuläget:** saknade resurstyper, interaktioner, sökparametrar och profiler i systemets CapabilityStatement.
- **Anslutningar:** en roll som härleds från registreraren förväntas ha en API-instans i tjänstekatalogen som följer tjänstens API-specifikation (`url|version`). Status: registrerad, annan version eller saknas.
- **Testlista:** varje krav en gång, med de roller som ställer det. API-krav och anslutningar får status från nuläget, övriga krav är manuella.

I matrisvyn finns systemen under **System**. Välj vilka av systemets roller som ska summeras, så räknas kraven, gapet och testlistan om. API-kraven kan grupperas per resurstyp, roll eller status, och testlistan kan laddas ner.

Exempelsystemen visar olika lägen:
- **Journalsystem X:** CareTeam saknas som server; sökparametern `date` och 1177:s Vårdkontakt-profil saknas; Subscription saknas; registreringen för 1177 gäller en äldre version.
- **1177 invånarplattform:** inga gap.
- **Labbsystem L:** inget nuläge inlämnat, så API-gapet är okänt, och registreringen saknas.

## Interaktiv matrisvy

```sh
node verktyg/ig-composer.mjs bygg   # skriver komposition.json i varje IG
node verktyg/ig-composer.mjs vy     # skriver vy.html
```

`vy.html` är en fristående sida (ingen server, inga externa beroenden) som läser in alla IG:ars `komposition.json`. CI laddar upp den som byggartefakten *matrisvy*. I vyn kan man:

- klicka på en **tjänst** i matrisen för dess kravprofiler per systemroll (härledning, förmågor, elementkrav filtrerbara per aktör med egen/ärvd/bas-härkomst, verksamhetskrav), vad som kommer med varifrån, exponerade profiler, komponerade paket och diagnostik;
- klicka på en **domän, federation eller ett byggblock** för var det används (direkt eller via andra byggblock) och vilka av dess artefakter som finns i vilka IG:ar – underlag för konsekvensanalys vid versionsbyte;
- **söka** efter en artefakt, aktör eller ett paket och se alla IG:ar där den finns, med läge (lokal, kopierad, genererad, refererad, utelämnat) och kedja.

Valet ligger i adressens `#`-del, så en länk till en vy går att dela.

```
.
├── konventioner/              inera.build.conventions  (konvention, publik)
│   └── regler.yaml            globala kompositionsregler
├── byggblock/
│   ├── fastakontakter/        inera.bb.fastakontakter  (byggblock, intern)
│   ├── patientoversikt/       inera.bb.patientoversikt (byggblock, intern) – komponerar Fasta kontakter
│   └── labbsvar/              inera.bb.labbsvar        (byggblock, intern)
├── federationer/
│   ├── svod/                  inera.fed.svod           (federation, intern)  – komponerar Tjänstekatalogen
│   └── individuell/           inera.fed.individuell    (federation, intern)  – komponerar Tjänstekatalogen
├── stodtjanster/
│   └── katalog/               inera.st.katalog         (stödtjänst, intern)
├── tjanster/
│   ├── npo/                   inera.tjanst.npo         (tjänst, publik)   – SVOD × Patientöversikt
│   └── journal1177/           inera.tjanst.journal1177 (tjänst, publik)   – Individuell tillgång × (Patientöversikt + Labbsvar)
├── system/                    konkreta system: roller de antar, ändpunkter och nuläge
│   └── nulage/                CapabilityStatement (kind=instance) och export från tjänstekatalogen
└── verktyg/                   ig-composer (Node ≥ 20)
```

Varje katalog utom `verktyg/` är en egen IG. Här är **verktyget och konventionerna** hemma. Byggblock, federationer och tjänster ligger i samma repo så länge det är en prototyp, så att allt går att bygga från början till slut. Längre fram kan de bli egna repon (skapade från `IneraFHIRTemplate`) som komponeras hit via arbetsytan.

Historiken är flyttad från `komposition/` på branchen `claude/trusting-ritchie-k22m87` i `Inera-AB/IneraFHIRTemplate`.

## Bygga

CI (`.github/workflows/bygg.yml`) kör samma sak vid varje push och pull request: verktygets tester, `bygg` för alla IG:ar och `matris`.

```sh
npm install -g fsh-sushi
cd verktyg && npm ci && cd ..
node verktyg/ig-composer.mjs bygg         # alla IG:ar i beroendeordning
node verktyg/ig-composer.mjs matris       # matris.md: federation × domän
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

- Dela upp i egna repon och lägg `ig-composer` som steg i `fhir-ig-workflows`.
- Loggåtkomst som byggblock i 1177 Journal, och journalanteckningar i båda tjänsterna.
- Registrera genererade `<Aktör>CS` som `TKAPISpecificationCapability` i tjänstekatalogen.
- Hämta nuläget direkt: läs `GET [bas]/metadata` och tjänstekatalogens sök-API i stället för filer.
- Testskript: generera `TestScript` per system ur testlistan.
- Avlämningsyta: `ig-composer leverera` med låsfil, kanaler (utkast, kandidat, fastställd) och ändringsrapport per systemroll, så att ändringar inte slår igenom i tjänsterna direkt.
- Härleda tjänsternas förmågor ur scenariernas operationer, i stället för handskrivna förmågor i byggblocken.
- Täckning vidare mot test (`TestScript` per aktör) och drift (ändpunkter i tjänstekatalogen).
- Regel för kandidater att lyfta: samma skärpning i flera tjänster → lyft till byggblocket.
