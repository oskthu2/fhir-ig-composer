### Stödtjänst: Tjänstekatalogen

Stödtjänst (`ig-roll = stodtjanst`, `publicering = intern`). Den beskriver tjänstekatalogens roll i kompositionen. Själva API:et specificeras i IG:n [Tjänstekatalogen](https://fhir.inera.se/ig/tjanstekatalog).

- Aktörer: `Tjanstekatalog` och `TjanstekatalogRegistrerare`, med förmågor.
- Användningsfall: `RegistreraAndpunkt` – registrera ändpunkt och en API-instans per tjänst och roll.

Federationer komponerar stödtjänsten. De gör registreringen till en förutsättning genom att inkludera användningsfallet i sina anslutningsfall, och genom att låta sina källsystemsroller härledas från `TjanstekatalogRegistrerare`.
