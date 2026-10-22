Extension: VardkontaktKontaktuppgift
Id: vardkontakt-kontaktuppgift
Title: "Kontaktuppgift för vårdkontakten"
Description: "Kontaktuppgift (telefon eller e-post) som patienten kan använda för frågor om vårdkontakten."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "Encounter"
* value[x] only ContactPoint

Profile: Vardkontakt
Parent: Encounter
Id: vardkontakt
Title: "Vårdkontakt"
Description: "En vårdkontakt i Patientöversikt."
* ^status = #draft
* status MS
* class MS
* subject 1..1 MS
* subject only Reference(Patient)
* actualPeriod MS
* serviceProvider MS
* participant MS
* extension contains VardkontaktKontaktuppgift named kontaktuppgift 0..1 MS

* subject insert Obligation(#SHALL:populate, PSProducent)
* actualPeriod insert Obligation(#SHALL:populate, PSProducent)
* serviceProvider insert Obligation(#SHALL:populate-if-known, PSProducent)
* extension[kontaktuppgift] insert Obligation(#SHOULD:populate-if-known, PSProducent)
* actualPeriod insert Obligation(#SHALL:display, PSKonsument)
* serviceProvider insert Obligation(#SHALL:display, PSKonsument)
* extension[kontaktuppgift] insert Obligation(#SHALL:display, PSKonsument)
