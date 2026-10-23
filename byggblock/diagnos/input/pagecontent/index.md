### Byggblock: Diagnos

Diagnoser och problem som dokumenterats för patienten.

- **Informationsbehov:** Diagnos (kod, typ, bedömnings- och registreringstidpunkt, ansvarig, signerare, kronisk, relaterade diagnoser).
- **Profil:** Diagnos (Condition), med kodverken kv_diagnostyp och ICD-10-SE.
- **Arbetsflöde:** Ta del av diagnoser.

Underlag: EHDS-TK (GetDiagnosis), överfört till R5. Skillnader mot EHDS-TK: ansvarig och signerare är `participant` (R5 har inte `recorder` och `asserter`), och `clinicalStatus` är obligatoriskt i R5. Spärrmetadata, källsystem och säkerhetsmärkning hör inte hit; de kommer från federationen.
