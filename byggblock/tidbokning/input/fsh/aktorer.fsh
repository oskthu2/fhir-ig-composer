Instance: TidTidbok
InstanceOf: ActorDefinition
Usage: #definition
Title: "Tidbokning: tidbok"
Description: "Tidbokssystem som har lediga tider och tar emot bokningar."
* name = "TidTidbok"
* title = "Tidbokning: tidbok"
* status = #draft
* type = #system
* capabilities = Canonical(TidTidbokCS)

Instance: TidBokningstjanst
InstanceOf: ActorDefinition
Usage: #definition
Title: "Tidbokning: bokningstjänst"
Description: "Tjänst där invånaren söker och bokar tider."
* name = "TidBokningstjanst"
* title = "Tidbokning: bokningstjänst"
* status = #draft
* type = #system
* capabilities = Canonical(TidBokningstjanstCS)

Instance: TidInvanare
InstanceOf: ActorDefinition
Usage: #definition
Title: "Invånare som bokar"
Description: "Invånaren som bokar en tid."
* name = "TidInvanare"
* title = "Invånare som bokar"
* status = #draft
* type = #person

Instance: TidTidbokCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Tidbokning, tidbok"
Description: "Krav på API för tidboken."
* name = "TidTidbokCS"
* title = "Förmågor: Tidbokning, tidbok"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[+].type = #Slot
* rest[=].resource[=].profile = Canonical(LedigTid)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].searchParam[0].name = "start"
* rest[=].resource[=].searchParam[=].type = #date
* rest[=].resource[=].searchParam[+].name = "status"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[=].searchParam[+].name = "service-type"
* rest[=].resource[=].searchParam[=].type = #token
* rest[=].resource[+].type = #Appointment
* rest[=].resource[=].profile = Canonical(Bokning)
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #read
* rest[=].resource[=].interaction[+].code = #search-type
* rest[=].resource[=].searchParam[0].name = "patient"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[=].resource[=].searchParam[+].name = "date"
* rest[=].resource[=].searchParam[=].type = #date

Instance: TidBokningstjanstCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: Tidbokning, bokningstjänst"
Description: "Krav på API för bokningstjänsten."
* name = "TidBokningstjanstCS"
* title = "Förmågor: Tidbokning, bokningstjänst"
* status = #draft
* date = "2026-10-23"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].resource[+].type = #Slot
* rest[=].resource[=].profile = Canonical(LedigTid)
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[+].type = #Appointment
* rest[=].resource[=].profile = Canonical(Bokning)
* rest[=].resource[=].interaction[0].code = #create

Instance: TidKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: Tidbokning"
Description: "Verksamhetskrav på tidboken."
* name = "TidKrav"
* title = "Krav: Tidbokning"
* status = #draft
* actor[0] = Canonical(TidTidbok)
* statement[0].key = "TID-1"
* statement[=].label = "Bara lediga tider"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Tidboken SKA bara lämna tider som är lediga när de söks."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-tidbokning/StructureDefinition/ledig-tid"
* statement[+].key = "TID-2"
* statement[=].label = "Dubbelbokning"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Tidboken SKA avvisa en bokning av en tid som redan är bokad."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/bb-tidbokning/StructureDefinition/bokning"
