Instance: SVODKallsystem
InstanceOf: ActorDefinition
Usage: #definition
Title: "SVOD: källsystem"
Description: "System som gör information tillgänglig för andra vårdgivare inom sammanhållen vård- och omsorgsdokumentation."
* name = "SVODKallsystem"
* title = "SVOD: källsystem"
* status = #draft
* type = #system
* derivedFrom[0] = Canonical(TjanstekatalogRegistrerare)
* capabilities = Canonical(SVODKallsystemCS)

Instance: SVODKonsument
InstanceOf: ActorDefinition
Usage: #definition
Title: "SVOD: konsument"
Description: "System som tar del av information från andra vårdgivare inom sammanhållen vård- och omsorgsdokumentation."
* name = "SVODKonsument"
* title = "SVOD: konsument"
* status = #draft
* type = #system
* capabilities = Canonical(SVODKonsumentCS)

Instance: SVODKallsystemCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: SVOD, källsystem"
Description: "Infrastrukturkrav på källsystem i SVOD."
* name = "SVODKallsystemCS"
* title = "Förmågor: SVOD, källsystem"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].documentation = "Källsystemet ska vara registrerat i tjänstekatalogen, publicera vilka patienter som finns per ändpunkt till patientindex, och notifiera ny data via prenumerationstjänsten."
* rest[=].resource[0].type = #Provenance
* rest[=].resource[=].documentation = "Proveniens för källsystem och mellanliggande infrastruktur."
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[=].searchParam[0].name = "target"
* rest[=].resource[=].searchParam[=].definition = "http://hl7.org/fhir/SearchParameter/Provenance-target"
* rest[=].resource[=].searchParam[=].type = #reference
* rest[+].mode = #client
* rest[=].documentation = "Källsystemet anmäler vilka patienter som finns hos ändpunkten till patientindex."
* rest[=].resource[0].type = #List
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #update

Instance: SVODKonsumentCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: SVOD, konsument"
Description: "Infrastrukturkrav på konsumenter i SVOD."
* name = "SVODKonsumentCS"
* title = "Förmågor: SVOD, konsument"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #client
* rest[=].documentation = "Konsumenten ska verifiera patientrelation (tgp) före åtkomst och tillämpa spärrar baserat på metadata om vårdenhet och vårdgivare."
* rest[=].interaction[0].code = #search-system
* rest[=].resource[0].type = #Provenance
* rest[=].resource[=].interaction[0].code = #search-type
* rest[=].resource[+].type = #AuditEvent
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[+].type = #Subscription
* rest[=].resource[=].interaction[0].code = #create

Instance: SVODKallsystemKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: SVOD, källsystem"
Description: "Regulatoriska krav på källsystem i SVOD."
* name = "SVODKallsystemKrav"
* title = "Krav: SVOD, källsystem"
* status = #draft
* actor[0] = Canonical(SVODKallsystem)
* statement[0].key = "SVOD-K-1"
* statement[=].label = "Metadata för spärr"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Varje resurs SKA bära vårdenhet och vårdgivare så att konsumenten kan tillämpa inre och yttre spärr (PDL 4 kap. 4 §, 6 kap. 2 §)."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/svod/StructureDefinition/svod-vardenhet"
* statement[=].satisfiedBy[+] = "https://fhir.inera.se/ig/svod/StructureDefinition/svod-vardgivare"
* statement[+].key = "SVOD-K-2"
* statement[=].label = "Registrering i tjänstekatalogen"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Källsystemets ändpunkter SKA vara registrerade i tjänstekatalogen med den tjänstespecifika API-specifikationen."
* statement[=].satisfiedBy[0] = "https://fhir.inera.se/ig/tjanstekatalog/StructureDefinition/tk-api-instance"

