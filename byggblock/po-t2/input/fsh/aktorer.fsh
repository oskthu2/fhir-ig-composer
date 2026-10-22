Instance: POProducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Patientöversikt (T2): producent"
Description: "Källsystem som tillhandahåller en eller flera av patientöversiktens informationsmängder."
* name = "POProducent"
* title = "Patientöversikt (T2): producent"
* status = #draft
* type = #system
* capabilities = Canonical(POProducentCS)

Instance: POKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Patientöversikt (T2): konsument"
Description: "System som aggregerar och visar patientöversikten källmärkt."
* name = "POKonsument"
* title = "Patientöversikt (T2): konsument"
* status = #draft
* type = #system
* capabilities = Canonical(POKonsumentCS)

Instance: POProducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Patientöversikt (T2), producent"
Description: "Patientcentrerade läsytor per informationsmängd. Sökning sker med kedjad patient.identifier på personnummer."
* name = "POProducentCS"
* title = "Förmågor: Patientöversikt (T2), producent"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].security.service = http://terminology.hl7.org/CodeSystem/restful-security-service#OAuth
* rest[=].resource[+].type = #Condition
* rest[=].resource[=].profile = Canonical(PODiagnos)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[+].type = #MedicationStatement
* rest[=].resource[=].profile = Canonical(POLakemedel)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[+].type = #Flag
* rest[=].resource[=].profile = Canonical(POUppmarksamhet)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference

Instance: POKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Patientöversikt (T2), konsument"
Description: "Konsumenten söker varje informationsmängd hos varje producent den hittar."
* name = "POKonsumentCS"
* title = "Förmågor: Patientöversikt (T2), konsument"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #Condition
* rest[=].resource[=].profile = Canonical(PODiagnos)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[+].type = #MedicationStatement
* rest[=].resource[=].profile = Canonical(POLakemedel)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[+].type = #Flag
* rest[=].resource[=].profile = Canonical(POUppmarksamhet)
* rest[=].resource[=].interaction[0].code = #search-type

Instance: POKonsumentKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Patientöversikt (T2), konsument"
Description: "Verksamhetskrav på konsumenten."
* name = "POKonsumentKrav"
* title = "Krav: Patientöversikt (T2), konsument"
* status = #draft
* actor[0] = Canonical(POKonsument)
* statement[0].key = "POT-K-1"
* statement[=].label = "Källmärkning"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Konsumenten SKA visa från vilken vårdgivare varje uppgift kommer."
* statement[+].key = "POT-K-2"
* statement[=].label = "Ofullständig översikt"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Konsumenten SKA visa att översikten kan vara ofullständig när en producent inte svarar eller inte implementerar en informationsmängd."

Instance: POVardpersonal
InstanceOf: ActorDefinition
Usage: #definition
Title: "Vårdpersonal"
Description: "Hälso- och sjukvårdspersonal som tar del av patientöversikten."
* name = "POVardpersonal"
* title = "Vårdpersonal"
* status = #draft
* type = #person
