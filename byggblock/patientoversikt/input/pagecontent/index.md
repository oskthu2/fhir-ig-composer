### Byggblock: Patientöversikt

Domänbyggblock (`ig-roll = byggblock`, `publicering = intern`) med kliniskt innehåll för Patientöversikt. Det innehåller inga krav på infrastruktur eller säkerhetsmetadata; sådana krav kommer från federationen när en tjänst komponeras.

Byggblocket komponerar [Fasta kontakter](komposition.html), som kopieras in. Aktörerna `PSProducent` och `PSKonsument` härleds från `FKProducent` respektive `FKKonsument`.
