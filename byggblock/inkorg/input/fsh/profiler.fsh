Profile: Inkorgsmeddelande
Parent: Communication
Id: inkorgsmeddelande
Title: "Inkorgsmeddelande"
Description: "Ett meddelande från vården till invånarens inkorg."
* ^status = #draft
* insert Realiserar(MeddelandeInfo)
* status MS
* subject 1..1 MS
* subject only Reference(Patient)
* topic 1..1 MS
* sent 1..1 MS
* received MS
* sender 1..1 MS
* payload 1..* MS
* payload.content[x] MS
* sender insert Obligation(#SHALL:populate, InkAvsandare)
* topic insert Obligation(#SHALL:populate, InkAvsandare)
* payload insert Obligation(#SHALL:populate, InkAvsandare)
* sent insert Obligation(#SHALL:populate, InkAvsandare)
* received insert Obligation(#SHALL:populate-if-known, InkInkorg)
* sender insert Obligation(#SHALL:display, InkInkorg)
* topic insert Obligation(#SHALL:display, InkInkorg)
* payload insert Obligation(#SHALL:display, InkInkorg)
