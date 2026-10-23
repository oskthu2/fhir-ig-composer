Profile: Vaccination
Parent: Immunization
Id: vaccination
Title: "Vaccination"
Description: "En given vaccination."
* ^status = #draft
* insert Realiserar(VaccinationInfo)
* status MS
* vaccineCode MS
* patient MS
* patient only Reference(Patient)
* occurrence[x] MS
* performer MS
* protocolApplied MS
* protocolApplied.doseNumber MS
* vaccineCode insert Obligation(#SHALL:populate, VaccProducent)
* occurrence[x] insert Obligation(#SHALL:populate, VaccProducent)
* protocolApplied.doseNumber insert Obligation(#SHOULD:populate-if-known, VaccProducent)
* vaccineCode insert Obligation(#SHALL:display, VaccKonsument)
* occurrence[x] insert Obligation(#SHALL:display, VaccKonsument)
