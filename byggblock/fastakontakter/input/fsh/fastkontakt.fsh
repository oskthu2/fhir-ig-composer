CodeSystem: FastKontaktTyp
Id: fast-kontakt-typ
Title: "Typ av fast kontakt"
Description: "Typ av fast kontakt enligt patientlagen (2014:821) 6 kap."
* ^status = #draft
* ^caseSensitive = true
* ^content = #complete
* #fast-vardkontakt "Fast vårdkontakt"
* #fast-lakarkontakt "Fast läkarkontakt"

ValueSet: FastKontaktTypVS
Id: fast-kontakt-typ
Title: "Typer av fast kontakt"
Description: "Typer av fast kontakt."
* ^status = #draft
* include codes from system FastKontaktTyp

Profile: FastKontakt
Parent: CareTeam
Id: fast-kontakt
Title: "Fast kontakt"
Description: "En patients fasta vårdkontakt eller fasta läkarkontakt."
* ^status = #draft
* status 1..1 MS
* subject 1..1 MS
* subject only Reference(Patient)
* period MS
* participant 1..* MS
* participant.role 1..1 MS
* participant.role from FastKontaktTypVS (extensible)
* participant.member 1..1 MS
* participant.member only Reference(Practitioner or PractitionerRole)
* managingOrganization MS

* subject insert Obligation(#SHALL:populate, FKProducent)
* participant.role insert Obligation(#SHALL:populate, FKProducent)
* participant.member insert Obligation(#SHALL:populate, FKProducent)
* period insert Obligation(#SHALL:populate-if-known, FKProducent)
* participant.role insert Obligation(#SHALL:display, FKKonsument)
* participant.member insert Obligation(#SHALL:display, FKKonsument)
