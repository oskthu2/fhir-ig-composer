// Gemensamma profiler för byggblocken. Identifierarkonventionerna följer
// svenska basprofiler (SEBasePatient, SEBaseOrganization,
// SEBasePractitionerRole) och EHDS-TK, men i R5: profilerna ärver FHIR:s
// basresurser, inte HL7 Europe Core (EURIDICE är R4).

Alias: $personnummer = http://electronichealth.se/identifier/personnummer
Alias: $samordningsnummer = http://electronichealth.se/identifier/samordningsnummer
Alias: $nationelltReservnummer = http://electronichealth.se/identifier/nationelltReservnummer
Alias: $hsaid = urn:oid:1.2.752.29.4.19
Alias: $v2-0203 = http://terminology.hl7.org/CodeSystem/v2-0203

Profile: SEPatient
Parent: Patient
Id: se-patient
Title: "Patient"
Description: "Patient med svenska identifierare: personnummer, samordningsnummer eller nationellt reservnummer."
* ^status = #draft
* identifier 1..* MS
* identifier ^slicing.discriminator.type = #value
* identifier ^slicing.discriminator.path = "system"
* identifier ^slicing.rules = #open
* identifier contains
    personnummer 0..1 MS and
    samordningsnummer 0..1 MS and
    nationelltReservnummer 0..1 MS
* identifier[personnummer].system = $personnummer
* identifier[personnummer].value 1..1 MS
* identifier[samordningsnummer].system = $samordningsnummer
* identifier[samordningsnummer].value 1..1 MS
* identifier[nationelltReservnummer].system = $nationelltReservnummer
* identifier[nationelltReservnummer].value 1..1 MS
* name MS
* gender MS
* birthDate MS
* birthDate ^short = "Kan härledas ur personnummer eller samordningsnummer (samordningsnummer: dag − 60)"

Profile: SEOrganization
Parent: Organization
Id: se-organization
Title: "Organisationsenhet"
Description: "Organisationsenhet, t.ex. vårdenhet eller vårdgivare, med HSA-id. HSA saknar historik, så den producerande verksamhetens uppgifter är den korrekta ögonblicksbilden för historiska data."
* ^status = #draft
* identifier MS
* identifier ^slicing.discriminator.type = #value
* identifier ^slicing.discriminator.path = "system"
* identifier ^slicing.rules = #open
* identifier contains hsaid 0..1 MS
* identifier[hsaid].system = $hsaid
* identifier[hsaid].type = $v2-0203#PRN
* identifier[hsaid].value 1..1 MS
* name MS
* contact MS
* contact.telecom MS
* contact.address MS

Profile: SEPractitionerRole
Parent: PractitionerRole
Id: se-practitionerrole
Title: "Hälso- och sjukvårdspersonal i uppdrag"
Description: "Hälso- och sjukvårdspersonal i ett medarbetaruppdrag, med HSA-id. Refereras normalt logiskt via identifier."
* ^status = #draft
* identifier MS
* identifier ^slicing.discriminator.type = #value
* identifier ^slicing.discriminator.path = "system"
* identifier ^slicing.rules = #open
* identifier contains hsaid 0..1 MS
* identifier[hsaid].system = $hsaid
* identifier[hsaid].type = $v2-0203#PRN
* identifier[hsaid].value 1..1 MS
* practitioner MS
* organization only Reference(SEOrganization)
* organization MS
* code MS
* code ^short = "Befattning eller yrkesroll"
