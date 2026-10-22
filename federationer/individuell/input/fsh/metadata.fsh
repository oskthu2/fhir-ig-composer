Alias: $v3-ActCode = http://terminology.hl7.org/CodeSystem/v3-ActCode

ValueSet: IndividuellSakerhetsetikettVS
Id: individuell-sakerhetsetikett
Title: "Säkerhetsetiketter för individuell tillgång"
Description: "Etikett för information som inte får visas för invånaren utan ansvarig vårdpersonals medgivande."
* ^status = #draft
* $v3-ActCode#NOPAT "no disclosure to patient, family or caregivers without attending provider's authorization"

// Federationsmönster (extension federationsmonster på denna IG). Verktyget
// genererar IndividuellMetadata<Resurstyp> för varje resurstyp som en tjänst
// i federationen exponerar. Får bara begränsa meta och extension.
//
// Källsystemet kan uppfylla federationens krav på två sätt – märka eller
// filtrera bort – vilket blir två systemroller (se aktorer.fsh). Bara den
// märkande rollen har elementkrav på meta.security.
RuleSet: IndividuellMetadata
* meta 1..1
* meta.security MS
* meta.security from IndividuellSakerhetsetikettVS (extensible)
* meta.security insert Obligation(#SHALL:populate-if-known, IndividuellKallsystemMarkande)
* meta.security insert Obligation(#SHALL:process, IndividuellKonsument)

// Hjälp för exempel i tjänster.
RuleSet: IndividuellEjForInvanare
* meta.security = $v3-ActCode#NOPAT
