// Informationsbehov (logisk modell). I verkligheten hämtas det från det
// externt publicerade informationsunderlaget; här ligger det i byggblocket.
Logical: LabbsvarInfo
Id: LabbsvarInfo
Title: "Informationsbehov: Labbsvar"
Description: "Ett analysresultat som informationsbehov, oberoende av FHIR-realisering."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* analys 1..1 Coding "Analys" "Vilken analys som utförts"
* resultat 0..1 Quantity "Resultat" "Analysens resultat"
* referensintervall 0..1 Range "Referensintervall" "Normalt intervall för resultatet"
* provtagningstid 1..1 dateTime "Provtagningstid" "När provet togs"
