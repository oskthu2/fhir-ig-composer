Alias: $flag-detail = http://hl7.org/fhir/StructureDefinition/flag-detail
Alias: $provenance-participant-type = http://terminology.hl7.org/CodeSystem/provenance-participant-type

Extension: UppmKommentar
Id: uppm-kommentar
Title: "Kommentar till uppmärksamhetssignal"
Description: "Kommentar till signalen; vid inaktivering även inaktiveringskommentaren."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "Flag"
* value[x] only string

Extension: UppmKonstaterad
Id: uppm-konstaterad
Title: "Konstaterad"
Description: "Datum då förhållandet som föranledde signalen konstaterades."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "Flag"
* value[x] only date

Extension: UppmAllvarlighetsgrad
Id: uppm-allvarlighetsgrad
Title: "Allvarlighetsgrad"
Description: "Bedömning av överkänslighetens allvarlighetsgrad (KV Allvarlighetsgrad)."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "Flag"
* value[x] only CodeableConcept

Extension: UppmVisshet
Id: uppm-visshet
Title: "Visshet"
Description: "Visshetsgrad för överkänsligheten (KV Visshetsgrad)."
* ^status = #draft
* ^context[+].type = #element
* ^context[=].expression = "Flag"
* value[x] only CodeableConcept

Profile: Uppmarksamhetssignal
Parent: Flag
Id: uppmarksamhetssignal
Title: "Uppmärksamhetssignal"
Description: "All uppmärksamhetsinformation är en Flag. Vid överkänslighet finns dessutom en Överkänslighet (AllergyIntolerance) som signalen pekar på."
* ^status = #draft
* insert Realiserar(UppmarksamhetssignalInfo)
* identifier MS
* status MS
* status ^short = "active för gällande signaler"
* subject only Reference(SEPatient)
* subject MS
* category 1..* MS
* category ^short = "Typ av uppmärksamhetssignal, och för överkänslighet även typen av överkänslighet"
* code 1..1 MS
* code ^short = "Substans, sjukdom, behandling eller smitta beroende på typ; rubrik som text för ostrukturerad information"
* period 1..1 MS
* period.start 1..1 MS
* period.end MS
* author only Reference(SEPractitionerRole)
* author MS
* encounter MS
* extension contains
    UppmKommentar named kommentar 0..1 MS and
    UppmKonstaterad named konstaterad 0..1 MS and
    UppmAllvarlighetsgrad named allvarlighetsgrad 0..1 MS and
    UppmVisshet named visshet 0..1 MS and
    $flag-detail named overkanslighet 0..1 MS
* extension[overkanslighet].value[x] only Reference(Overkanslighet)
* extension[overkanslighet] ^short = "Överkänsligheten, när signalen gäller överkänslighet"
* category insert Obligation(#SHALL:populate, UppmProducent)
* code insert Obligation(#SHALL:populate, UppmProducent)
* period.start insert Obligation(#SHALL:populate, UppmProducent)
* extension[overkanslighet] insert Obligation(#SHALL:populate-if-known, UppmProducent)
* category insert Obligation(#SHALL:display, UppmKonsument)
* code insert Obligation(#SHALL:display, UppmKonsument)
* period insert Obligation(#SHALL:display, UppmKonsument)

Profile: Overkanslighet
Parent: AllergyIntolerance
Id: overkanslighet
Title: "Överkänslighet"
Description: "Allergi eller annan överkänslighet. Finns bara när uppmärksamhetssignalen gäller överkänslighet; signalen är alltid primär."
* ^status = #draft
* insert Realiserar(OverkanslighetInfo)
* patient only Reference(SEPatient)
* patient MS
* clinicalStatus MS
* verificationStatus MS
* verificationStatus ^short = "Från visshetsgraden"
* type MS
* code 1..1 MS
* code ^short = "Agens: ATC-substans, annat kodat agens eller fritext"
* onsetDateTime MS
* recordedDate MS
* note MS
* reaction MS
* reaction.severity MS
* reaction.substance MS
* reaction.substance ^short = "Läkemedelsprodukt (NPL-id)"
* participant ^slicing.discriminator.type = #pattern
* participant ^slicing.discriminator.path = "function"
* participant ^slicing.rules = #open
* participant contains ansvarig 0..1 MS and signerare 0..1 MS
* participant[ansvarig].function = $provenance-participant-type#author
* participant[ansvarig].actor only Reference(SEPractitionerRole)
* participant[signerare].function = $provenance-participant-type#legal
* participant[signerare].actor only Reference(SEPractitionerRole)
* code insert Obligation(#SHALL:populate, UppmProducent)
* reaction.severity insert Obligation(#SHOULD:populate-if-known, UppmProducent)
* code insert Obligation(#SHALL:display, UppmKonsument)
* reaction.severity insert Obligation(#SHALL:display, UppmKonsument)
