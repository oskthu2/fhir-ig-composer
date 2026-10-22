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

// ---------------------------------------------------------------------------
// Kravmodell: användningsfall, scenarier och informationsbehov.
// Användningsfall och delflöden skrivs i skissformatet (input/scenarier/*.yaml)
// och kompileras av ig-composer till ExampleScenario och Requirements.

Extension: AnvandningsfallExt
Id: anvandningsfall
Title: "Användningsfall"
Description: "Anges på en tjänste-IG: ett användningsfall (namn i skissformatet) som ingår i tjänstens konfiguration. Upprepas för flera."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ImplementationGuide"
* value[x] only string

Extension: ForutsattningExt
Id: forutsattning
Title: "Förutsättning"
Description: "Anges på en federations-IG: ett användningsfall (namn i skissformatet) som är en förutsättning för att delta i federationen, t.ex. anslutning och registrering i tjänstekatalogen. Ingår automatiskt i varje tjänst i federationen."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ImplementationGuide"
* value[x] only string

Extension: FlodesmonsterExt
Id: flodesmonster
Title: "Flödesmönster"
Description: "Anges på en federations-IG: delflöden som vävs in i varje användningsfall i en tjänst i federationen, före och efter varje steg med någon av de angivna operationstyperna."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ImplementationGuide"
* extension contains
    vid 1..* and
    fore 0..* and
    foreEnGang 0..1 and
    foreVarje 0..* and
    efter 0..*
* extension[vid].value[x] only code
* extension[vid] ^short = "Operationstyp (restful-interaction), t.ex. search-type, read"
* extension[fore].value[x] only string
* extension[fore] ^short = "Delflöde som vävs in före steget (i angiven ordning)"
* extension[foreEnGang].value[x] only boolean
* extension[foreEnGang] ^short = "Väv bara in fore-delflödena före första matchande steg"
* extension[foreVarje].value[x] only string
* extension[foreVarje] ^short = "Delflöde som vävs in före varje matchande steg, efter fore (t.ex. T2-uppslaget)"
* extension[efter].value[x] only string
* extension[efter] ^short = "Delflöde som vävs in efter steget"

Extension: ScenarioAktorExt
Id: scenario-aktor
Title: "Scenarioaktör"
Description: "Binder en aktör i ett ExampleScenario eller ett arbetsflöde (PlanDefinition) till den/de systemroller (ActorDefinition) den spelar. Upprepas när en aktör spelar roller från både domän och federation."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ExampleScenario.actor"
* ^context[+].type = #element
* ^context[=].expression = "PlanDefinition.actor"
* value[x] only canonical
* valueCanonical only Canonical(ActorDefinition)

Extension: InformationsbehovExt
Id: informationsbehov
Title: "Informationsbehov"
Description: "Det informationsbehov (logisk modell) som en instans i ett ExampleScenario realiserar."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ExampleScenario.instance"
* value[x] only canonical
* valueCanonical only Canonical(StructureDefinition)

Extension: RealiserarExt
Id: realiserar
Title: "Realiserar"
Description: "Profilen realiserar detta informationsbehov (logisk modell). Används av ig-composer för att välja profil för informationsbehoven i ett scenario (harmonisering)."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "StructureDefinition"
* value[x] only canonical
* valueCanonical only Canonical(StructureDefinition)

Extension: InvavdAvExt
Id: invavd-av
Title: "Invävd av"
Description: "Sätts av ig-composer på steg i ett ExampleScenario som vävts in av en federations flödesmönster: federationens paket-id."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ExampleScenario.process.step"
* value[x] only string

Extension: StodtjanstExt
Id: stodtjanst
Title: "Stödtjänst"
Description: "Anges på en ActorDefinition: aktören är en stödtjänst som federationen eller stödtjänsten själv tillhandahåller (t.ex. tjänstekatalogen, loggtjänsten). Den spelas inte av tjänsternas system."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ActorDefinition"
* value[x] only boolean

Extension: TillvalForExt
Id: tillval-for
Title: "Tillval för"
Description: "Anges på en ActorDefinition: aktören är ett tillval för en grundroll. Ett system som spelar grundrollen kan välja att också anta tillvalet (t.ex. engagemangsindexerad producent), och får då tillvalets krav."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ActorDefinition"
* value[x] only canonical
* valueCanonical only Canonical(ActorDefinition)

Extension: ValfriInformationsmangdExt
Id: valfri-informationsmangd
Title: "Valfri informationsmängd"
Description: "Anges på en tjänste-IG: informationsmängden (logisk modell) är valfri i tjänsten. En producent får välja bort den; implementerar den mängden gäller kraven fullt ut. Övriga informationsmängder är obligatoriska."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ImplementationGuide"
* value[x] only string

Extension: ExternSpecifikationExt
Id: extern-specifikation
Title: "Extern specifikation"
Description: "Anges på en logisk modell (informationsbehov): den publicerade specifikation (CapabilityStatement kind=requirements, url|version) som informationsmängden motsvarar. Tjänstens genererade specifikation får den som instantiates, och T1-uppslag och registrering använder den."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "StructureDefinition"
* value[x] only canonical

Extension: TillamparExt
Id: tillampar
Title: "Tillämpar"
Description: "Sätts av ig-composer på ett ExampleScenario i en tjänst eller stödtjänst: det logiska arbetsflöde (PlanDefinition, workflow-definition) som scenariot tillämpar."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ExampleScenario"
* value[x] only canonical
* valueCanonical only Canonical(PlanDefinition)

Extension: SpecifikationExt
Id: specifikation
Title: "Specifikation"
Description: "Sätts av ig-composer på ett tillämpat steg i ett ExampleScenario: den specifikation (CapabilityStatement kind=requirements) som interaktionen följer, t.ex. tjänstens API för en informationsmängd eller stödtjänstens API."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ExampleScenario.process.step"
* value[x] only canonical
* valueCanonical only Canonical(CapabilityStatement)

Extension: BindningExt
Id: bindning
Title: "Bindning"
Description: "Sätts av ig-composer på ett tillämpat steg: hur aktiviteten bands till en interaktion – härledd ur mottagarens förmågor, angiven i tjänstens tillämpning, eller angiven i ett tillämpat flöde."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "ExampleScenario.process.step"
* value[x] only code
* valueCode from BindningVS (required)
