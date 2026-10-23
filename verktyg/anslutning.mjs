// Anslutningar: vad ett system faktiskt är godkänt för, per miljö. Det hålls
// isär från vad systemet deklarerar (CapabilityStatement på /metadata, eller
// för en klient det genererade klient-CapabilityStatement) och från vad som
// är publicerat i tjänstekatalogen.
//
// En anslutning gäller en roll (tjänst + aktör) i en miljö och går genom en
// statuskedja. Varje övergång loggas i historiken; vissa statusar kräver bevis.
//
//   system/<namn>.yaml
//     anslutningar:
//       - tjanst: inera.tjanst.npo
//         aktor: NPOKonsument
//         miljo: test
//         status: testad
//         informationsmangder: [VardkontaktInfo]   # valfritt: smalna av
//         historik:
//           - { status: begard, datum: 2026-10-23, av: … }
//         bevis:
//           - { typ: testrapport, fil: rapport/federation.md, datum: 2026-10-23 }

import fs from 'node:fs';
import path from 'node:path';

export const KEDJA = {
  test: ['begard', 'behorig', 'testad'],
  prod: ['ansokt', 'godkand', 'ansluten'],
};
export const MILJOER = Object.keys(KEDJA);
export const ATERKALLAD = 'aterkallad';
export const STATUS_TITEL = {
  begard: 'begärd', behorig: 'behörig', testad: 'testad',
  ansokt: 'ansökt', godkand: 'godkänd', ansluten: 'ansluten', aterkallad: 'återkallad',
};
// Bevis som krävs för att nå en status.
export const BEVIS_KRAVS = { testad: 'testrapport', godkand: 'beslut' };
// Från denna status har rollen behörighet (nycklar och prenumerationer).
export const BEHORIG_FRAN = { test: 'behorig', prod: 'godkand' };

const nyckel = (a) => `${a.miljo}|${a.tjanst}|${a.aktor}`;
const index = (miljo, status) => KEDJA[miljo].indexOf(status);

export const harBehorighet = (a) => a.status !== ATERKALLAD && index(a.miljo, a.status) >= index(a.miljo, BEHORIG_FRAN[a.miljo]);

// Nästa status i kedjan, eller null.
export function nastaStatus(a) {
  if (!a || a.status === ATERKALLAD) return null;
  return KEDJA[a.miljo][index(a.miljo, a.status) + 1] || null;
}

// En ny anslutningslista efter en övergång. Kastar om övergången inte är
// tillåten. mal: { tjanst, aktor, miljo }; ny: status; opt: { av, datum,
// bevis: [{ typ, fil?, text? }], informationsmangder, root }.
export function overga(anslutningar, mal, ny, opt = {}) {
  const { av = 'okänd', datum = new Date().toISOString().slice(0, 10), bevis = [], root = null } = opt;
  if (!KEDJA[mal.miljo]) throw new Error(`Okänd miljö ${mal.miljo} (${MILJOER.join(', ')})`);
  if (ny !== ATERKALLAD && !KEDJA[mal.miljo].includes(ny)) throw new Error(`${ny} är ingen status i ${mal.miljo} (${KEDJA[mal.miljo].join(' → ')})`);
  const lista = (anslutningar || []).map((a) => ({ ...a }));
  const i = lista.findIndex((a) => nyckel(a) === nyckel(mal));
  const nu = i >= 0 ? lista[i] : null;
  const forvantad = nu ? nastaStatus(nu) : KEDJA[mal.miljo][0];
  if (ny !== ATERKALLAD && ny !== forvantad) {
    throw new Error(nu ? `${STATUS_TITEL[nu.status]} → ${STATUS_TITEL[ny]} hoppar över kedjan; nästa är ${forvantad ? STATUS_TITEL[forvantad] : 'ingen'}` : `En ny anslutning börjar som ${STATUS_TITEL[forvantad]}`);
  }
  if (ny === ATERKALLAD && !nu) throw new Error('Det finns ingen anslutning att återkalla');
  for (const b of bevis) {
    if (!b.typ) throw new Error('Bevis saknar typ');
    if (b.fil && root && !fs.existsSync(path.join(root, b.fil))) throw new Error(`Bevisfilen ${b.fil} finns inte`);
  }
  const allaBevis = [...(nu?.bevis || []), ...bevis.map((b) => ({ ...b, datum: b.datum || datum }))];
  if (BEVIS_KRAVS[ny] && !allaBevis.some((b) => b.typ === BEVIS_KRAVS[ny])) {
    throw new Error(`${STATUS_TITEL[ny]} kräver bevis av typen ${BEVIS_KRAVS[ny]}`);
  }
  // Produktion förutsätter att samma roll är testad i testmiljön.
  if (mal.miljo === 'prod' && ny === KEDJA.prod[0]) {
    const t = lista.find((a) => nyckel(a) === nyckel({ ...mal, miljo: 'test' }));
    if (!t || t.status !== 'testad') throw new Error('Ansökan till produktion kräver att rollen är testad i testmiljön');
  }
  const post = {
    tjanst: mal.tjanst, aktor: mal.aktor, miljo: mal.miljo, status: ny,
    ...(opt.informationsmangder?.length ? { informationsmangder: opt.informationsmangder } : nu?.informationsmangder ? { informationsmangder: nu.informationsmangder } : {}),
    historik: [...(nu?.historik || []), { status: ny, datum, av }],
    ...(allaBevis.length ? { bevis: allaBevis } : {}),
  };
  if (i >= 0) lista[i] = post;
  else lista.push(post);
  return lista;
}

// Anslutningarna för vyn: kedjan med nådda steg, nästa steg och vad som
// saknas, samt fel (roll som inte finns i tjänsten).
export function analyseraAnslutningar(sys, manifests) {
  return (sys.anslutningar || []).map((a) => {
    const m = manifests[a.tjanst];
    const fel = [];
    if (!KEDJA[a.miljo]) fel.push(`okänd miljö ${a.miljo}`);
    else if (a.status !== ATERKALLAD && !KEDJA[a.miljo].includes(a.status)) fel.push(`okänd status ${a.status}`);
    if (!m) fel.push(`${a.tjanst} saknar komposition.json`);
    else if (!m.kravprofiler.some((k) => k.aktor === a.aktor)) fel.push(`${a.aktor} är ingen tjänsteaktör i ${a.tjanst}`);
    if (!(sys.roller || []).some((r) => r.tjanst === a.tjanst && r.aktor === a.aktor)) fel.push('rollen finns inte bland systemets roller');
    const nasta = KEDJA[a.miljo] ? nastaStatus(a) : null;
    const nadd = (s) => a.status !== ATERKALLAD && index(a.miljo, s) <= index(a.miljo, a.status);
    return {
      ...a,
      titel: m?.aktorer[a.aktor]?.titel || a.aktor,
      tjanstTitel: m?.ig.titel || a.tjanst,
      kedja: (KEDJA[a.miljo] || []).map((s) => ({ status: s, titel: STATUS_TITEL[s], nadd: nadd(s), datum: [...(a.historik || [])].reverse().find((h) => h.status === s)?.datum || null })),
      nasta, nastaTitel: nasta ? STATUS_TITEL[nasta] : null,
      kraverBevis: nasta && BEVIS_KRAVS[nasta] && !(a.bevis || []).some((b) => b.typ === BEVIS_KRAVS[nasta]) ? BEVIS_KRAVS[nasta] : null,
      behorig: KEDJA[a.miljo] ? harBehorighet(a) : false,
      fel,
    };
  });
}
