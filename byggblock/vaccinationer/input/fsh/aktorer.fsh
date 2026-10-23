Instance: VaccProducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Vaccinationer: producent"
Description: "Källsystem som tillhandahåller patientens vaccinationer."
* name = "VaccProducent"
* title = "Vaccinationer: producent"
* status = #draft
* type = #system
* capabilities = Canonical(VaccProducentCS)

Instance: VaccKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Vaccinationer: konsument"
Description: "System som visar patientens vaccinationer."
* name = "VaccKonsument"
* title = "Vaccinationer: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(VaccKonsumentCS)

Instance: VaccLasare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Den som tar del av vaccinationer"
Description: "Vårdpersonal eller invånare som tar del av vaccinationerna."
* name = "VaccLasare"
* title = "Den som tar del av vaccinationer"
* status = #draft
* type = #person

Instance: VaccProducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Vaccinationer, producent"
Description: "Krav på API för producent av vaccinationer."
* name = "VaccProducentCS"
* title = "Förmågor: Vaccinationer, producent"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[+].type = #Immunization
* rest[=].resource[=].profile = Canonical(Vaccination)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "date"
* rest[=].resource[=].searchParam[=].type = #date

Instance: VaccKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Vaccinationer, konsument"
Description: "Krav på API för konsument av vaccinationer."
* name = "VaccKonsumentCS"
* title = "Förmågor: Vaccinationer, konsument"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #Immunization
* rest[=].resource[=].profile = Canonical(Vaccination)
* rest[=].resource[=].interaction[0].code = #search-type

Instance: VaccKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Vaccinationer"
Description: "Verksamhetskrav på producent av vaccinationer."
* name = "VaccKrav"
* title = "Krav: Vaccinationer"
* status = #draft
* actor[0] = Canonical(VaccProducent)
* statement[0].key = "VACC-1"
* statement[=].label = "Samtliga vaccinationer"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Producenten SKA tillhandahålla patientens samtliga registrerade vaccinationer, även de som getts av annan vårdgivare och förts in i journalen."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-vaccinationer/StructureDefinition/vaccination"
* statement[+].key = "VACC-2"
* statement[=].label = "Dosnummer"
* statement[=].conformance[0] = #SHOULD
* statement[=].requirement = "Producenten BÖR ange dosnummer när vaccinationen ingår i ett vaccinationsschema."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-vaccinationer/StructureDefinition/vaccination"
