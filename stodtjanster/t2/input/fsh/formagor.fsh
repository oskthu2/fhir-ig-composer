// ---------------------------------------------------------------- stödtjänsternas kravbilder

Instance: TjanstekatalogCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Tjänstekatalogen"
Description: "Motsvarar Katalogtjänsters tjanstekatalog-api, plus registrering (create/update) som kompositionen behöver."
* name = "TjanstekatalogCS"
* title = "Förmågor: Tjänstekatalogen"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* instantiates[0] = "https://fhir.inera.se/ig/katalogtjanster/CapabilityStatement/tjanstekatalog-api|0.2.0"
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].security.service[0] = http://terminology.hl7.org/CodeSystem/restful-security-service#OAuth
* rest[=].resource[0].type = #Endpoint
* rest[=].resource[=].profile = $katalog-anslutningspunkt
* rest[=].resource[=].interaction[0].code = #read
* rest[=].resource[=].interaction[+].code = #search-type
* rest[=].resource[=].interaction[+].code = #create
* rest[=].resource[=].interaction[+].code = #update
* rest[=].resource[=].searchParam[0].name = "organization"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "status"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[=].searchParam[+].name = "connection-type"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[=].searchParam[+].name = "implements"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[+].type = #CapabilityStatement
* rest[=].resource[=].profile = $katalog-tjansteinstans
* rest[=].resource[=].interaction[0].code = #read
* rest[=].resource[=].interaction[+].code = #search-type
* rest[=].resource[=].interaction[+].code = #create
* rest[=].resource[=].interaction[+].code = #update
* rest[=].resource[=].searchParam[0].name = "url"
* rest[=].resource[=].searchParam[=].type = #uri

Instance: FederationsmedlemskatalogCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Federationsmedlemskatalogen"
Description: "Motsvarar Katalogtjänsters fed-katalog-api, plus registrering som kompositionen behöver."
* name = "FederationsmedlemskatalogCS"
* title = "Förmågor: Federationsmedlemskatalogen"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* instantiates[0] = "https://fhir.inera.se/ig/katalogtjanster/CapabilityStatement/fed-katalog-api|0.2.0"
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].security.service[0] = http://terminology.hl7.org/CodeSystem/restful-security-service#OAuth
* rest[=].resource[0].type = #Organization
* rest[=].resource[=].profile = $katalog-medlem
* rest[=].resource[=].interaction[0].code = #read
* rest[=].resource[=].interaction[+].code = #search-type
* rest[=].resource[=].interaction[+].code = #create
* rest[=].resource[=].searchParam[0].name = "identifier"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[=].searchParam[+].name = "active"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[+].type = #OrganizationAffiliation
* rest[=].resource[=].profile = $katalog-medlemskap
* rest[=].resource[=].interaction[0].code = #read
* rest[=].resource[=].interaction[+].code = #search-type
* rest[=].resource[=].interaction[+].code = #create
* rest[=].resource[=].searchParam[0].name = "participating-organization"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "primary-organization"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "role"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[=].searchParam[+].name = "active"
* rest[=].resource[=].searchParam[=].type = #token

Instance: EngagemangsindexCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Engagemangsindexet"
Description: "Motsvarar Katalogtjänsters engagemangsindex-api, plus producenternas push (create)."
* name = "EngagemangsindexCS"
* title = "Förmågor: Engagemangsindexet"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* instantiates[0] = "https://fhir.inera.se/ig/katalogtjanster/CapabilityStatement/engagemangsindex-api|0.2.0"
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].security.service[0] = http://terminology.hl7.org/CodeSystem/restful-security-service#OAuth
* rest[=].resource[0].type = #EpisodeOfCare
* rest[=].resource[=].profile = $engagemang-minimal
* rest[=].resource[=].interaction[0].code = #read
* rest[=].resource[=].interaction[+].code = #search-type
* rest[=].resource[=].interaction[+].code = #create
* rest[=].resource[=].searchParam[0].name = "patient-identifier"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[=].searchParam[+].name = "status"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[=].searchParam[+].name = "organization-identifier"
* rest[=].resource[=].searchParam[=].type = #token

// ---------------------------------------------------------------- deltagarnas kravbilder

Instance: TjanstekatalogRegistrerareCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: T2, registrerare"
Description: "Det en registrerare behöver kunna mot tjänstekatalogen."
* name = "TjanstekatalogRegistrerareCS"
* title = "Förmågor: T2, registrerare"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[0].type = #Endpoint
* rest[=].resource[=].profile = $katalog-anslutningspunkt
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #update
* rest[=].resource[+].type = #CapabilityStatement
* rest[=].resource[=].profile = $katalog-tjansteinstans
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #update

Instance: T2KonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: T2, konsument"
Description: "Tjänstesökning (T1) och medlemsverifiering (F1)."
* name = "T2KonsumentCS"
* title = "Förmågor: T2, konsument"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[0].type = #Endpoint
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[+].type = #OrganizationAffiliation
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[+].type = #EpisodeOfCare
* rest[=].resource[=].interaction[0].code = #search-type

Instance: EngagemangsproducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: T2, engagemangsproducent"
Description: "Push av engagemang till engagemangsindexet."
* name = "EngagemangsproducentCS"
* title = "Förmågor: T2, engagemangsproducent"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[0].type = #EpisodeOfCare
* rest[=].resource[=].profile = $engagemang-minimal
* rest[=].resource[=].interaction[0].code = #create

Instance: FederationsoperatorCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: T2, federationsoperatör"
Description: "Registrering av medlemmar och medlemskap."
* name = "FederationsoperatorCS"
* title = "Förmågor: T2, federationsoperatör"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[0].type = #Organization
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[+].type = #OrganizationAffiliation
* rest[=].resource[=].interaction[0].code = #create
