// Tjänsteaktörer: korsningen mellan domänernas och federationens aktörer.
// Federationen har två varianter av källsystem (märkande och filtrerande),
// så tjänsten har två källsystemsroller. Förmågorna (<Aktör>CS) och kraven
// (<Aktör>Krav) genereras av ig-composer.
Instance: Journal1177KallsystemMarkande
InstanceOf: ActorDefinition
Usage: #definition
Title: "1177 Journal: märkande källsystem"
Description: "Källsystem som lämnar journalinformation till 1177 Journal och märker det som inte får visas för invånaren."
* name = "Journal1177KallsystemMarkande"
* title = "1177 Journal: märkande källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(PSProducent)
* derivedFrom[+] = Canonical(LabProducent)
* derivedFrom[+] = Canonical(IndividuellKallsystemMarkande)
* capabilities = Canonical(Journal1177KallsystemMarkandeCS)

Instance: Journal1177KallsystemFiltrerande
InstanceOf: ActorDefinition
Usage: #definition
Title: "1177 Journal: filtrerande källsystem"
Description: "Källsystem som lämnar journalinformation till 1177 Journal och själv filtrerar bort det som inte får visas för invånaren."
* name = "Journal1177KallsystemFiltrerande"
* title = "1177 Journal: filtrerande källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(PSProducent)
* derivedFrom[+] = Canonical(LabProducent)
* derivedFrom[+] = Canonical(IndividuellKallsystemFiltrerande)
* capabilities = Canonical(Journal1177KallsystemFiltrerandeCS)

Instance: Journal1177Invanartjanst
InstanceOf: ActorDefinition
Usage: #definition
Title: "1177 Journal: invånartjänst"
Description: "1177 Journal, som visar journalinformationen för invånaren."
* name = "Journal1177Invanartjanst"
* title = "1177 Journal: invånartjänst"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(PSKonsument)
* derivedFrom[+] = Canonical(LabKonsument)
* derivedFrom[+] = Canonical(IndividuellKonsument)
* capabilities = Canonical(Journal1177InvanartjanstCS)
