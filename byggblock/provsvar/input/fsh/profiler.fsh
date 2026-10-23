Alias: $obs-category = http://terminology.hl7.org/CodeSystem/observation-category
Alias: $v2-0074 = http://terminology.hl7.org/CodeSystem/v2-0074

Profile: Provsvar
Parent: DiagnosticReport
Id: provsvar
Title: "Provsvar"
Description: "Ett svar från laboratoriet, med de enskilda analysresultaten."
* ^status = #draft
* insert Realiserar(ProvsvarInfo)
* identifier MS
* status MS
* category ^slicing.discriminator.type = #pattern
* category ^slicing.discriminator.path = "$this"
* category ^slicing.rules = #open
* category contains laboratorium 1..1 MS
* category[laboratorium] = $v2-0074#LAB
* code 1..1 MS
* code ^short = "Beställningen"
* subject only Reference(SEPatient)
* subject 1..1 MS
* effectiveDateTime MS
* effectiveDateTime ^short = "Provtagningstidpunkt"
* issued 1..1 MS
* issued ^short = "Svarstidpunkt"
* performer only Reference(SEOrganization or SEPractitionerRole)
* performer 1..* MS
* performer ^short = "Svarande laboratorium"
* result 1..* MS
* result only Reference(Analysresultat)
* specimen MS
* conclusion MS
* code insert Obligation(#SHALL:populate, ProvProducent)
* issued insert Obligation(#SHALL:populate, ProvProducent)
* performer insert Obligation(#SHALL:populate, ProvProducent)
* result insert Obligation(#SHALL:populate, ProvProducent)
* status insert Obligation(#SHALL:display, ProvKonsument)
* issued insert Obligation(#SHALL:display, ProvKonsument)
* performer insert Obligation(#SHALL:display, ProvKonsument)

Profile: Analysresultat
Parent: Observation
Id: analysresultat
Title: "Analysresultat"
Description: "Resultatet av en enskild laboratorieanalys."
* ^status = #draft
* insert Realiserar(AnalysresultatInfo)
* status MS
* category ^slicing.discriminator.type = #pattern
* category ^slicing.discriminator.path = "$this"
* category ^slicing.rules = #open
* category contains laboratorium 1..1 MS
* category[laboratorium] = $obs-category#laboratory
* code 1..1 MS
* code ^short = "Analys (NPU eller LOINC)"
* subject only Reference(SEPatient)
* subject 1..1 MS
* effective[x] MS
* value[x] MS
* dataAbsentReason MS
* interpretation MS
* referenceRange MS
* note MS
* code insert Obligation(#SHALL:populate, ProvProducent)
* value[x] insert Obligation(#SHALL:populate-if-known, ProvProducent)
* referenceRange insert Obligation(#SHOULD:populate-if-known, ProvProducent)
* code insert Obligation(#SHALL:display, ProvKonsument)
* value[x] insert Obligation(#SHALL:display, ProvKonsument)
* interpretation insert Obligation(#SHALL:display, ProvKonsument)
* referenceRange insert Obligation(#SHALL:display, ProvKonsument)
