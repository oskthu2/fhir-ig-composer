Instance: VardkontaktNPOExempel
InstanceOf: VardkontaktNPO
Usage: #example
Title: "Exempel: vårdkontakt i NPÖ"
Description: "Vårdkontakt med kontaktuppgift och källsystem; spärrmetadata i proveniensen."
* insert SVODExempelmetadata(https://tjanstekatalogen.inera.se/Endpoint/SE2321000016-ABCD)
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
Description: "Fast vårdkontakt med källsystem; spärrmetadata i proveniensen. Profilen Fast kontakt är kopierad från byggblocket och har fått SVOD:s metadata som ytterligare bas."
* insert SVODExempelmetadata(https://tjanstekatalogen.inera.se/Endpoint/SE2321000016-ABCD)
* status = #active
* subject.display = "Exempelpatient"
* participant[0].role = FastKontaktTyp#fast-vardkontakt
* participant[=].member.display = "Dr Exempel"

Instance: VardkontaktNPOProvenans
InstanceOf: SVODProvenans
Usage: #example
Title: "Exempel: proveniens för vårdkontakten"
Description: "Vårdgivare (yttre spärr) och vårdenhet (inre spärr) för vårdkontakten."
* insert SVODExempelprovenans(Encounter/VardkontaktNPOExempel, 2026-09-01T09:35:00+02:00, SE2321000016-0001, SE2321000016-ABCD)

Instance: FastKontaktNPOProvenans
InstanceOf: SVODProvenans
Usage: #example
Title: "Exempel: proveniens för den fasta vårdkontakten"
Description: "Vårdgivare (yttre spärr) och vårdenhet (inre spärr) för den fasta vårdkontakten."
* insert SVODExempelprovenans(CareTeam/FastKontaktNPOExempel, 2026-08-15T10:00:00+02:00, SE2321000016-0001, SE2321000016-ABCD)
