// Kodsystem och värdemängder för kompositionsextensionerna. Koderna är
// ASCII för att fungera som nycklar i verktyget och i regler.yaml.

CodeSystem: IGRoll
Id: ig-roll
Title: "IG-roll"
Description: "Vilken roll en IG har i kompositionen."
* ^status = #draft
* ^caseSensitive = true
* ^content = #complete
* #byggblock "Byggblock" "Domänbyggblock: kliniskt innehåll (profiler, terminologi, aktörer). Publiceras normalt inte som tjänst."
* #federation "Federation" "Juridiskt utrymme: säkerhetsmetadata, stödtjänster och infrastrukturkrav. Begränsar aldrig kliniska element."
* #tjanst "Tjänst" "En cell i matrisen federation × domän. Komponeras av byggblock och exakt en federation, och publiceras."
* #konvention "Konvention" "Definierar själva kompositionsmekanismen (detta paket)."

ValueSet: IGRollVS
Id: ig-roll
Title: "IG-roll"
Description: "Tillåtna värden för extension ig-roll."
* ^status = #draft
* include codes from system IGRoll

CodeSystem: Publicering
Id: publicering
Title: "Publicering"
Description: "Om en IG:s artefakter är publicerade och kan refereras, eller är interna och måste kopieras in."
* ^status = #draft
* ^caseSensitive = true
* ^content = #complete
* #intern "Intern" "Publiceras inte. Artefakter kopieras in i konsumerande IG med omskriven kanonisk URL."
* #publik "Publik" "Publiceras som paket. Artefakter refereras via paketberoende."

ValueSet: PubliceringVS
Id: publicering
Title: "Publicering"
Description: "Tillåtna värden för extension publicering."
* ^status = #draft
* include codes from system Publicering

CodeSystem: Inkludering
Id: inkludering
Title: "Inkludering"
Description: "Hur ett beroende eller en artefakt tas med i en konsumerande IG."
* ^status = #draft
* ^caseSensitive = true
* ^content = #complete
* #kopiera "Kopiera" "Kopiera in källkoden och skriv om kanonisk URL."
* #referera "Referera" "Referera via paketberoende, ingen kopiering (RuleSets kopieras ändå)."
* #exkludera "Exkludera" "Ta inte med artefakten."

ValueSet: InkluderingVS
Id: inkludering
Title: "Inkludering"
Description: "Tillåtna värden för inkludering och kompositionsanvisning."
* ^status = #draft
* include codes from system Inkludering
