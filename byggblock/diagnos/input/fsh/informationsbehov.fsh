// Informationsbehov (logiska modeller), oberoende av FHIR-realisering och av
// källformat (RIV-TA-mappningen hör till mappnings-IG:n).
Logical: DiagnosuppgiftInfo
Id: DiagnosuppgiftInfo
Title: "Informationsbehov: Diagnos"
Description: "En diagnos eller ett problem som dokumenterats för patienten."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer, samordningsnummer eller nationellt reservnummer"
* diagnoskod 1..1 CodeableConcept "Diagnoskod" "ICD-10-SE, eller fritext"
* diagnostyp 1..1 code "Diagnostyp" "Huvuddiagnos eller bidiagnos"
* bedomningstidpunkt 0..1 dateTime "Bedömningstidpunkt" "När diagnosen ställdes"
* registrerad 1..1 dateTime "Registrerad" "När diagnosen dokumenterades"
* ansvarig 0..1 Identifier "Ansvarig" "Ansvarig hälso- och sjukvårdspersonal (HSA-id)"
* signerare 0..1 Identifier "Signerare" "Den som signerat (rättslig äkthetsintygsgivare)"
* kronisk 0..1 boolean "Kronisk" "Om diagnosen är kronisk"
* relaterad 0..* Identifier "Relaterad diagnos" "Andra diagnoser som diagnosen hänger samman med"
