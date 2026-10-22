// Stödtjänsternas profiler specificeras i IG:n Katalogtjänster och refereras
// via URL. Kravbilderna anger med instantiates vilken specifikation i
// Katalogtjänster de motsvarar; ig-composer jämför dem med ögonblicksbilder
// i externa/ och live mot en T2-federation.
Alias: $katalog-anslutningspunkt = https://fhir.inera.se/ig/katalogtjanster/StructureDefinition/katalog-anslutningspunkt
Alias: $katalog-tjansteinstans = https://fhir.inera.se/ig/katalogtjanster/StructureDefinition/katalog-tjansteinstans
Alias: $katalog-medlem = https://fhir.inera.se/ig/katalogtjanster/StructureDefinition/katalog-medlem
Alias: $katalog-medlemskap = https://fhir.inera.se/ig/katalogtjanster/StructureDefinition/katalog-medlemskap
Alias: $engagemang-minimal = https://fhir.inera.se/ig/katalogtjanster/StructureDefinition/engagemang-minimal

// ---------------------------------------------------------------- stödtjänster

Instance: Tjanstekatalog
InstanceOf: ActorDefinition
Usage: #definition
Title: "Tjänstekatalogen"
Description: "Specifikationer, anslutningspunkter och tjänsteinstanser. Svarar på tjänstesökningen (T1)."
* insert Stodtjanst
* name = "Tjanstekatalog"
* title = "Tjänstekatalogen"
* status = #draft
* type = #system
* capabilities = Canonical(TjanstekatalogCS)

Instance: Federationsmedlemskatalog
InstanceOf: ActorDefinition
Usage: #definition
Title: "Federationsmedlemskatalogen"
Description: "Federationerna, deras medlemmar och medlemskap. Svarar på medlemsverifieringen (F1)."
* insert Stodtjanst
* name = "Federationsmedlemskatalog"
* title = "Federationsmedlemskatalogen"
* status = #draft
* type = #system
* capabilities = Canonical(FederationsmedlemskatalogCS)

Instance: Engagemangsindex
InstanceOf: ActorDefinition
Usage: #definition
Title: "Engagemangsindexet"
Description: "Vem har information om patienten: engagemang per patient och producent, pushade av producenterna. En optimering, aldrig en sanningskälla."
* insert Stodtjanst
* name = "Engagemangsindex"
* title = "Engagemangsindexet"
* status = #draft
* type = #system
* capabilities = Canonical(EngagemangsindexCS)

Instance: Atkomstintygstjanst
InstanceOf: ActorDefinition
Usage: #definition
Title: "Åtkomstintygstjänsten"
Description: "Utfärdar åtkomstintyg (OAuth 2.0, client credentials). Anslutningspunkten anvisar utfärdaren med extensionen atkomstintygsutfardare."
* insert Stodtjanst
* name = "Atkomstintygstjanst"
* title = "Åtkomstintygstjänsten"
* status = #draft
* type = #system

// ---------------------------------------------------------------- deltagarroller

Instance: TjanstekatalogRegistrerare
InstanceOf: ActorDefinition
Usage: #definition
Title: "T2: registrerare"
Description: "System som registrerar sin anslutningspunkt (med de specifikationer den implementerar) och sina tjänsteinstanser i tjänstekatalogen."
* name = "TjanstekatalogRegistrerare"
* title = "T2: registrerare"
* status = #draft
* type = #system
* capabilities = Canonical(TjanstekatalogRegistrerareCS)

Instance: T2Konsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "T2: konsument"
Description: "System som slår upp producenter i tjänstekatalogen (T1), verifierar deras medlemskap (F1) och hämtar åtkomstintyg före anrop."
* name = "T2Konsument"
* title = "T2: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(T2KonsumentCS)

Instance: Engagemangsproducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "T2: engagemangsproducent"
Description: "Producent som deklarerar engagemangsindexerad och pushar sina engagemang till engagemangsindexet."
* name = "Engagemangsproducent"
* title = "T2: engagemangsproducent"
* status = #draft
* type = #system
* capabilities = Canonical(EngagemangsproducentCS)

Instance: Federationsoperator
InstanceOf: ActorDefinition
Usage: #definition
Title: "T2: federationsoperatör"
Description: "Den som förvaltar en federation och registrerar medlemskap i federationsmedlemskatalogen."
* insert Stodtjanst
* name = "Federationsoperator"
* title = "T2: federationsoperatör"
* status = #draft
* type = #system
* capabilities = Canonical(FederationsoperatorCS)

Instance: Federationsmedlem
InstanceOf: ActorDefinition
Usage: #definition
Title: "T2: federationsmedlem"
Description: "Organisation som ansöker om och har medlemskap i en federation."
* name = "Federationsmedlem"
* title = "T2: federationsmedlem"
* status = #draft
* type = #system
