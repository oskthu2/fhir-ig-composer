// Profilerna för Endpoint och API-instans (CapabilityStatement kind=instance)
// specificeras i IG:n Tjänstekatalogen och refereras här via URL.
Alias: $tk-endpoint = https://fhir.inera.se/ig/tjanstekatalog/StructureDefinition/tk-endpoint
Alias: $tk-api-instance = https://fhir.inera.se/ig/tjanstekatalog/StructureDefinition/tk-api-instance

Instance: Tjanstekatalog
InstanceOf: ActorDefinition
Usage: #definition
Title: "Tjänstekatalogen"
Description: "Nationell katalog över organisationers tekniska ändpunkter och de API-specifikationer deras API:er följer."
* insert Stodtjanst
* name = "Tjanstekatalog"
* title = "Tjänstekatalogen"
* status = #draft
* type = #system
* capabilities = Canonical(TjanstekatalogCS)

Instance: TjanstekatalogRegistrerare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Tjänstekatalogen: registrerare"
Description: "System som registrerar sina ändpunkter och API-instanser i tjänstekatalogen."
* name = "TjanstekatalogRegistrerare"
* title = "Tjänstekatalogen: registrerare"
* status = #draft
* type = #system
* capabilities = Canonical(TjanstekatalogRegistrerareCS)

Instance: TjanstekatalogCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Tjänstekatalogen"
Description: "Tjänstekatalogens administrativa API, så som kompositionen behöver det."
* name = "TjanstekatalogCS"
* title = "Förmågor: Tjänstekatalogen"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].documentation = "Administrativt API enligt IG:n Tjänstekatalogen."
* rest[=].resource[0].type = #Endpoint
* rest[=].resource[=].profile = $tk-endpoint
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #update
* rest[=].resource[=].interaction[+].code = #search-type
* rest[=].resource[+].type = #CapabilityStatement
* rest[=].resource[=].profile = $tk-api-instance
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #update
* rest[=].resource[=].interaction[+].code = #search-type

Instance: TjanstekatalogRegistrerareCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Tjänstekatalogen, registrerare"
Description: "Det en registrerare behöver kunna mot tjänstekatalogen."
* name = "TjanstekatalogRegistrerareCS"
* title = "Förmågor: Tjänstekatalogen, registrerare"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[0].type = #Endpoint
* rest[=].resource[=].profile = $tk-endpoint
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #update
* rest[=].resource[+].type = #CapabilityStatement
* rest[=].resource[=].profile = $tk-api-instance
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #update
