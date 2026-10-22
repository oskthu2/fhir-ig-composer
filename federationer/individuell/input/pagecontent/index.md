### Federation: Individuell tillgång

Federationsbyggblock (`ig-roll = federation`, `publicering = intern`) för invånares direktåtkomst till sin egen vårddokumentation (patientdatalagen 5 kap. 5 §, GDPR art. 15).

Federationen innehåller inga kliniska profiler. Dess krav på varje resurs är mönstret `IndividuellMetadata`: säkerhetsetiketten NOPAT i `meta.security` för information som inte får visas för invånaren. När en tjänst i federationen komponeras genererar verktyget `IndividuellMetadata<Resurstyp>` för varje resurstyp som tjänsten exponerar.

Källsystemet kan uppfylla kravet på två sätt, och därför finns två systemroller:

| Aktör | Härleds från | Krav |
|---|---|---|
| `IndividuellKallsystem` | – | Förmågor (`IndividuellKallsystemCS`), `IND-K-*` |
| `IndividuellKallsystemMarkande` | `IndividuellKallsystem` | Märker med NOPAT (`IND-M-1`), obligation på `meta.security` |
| `IndividuellKallsystemFiltrerande` | `IndividuellKallsystem` | Filtrerar bort (`IND-F-1`) |
| `IndividuellKonsument` | – | Visar inte märkt information (`IND-C-*`) |
