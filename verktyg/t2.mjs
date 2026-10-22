// Läsning av T2-katalogerna (tjänstekatalog, federationsmedlemskatalog och
// engagemangsindex) enligt katalogtjänsternas specifikationer, oavsett om de
// kommer från en nulägesfil, den mockade federationen eller en verklig
// realisering. Gemensamt för systemanalysen och testköraren.

export const KATALOG_EXT = 'https://fhir.inera.se/ig/katalogtjanster/StructureDefinition/';
export const HSA = 'urn:oid:1.2.752.29.4.19';
export const PERSONNUMMER = 'http://electronichealth.se/identifier/personnummer';

export const utanVersion = (url) => String(url).split('|')[0];
export const versionAv = (url) => String(url).split('|')[1] || null;

// Specifikationen en anslutningspunkt registreras mot för en informationsmängd:
// den externa om informationsmängden motsvarar en, annars tjänstens egen.
export const specFor = (mangd) => mangd.motsvarar || `${mangd.url}|${mangd.version}`;

// Federationens organisation i federationsmedlemskatalogen. Utan karta:
// Organization/fed-<sista delen av federationens paket-id>.
export const federationsOrg = (fedId, karta = {}) => `Organization/${karta[fedId] || `fed-${fedId.split('.').pop()}`}`;

// Federationen en tjänst ingår i.
export const federationFor = (m) => m.paket.find((p) => p.roll === 'federation')?.id || null;

const resurser = (kalla) => {
  if (!kalla) return [];
  if (Array.isArray(kalla)) return kalla.flatMap(resurser);
  if (kalla.resourceType === 'Bundle') return (kalla.entry || []).map((e) => e.resource).filter(Boolean);
  return [kalla];
};

const ext = (r, namn) => (r.extension || []).filter((e) => e.url === KATALOG_EXT + namn);

// kalla: en eller flera Bundles eller resurser.
export function lasKatalog(kalla) {
  const alla = resurser(kalla);
  const av = (typ) => alla.filter((r) => r.resourceType === typ);
  const organisationer = av('Organization').map((o) => ({
    id: o.id, ref: `Organization/${o.id}`, namn: o.name, aktiv: o.active !== false,
    hsaId: (o.identifier || []).find((i) => i.system === HSA)?.value || (o.identifier || [])[0]?.value || null,
  }));
  return {
    organisationer,
    medlemskap: av('OrganizationAffiliation').map((a) => ({
      id: a.id, aktiv: a.active !== false, federation: a.organization?.reference, medlem: a.participatingOrganization?.reference,
      roller: (a.code || []).flatMap((c) => (c.coding || []).map((x) => x.code)),
    })),
    andpunkter: av('Endpoint').map((e) => ({
      id: e.id, namn: e.name, adress: e.address, aktiv: (e.status || 'active') === 'active', org: e.managingOrganization?.reference || null,
      implements: ext(e, 'implements').map((x) => x.valueCanonical),
      indexerad: ext(e, 'engagemangsindexerad').some((x) => x.valueBoolean === true),
    })),
    instanser: av('CapabilityStatement').filter((c) => c.kind === 'instance').map((c) => ({
      id: c.id, adress: c.implementation?.url, instantiates: c.instantiates || [],
    })),
    engagemang: av('EpisodeOfCare').map((e) => ({
      id: e.id, aktiv: (e.status || 'active') === 'active',
      patient: e.patient?.identifier?.value || null,
      hsaId: e.managingOrganization?.identifier?.value || null,
    })),
  };
}

export const orgMedHsa = (k, hsaId) => (hsaId ? k.organisationer.find((o) => o.hsaId === hsaId) : null) || null;

// Matchar en registrerad canonical mot en förväntad url|version. En
// registrering utan version godtas för vilken version som helst.
export function matcha(registrerade, forvantad) {
  const traff = registrerade.filter((r) => utanVersion(r) === utanVersion(forvantad));
  const exakt = traff.find((r) => !versionAv(r) || !versionAv(forvantad) || versionAv(r) === versionAv(forvantad));
  return { status: exakt ? 'registrerad' : traff.length ? 'annan version' : 'saknas', registrerad: exakt || traff[0] || null };
}
