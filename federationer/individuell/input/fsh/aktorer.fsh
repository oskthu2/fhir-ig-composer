// Källsystem: gemensam roll med förmågor, och två varianter för hur
// information som inte får visas för invånaren hanteras.
Instance: IndividuellKallsystem
InstanceOf: ActorDefinition
Usage: #definition
Title: "Individuell tillgång: källsystem"
Description: "System som gör vårddokumentation tillgänglig för invånarens direktåtkomst. Antas alltid tillsammans med en av varianterna märkande eller filtrerande."
* name = "IndividuellKallsystem"
* title = "Individuell tillgång: källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(TjanstekatalogRegistrerare)
* capabilities = Canonical(IndividuellKallsystemCS)

Instance: IndividuellKallsystemMarkande
InstanceOf: ActorDefinition
Usage: #definition
Title: "Individuell tillgång: märkande källsystem"
Description: "Källsystem som lämnar all information och märker det som inte får visas för invånaren."
* name = "IndividuellKallsystemMarkande"
* title = "Individuell tillgång: märkande källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(IndividuellKallsystem)

Instance: IndividuellKallsystemFiltrerande
InstanceOf: ActorDefinition
Usage: #definition
Title: "Individuell tillgång: filtrerande källsystem"
Description: "Källsystem som själv filtrerar bort information som inte får visas för invånaren."
* name = "IndividuellKallsystemFiltrerande"
* title = "Individuell tillgång: filtrerande källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(IndividuellKallsystem)

Instance: IndividuellKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "Individuell tillgång: invånartjänst"
Description: "Tjänst som visar vårddokumentation för invånaren."
* name = "IndividuellKonsument"
* title = "Individuell tillgång: invånartjänst"
* status = #draft
* type = #system
* capabilities = Canonical(IndividuellKonsumentCS)

Instance: IndividuellKallsystemCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Individuell tillgång, källsystem"
Description: "Infrastrukturkrav på källsystem för individuell tillgång."
* name = "IndividuellKallsystemCS"
* title = "Förmågor: Individuell tillgång, källsystem"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].documentation = "Källsystemet ska publicera vilka patienter som finns per ändpunkt till patientindex, notifiera ny data via prenumerationstjänsten och exponera sitt CapabilityStatement (capability discovery)."
* rest[=].interaction[0].code = #search-system

Instance: IndividuellKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Individuell tillgång, invånartjänst"
Description: "Infrastrukturkrav på invånartjänster för individuell tillgång."
* name = "IndividuellKonsumentCS"
* title = "Förmågor: Individuell tillgång, invånartjänst"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].documentation = "Invånartjänsten hämtar endast information om den inloggade invånaren och använder capability discovery för att avgöra vad varje källsystem stödjer."
* rest[=].interaction[0].code = #search-system

Instance: IndividuellKallsystemKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Individuell tillgång, källsystem"
Description: "Regulatoriska krav på alla källsystem för individuell tillgång."
* name = "IndividuellKallsystemKrav"
* title = "Krav: Individuell tillgång, källsystem"
* status = #draft
* actor[0] = Canonical(IndividuellKallsystem)
* statement[0].key = "IND-K-1"
* statement[=].label = "Bara invånarens egen information"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Källsystemet SKA endast lämna information om den invånare som begäran avser (PDL 5 kap. 5 §)."
* statement[+].key = "IND-K-2"
* statement[=].label = "Information som inte får visas"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Källsystemet SKA säkerställa att information som vårdgivaren bedömt inte får visas för invånaren inte visas, antingen genom märkning eller filtrering."

Instance: IndividuellMarkandeKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: märkande källsystem"
Description: "Krav på källsystem som märker information som inte får visas för invånaren."
* name = "IndividuellMarkandeKrav"
* title = "Krav: märkande källsystem"
* status = #draft
* actor[0] = Canonical(IndividuellKallsystemMarkande)
* derivedFrom[0] = Canonical(IndividuellKallsystemKrav)
* statement[0].key = "IND-M-1"
* statement[=].label = "Märkning"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Källsystemet SKA märka information som inte får visas för invånaren med säkerhetsetiketten NOPAT i `meta.security`."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/individuell/ValueSet/individuell-sakerhetsetikett"

Instance: IndividuellFiltrerandeKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: filtrerande källsystem"
Description: "Krav på källsystem som filtrerar bort information som inte får visas för invånaren."
* name = "IndividuellFiltrerandeKrav"
* title = "Krav: filtrerande källsystem"
* status = #draft
* actor[0] = Canonical(IndividuellKallsystemFiltrerande)
* derivedFrom[0] = Canonical(IndividuellKallsystemKrav)
* statement[0].key = "IND-F-1"
* statement[=].label = "Filtrering"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Källsystemet SKA INTE lämna information som inte får visas för invånaren."

Instance: IndividuellKonsumentKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: invånartjänst"
Description: "Regulatoriska krav på invånartjänster."
* name = "IndividuellKonsumentKrav"
* title = "Krav: invånartjänst"
* status = #draft
* actor[0] = Canonical(IndividuellKonsument)
* statement[0].key = "IND-C-1"
* statement[=].label = "Märkt information"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Invånartjänsten SKA INTE visa information märkt med NOPAT."
* statement[+].key = "IND-C-2"
* statement[=].label = "Stark autentisering"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Invånaren SKA vara autentiserad med lägst tillitsnivå 3 innan information hämtas."
