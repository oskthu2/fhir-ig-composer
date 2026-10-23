### Byggblock: Grund

Gemensamma profiler som de kliniska byggblocken refererar till:

- **Patient** med personnummer, samordningsnummer eller nationellt reservnummer.
- **Organisationsenhet** (vårdenhet, vårdgivare) med HSA-id.
- **Hälso- och sjukvårdspersonal i uppdrag** med HSA-id.

Identifierarkonventionerna följer svenska basprofiler och EHDS-TK. Byggblocket är FHIR R5 och ärver basresurserna; det är inte en profilering av HL7 Europe Core eller EURIDICE (som är R4).

Byggblocket komponeras in i andra byggblock och kopieras med dem till tjänsterna.
