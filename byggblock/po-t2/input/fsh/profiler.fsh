Profile: PODiagnos
Parent: Condition
Id: po-diagnos
Title: "Diagnos"
Description: "Diagnos i patientöversikten."
* ^status = #draft
* insert Realiserar(DiagnosInfo)
* code 1..1 MS
* subject MS
* subject only Reference(Patient)
* recordedDate MS
* code insert Obligation(#SHALL:populate, POProducent)
* subject insert Obligation(#SHALL:populate, POProducent)
* code insert Obligation(#SHALL:display, POKonsument)

Profile: POLakemedel
Parent: MedicationStatement
Id: po-lakemedel
Title: "Läkemedel"
Description: "Läkemedel i patientöversikten."
* ^status = #draft
* insert Realiserar(LakemedelInfo)
* medication MS
* subject MS
* subject only Reference(Patient)
* effective[x] MS
* medication insert Obligation(#SHALL:populate, POProducent)
* subject insert Obligation(#SHALL:populate, POProducent)
* medication insert Obligation(#SHALL:display, POKonsument)

Profile: POUppmarksamhet
Parent: Flag
Id: po-uppmarksamhet
Title: "Uppmärksamhetsinformation"
Description: "Uppmärksamhetssignal i patientöversikten."
* ^status = #draft
* insert Realiserar(UppmarksamhetInfo)
* code MS
* subject MS
* subject only Reference(Patient)
* code insert Obligation(#SHALL:populate, POProducent)
* code insert Obligation(#SHALL:display, POKonsument)
