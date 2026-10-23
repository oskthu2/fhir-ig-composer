Instance: ProvProducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Provsvar: producent"
Description: "Laboratoriesystem eller journalsystem som tillhandahåller patientens provsvar."
* name = "ProvProducent"
* title = "Provsvar: producent"
* status = #draft
* type = #system
* capabilities = Canonical(ProvProducentCS)

Instance: ProvKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Provsvar: konsument"
Description: "System som visar patientens provsvar."
* name = "ProvKonsument"
* title = "Provsvar: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(ProvKonsumentCS)

Instance: ProvLasare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Den som tar del av provsvar"
Description: "Vårdpersonal eller invånare som tar del av provsvaren."
* name = "ProvLasare"
* title = "Den som tar del av provsvar"
* status = #draft
* type = #person

Instance: ProvProducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Provsvar, producent"
Description: "Patientavgränsad sökning på provsvar, med analysresultaten."
* name = "ProvProducentCS"
* title = "Förmågor: Provsvar, producent"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[+].type = #DiagnosticReport
* rest[=].resource[=].profile = Canonical(Provsvar)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "date"
* rest[=].resource[=].searchParam[=].type = #date
* rest[=].resource[=].searchParam[+].name = "category"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[+].type = #Observation
* rest[=].resource[=].profile = Canonical(Analysresultat)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "code"
* rest[=].resource[=].searchParam[=].type = #token

Instance: ProvKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Provsvar, konsument"
Description: "Konsumenten söker patientens provsvar och läser analysresultaten."
* name = "ProvKonsumentCS"
* title = "Förmågor: Provsvar, konsument"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #DiagnosticReport
* rest[=].resource[=].profile = Canonical(Provsvar)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[+].type = #Observation
* rest[=].resource[=].profile = Canonical(Analysresultat)
* rest[=].resource[=].interaction[0].code = #read

Instance: ProvKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Provsvar"
Description: "Verksamhetskrav på producent av provsvar."
* name = "ProvKrav"
* title = "Krav: Provsvar"
* status = #draft
* actor[0] = Canonical(ProvProducent)
* statement[0].key = "PROV-1"
* statement[=].label = "Svar med analyser"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Ett provsvar SKA innehålla de analyser som ingår i svaret, med analyskod enligt NPU eller LOINC."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-provsvar/StructureDefinition/provsvar"
* statement[+].key = "PROV-2"
* statement[=].label = "Referensintervall"
* statement[=].conformance[0] = #SHOULD
* statement[=].requirement = "Producenten BÖR ange referensintervall och tolkning när laboratoriet har dem."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-provsvar/StructureDefinition/analysresultat"
