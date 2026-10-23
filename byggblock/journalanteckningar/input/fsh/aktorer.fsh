Instance: AntProducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Journalanteckningar: producent"
Description: "Källsystem som tillhandahåller signerade journalanteckningar."
* name = "AntProducent"
* title = "Journalanteckningar: producent"
* status = #draft
* type = #system
* capabilities = Canonical(AntProducentCS)

Instance: AntKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Journalanteckningar: konsument"
Description: "System som visar journalanteckningar."
* name = "AntKonsument"
* title = "Journalanteckningar: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(AntKonsumentCS)

Instance: AntLasare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Den som läser journalanteckningar"
Description: "Vårdpersonal eller invånare som läser anteckningarna."
* name = "AntLasare"
* title = "Den som läser journalanteckningar"
* status = #draft
* type = #person

Instance: AntProducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Journalanteckningar, producent"
Description: "Krav på API för producent av journalanteckningar."
* name = "AntProducentCS"
* title = "Förmågor: Journalanteckningar, producent"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[+].type = #DocumentReference
* rest[=].resource[=].profile = Canonical(Journalanteckning)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "date"
* rest[=].resource[=].searchParam[=].type = #date
* rest[=].resource[=].searchParam[+].name = "type"
* rest[=].resource[=].searchParam[=].type = #token

Instance: AntKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Journalanteckningar, konsument"
Description: "Krav på API för konsument av journalanteckningar."
* name = "AntKonsumentCS"
* title = "Förmågor: Journalanteckningar, konsument"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #DocumentReference
* rest[=].resource[=].profile = Canonical(Journalanteckning)
* rest[=].resource[=].interaction[0].code = #search-type

Instance: AntKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Journalanteckningar"
Description: "Verksamhetskrav på producent av journalanteckningar."
* name = "AntKrav"
* title = "Krav: Journalanteckningar"
* status = #draft
* actor[0] = Canonical(AntProducent)
* statement[0].key = "ANT-1"
* statement[=].label = "Bara signerade anteckningar"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Producenten SKA bara tillhandahålla signerade anteckningar."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-anteckningar/StructureDefinition/journalanteckning"
* statement[+].key = "ANT-2"
* statement[=].label = "Författare"
* statement[=].conformance[0] = #SHOULD
* statement[=].requirement = "Producenten BÖR ange författare och vårdenhet för varje anteckning."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-anteckningar/StructureDefinition/journalanteckning"
