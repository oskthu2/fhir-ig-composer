Instance: FormVardsystem
InstanceOf: ActorDefinition
Usage: #definition
Title: "Formulär: vårdsystem"
Description: "Vårdens system, som begär formulär och tar del av svaren."
* name = "FormVardsystem"
* title = "Formulär: vårdsystem"
* status = #draft
* type = #system
* capabilities = Canonical(FormVardsystemCS)

Instance: FormFormulartjanst
InstanceOf: ActorDefinition
Usage: #definition
Title: "Formulär: formulärtjänst"
Description: "Tjänst som visar formuläret för invånaren och tar hand om svaren."
* name = "FormFormulartjanst"
* title = "Formulär: formulärtjänst"
* status = #draft
* type = #system
* capabilities = Canonical(FormFormulartjanstCS)

Instance: FormVardpersonal
InstanceOf: ActorDefinition
Usage: #definition
Title: "Vårdpersonal som begär formulär"
Description: "Vårdpersonal som vill att patienten fyller i ett formulär."
* name = "FormVardpersonal"
* title = "Vårdpersonal som begär formulär"
* status = #draft
* type = #person

Instance: FormInvanare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Invånare som fyller i formulär"
Description: "Invånaren som fyller i formuläret."
* name = "FormInvanare"
* title = "Invånare som fyller i formulär"
* status = #draft
* type = #person

Instance: FormFormulartjanstCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Formulär, formulärtjänst"
Description: "Krav på API för formulärtjänsten."
* name = "FormFormulartjanstCS"
* title = "Förmågor: Formulär, formulärtjänst"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[+].type = #Task
* rest[=].resource[=].profile = Canonical(Formularbegaran)
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[+].type = #QuestionnaireResponse
* rest[=].resource[=].profile = Canonical(Formularsvar)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "status"
* rest[=].resource[=].searchParam[=].type = #token

Instance: FormVardsystemCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Formulär, vårdsystem"
Description: "Krav på API för vårdsystemet."
* name = "FormVardsystemCS"
* title = "Förmågor: Formulär, vårdsystem"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #Task
* rest[=].resource[=].profile = Canonical(Formularbegaran)
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[+].type = #QuestionnaireResponse
* rest[=].resource[=].profile = Canonical(Formularsvar)
* rest[=].resource[=].interaction[0].code = #search-type

Instance: FormKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Formulär"
Description: "Verksamhetskrav på formulärtjänsten."
* name = "FormKrav"
* title = "Krav: Formulär"
* status = #draft
* actor[0] = Canonical(FormFormulartjanst)
* statement[0].key = "FORM-1"
* statement[=].label = "Svar till rätt begäran"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Formulärtjänsten SKA kunna visa vilken begäran ett svar hör till."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-formular/StructureDefinition/formularsvar"
* statement[+].key = "FORM-2"
* statement[=].label = "Bara inskickade svar"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Formulärtjänsten SKA bara lämna ut svar som invånaren har skickat in."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-formular/StructureDefinition/formularsvar"
