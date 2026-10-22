// Informationsbehov (logisk modell). I verkligheten hämtas det från det
// externt publicerade informationsunderlaget; här ligger det i byggblocket.
Logical: VardkontaktInfo
Id: VardkontaktInfo
Title: "Informationsbehov: Vårdkontakt"
Description: "En vårdkontakt som informationsbehov, oberoende av FHIR-realisering."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* tidpunkt 1..1 Period "Tidpunkt" "När vårdkontakten ägde rum"
* vardenhet 0..1 string "Vårdenhet" "Var vårdkontakten ägde rum"
* kontaktuppgift 0..1 ContactPoint "Kontaktuppgift" "Hur patienten kan nå vårdenheten om kontakten"
