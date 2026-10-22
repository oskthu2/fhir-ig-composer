// Tjänstespecifik skärpning: NPÖ kräver kontaktuppgift på vårdkontakten.
// Två baser: domänens Vardkontakt (Parent) och federationens metadata för
// Encounter (Bas), som verktyget genererar från SVOD:s federationsmönster.
Profile: VardkontaktNPO
Parent: Vardkontakt
Id: vardkontakt-npo
Title: "Vårdkontakt NPÖ"
Description: "Vårdkontakt i NPÖ. Skärper Patientöversikts Vårdkontakt: kontaktuppgift är obligatorisk. Uppfyller dessutom SVOD:s metadatakrav."
* ^status = #draft
* insert Bas(SVODMetadataEncounter)
* extension[kontaktuppgift] 1..1
* extension[kontaktuppgift] insert Obligation(#SHALL:populate, NPOKallsystem)
