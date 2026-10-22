Instance: FKProducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Fasta kontakter: producent"
Description: "System som tillhandahåller patientens fasta kontakter."
* name = "FKProducent"
* title = "Fasta kontakter: producent"
* status = #draft
* type = #system
* capabilities = Canonical(FKProducentCS)

Instance: FKKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Fasta kontakter: konsument"
Description: "System som hämtar och visar patientens fasta kontakter."
* name = "FKKonsument"
* title = "Fasta kontakter: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(FKKonsumentCS)

Instance: FKProducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Fasta kontakter, producent"
Description: "Krav på API för producent av fasta kontakter."
* name = "FKProducentCS"
* title = "Förmågor: Fasta kontakter, producent"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[0].type = #CareTeam
* rest[=].resource[=].profile = Canonical(FastKontakt)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].definition = "http://hl7.org/fhir/SearchParameter/clinical-patient"
* rest[=].resource[=].searchParam[=].type = #reference

Instance: FKKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Fasta kontakter, konsument"
Description: "Krav på API för konsument av fasta kontakter."
* name = "FKKonsumentCS"
* title = "Förmågor: Fasta kontakter, konsument"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[0].type = #CareTeam
* rest[=].resource[=].profile = Canonical(FastKontakt)
* rest[=].resource[=].interaction[0].code = #search-type

Instance: FKKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Fasta kontakter"
Description: "Verksamhetskrav på producent av fasta kontakter."
* name = "FKKrav"
* title = "Krav: Fasta kontakter"
* status = #draft
* actor[0] = Canonical(FKProducent)
* statement[0].key = "FK-1"
* statement[=].label = "Samtliga fasta kontakter"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Producenten SKA tillhandahålla samtliga gällande fasta kontakter för patienten (patientlagen 6 kap. 2–3 §§)."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/fastakontakter/StructureDefinition/fast-kontakt"
