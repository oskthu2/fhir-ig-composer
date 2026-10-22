Alias: $observation-category = http://terminology.hl7.org/CodeSystem/observation-category

Profile: Labbsvar
Parent: Observation
Id: labbsvar
Title: "Labbsvar"
Description: "Ett laboratoriesvar (analysresultat)."
* ^status = #draft
* status MS
* category ^slicing.discriminator.type = #value
* category ^slicing.discriminator.path = "$this"
* category ^slicing.rules = #open
* category contains laboratorium 1..1 MS
* category[laboratorium] = $observation-category#laboratory
* code MS
* subject 1..1 MS
* subject only Reference(Patient)
* effective[x] MS
* issued MS
* performer MS
* value[x] MS
* interpretation MS
* referenceRange MS

* code insert Obligation(#SHALL:populate, LabProducent)
* subject insert Obligation(#SHALL:populate, LabProducent)
* effective[x] insert Obligation(#SHALL:populate, LabProducent)
* value[x] insert Obligation(#SHALL:populate-if-known, LabProducent)
* referenceRange insert Obligation(#SHALL:populate-if-known, LabProducent)
* code insert Obligation(#SHALL:display, LabKonsument)
* value[x] insert Obligation(#SHALL:display, LabKonsument)
* referenceRange insert Obligation(#SHALL:display, LabKonsument)
* interpretation insert Obligation(#SHOULD:display, LabKonsument)
