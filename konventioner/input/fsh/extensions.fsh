// Extensions som konfigurerar kompositionen. IG-nivå sätts i
// sushi-config.yaml (extension:), artefaktnivå via RuleSets i rulesets.fsh.

Alias: $snapshot-behavior = http://hl7.org/fhir/tools/StructureDefinition/snapshot-behavior

Extension: IGRollExt
Id: ig-roll
Title: "IG-roll"
Description: "IG:ns roll i kompositionen: byggblock, federation, tjänst eller konvention."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ImplementationGuide"
* value[x] only code
* valueCode from IGRollVS (required)

Extension: PubliceringExt
Id: publicering
Title: "Publicering"
Description: "Om IG:n publiceras (artefakter refereras) eller är intern (artefakter kopieras in)."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ImplementationGuide"
* value[x] only code
* valueCode from PubliceringVS (required)

Extension: KomponerarExt
Id: komponerar
Title: "Komponerar"
Description: "Ett byggblock, en federation eller ett konventionspaket som denna IG komponeras av. Inkludering överstyr den globala regeln för beroendets publicering."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ImplementationGuide"
* extension contains
    paket 1..1 and
    version 1..1 and
    inkludering 0..1
* extension[paket].value[x] only string
* extension[paket] ^short = "Paket-id, t.ex. inera.bb.patientoversikt"
* extension[version].value[x] only string
* extension[inkludering].value[x] only code
* extension[inkludering].valueCode from InkluderingVS (required)
* extension[inkludering] ^short = "Överstyr global regel: kopiera | referera"

Extension: FederationsmonsterExt
Id: federationsmonster
Title: "Federationsmönster"
Description: "Anges på en federations-IG. Pekar ut den RuleSet som beskriver federationens krav på varje exponerad resurs, och prefixet för de profiler per resurstyp som genereras i varje tjänst i federationen."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ImplementationGuide"
* extension contains
    ruleset 1..1 and
    profilprefix 1..1
* extension[ruleset].value[x] only string
* extension[profilprefix].value[x] only string

Extension: KopieradFranExt
Id: kopierad-fran
Title: "Kopierad från"
Description: "Sätts av kompositionsverktyget på varje kopierad definition: källans kanoniska URL och version (url|version). Källan är ofta ett internt byggblock som inte publiceras; valideraren varnar då för att den inte kan slås upp, vilket är väntat."
* ^status = #draft
// Gäller bara artefakten själv; ärvs inte till härledda profiler.
* ^extension[$snapshot-behavior].valueCode = #ignore
* ^context[+].type = #element
* ^context[=].expression = "StructureDefinition"
* ^context[+].type = #element
* ^context[=].expression = "ValueSet"
* ^context[+].type = #element
* ^context[=].expression = "CodeSystem"
* ^context[+].type = #element
* ^context[=].expression = "ActorDefinition"
* ^context[+].type = #element
* ^context[=].expression = "CapabilityStatement"
* ^context[+].type = #element
* ^context[=].expression = "Requirements"
* ^context[+].type = #element
* ^context[=].expression = "SearchParameter"
* ^context[+].type = #element
* ^context[=].expression = "OperationDefinition"
* value[x] only canonical

Extension: KompositionsanvisningExt
Id: kompositionsanvisning
Title: "Kompositionsanvisning"
Description: "Artefaktnivå: överstyr hur just denna artefakt tas med när IG:n komponeras in i en annan (kopiera | referera | exkludera)."
* ^status = #draft
* ^extension[$snapshot-behavior].valueCode = #ignore
* ^context[+].type = #element
* ^context[=].expression = "StructureDefinition"
* ^context[+].type = #element
* ^context[=].expression = "ActorDefinition"
* ^context[+].type = #element
* ^context[=].expression = "CapabilityStatement"
* ^context[+].type = #element
* ^context[=].expression = "Requirements"
* value[x] only code
* valueCode from InkluderingVS (required)
