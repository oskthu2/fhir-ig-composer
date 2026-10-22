// Tjänsteaktörer: korsningen mellan domänens och federationens aktörer.
Instance: POT2Producent
InstanceOf: ActorDefinition
Usage: #definition
Title: "Patientöversikt (T2): källsystem"
Description: "Källsystem som tillhandahåller patientöversiktens informationsmängder i Patientöversiktsfederationen."
* name = "POT2Producent"
* title = "Patientöversikt (T2): källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(POProducent)
* derivedFrom[+] = Canonical(POT2Kallsystem)
* capabilities = Canonical(POT2ProducentCS)

Instance: POT2Visning
InstanceOf: ActorDefinition
Usage: #definition
Title: "Patientöversikt (T2): visning"
Description: "System som visar patientöversikten i Patientöversiktsfederationen."
* name = "POT2Visning"
* title = "Patientöversikt (T2): visning"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(POKonsument)
* derivedFrom[+] = Canonical(POT2Konsument)
* capabilities = Canonical(POT2VisningCS)
