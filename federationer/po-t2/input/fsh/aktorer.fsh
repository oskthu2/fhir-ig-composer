Instance: POT2Kallsystem
InstanceOf: ActorDefinition
Usage: #definition
Title: "Patientöversiktsfederationen: källsystem"
Description: "Medlem som registrerar sin anslutningspunkt med de informationsmängder den implementerar."
* name = "POT2Kallsystem"
* title = "Patientöversiktsfederationen: källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(TjanstekatalogRegistrerare)
* derivedFrom[+] = Canonical(Federationsmedlem)

Instance: POT2Konsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Patientöversiktsfederationen: konsument"
Description: "Medlem som hittar producenter med tjänstesökning och anropar dem med åtkomstintyg."
* name = "POT2Konsument"
* title = "Patientöversiktsfederationen: konsument"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(T2Konsument)
* derivedFrom[+] = Canonical(Federationsmedlem)

Instance: POT2Engagemangsindexerad
InstanceOf: ActorDefinition
Usage: #definition
Title: "Patientöversiktsfederationen: engagemangsindexerat källsystem"
Description: "Tillval: källsystemet anmäler engagemang och anropas bara för patienter det har engagemang för. Källsystem utan tillvalet anropas alltid."
* insert TillvalFor(POT2Kallsystem)
* name = "POT2Engagemangsindexerad"
* title = "Patientöversiktsfederationen: engagemangsindexerat källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(Engagemangsproducent)

Instance: POT2KonsumentKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Patientöversiktsfederationen, konsument"
Description: "Federationens krav på konsumenter."
* name = "POT2KonsumentKrav"
* title = "Krav: Patientöversiktsfederationen, konsument"
* status = #draft
* actor[0] = Canonical(POT2Konsument)
* statement[0].key = "POT2-K-1"
* statement[=].label = "Icke-indexerade producenter"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Konsumenten SKA anropa producenter som inte är engagemangsindexerade även när engagemangsindexet saknar engagemang för patienten."
