// RuleSets och alias som kopieras in i varje komponerad IG (regel
// kopiering.ruleSetsAlltid). FSH delar inte RuleSets mellan paket, därför
// kopierar verktyget dem. Extension-URL:erna pekar alltid på detta paket och
// skrivs aldrig om.

// Multipelt arv. Lägger till en profil som ytterligare bas utöver Parent.
// I dag uttryckt med imposeProfile ur Extensions Pack, som valideraren
// kontrollerar. När multipelt arv tas upp i FHIR/FSH ändras bara denna
// RuleSet — inte profilerna som använder den.
// Adresseras via alias så att flera baser och ärvda extensions på profilen
// inte skriver över varandra.
RuleSet: Bas(profil)
* ^extension[$imposeProfile][+].valueCanonical = Canonical({profil})

// Krav på ett element för en viss systemroll. Används med sökväg:
//   * period insert Obligation(#SHALL:populate, PSProducent)
// Verktyget läser dessa för att härleda kravprofilen per systemroll.
// SUSHI:s [+] räknar inte med obligations som elementet ärver; det rättas
// av "ig-compose efterbehandla" efter SUSHI. (Alias-adressering fungerar
// inte här: SUSHI slår då ihop obligationen med den ärvda.)
RuleSet: Obligation(kod, aktor)
* ^extension[+].url = "http://hl7.org/fhir/StructureDefinition/obligation"
* ^extension[=].extension[+].url = "code"
* ^extension[=].extension[=].valueCode = {kod}
* ^extension[=].extension[+].url = "actor"
* ^extension[=].extension[=].valueCanonical = Canonical({aktor})

// Artefaktnivå: överstyr hur artefakten tas med vid komposition.
// Extensions adresseras med alias (inte [+]) eftersom SUSHI självt lägger
// extensions på t.ex. extension-definitioner.
RuleSet: Kompositionsanvisning(inkludering)
* ^extension[$kompositionsanvisning].valueCode = {inkludering}

// Infogas av verktyget i kopierade profiler, extensions, värdemängder och
// kodsystem.
RuleSet: KopieradFran(url)
* ^extension[$kopierad-fran].valueCanonical = "{url}"

// Infogas av verktyget i kopierade instanser (ActorDefinition,
// CapabilityStatement, Requirements m.fl.).
RuleSet: KopieradFranInstans(url)
* extension[$kopierad-fran].valueCanonical = "{url}"
