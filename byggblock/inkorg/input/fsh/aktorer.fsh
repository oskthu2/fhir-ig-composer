Instance: InkAvsandare
InstanceOf: ActorDefinition
Usage: #definition
Title: "1177 Inkorg: avsändande system"
Description: "Vårdens system som skickar meddelanden till invånarens inkorg."
* name = "InkAvsandare"
* title = "1177 Inkorg: avsändande system"
* status = #draft
* type = #system
* capabilities = Canonical(InkAvsandareCS)

Instance: InkInkorg
InstanceOf: ActorDefinition
Usage: #definition
Title: "1177 Inkorg: inkorg"
Description: "Invånarens inkorg på 1177, som tar emot och visar meddelanden."
* name = "InkInkorg"
* title = "1177 Inkorg: inkorg"
* status = #draft
* type = #system
* capabilities = Canonical(InkInkorgCS)

Instance: InkVardpersonal
InstanceOf: ActorDefinition
Usage: #definition
Title: "Vårdpersonal som skickar meddelande"
Description: "Vårdpersonal som skriver ett meddelande till invånaren."
* name = "InkVardpersonal"
* title = "Vårdpersonal som skickar meddelande"
* status = #draft
* type = #person

Instance: InkInvanare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Invånare med inkorg"
Description: "Invånaren som tar emot och läser meddelandet."
* name = "InkInvanare"
* title = "Invånare med inkorg"
* status = #draft
* type = #person

Instance: InkInkorgCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: 1177 Inkorg, inkorg"
Description: "Krav på API för inkorgen."
* name = "InkInkorgCS"
* title = "Förmågor: 1177 Inkorg, inkorg"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[+].type = #Communication
* rest[=].resource[=].profile = Canonical(Inkorgsmeddelande)
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].interaction[+].code = #search-type
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "sent"
* rest[=].resource[=].searchParam[=].type = #date

Instance: InkAvsandareCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: 1177 Inkorg, avsändande system"
Description: "Krav på API för det avsändande systemet."
* name = "InkAvsandareCS"
* title = "Förmågor: 1177 Inkorg, avsändande system"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #Communication
* rest[=].resource[=].profile = Canonical(Inkorgsmeddelande)
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #read

Instance: InkKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: 1177 Inkorg"
Description: "Verksamhetskrav på inkorgen."
* name = "InkKrav"
* title = "Krav: 1177 Inkorg"
* status = #draft
* actor[0] = Canonical(InkInkorg)
* statement[0].key = "INK-1"
* statement[=].label = "Avsändare"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Inkorgen SKA visa vilken vårdenhet som skickat meddelandet."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-inkorg/StructureDefinition/inkorgsmeddelande"
* statement[+].key = "INK-2"
* statement[=].label = "Läskvittens"
* statement[=].conformance[0] = #SHOULD
* statement[=].requirement = "Inkorgen BÖR registrera när invånaren öppnar meddelandet, så att avsändaren kan se att det är läst."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-inkorg/StructureDefinition/inkorgsmeddelande"
