Instance: VardkontaktNPOExempel
InstanceOf: VardkontaktNPO
Usage: #example
Title: "Exempel: vårdkontakt i NPÖ"
Description: "Vårdkontakt med kontaktuppgift och SVOD-metadata."
* insert SVODExempelmetadata(https://journal.exempelregion.se/fhir, SE2321000016-ABCD, SE2321000016-0001)
* status = #completed
* class = http://terminology.hl7.org/CodeSystem/v3-ActCode#AMB
* subject.display = "Exempelpatient"
* actualPeriod.start = "2026-09-01T09:00:00+02:00"
* actualPeriod.end = "2026-09-01T09:30:00+02:00"
* serviceProvider.display = "Exempelvårdcentralen"
* extension[kontaktuppgift].valueContactPoint.system = #phone
* extension[kontaktuppgift].valueContactPoint.value = "+46 8 123 456 00"

Instance: FastKontaktNPOExempel
InstanceOf: FastKontakt
Usage: #example
Title: "Exempel: fast vårdkontakt i NPÖ"
Description: "Fast vårdkontakt med SVOD-metadata. Profilen Fast kontakt är kopierad från byggblocket och har fått SVOD:s metadata som ytterligare bas."
* insert SVODExempelmetadata(https://journal.exempelregion.se/fhir, SE2321000016-ABCD, SE2321000016-0001)
* status = #active
* subject.display = "Exempelpatient"
* participant[0].role = FastKontaktTyp#fast-vardkontakt
* participant[=].member.display = "Dr Exempel"
