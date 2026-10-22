Alias: $svod-vardenhet = https://fhir.inera.se/ig/svod/StructureDefinition/svod-vardenhet
Alias: $svod-vardgivare = https://fhir.inera.se/ig/svod/StructureDefinition/svod-vardgivare

Extension: SVODVardenhet
Id: svod-vardenhet
Title: "SVOD: vårdenhet"
Description: "HSA-id för den vårdenhet där informationen dokumenterats. Underlag för inre spärr."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "DomainResource"
* value[x] only Identifier
* valueIdentifier.system = "urn:oid:1.2.752.29.4.19"
* valueIdentifier.value 1..1

Extension: SVODVardgivare
Id: svod-vardgivare
Title: "SVOD: vårdgivare"
Description: "HSA-id för den vårdgivare som ansvarar för informationen. Underlag för yttre spärr."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "DomainResource"
* value[x] only Identifier
* valueIdentifier.system = "urn:oid:1.2.752.29.4.19"
* valueIdentifier.value 1..1

// Federationsmönster (extension federationsmonster på denna IG). Verktyget
// genererar profilen SVODMetadata<Resurstyp> med denna RuleSet för varje
// resurstyp som en tjänst i SVOD exponerar. Får bara begränsa meta och
// extension (regel federation.tillatenYta).
RuleSet: SVODMetadata
* meta 1..1
* meta.source 1..1 MS
* meta.security MS
* extension contains
    SVODVardenhet named vardenhet 1..1 MS and
    SVODVardgivare named vardgivare 1..1 MS
* meta.source insert Obligation(#SHALL:populate, SVODKallsystem)
* extension[vardenhet] insert Obligation(#SHALL:populate, SVODKallsystem)
* extension[vardgivare] insert Obligation(#SHALL:populate, SVODKallsystem)
* extension[vardenhet] insert Obligation(#SHALL:process, SVODKonsument)
* extension[vardgivare] insert Obligation(#SHALL:process, SVODKonsument)

// Hjälp för exempel i tjänster. Med imposeProfile ärvs inte federationens
// slice-namn (extension[vardenhet]) till tjänsteprofilen, så exempel
// adresserar extensions via alias. Aliasens URL:er skrivs om till
// tjänstens canonical vid kopiering.
RuleSet: SVODExempelmetadata(kalla, vardenhet, vardgivare)
* meta.source = "{kalla}"
* extension[$svod-vardenhet].valueIdentifier.system = "urn:oid:1.2.752.29.4.19"
* extension[$svod-vardenhet].valueIdentifier.value = "{vardenhet}"
* extension[$svod-vardgivare].valueIdentifier.system = "urn:oid:1.2.752.29.4.19"
* extension[$svod-vardgivare].valueIdentifier.value = "{vardgivare}"
