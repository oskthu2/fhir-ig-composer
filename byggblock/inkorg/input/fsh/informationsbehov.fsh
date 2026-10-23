// Informationsbehov (logiska modeller), oberoende av FHIR-realisering.
Logical: MeddelandeInfo
Id: MeddelandeInfo
Title: "Informationsbehov: Meddelande"
Description: "Ett meddelande från vården till invånaren."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* avsandare 1..1 string "Avsändande enhet" "Vårdenheten som skickar meddelandet"
* amne 1..1 string "Ämne" "Meddelandets rubrik"
* innehall 1..1 string "Innehåll" "Meddelandets text, eventuellt med bilagor"
* skickat 1..1 dateTime "Skickat" "När meddelandet skickades"
* last 0..1 dateTime "Läst" "När invånaren öppnade meddelandet"
