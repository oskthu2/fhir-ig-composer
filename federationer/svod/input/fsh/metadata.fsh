Alias: $hsaid = urn:oid:1.2.752.29.4.19
Alias: $provenance-participant-type = http://terminology.hl7.org/CodeSystem/provenance-participant-type

// Spärrmetadata som Provenance (underlag: EHDS-TK, GENERAL-003). Varje
// klinisk resurs åtföljs av en Provenance med vårdgivaren (custodian, yttre
// spärr) och vårdenheten (author, inre spärr), som logiska referenser via
// HSA-id. Ett källsystem som självt filtrerar efter den anropande
// vårdpersonalens kontext behöver inte lämna spärrmetadata.
Profile: SVODProvenans
Parent: Provenance
Id: svod-provenans
Title: "SVOD: proveniens för spärr"
Description: "Proveniens för en klinisk resurs i SVOD: vårdgivaren (yttre spärr) och vårdenheten (inre spärr) som informationen tillhör."
* ^status = #draft
* target 1..* MS
* recorded 1..1 MS
* recorded ^short = "När informationen dokumenterades"
* agent 2..* MS
* agent ^slicing.discriminator.type = #pattern
* agent ^slicing.discriminator.path = "type"
* agent ^slicing.rules = #open
* agent contains vardgivare 1..1 MS and vardenhet 1..1 MS
* agent[vardgivare].type 1..1
* agent[vardgivare].type = $provenance-participant-type#custodian
* agent[vardgivare].who 1..1 MS
* agent[vardgivare].who only Reference(Organization)
* agent[vardgivare].who.identifier 1..1 MS
* agent[vardgivare].who.identifier.system = $hsaid
* agent[vardgivare] ^short = "Vårdgivaren – underlag för yttre spärr"
* agent[vardenhet].type 1..1
* agent[vardenhet].type = $provenance-participant-type#author
* agent[vardenhet].who 1..1 MS
* agent[vardenhet].who only Reference(Organization)
* agent[vardenhet].who.identifier 1..1 MS
* agent[vardenhet].who.identifier.system = $hsaid
* agent[vardenhet] ^short = "Vårdenheten – underlag för inre spärr"
* agent[vardgivare] insert Obligation(#SHALL:populate, SVODKallsystem)
* agent[vardenhet] insert Obligation(#SHALL:populate, SVODKallsystem)
* agent[vardgivare] insert Obligation(#SHALL:process, SVODKonsument)
* agent[vardenhet] insert Obligation(#SHALL:process, SVODKonsument)

// Federationsmönster (extension federationsmonster på denna IG). Verktyget
// genererar profilen SVODMetadata<Resurstyp> med denna RuleSet för varje
// resurstyp som en tjänst i SVOD exponerar. Får bara begränsa meta och
// extension (regel federation.tillatenYta). Spärrmetadata finns i
// SVODProvenans, inte på resursen.
RuleSet: SVODMetadata
* meta 1..1
* meta.source 1..1 MS
* meta.source ^short = "Källsystemets anslutningspunkt i tjänstekatalogen"
* meta.source insert Obligation(#SHALL:populate, SVODKallsystem)

// Hjälp för exempel i tjänster.
RuleSet: SVODExempelmetadata(kalla)
* meta.source = "{kalla}"

// En Provenance för ett exempel: vårdgivare och vårdenhet med HSA-id.
RuleSet: SVODExempelprovenans(mal, tid, vardgivare, vardenhet)
* target[0] = Reference({mal})
* recorded = "{tid}"
* agent[vardgivare].type = $provenance-participant-type#custodian
* agent[vardgivare].who.identifier.system = "urn:oid:1.2.752.29.4.19"
* agent[vardgivare].who.identifier.value = "{vardgivare}"
* agent[vardenhet].type = $provenance-participant-type#author
* agent[vardenhet].who.identifier.system = "urn:oid:1.2.752.29.4.19"
* agent[vardenhet].who.identifier.value = "{vardenhet}"
