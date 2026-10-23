Instance: UppmProducent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Uppmärksamhet: producent"
Description: "Källsystem som tillhandahåller patientens uppmärksamhetsinformation."
* name = "UppmProducent"
* title = "Uppmärksamhet: producent"
* status = #draft
* type = #system
* capabilities = Canonical(UppmProducentCS)

Instance: UppmKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Uppmärksamhet: konsument"
Description: "System som visar patientens uppmärksamhetsinformation."
* name = "UppmKonsument"
* title = "Uppmärksamhet: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(UppmKonsumentCS)

Instance: UppmLasare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Den som tar del av uppmärksamhetsinformation"
Description: "Vårdpersonal eller invånare som tar del av uppmärksamhetsinformationen."
* name = "UppmLasare"
* title = "Den som tar del av uppmärksamhetsinformation"
* status = #draft
* type = #person

Instance: UppmProducentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Uppmärksamhet, producent"
Description: "Patientavgränsad sökning på uppmärksamhetssignaler och överkänsligheter."
* name = "UppmProducentCS"
* title = "Förmågor: Uppmärksamhet, producent"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[+].type = #Flag
* rest[=].resource[=].profile = Canonical(Uppmarksamhetssignal)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "date"
* rest[=].resource[=].searchParam[=].type = #date
* rest[=].resource[+].type = #AllergyIntolerance
* rest[=].resource[=].profile = Canonical(Overkanslighet)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference

Instance: UppmKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Uppmärksamhet, konsument"
Description: "Konsumenten söker patientens uppmärksamhetsinformation."
* name = "UppmKonsumentCS"
* title = "Förmågor: Uppmärksamhet, konsument"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #Flag
* rest[=].resource[=].profile = Canonical(Uppmarksamhetssignal)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[+].type = #AllergyIntolerance
* rest[=].resource[=].profile = Canonical(Overkanslighet)
* rest[=].resource[=].interaction[0].code = #read

Instance: UppmKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Uppmärksamhet"
Description: "Verksamhetskrav på producent av uppmärksamhetsinformation."
* name = "UppmKrav"
* title = "Krav: Uppmärksamhet"
* status = #draft
* actor[0] = Canonical(UppmProducent)
* statement[0].key = "UPPM-1"
* statement[=].label = "Signalen är primär"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Varje uppmärksamhetssignal SKA tillhandahållas som en uppmärksamhetssignal; vid överkänslighet SKA dessutom en överkänslighet finnas, som signalen pekar på."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-uppmarksamhet/StructureDefinition/uppmarksamhetssignal"
* statement[+].key = "UPPM-2"
* statement[=].label = "Giltighet"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Producenten SKA ange från när signalen gäller, och när den slutar gälla om den är inaktiverad eller har ett planerat slut."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-uppmarksamhet/StructureDefinition/uppmarksamhetssignal"
