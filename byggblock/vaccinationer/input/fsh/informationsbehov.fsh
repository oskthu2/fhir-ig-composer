// Informationsbehov (logiska modeller), oberoende av FHIR-realisering.
Logical: VaccinationInfo
Id: VaccinationInfo
Title: "Informationsbehov: Vaccination"
Description: "En given vaccination."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* vaccin 1..1 CodeableConcept "Vaccin" "Vaccinet som gavs"
* tidpunkt 1..1 dateTime "Tidpunkt" "När vaccinationen gavs"
* dosnummer 0..1 positiveInt "Dosnummer" "Vilken dos i vaccinationsschemat"
* enhet 0..1 string "Vaccinerande enhet" "Var vaccinationen gavs"
