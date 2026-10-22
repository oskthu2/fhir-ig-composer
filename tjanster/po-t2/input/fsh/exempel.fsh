Instance: PODiagnosExempel
InstanceOf: PODiagnos
Usage: #example
Title: "Exempel: diagnos"
Description: "Diagnos för testpatienten."
* clinicalStatus = http://terminology.hl7.org/CodeSystem/condition-clinical#active
* code = http://snomed.info/sct#38341003 "Hypertensive disorder"
* subject.identifier.system = "http://electronichealth.se/identifier/personnummer"
* subject.identifier.value = "191212121212"
* subject.display = "Anna Exempel"
* recordedDate = "2026-03-02"

Instance: POLakemedelExempel
InstanceOf: POLakemedel
Usage: #example
Title: "Exempel: läkemedel"
Description: "Läkemedel för testpatienten."
* status = #recorded
* medication.concept = http://snomed.info/sct#386873009 "Enalapril"
* subject.identifier.system = "http://electronichealth.se/identifier/personnummer"
* subject.identifier.value = "191212121212"
* subject.display = "Anna Exempel"

Instance: POUppmarksamhetExempel
InstanceOf: POUppmarksamhet
Usage: #example
Title: "Exempel: uppmärksamhetsinformation"
Description: "Allergi mot penicillin för testpatienten."
* status = #active
* code = http://snomed.info/sct#91936005 "Allergy to penicillin"
* subject.identifier.system = "http://electronichealth.se/identifier/personnummer"
* subject.identifier.value = "191212121212"
* subject.display = "Anna Exempel"
