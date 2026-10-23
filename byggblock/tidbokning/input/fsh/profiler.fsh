Profile: LedigTid
Parent: Slot
Id: ledig-tid
Title: "Ledig tid"
Description: "En tid i tidboken som kan bokas."
* ^status = #draft
* insert Realiserar(LedigTidInfo)
* schedule MS
* status MS
* start MS
* end MS
* serviceType MS
* start insert Obligation(#SHALL:populate, TidTidbok)
* end insert Obligation(#SHALL:populate, TidTidbok)
* status insert Obligation(#SHALL:populate, TidTidbok)
* start insert Obligation(#SHALL:display, TidBokningstjanst)

Profile: Bokning
Parent: Appointment
Id: bokning
Title: "Bokning"
Description: "En bokad tid för en patient."
* ^status = #draft
* insert Realiserar(BokningInfo)
* status MS
* start 1..1 MS
* end 1..1 MS
* subject 1..1 MS
* subject only Reference(Patient)
* participant MS
* serviceType MS
* slot MS
// R5-kärnan binder class till THO:s EncounterClass, som inte finns i THO 7; samma koder finns i v3-ActEncounterCode.
* class from http://terminology.hl7.org/ValueSet/v3-ActEncounterCode (preferred)
* start insert Obligation(#SHALL:populate, TidBokningstjanst)
* subject insert Obligation(#SHALL:populate, TidBokningstjanst)
* slot insert Obligation(#SHALL:populate, TidBokningstjanst)
* status insert Obligation(#SHALL:populate, TidTidbok)
