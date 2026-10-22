### Byggblock: Patientöversikt (T2)

Domänbyggblock (`ig-roll = byggblock`, `publicering = intern`) för patientöversikten
i referensrealiseringen av RIVTA T2. Varje informationsbehov är en
informationsmängd som en producent kan implementera, och motsvarar en externt
publicerad specifikation (`ExternSpecifikation`):

| Informationsbehov | Resurs | Motsvarar |
|---|---|---|
| Diagnos | Condition | `https://fhir.inera.se/ig/patientoversikt/CapabilityStatement/exempel-diagnoser-api` |
| Läkemedel | MedicationStatement | `https://fhir.inera.se/ig/patientoversikt/CapabilityStatement/exempel-lakemedel-api` |
| Uppmärksamhetsinformation | Flag | `https://fhir.inera.se/ig/patientoversikt/CapabilityStatement/exempel-uppmarksamhet-api` |

En tjänst som komponerar byggblocket får en genererad specifikation per
informationsmängd (`<Informationsmängd>API`) som instansierar den externa.
