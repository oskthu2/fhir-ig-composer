// Informationsbehov (logiska modeller), oberoende av FHIR-realisering.
Logical: RemissInfo
Id: RemissInfo
Title: "Informationsbehov: Remiss"
Description: "En remiss från en remittent till en mottagande enhet."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* fragestallning 1..1 string "Frågeställning" "Vad remittenten vill ha besvarat"
* remittent 1..1 string "Remittent" "Vem som remitterar"
* mottagare 1..1 string "Mottagande enhet" "Vem remissen skickas till"
* prioritet 0..1 code "Prioritet" "Hur brådskande remissen är"
* anamnes 0..1 string "Anamnes" "Relevant sjukhistoria"