Instance: SVODKonsumentKrav
InstanceOf: Requirements
Usage: #definition
Title: "Krav: SVOD, konsument"
Description: "Regulatoriska krav på konsumenter i SVOD."
* name = "SVODKonsumentKrav"
* title = "Krav: SVOD, konsument"
* status = #draft
* actor[0] = Canonical(SVODKonsument)
* statement[0].key = "SVOD-C-1"
* statement[=].label = "Spärr"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Konsumenten SKA tillämpa inre och yttre spärr utifrån resursens vårdenhet och vårdgivare."
* statement[+].key = "SVOD-C-2"
* statement[=].label = "Patientrelation"
* statement[=].conformance[0] = #SHALL
* statement[=].requirement = "Konsumenten SKA verifiera patientrelation innan information hämtas."

// Stödtjänster som vävs in i tjänsternas användningsfall via federationens
// flödesmönster (se input/scenarier).
Instance: SVODPatientrelationstjanst
InstanceOf: ActorDefinition
Usage: #definition
Title: "SVOD: patientrelationstjänst"
Description: "Stödtjänst som verifierar att användaren har en patientrelation till patienten."
* insert Stodtjanst
* name = "SVODPatientrelationstjanst"
* title = "SVOD: patientrelationstjänst"
* status = #draft
* type = #system
* capabilities = Canonical(SVODPatientrelationstjanstCS)

Instance: SVODLoggtjanst
InstanceOf: ActorDefinition
Usage: #definition
Title: "SVOD: loggtjänst"
Description: "Stödtjänst som tar emot åtkomstloggar."
* insert Stodtjanst
* name = "SVODLoggtjanst"
* title = "SVOD: loggtjänst"
* status = #draft
* type = #system
* capabilities = Canonical(SVODLoggtjanstCS)

Instance: SVODPatientrelationstjanstCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: SVOD, patientrelationstjänst"
Description: "Förmågor hos patientrelationstjänsten."
* name = "SVODPatientrelationstjanstCS"
* title = "Förmågor: SVOD, patientrelationstjänst"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].documentation = "Verifierar patientrelation för en användare och en patient."
* rest[=].interaction[0].code = #search-system

Instance: SVODLoggtjanstCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: SVOD, loggtjänst"
Description: "Förmågor hos loggtjänsten."
* name = "SVODLoggtjanstCS"
* title = "Förmågor: SVOD, loggtjänst"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[0].type = #AuditEvent
* rest[=].resource[=].interaction[0].code = #create

Instance: SVODPatientindex
InstanceOf: ActorDefinition
Usage: #definition
Title: "SVOD: patientindex"
Description: "Stödtjänst som håller reda på vilka patienter som finns hos vilka ändpunkter."
* insert Stodtjanst
* name = "SVODPatientindex"
* title = "SVOD: patientindex"
* status = #draft
* type = #system
* capabilities = Canonical(SVODPatientindexCS)

Instance: SVODPrenumerationstjanst
InstanceOf: ActorDefinition
Usage: #definition
Title: "SVOD: prenumerationstjänst"
Description: "Stödtjänst som notifierar konsumenter om ny data för patienter de har en vårdrelation till."
* insert Stodtjanst
* name = "SVODPrenumerationstjanst"
* title = "SVOD: prenumerationstjänst"
* status = #draft
* type = #system
* capabilities = Canonical(SVODPrenumerationstjanstCS)

Instance: SVODPatientindexCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: SVOD, patientindex"
Description: "Förmågor hos patientindex."
* name = "SVODPatientindexCS"
* title = "Förmågor: SVOD, patientindex"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[0].type = #List
* rest[=].resource[=].interaction[0].code = #create
* rest[=].resource[=].interaction[+].code = #update

Instance: SVODPrenumerationstjanstCS
InstanceOf: CapabilityStatement
Usage: #definition
Title: "Förmågor: SVOD, prenumerationstjänst"
Description: "Förmågor hos prenumerationstjänsten."
* name = "SVODPrenumerationstjanstCS"
* title = "Förmågor: SVOD, prenumerationstjänst"
* status = #draft
* date = "2026-10-22"
* kind = #requirements
* fhirVersion = #5.0.0
* format[0] = #json
* rest[0].mode = #server
* rest[=].resource[0].type = #Subscription
* rest[=].resource[=].interaction[0].code = #create
