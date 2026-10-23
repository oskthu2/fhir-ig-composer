// Informationsbehov (logiska modeller), oberoende av FHIR-realisering.
Logical: LedigTidInfo
Id: LedigTidInfo
Title: "Informationsbehov: Ledig tid"
Description: "En ledig tid som kan bokas."
* ^status = #draft
* enhet 1..1 string "Enhet" "Var besöket sker"
* start 1..1 dateTime "Start" "När tiden börjar"
* slut 1..1 dateTime "Slut" "När tiden slutar"
* besokstyp 0..1 CodeableConcept "Typ av besök" "Vilken sorts besök tiden gäller"

Logical: BokningInfo
Id: BokningInfo
Title: "Informationsbehov: Bokning"
Description: "En bokad tid för en patient."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* start 1..1 dateTime "Start" "När besöket börjar"
* slut 1..1 dateTime "Slut" "När besöket slutar"
* enhet 1..1 string "Enhet" "Var besöket sker"
* besokstyp 0..1 CodeableConcept "Typ av besök" "Vilken sorts besök"
* status 1..1 code "Status" "Bokad, avbokad eller genomförd"
