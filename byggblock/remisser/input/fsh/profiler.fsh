Profile: Remiss
Parent: ServiceRequest
Id: remiss
Title: "Remiss"
Description: "En remiss från en remittent till en mottagande enhet."
* ^status = #draft
* insert Realiserar(RemissInfo)
* status MS
* intent = #order
* code MS
* subject MS
* subject only Reference(Patient)
* requester 1..1 MS
* performer 1..* MS
* reason MS
* priority MS
* note MS
* requester insert Obligation(#SHALL:populate, RemAvsandare)
* performer insert Obligation(#SHALL:populate, RemAvsandare)
* reason insert Obligation(#SHALL:populate, RemAvsandare)
* priority insert Obligation(#SHOULD:populate-if-known, RemAvsandare)
* reason insert Obligation(#SHALL:display, RemMottagare)
* priority insert Obligation(#SHALL:display, RemMottagare)
