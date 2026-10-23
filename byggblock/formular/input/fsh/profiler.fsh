Profile: Formularbegaran
Parent: Task
Id: formularbegaran
Title: "Formulärbegäran"
Description: "En begäran om att invånaren ska fylla i ett formulär."
* ^status = #draft
* insert Realiserar(FormularbegaranInfo)
* status MS
* intent = #order
* focus MS
* for MS
* for only Reference(Patient)
* requester MS
* restriction MS
* restriction.period MS
* focus insert Obligation(#SHALL:populate, FormVardsystem)
* for insert Obligation(#SHALL:populate, FormVardsystem)
* restriction.period insert Obligation(#SHOULD:populate-if-known, FormVardsystem)

Profile: Formularsvar
Parent: QuestionnaireResponse
Id: formularsvar
Title: "Formulärsvar"
Description: "Invånarens svar på ett formulär."
* ^status = #draft
* insert Realiserar(FormularsvarInfo)
* questionnaire MS
* status MS
* subject 1..1 MS
* subject only Reference(Patient)
* authored MS
* item MS
* authored insert Obligation(#SHALL:populate, FormFormulartjanst)
* item insert Obligation(#SHALL:populate, FormFormulartjanst)
* item insert Obligation(#SHALL:display, FormVardsystem)
