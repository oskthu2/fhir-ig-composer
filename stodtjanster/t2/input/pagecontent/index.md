### Stödtjänst: T2-samverkan

Stödtjänst (`ig-roll = stodtjanst`, `publicering = intern`). Innehåller de federationsgemensamma stödtjänsterna för samverkan enligt RIVTA T2, så som kompositionen behöver dem. Katalogernas API:er specificeras i IG:n [Katalogtjänster](https://fhir.inera.se/ig/katalogtjanster). Kravbilderna här anger med `instantiates` vilken specifikation de motsvarar.

| Stödtjänst | Uppslag | Motsvarar |
|---|---|---|
| Tjänstekatalogen | T1: anslutningspunkt per specifikation (`implements`) och logisk adress | `tjanstekatalog-api` |
| Federationsmedlemskatalogen | F1: aktivt medlemskap | `fed-katalog-api` |
| Engagemangsindexet | Vem har information om patienten | `engagemangsindex-api` |
| Åtkomstintygstjänsten | Åtkomstintyg (OAuth 2.0) | – |

Användningsfall: `BliMedlem`, `RegistreraAndpunkt`, `AnmalaEngagemang`. Delflöden som federationerna väver in: `T2Uppslag` före varje anrop, och `EngagemangsUppslag` en gång före hämtningarna.
