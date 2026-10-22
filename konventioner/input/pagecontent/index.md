### Kompositionskonventioner

Detta paket definierar hur Ineras IG:ar komponeras av återanvändbara delar. Det är en förutsättning för verktyget `ig-composer` och refereras av alla IG:ar som komponeras.

#### Roller

| Roll | Innehåll | Får komponera |
|---|---|---|
| `byggblock` | Kliniskt innehåll: profiler, terminologi, aktörer, förmågor | byggblock |
| `federation` | Juridiskt utrymme: säkerhetsmetadata, stödtjänster, infrastrukturkrav. Begränsar bara `meta` och `extension`. | federation, stödtjänst |
| `stodtjanst` | Infrastrukturtjänst med eget API som federationer bygger på, t.ex. tjänstekatalogen | stödtjänst |
| `tjanst` | En cell i matrisen federation × domän. Publiceras. | byggblock, exakt en federation |
| `konvention` | Detta paket | – |

Alla roller får dessutom komponera konventionspaketet.

#### Konfiguration

Konfiguration sker på tre nivåer, där den mest specifika vinner:

1. **Globala regler** – `regler.yaml` i detta paket.
2. **IG-nivå** – extensions på ImplementationGuide: [ig-roll](StructureDefinition-ig-roll.html), [publicering](StructureDefinition-publicering.html), [komponerar](StructureDefinition-komponerar.html), [federationsmonster](StructureDefinition-federationsmonster.html).
3. **Artefaktnivå** – `* insert Kompositionsanvisning(#exkludera)` som sätter [kompositionsanvisning](StructureDefinition-kompositionsanvisning.html).

#### RuleSets

| RuleSet | Syfte |
|---|---|
| `Bas(profil)` | Multipelt arv: profilen blir ytterligare bas utöver `Parent`. I dag `imposeProfile`; byts när FHIR/FSH får officiellt stöd. |
| `Obligation(kod, aktor)` | Elementkrav per systemroll, t.ex. `* period insert Obligation(#SHALL:populate, PSProducent)`. |
| `Kompositionsanvisning(inkludering)` | Överstyr inkludering för en artefakt. |
| `KopieradFran(url)`, `KopieradFranInstans(url)` | Sätts av verktyget på kopierade definitioner. |

#### Kravmodell

Användningsfall och delflöden skrivs i ett skissformat (`input/scenarier/*.yaml`) och kompileras av `ig-composer` till `ExampleScenario` och `Requirements`.

| Begrepp | FHIR | Konvention |
|---|---|---|
| Aktör (person eller system) | `ActorDefinition` | [scenario-aktor](StructureDefinition-scenario-aktor.html) binder scenarioaktören till sina roller |
| Informationsbehov | Logisk modell (`StructureDefinition` kind=logical) | [informationsbehov](StructureDefinition-informationsbehov.html) på scenarioinstansen |
| Harmonisering | Profil | `* insert Realiserar(Informationsbehov)` sätter [realiserar](StructureDefinition-realiserar.html) |
| Användningsfall, scenario, delflöde | `ExampleScenario` (processer, steg, alternativ, `step.workflow`) | |
| Invävning | Federationens [flödesmönster](StructureDefinition-flodesmonster.html) | Invävda steg får [invavd-av](StructureDefinition-invavd-av.html) |
| Urval i en tjänst | [anvandningsfall](StructureDefinition-anvandningsfall.html) på ImplementationGuide | |
| Förutsättning för en federation | [forutsattning](StructureDefinition-forutsattning.html) på federationens ImplementationGuide | Ingår i varje tjänst i federationen |
| Inkludera ett användningsfall i ett annat | `inkludera:` i skissformatet, med `roller:` som binder aktörerna | Blir `step.workflow` |
| Krav per deltagande aktör | `Requirements` med `satisfiedBy` till profil och förmåga | |
