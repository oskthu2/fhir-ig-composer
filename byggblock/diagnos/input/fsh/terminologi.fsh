Alias: $ICD10SE = https://www.icd10.se/
Alias: $provenance-participant-type = http://terminology.hl7.org/CodeSystem/provenance-participant-type

Alias: $kv-diagnostyp = https://terminologitjansten.inera.se/inera-kodverksforvaltning/kodverk/kv_diagnostyp

// Ineras kodverk kv_diagnostyp förvaltas i terminologitjänsten och definieras
// inte här (en IG kan inte äga ett kodsystem med en annan kanonisk adress);
// värdemängden räknar upp de koder som diagnoser använder.
ValueSet: DiagnostypVS
Id: diagnostyp
Title: "Diagnostyp"
Description: "Typ av diagnos ur Ineras kodverk kv_diagnostyp: huvuddiagnos (HD) eller bidiagnos (BY)."
* ^status = #active
* $kv-diagnostyp#HD "Huvuddiagnos"
* $kv-diagnostyp#BY "Bidiagnos"
