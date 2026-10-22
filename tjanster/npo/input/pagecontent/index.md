### NPÖ – Nationell patientöversikt

Tjänste-IG (`ig-roll = tjanst`, `publicering = publik`) för cellen **SVOD × Patientöversikt** i matrisen federation × domän.

IG:n skrivs till största delen inte för hand. Den komponeras av verktyget `ig-composer` från:

- byggblocket **Patientöversikt** (som komponerar **Fasta kontakter**) – kliniskt innehåll, kopieras in eftersom det är internt,
- federationen **SVOD** – metadata för spärr, proveniens och stödtjänster, kopieras in,
- **konventionspaketet** – refereras; dess RuleSets kopieras.

Det som är skrivet för hand är:

- [Vårdkontakt NPÖ](StructureDefinition-vardkontakt-npo.html) – skärpning av Vårdkontakt där kontaktuppgift är obligatorisk, med SVOD:s metadata som ytterligare bas.
- Tjänsteaktörerna **NPÖ: källsystem** och **NPÖ: konsument**, härledda från domänens och federationens aktörer.
- Exempel.

Se [Komposition och kravprofiler](komposition.html) för vad som kommer med varifrån och den härledda kravprofilen per systemroll.
