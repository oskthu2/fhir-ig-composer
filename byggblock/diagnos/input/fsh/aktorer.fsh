Instance: DiagProducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Diagnos: producent"
Description: "Källsystem som tillhandahåller patientens diagnoser."
* name = "DiagProducent"
* title = "Diagnos: producent"
* status = #draft
* type = #system
* capabilities = Canonical(DiagProducentCS)

Instance: DiagKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Diagnos: konsument"
Description: "System som visar patientens diagnoser."
* name = "DiagKonsument"
* title = "Diagnos: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(DiagKonsumentCS)

Instance: DiagLasare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Den som tar del av diagnoser"
Description: "Vårdpersonal eller invånare som tar del av diagnoserna."
* name = "DiagLasare"
* title = "Den som tar del av diagnoser"
* status = #draft
* type = #person

Instance: DiagProducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Diagnos, producent"
Description: "Patientavgränsad sökning på diagnoser."
* name = "DiagProducentCS"
* title = "Förmågor: Diagnos, producent"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[+].type = #Condition
* rest[=].resource[=].profile = Canonical(Diagnos)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "category"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[=].searchParam[+].name = "recorded-date"
* rest[=].resource[=].searchParam[=].type = #date

Instance: DiagKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Diagnos, konsument"
Description: "Konsumenten söker patientens diagnoser."
* name = "DiagKonsumentCS"
* title = "Förmågor: Diagnos, konsument"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #Condition
* rest[=].resource[=].profile = Canonical(Diagnos)
* rest[=].resource[=].interaction[0].code = #search-type

Instance: DiagKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Diagnos"
Description: "Verksamhetskrav på producent av diagnoser."
* name = "DiagKrav"
* title = "Krav: Diagnos"
* status = #draft
* actor[0] = Canonical(DiagProducent)
* statement[0].key = "DIAG-1"
* statement[=].label = "Diagnostyp"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Producenten SKA ange om diagnosen är huvuddiagnos eller bidiagnos."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-diagnos/StructureDefinition/diagnos"
* statement[+].key = "DIAG-2"
* statement[=].label = "Kodverk"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "En kodad diagnos SKA anges med ICD-10-SE; en okodad med fritext."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-diagnos/StructureDefinition/diagnos"
* statement[+].key = "DIAG-3"
* statement[=].label = "Bekräftade diagnoser"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Producenten SKA bara tillhandahålla journalförda, bekräftade diagnoser."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-diagnos/StructureDefinition/diagnos"
