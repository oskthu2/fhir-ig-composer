Instance: LabProducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Labbsvar: producent"
Description: "System som tillhandahåller laboratoriesvar."
* name = "LabProducent"
* title = "Labbsvar: producent"
* status = #draft
* type = #system
* capabilities = Canonical(LabProducentCS)

Instance: LabKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Labbsvar: konsument"
Description: "System som hämtar och visar laboratoriesvar."
* name = "LabKonsument"
* title = "Labbsvar: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(LabKonsumentCS)

Instance: LabProducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Labbsvar, producent"
Description: "Krav på API för producent av labbsvar."
* name = "LabProducentCS"
* title = "Förmågor: Labbsvar, producent"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[0].type = #Observation
* rest[=].resource[=].profile = Canonical(Labbsvar)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].definition = "http://hl7.org/fhir/SearchParameter/clinical-patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "category"
* rest[=].resource[=].searchParam[=].definition = "http://hl7.org/fhir/SearchParameter/Observation-category"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[=].searchParam[+].name = "date"
* rest[=].resource[=].searchParam[=].definition = "http://hl7.org/fhir/SearchParameter/clinical-date"
* rest[=].resource[=].searchParam[=].type = #date

Instance: LabKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Labbsvar, konsument"
Description: "Krav på API för konsument av labbsvar."
* name = "LabKonsumentCS"
* title = "Förmågor: Labbsvar, konsument"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[0].type = #Observation
* rest[=].resource[=].profile = Canonical(Labbsvar)
* rest[=].resource[=].interaction[0].code = #search-type

Instance: LabKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Labbsvar"
Description: "Verksamhetskrav på producent av labbsvar."
* name = "LabKrav"
* title = "Krav: Labbsvar"
* status = #draft
* actor[0] = Canonical(LabProducent)
* statement[0].key = "LAB-1"
* statement[=].label = "Slutliga svar"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Producenten SKA lämna slutliga svar med status `final` och korrigerade svar med status `corrected`."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-labbsvar/StructureDefinition/labbsvar"
* statement[+].key = "LAB-2"
* statement[=].label = "Referensintervall"
* statement[=].conformance[0] = #SHOULD
* statement[=].requirement = "Producenten BÖR lämna referensintervall för numeriska svar."

Instance: LabLasare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Läsare av labbsvar"
Description: "Person som tar del av labbsvar, t.ex. patienten själv eller vårdpersonal."
* name = "LabLasare"
* title = "Läsare av labbsvar"
* status = #draft
* type = #person
