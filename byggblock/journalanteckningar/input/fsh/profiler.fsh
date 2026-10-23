Profile: Journalanteckning
Parent: DocumentReference
Id: journalanteckning
Title: "Journalanteckning"
Description: "En signerad journalanteckning."
* ^status = #draft
* insert Realiserar(AnteckningInfo)
* status MS
* docStatus MS
* type 1..1 MS
* subject 1..1 MS
* subject only Reference(Patient)
* date MS
* author MS
* custodian MS
* content MS
* content.attachment MS
* type insert Obligation(#SHALL:populate, AntProducent)
* date insert Obligation(#SHALL:populate, AntProducent)
* content.attachment insert Obligation(#SHALL:populate, AntProducent)
* author insert Obligation(#SHOULD:populate-if-known, AntProducent)
* type insert Obligation(#SHALL:display, AntKonsument)
* author insert Obligation(#SHALL:display, AntKonsument)
* content.attachment insert Obligation(#SHALL:display, AntKonsument)
