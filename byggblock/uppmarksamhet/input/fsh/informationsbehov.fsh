// Informationsbehov (logiska modeller), oberoende av FHIR-realisering och källformat.
Logical: UppmarksamhetssignalInfo
Id: UppmarksamhetssignalInfo
Title: "Informationsbehov: Uppmärksamhetssignal"
Description: "Information som vården behöver uppmärksammas på: överkänslighet, allvarlig sjukdom, behandling, smitta, vårdbegränsning eller ostrukturerad information."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer, samordningsnummer eller nationellt reservnummer"
* typ 1..1 CodeableConcept "Typ av uppmärksamhetssignal" "T.ex. överkänslighet, allvarlig sjukdom, smitta"
* kod 0..1 CodeableConcept "Klinisk kod" "Substans, sjukdom eller behandling, beroende på typ"
* giltigFran 1..1 dateTime "Giltig från" "Från när signalen gäller"
* giltigTill 0..1 dateTime "Giltig till" "Planerat slut eller inaktivering"
* kommentar 0..1 string "Kommentar" "Kommentar till signalen"
* konstaterad 0..1 date "Konstaterad" "När förhållandet konstaterades"
* ansvarig 0..1 Identifier "Ansvarig" "Ansvarig hälso- och sjukvårdspersonal (HSA-id)"

Logical: OverkanslighetInfo
Id: OverkanslighetInfo
Title: "Informationsbehov: Överkänslighet"
Description: "En allergi eller annan överkänslighet, med agens, allvarlighetsgrad och visshet."
* ^status = #draft
* patient 1..1 Identifier "Patient" "Personnummer, samordningsnummer eller nationellt reservnummer"
* agens 1..1 CodeableConcept "Agens" "Substans (ATC) eller annat agens"
* allvarlighetsgrad 0..1 code "Allvarlighetsgrad" "Hur allvarlig överkänsligheten är"
* visshet 0..1 code "Visshet" "Hur säker uppgiften är"
* konstaterad 0..1 date "Konstaterad" "När överkänsligheten konstaterades"
* lakemedelsprodukt 0..* Identifier "Läkemedelsprodukt" "NPL-id för produkter som orsakar överkänsligheten"
