# Externa specifikationer

Ögonblicksbilder av externt publicerade specifikationer (CapabilityStatement
`kind=requirements`) som informationsmängderna motsvarar
(`ExternSpecifikation`). Används av `federation testa --mot <miljö>` för att
jämföra tjänstens specifikation per informationsmängd med den externa.

| Katalog | Källa | Paket | Licens |
|---|---|---|---|
| `infopeak/` | referensrealiseringen av RIVTA T2 | `inera.patientoversikt` 0.1.0, `inera.katalogtjanster` 0.2.0 | CC0-1.0 |

Hämta nya med `node verktyg/ig-composer.mjs externa hamta` (basic auth från
`INFOPEAK_ANVANDARE` och `INFOPEAK_LOSENORD`).
