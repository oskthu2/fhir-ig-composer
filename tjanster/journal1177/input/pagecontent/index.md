### 1177 Journal

Tjänste-IG (`ig-roll = tjanst`, `publicering = publik`) för cellerna **Individuell tillgång × Patientöversikt** och **Individuell tillgång × Labbsvar** i matrisen federation × domän.

IG:n komponeras av verktyget `ig-composer` från:

- byggblocket **Patientöversikt** (som komponerar **Fasta kontakter**) och byggblocket **Labbsvar** – kliniskt innehåll, kopieras in eftersom det är internt,
- federationen **Individuell tillgång** – märkning av information som inte får visas för invånaren, och stödtjänster, kopieras in,
- **konventionspaketet** – refereras; dess RuleSets kopieras.

Till skillnad från NPÖ har 1177 Journal ingen egen skärpning av profilerna. Domänernas profiler exponeras oförändrade, med federationens metadata som ytterligare bas.

Det som är skrivet för hand är tjänsteaktörerna och exemplen. Federationen låter källsystemet antingen märka eller filtrera bort information som inte får visas för invånaren. Därför har tjänsten två källsystemsroller:

- **1177 Journal: märkande källsystem** – härleds från Patientöversikt- och Labbsvar-producent och märkande källsystem,
- **1177 Journal: filtrerande källsystem** – samma domänroller, men filtrerande källsystem,
- **1177 Journal: invånartjänst** – härleds från konsumentrollerna och federationens invånartjänst.

Se [Komposition och kravprofiler](komposition.html) för den härledda kravprofilen per systemroll.
