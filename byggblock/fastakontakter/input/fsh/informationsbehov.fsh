// Informationsbehov (logisk modell). I verkligheten hämtas det från det
// externt publicerade informationsunderlaget; här ligger det i byggblocket.
Logical: FastKontaktInfo
Id: FastKontaktInfo
Title: "Informationsbehov: Fast kontakt"
Description: "Patientens fasta vårdkontakt eller fasta läkarkontakt, som informationsbehov oberoende av FHIR-realisering."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer eller samordningsnummer"
* typ 1..1 Coding "Typ" "Fast vårdkontakt eller fast läkarkontakt"
* person 1..1 string "Kontaktperson" "Namn på den fasta kontakten"
* giltighet 0..1 Period "Giltighet" "Period då kontakten gäller"
