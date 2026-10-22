Instance: PSProducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Patientöversikt: producent"
Description: "Källsystem som tillhandahåller information till en patientöversikt."
* name = "PSProducent"
* title = "Patientöversikt: producent"
* status = #draft
* type = #system
* capabilities = Canonical(PSProducentCS)
* derivedFrom[0] = Canonical(FKProducent)

Instance: PSKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Patientöversikt: konsument"
Description: "System som sammanställer och visar en patientöversikt."
* name = "PSKonsument"
* title = "Patientöversikt: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(PSKonsumentCS)
* derivedFrom[0] = Canonical(FKKonsument)

Instance: PSProducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Patientöversikt, producent"
Description: "Krav på API för producent i Patientöversikt."
* name = "PSProducentCS"
* title = "Förmågor: Patientöversikt, producent"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[0].type = #Encounter
* rest[=].resource[=].profile = Canonical(Vardkontakt)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].definition = "http://hl7.org/fhir/SearchParameter/clinical-patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "date"
* rest[=].resource[=].searchParam[=].definition = "http://hl7.org/fhir/SearchParameter/clinical-date"
* rest[=].resource[=].searchParam[=].type = #date

Instance: PSKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Patientöversikt, konsument"
Description: "Krav på API för konsument i Patientöversikt."
* name = "PSKonsumentCS"
* title = "Förmågor: Patientöversikt, konsument"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[0].type = #Encounter
* rest[=].resource[=].profile = Canonical(Vardkontakt)
* rest[=].resource[=].interaction[0].code = #search-type

Instance: PSKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Patientöversikt"
Description: "Verksamhetskrav på producent i Patientöversikt."
* name = "PSKrav"
* title = "Krav: Patientöversikt"
* status = #draft
* actor[0] = Canonical(PSProducent)
* derivedFrom[0] = Canonical(FKKrav)
* statement[0].key = "PS-1"
* statement[=].label = "Vårdkontakter per patient"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Producenten SKA kunna lämna patientens vårdkontakter avgränsade i tid."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-patientoversikt/StructureDefinition/vardkontakt"

Instance: Vardpersonal
InstanceOf: ActorDefinition
Usage: #definition
Title: "Vårdpersonal"
Description: "Hälso- och sjukvårdspersonal som tar del av patientens information."
* name = "Vardpersonal"
* title = "Vårdpersonal"
* status = #draft
* type = #person
