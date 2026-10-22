Instance: VardkontaktJournal1177Exempel
InstanceOf: Vardkontakt
Usage: #example
Title: "Exempel: vårdkontakt i 1177 Journal"
Description: "Vårdkontakt som får visas för invånaren."
* status = #completed
* class = http://terminology.hl7.org/CodeSystem/v3-ActCode#AMB
* subject.display = "Exempelpatient"
* actualPeriod.start = "2026-09-01T09:00:00+02:00"
* actualPeriod.end = "2026-09-01T09:30:00+02:00"
* serviceProvider.display = "Exempelvårdcentralen"

Instance: LabbsvarJournal1177Exempel
InstanceOf: Labbsvar
Usage: #example
Title: "Exempel: labbsvar i 1177 Journal"
Description: "Labbsvar (P-Glukos) som får visas för invånaren."
* status = #final
* category[laboratorium] = $observation-category#laboratory
* code = http://loinc.org#15074-8 "Glucose [Moles/volume] in Blood"
* subject.display = "Exempelpatient"
* effectiveDateTime = "2026-09-01T08:15:00+02:00"
* valueQuantity = 5.4 'mmol/L' "mmol/L"
* referenceRange.low = 4.0 'mmol/L' "mmol/L"
* referenceRange.high = 6.0 'mmol/L' "mmol/L"

Instance: LabbsvarEjForInvanareExempel
InstanceOf: Labbsvar
Usage: #example
Title: "Exempel: labbsvar som inte får visas för invånaren"
Description: "Labbsvar från ett märkande källsystem, märkt med NOPAT. Invånartjänsten visar det inte (IND-C-1)."
* insert IndividuellEjForInvanare
* status = #final
* category[laboratorium] = $observation-category#laboratory
* code = http://loinc.org#2160-0 "Creatinine [Mass/volume] in Serum or Plasma"
* subject.display = "Exempelpatient"
* effectiveDateTime = "2026-09-01T08:15:00+02:00"
* valueQuantity = 1.4 'mg/dL' "mg/dL"
