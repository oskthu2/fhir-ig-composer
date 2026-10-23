// Informationsbehov (logiska modeller), oberoende av FHIR-realisering och källformat.
Logical: ProvsvarInfo
Id: ProvsvarInfo
Title: "Informationsbehov: Provsvar"
Description: "Ett svar från laboratoriet på en beställning, med de analyser som ingår."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer, samordningsnummer eller nationellt reservnummer"
* bestallning 1..1 CodeableConcept "Beställning" "Vad som beställdes"
* svarstidpunkt 1..1 dateTime "Svarstidpunkt" "När svaret lämnades"
* status 1..1 code "Status" "Preliminärt, slutligt eller rättat"
* laboratorium 1..1 Identifier "Laboratorium" "Svarande laboratorium (HSA-id)"
* provtagning 0..1 dateTime "Provtagning" "När provet togs"
* analyser 1..* Reference "Analyser" "De enskilda analysresultaten"
* kommentar 0..1 string "Kommentar" "Kommentar till svaret"

Logical: AnalysresultatInfo
Id: AnalysresultatInfo
Title: "Informationsbehov: Analysresultat"
Description: "Resultatet av en enskild analys."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer, samordningsnummer eller nationellt reservnummer"
* analys 1..1 CodeableConcept "Analys" "NPU eller LOINC"
* varde 0..1 Quantity "Värde" "Resultatet, med enhet"
* tolkning 0..1 CodeableConcept "Tolkning" "T.ex. avvikande"
* referensintervall 0..1 string "Referensintervall" "Normalt intervall för analysen"
* tidpunkt 0..1 dateTime "Tidpunkt" "När analysen utfördes"
* kommentar 0..1 string "Kommentar" "Kommentar till analysen"
