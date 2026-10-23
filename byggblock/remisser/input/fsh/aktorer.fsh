Instance: RemAvsandare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Remisser: remitterande system"
Description: "System där remittenten skriver och skickar remissen."
* name = "RemAvsandare"
* title = "Remisser: remitterande system"
* status = #draft
* type = #system
* capabilities = Canonical(RemAvsandareCS)

Instance: RemMottagare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Remisser: mottagande system"
Description: "System hos den mottagande enheten, som tar emot och bedömer remissen."
* name = "RemMottagare"
* title = "Remisser: mottagande system"
* status = #draft
* type = #system
* capabilities = Canonical(RemMottagareCS)

Instance: RemRemittent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Remittent"
Description: "Vårdpersonal som remitterar patienten."
* name = "RemRemittent"
* title = "Remittent"
* status = #draft
* type = #person

Instance: RemAvsandareCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Remisser, remitterande system"
Description: "Krav på API för det remitterande systemet."
* name = "RemAvsandareCS"
* title = "Förmågor: Remisser, remitterande system"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #ServiceRequest
* rest[=].resource[=].profile = Canonical(Remiss)
* rest[=].resource[=].interaction[0].code = #create

Instance: RemMottagareCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Remisser, mottagande system"
Description: "Krav på API för det mottagande systemet."
* name = "RemMottagareCS"
* title = "Förmågor: Remisser, mottagande system"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[+].type = #ServiceRequest
* rest[=].resource[=].profile = Canonical(Remiss)
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #read

Instance: RemKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Remisser"
Description: "Verksamhetskrav på det remitterande systemet."
* name = "RemKrav"
* title = "Krav: Remisser"
* status = #draft
* actor[0] = Canonical(RemAvsandare)
* statement[0].key = "REM-1"
* statement[=].label = "Frågeställning"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Remissen SKA innehålla en frågeställning, remittent och mottagande enhet."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-remisser/StructureDefinition/remiss"
* statement[+].key = "REM-2"
* statement[=].label = "Prioritet"
* statement[=].conformance[0] = #SHOULD
* statement[=].requirement = "Remissen BÖR ange prioritet."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-remisser/StructureDefinition/remiss"
