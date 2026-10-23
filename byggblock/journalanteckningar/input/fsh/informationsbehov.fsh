// Informationsbehov (logiska modeller), oberoende av FHIR-realisering.
Logical: AnteckningInfo
Id: AnteckningInfo
Title: "Informationsbehov: Journalanteckning"
Description: "En signerad journalanteckning."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* tidpunkt 1..1 dateTime "Tidpunkt" "När anteckningen skrevs"
* typ 1..1 CodeableConcept "Anteckningstyp" "T.ex. besöksanteckning eller epikris"
* forfattare 0..1 string "Författare" "Vem som skrev anteckningen"
* vardenhet 0..1 string "Vårdenhet" "Var anteckningen skrevs"
* text 1..1 string "Text" "Anteckningens innehåll"
