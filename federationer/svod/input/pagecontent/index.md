### Federation: SVOD

Federationsbyggblock (`ig-roll = federation`, `publicering = intern`) för sammanhållen vård- och omsorgsdokumentation enligt patientdatalagen 6 kap.

Federationen innehåller inga kliniska profiler. Dess krav på varje resurs uttrycks som mönstret `SVODMetadata` (extension `federationsmonster`). När en tjänst i SVOD komponeras genererar verktyget profilen `SVODMetadata<Resurstyp>` för varje resurstyp som tjänsten exponerar, och tjänstens profiler får den som ytterligare bas (`Bas`). Mönstret får bara begränsa `meta` och `extension`.

Aktörer: `SVODKallsystem`, `SVODKonsument`, med förmågor (`SVODKallsystemCS`, `SVODKonsumentCS`) och regulatoriska krav (`SVODKallsystemKrav`, `SVODKonsumentKrav`).
