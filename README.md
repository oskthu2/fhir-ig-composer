# Komposition av IG:ar – prototyp

Prototyp för att komponera Ineras IG:ar av återanvändbara delar: **byggblock** (kliniskt innehåll), **federationer** (juridiskt utrymme, säkerhetsmetadata och stödtjänster) och **tjänster** (en cell i matrisen federation × domän). Kraven på ett system härleds från de **systemroller** (R5 `ActorDefinition`) som det antar.

Allt är FHIR R5. Arv uttrycks med FHIR:s egna mekanismer (`Parent`, `imposeProfile`, `ActorDefinition.derivedFrom`, `CapabilityStatement.imports`, `Requirements.derivedFrom`, obligations). Det som FHIR inte täcker – kopiering av interna byggblock, RuleSets och federationsmönster – sköts av verktyget `ig-compose` enligt globala regler och extensions på IG:ar och artefakter.

Tjänster i prototypen:

| | Patientöversikt | Labbsvar |
|---|---|---|
| **SVOD** | NPÖ | *kandidat* |
| **Individuell tillgång** | 1177 Journal | 1177 Journal |

(`node verktyg/ig-compose.mjs matris` tar fram matrisen ur IG:arna.)

```
komposition/
├── konventioner/              inera.build.conventions  (konvention, publik)
│   └── regler.yaml            globala kompositionsregler
├── byggblock/
│   ├── fastakontakter/        inera.bb.fastakontakter  (byggblock, intern)
│   ├── patientoversikt/       inera.bb.patientoversikt (byggblock, intern) – komponerar Fasta kontakter
│   └── labbsvar/              inera.bb.labbsvar        (byggblock, intern)
├── federationer/
│   ├── svod/                  inera.fed.svod           (federation, intern)
│   └── individuell/           inera.fed.individuell    (federation, intern)
├── tjanster/
│   ├── npo/                   inera.tjanst.npo         (tjänst, publik)   – SVOD × Patientöversikt
│   └── journal1177/           inera.tjanst.journal1177 (tjänst, publik)   – Individuell tillgång × (Patientöversikt + Labbsvar)
└── verktyg/                   ig-compose (Node ≥ 20)
```

Katalogerna är egna IG:ar och är tänkta att bli egna repon (byggblock och federationer från `IneraFHIRTemplate`, verktyget i mallen eller i `fhir-ig-workflows`). De ligger i samma katalog här för att prototypen ska gå att bygga från början till slut.

## Bygga

```sh
npm install -g fsh-sushi
cd komposition/verktyg && npm ci && cd ..
node verktyg/ig-compose.mjs bygg          # alla IG:ar i beroendeordning
node verktyg/ig-compose.mjs matris        # matris.md: federation × domän
cd verktyg && npm test                    # verktygets tester
```

`bygg` gör för varje IG: `komponera` → `sushi build` → `efterbehandla`. Publika paket som andra IG:ar komponerar (konventionspaketet) byggs med `--snapshot` och installeras i den lokala FHIR-cachen så att de kan refereras. En enskild IG byggs fullt ut så här:

```sh
node verktyg/ig-compose.mjs komponera tjanster/npo
(cd tjanster/npo && sushi build .)
node verktyg/ig-compose.mjs efterbehandla tjanster/npo
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

- **SUSHI:s mjuka index** (`[+]`) räknar inte med obligations som elementet ärver. En obligation i en härledd profil skriver då över den ärvda, och differentialen får med ärvda obligations som IG Publisher sedan dubblerar. `ig-compose efterbehandla` reducerar därför varje differential till profilens egna obligations efter SUSHI. (`Bas` har inte problemet; den adresserar `imposeProfile` via alias.)
- **Ärvda metadata-extensions.** SUSHI och IG Publisher kopierar profilnivåns extensions till härledda profiler. `kopierad-fran` och `kompositionsanvisning` gäller bara artefakten själv. Extension-definitionerna har därför `snapshot-behavior = ignore` (läses av IG Publisher), och efterbehandlingen tar bort dem ur SUSHI:s utdata.

## Validering

NPÖ har byggts med IG Publisher 3.0.1 (`-no-sushi` efter `komponera` → `sushi` → `efterbehandla`): **0 fel, 48 varningar**. 23 av varningarna är `kopierad-fran` som pekar på interna byggblock som inte publiceras, vilket är väntat. Resten är vanliga för Ineras IG:ar: HSA-OID:n saknar definition, kanoniska länkar i Requirements-narrativ, bindningar i bas-FHIR och OID för terminologi. Obligations i snapshoten för Vårdkontakt NPÖ blir de ärvda (PSProducent, PSKonsument) plus den egna (NPOKallsystem).

1177 Journal: **0 fel, 62 varningar**, varav 32 är `kopierad-fran` mot interna byggblock. Resten är av samma slag som för NPÖ, plus IG Publishers rekommendation att labbsvar har `performer`.

## Utdata

För varje komponerad IG (allt genereras och är git-ignorerat):

- `input/fsh/_komponerat/` – kopierad FSH per källpaket och `_genererat.fsh` (federationsprofiler, förmågor, krav).
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

- Dela upp i egna repon och lägg `ig-compose` som steg i `fhir-ig-workflows`.
- Loggåtkomst som byggblock i 1177 Journal, och journalanteckningar i båda tjänsterna.
- Registrera genererade `<Aktör>CS` som `TKAPISpecificationCapability` i tjänstekatalogen.
- Interaktiv matrisvy från `komposition.json` som kan skriva tillbaka extensions som pull requests.
- Regel för kandidater att lyfta: samma skärpning i flera tjänster → lyft till byggblocket.
