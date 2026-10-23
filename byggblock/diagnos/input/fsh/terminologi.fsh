Alias: $ICD10SE = https://www.icd10.se/
Alias: $provenance-participant-type = http://terminology.hl7.org/CodeSystem/provenance-participant-type

// Fragment av Ineras kodverk kv_diagnostyp (de koder som diagnoser använder).
CodeSystem: DiagnostypCS
Id: kv-diagnostyp
Title: "KV Diagnostyp (fragment)"
Description: "Fragment av Ineras kodverk kv_diagnostyp: huvuddiagnos och bidiagnos. Kodverket förvaltas av Inera."
* ^url = "https://terminologitjansten.inera.se/inera-kodverksforvaltning/kodverk/kv_diagnostyp"
* ^status = #active
* ^content = #fragment
* ^caseSensitive = true
* #HD "Huvuddiagnos"
* #BY "Bidiagnos"

ValueSet: DiagnostypVS
Id: diagnostyp
Title: "Diagnostyp"
Description: "Typ av diagnos: huvuddiagnos (HD) eller bidiagnos (BY)."
* ^status = #active
* include codes from system DiagnostypCS
