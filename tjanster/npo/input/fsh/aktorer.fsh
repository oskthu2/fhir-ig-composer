// Tjänsteaktörer: korsningen mellan domänens och federationens aktörer.
// Förmågorna (<Aktör>CS) och kraven (<Aktör>Krav) genereras av ig-compose.
Instance: NPOKallsystem
InstanceOf: ActorDefinition
Usage: #definition
Title: "NPÖ: källsystem"
Description: "Källsystem som tillhandahåller information till NPÖ."
* name = "NPOKallsystem"
* title = "NPÖ: källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(PSProducent)
* derivedFrom[+] = Canonical(SVODKallsystem)
* capabilities = Canonical(NPOKallsystemCS)

Instance: NPOKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "NPÖ: konsument"
Description: "System som visar NPÖ för behörig vårdpersonal."
* name = "NPOKonsument"
* title = "NPÖ: konsument"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(PSKonsument)
* derivedFrom[+] = Canonical(SVODKonsument)
* capabilities = Canonical(NPOKonsumentCS)
