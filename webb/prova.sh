#!/bin/sh
# Provar innehållsförhandlingen mot en körande webb (docker compose up webb).
#   sh webb/prova.sh [http://localhost:8081] [ig/npo/StructureDefinition/vardkontakt-npo]
B=${1:-http://localhost:8081}
R=${2:-ig/npo/StructureDefinition/vardkontakt-npo}
fel=0
kolla() { # beskrivning, väntat, faktiskt
  if [ "$2" = "$3" ]; then echo "ok    $1: $3"; else echo "FEL   $1: väntade $2, fick $3"; fel=1; fi
}
kolla "HTML (webbläsare) omdirigeras" 302 "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: text/html' "$B/$R")"
kolla "JSON med Accept" "application/fhir+json" "$(curl -s -o /dev/null -w '%{content_type}' -H 'Accept: application/fhir+json' "$B/$R" | cut -d';' -f1)"
if [ "$(curl -s -o /dev/null -w '%{http_code}' "$B/$R?_format=xml")" = 404 ]; then
  echo "–     XML med _format: finns inte (XML kommer bara från IG Publisher)"
else
  kolla "XML med _format" "application/fhir+xml" "$(curl -s -o /dev/null -w '%{content_type}' "$B/$R?_format=xml" | cut -d';' -f1)"
fi
kolla "resursens url" "https://fhir.inera.se/$R" "$(curl -s -H 'Accept: application/fhir+json' "$B/$R" | node -e 'let t="";process.stdin.on("data",(c)=>{t+=c}).on("end",()=>{try{console.log(JSON.parse(t).url)}catch{console.log("(inte JSON)")}})')"
kolla "okänd resurs" 404 "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/fhir+json' "$B/${R%/*}/finns-inte")"
kolla "package-list.json" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$B/$(echo "$R" | cut -d/ -f1-2)/package-list.json")"
kolla "paketflödet" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$B/package-feed.xml")"
exit $fel
