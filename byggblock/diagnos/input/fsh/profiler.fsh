Alias: $condition-related = http://hl7.org/fhir/StructureDefinition/condition-related
Alias: $condition-assertedDate = http://hl7.org/fhir/StructureDefinition/condition-assertedDate

Extension: DiagnosKronisk
Id: diagnos-kronisk
Title: "Kronisk diagnos"
Description: "Anger om diagnosen är kronisk."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "Condition"
* value[x] only boolean

Profile: Diagnos
Parent: Condition
Id: diagnos
Title: "Diagnos"
Description: "En diagnos eller ett problem. R5: ansvarig och signerare är participant (author, legal); clinicalStatus är obligatoriskt och härleds till active när källan inte har status."
* ^status = #draft
* insert Realiserar(DiagnosuppgiftInfo)
* identifier MS
* identifier ^short = "Diagnosens id hos den informationsägande vårdgivaren"
* subject only Reference(SEPatient)
* subject MS
* clinicalStatus MS
* clinicalStatus ^short = "active när källan inte har status (R5 kräver clinicalStatus)"
* verificationStatus MS
* verificationStatus ^short = "confirmed: journalförda diagnoser är bekräftade"
* category ^slicing.discriminator.type = #value
* category ^slicing.discriminator.path = "coding.system"
* category ^slicing.rules = #open
* category contains diagnostyp 1..1 MS
* category[diagnostyp].coding 1..1 MS
* category[diagnostyp].coding.system = "https://terminologitjansten.inera.se/inera-kodverksforvaltning/kodverk/kv_diagnostyp"
* category[diagnostyp].coding.code 1..1 MS
* category[diagnostyp] from DiagnostypVS (required)
* code 1..1 MS
* code.coding ^slicing.discriminator.type = #value
* code.coding ^slicing.discriminator.path = "system"
* code.coding ^slicing.rules = #open
* code.coding contains icd10se 0..1 MS
* code.coding[icd10se].system = $ICD10SE
* code.coding[icd10se].code 1..1 MS
* code.text MS
* code.text ^short = "Fritext, eller kodens benämning"
* onset[x] only dateTime
* onsetDateTime MS
* onsetDateTime ^short = "Bedömningstidpunkt"
* recordedDate 1..1 MS
* participant ^slicing.discriminator.type = #pattern
* participant ^slicing.discriminator.path = "function"
* participant ^slicing.rules = #open
* participant contains ansvarig 0..1 MS and signerare 0..1 MS
* participant[ansvarig].function = $provenance-participant-type#author
* participant[ansvarig].actor only Reference(SEPractitionerRole)
* participant[ansvarig] ^short = "Ansvarig hälso- och sjukvårdspersonal"
* participant[signerare].function = $provenance-participant-type#legal
* participant[signerare].actor only Reference(SEPractitionerRole)
* participant[signerare] ^short = "Rättslig äkthetsintygsgivare"
* extension contains
    DiagnosKronisk named kronisk 0..1 MS and
    $condition-assertedDate named signerad 0..1 MS and
    $condition-related named relaterad 0..* MS
* extension[relaterad] ^short = "Relaterad diagnos, logisk referens via identifier"
* code insert Obligation(#SHALL:populate, DiagProducent)
* category[diagnostyp] insert Obligation(#SHALL:populate, DiagProducent)
* recordedDate insert Obligation(#SHALL:populate, DiagProducent)
* onsetDateTime insert Obligation(#SHOULD:populate-if-known, DiagProducent)
* participant[ansvarig] insert Obligation(#SHOULD:populate-if-known, DiagProducent)
* extension[kronisk] insert Obligation(#SHOULD:populate-if-known, DiagProducent)
* code insert Obligation(#SHALL:display, DiagKonsument)
* category[diagnostyp] insert Obligation(#SHALL:display, DiagKonsument)
* onsetDateTime insert Obligation(#SHALL:display, DiagKonsument)
