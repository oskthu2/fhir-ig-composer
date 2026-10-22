// Informationsbehov (logiska modeller), ett per informationsmängd. Var och en
// motsvarar en externt publicerad specifikation.
Logical: DiagnosInfo
Id: DiagnosInfo
Title: "Informationsbehov: Diagnos"
Description: "Patientens diagnoser, källmärkta per vårdgivare."
* ^status = #draft
* insert ExternSpecifikation(https://fhir.inera.se/ig/patientoversikt/CapabilityStatement/exempel-diagnoser-api|0.1.0)
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* diagnos 1..1 CodeableConcept "Diagnos" "Diagnoskod"
* tidpunkt 0..1 dateTime "Tidpunkt" "När diagnosen ställdes"
* registreradAv 0..1 string "Registrerad av" "Den som ställde diagnosen"

Logical: LakemedelInfo
Id: LakemedelInfo
Title: "Informationsbehov: Läkemedel"
Description: "Patientens läkemedel, källmärkta per vårdgivare."
* ^status = #draft
* insert ExternSpecifikation(https://fhir.inera.se/ig/patientoversikt/CapabilityStatement/exempel-lakemedel-api|0.1.0)
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* lakemedel 1..1 CodeableConcept "Läkemedel" "Läkemedel eller substans"
* period 0..1 Period "Period" "Under vilken tid läkemedlet används"

Logical: UppmarksamhetInfo
Id: UppmarksamhetInfo
Title: "Informationsbehov: Uppmärksamhetsinformation"
Description: "Uppmärksamhetssignaler om patienten, t.ex. allergi och överkänslighet."
* ^status = #draft
* insert ExternSpecifikation(https://fhir.inera.se/ig/patientoversikt/CapabilityStatement/exempel-uppmarksamhet-api|0.1.0)
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* signal 1..1 CodeableConcept "Signal" "Typ av uppmärksamhetsinformation"
