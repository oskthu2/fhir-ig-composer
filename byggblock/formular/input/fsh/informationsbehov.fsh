// Informationsbehov (logiska modeller), oberoende av FHIR-realisering.
Logical: FormularbegaranInfo
Id: FormularbegaranInfo
Title: "Informationsbehov: Formulärbegäran"
Description: "En begäran om att invånaren ska fylla i ett formulär."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* formular 1..1 string "Formulär" "Vilket formulär som ska fyllas i"
* begartAv 1..1 string "Begärt av" "Vem som begärt att formuläret fylls i"
* svaraSenast 0..1 dateTime "Svara senast" "När svaret behövs"

Logical: FormularsvarInfo
Id: FormularsvarInfo
Title: "Informationsbehov: Formulärsvar"
Description: "Invånarens svar på ett formulär."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* formular 1..1 string "Formulär" "Vilket formulär svaret gäller"
* besvarad 1..1 dateTime "Besvarad" "När formuläret skickades in"
* svar 1..* string "Svar" "Svaren på formulärets frågor"
