// Kravmodellen: användningsfall och delflöden i skissformatet
// (input/scenarier/*.yaml) på två nivåer:
//
//   logisk     i byggblock och federationer: rena arbetsflöden med aktiviteter
//              (hämta, lämna, registrera …), roller och information, utan
//              FHIR-interaktioner. Kompileras till PlanDefinition
//              (workflow-definition) och Requirements.
//   tillämpad  i stödtjänster och tjänster: varje aktivitet binds till en
//              interaktion i mottagarens förmågor (CapabilityStatement) och
//              tjänstens specifikation per informationsmängd – härledd, eller
//              angiven i tjänstens input/tillampning.yaml. Kompileras till
//              ExampleScenario och Requirements.
//
// Federationens flödesmönster vävs in, informationsbehov harmoniseras till
// profiler, och täckningen kontrolleras hela vägen från scenariots steg till
// aktörernas förmågor.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

// Operationstyper som kräver en interaktion på en resurstyp respektive på
// systemnivå i förmågorna.
const RESOURCE_OPS = new Set(['read', 'vread', 'update', 'patch', 'delete', 'history-instance', 'history-type', 'create', 'search-type']);
const SYSTEM_OPS = new Set(['search-system', 'history-system', 'transaction', 'batch']);
const RESTFUL = new Set([...RESOURCE_OPS, ...SYSTEM_OPS, 'capabilities', 'operation']);
// Aktiviteter i logiska arbetsflöden, och de interaktioner en tillämpning kan
// binda dem till (i prioritetsordning).
export const AKTIVITETER = {
  hamta: { verb: ['hämta', 'hämtar'], ops: ['search-type', 'read', 'search-system'], hamtar: true },
  kontrollera: { verb: ['kontrollera', 'kontrollerar'], ops: ['search-type', 'read', 'search-system'], hamtar: true },
  lamna: { verb: ['lämna', 'lämnar'], ops: ['create'] },
  registrera: { verb: ['registrera', 'registrerar'], ops: ['create', 'update'] },
  uppdatera: { verb: ['uppdatera', 'uppdaterar'], ops: ['update'] },
  meddela: { verb: ['meddela', 'meddelar'], ops: ['create'] },
  visa: { verb: ['visa', 'visar'], ops: [] },
  utfora: { verb: ['utföra', 'utför'], ops: [] },
};
// Aktiviteten bakom en interaktion i ett tillämpat flöde.
const AKTIVITET_FOR_OP = {
  'search-type': 'hamta', read: 'hamta', vread: 'hamta', 'search-system': 'hamta', create: 'registrera',
  update: 'uppdatera', patch: 'uppdatera', capabilities: 'kontrollera', token: 'hamta',
};
const aktivitetAv = (s) => s.aktivitet || (s.hamtar ? 'hamta' : s.skickar ? 'lamna' : AKTIVITET_FOR_OP[s.operation])
  || (s.fran && s.fran === s.till ? 'utfora' : null);
const VERB = {
  read: ['läsa', 'läser'], vread: ['läsa', 'läser'], 'search-type': ['söka', 'söker'], 'search-system': ['söka', 'söker'],
  create: ['skapa', 'skapar'], update: ['uppdatera', 'uppdaterar'], patch: ['ändra', 'ändrar'], delete: ['ta bort', 'tar bort'],
};

export function loadSketches(ig, katalog) {
  const dir = path.join(ig.dir, katalog);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => {
    const doc = YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { ...doc, paket: ig.id, fil: path.join(katalog, f), namn: doc.anvandningsfall || doc.delflode };
  });
}

const pascal = (s) => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, c) => c.toUpperCase());
const fshStr = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ').trim();

// ctx: { ig, rules, plan, fed, entities, actors, ancestorsOf, capabilities, serviceActors,
//        profiles, exposed, parentOf, baseType, realiserar, rollOf, report(niva, regel, text) }
export function composeScenarios(ctx) {
  const { ig, rules, plan } = ctx;
  const regler = rules.scenarier;
  const kallor = [ig, ...plan.filter((p) => p.mode === 'kopiera').map((p) => p.ig)];
  const skisser = kallor.flatMap((src) => loadSketches(src, regler.katalog));
  const anvandningsfall = skisser.filter((s) => s.anvandningsfall);
  const delfloden = new Map(skisser.filter((s) => s.delflode).map((s) => [s.delflode, s]));
  const fel = (regel, text) => ctx.report(regel === true ? 'fel' : regler.tackning[regel] || 'fel', text);
  // Nivå: logiska flöden i byggblock och federationer, tillämpade i övriga.
  const logiskaRoller = regler.logiska || ['byggblock', 'federation'];
  const nivaFor = (roll) => (logiskaRoller.includes(roll) ? 'logisk' : 'tillampad');
  const igNiva = nivaFor(ig.roll);
  const paketNiva = (id) => nivaFor(ctx.ws?.get(id)?.roll);
  // Ett logiskt flöde anger aktiviteter, inte interaktioner.
  const validera = (skiss) => {
    if (skiss.paket !== ig.id) return;
    const kontrollera = (lista, var_) => (lista || []).forEach((st, i) => {
      if (st.aktivitet && !AKTIVITETER[st.aktivitet]) fel(true, `${skiss.namn} steg ${var_}${i + 1}: okänd aktivitet ${st.aktivitet} (${Object.keys(AKTIVITETER).join(', ')})`);
      if (paketNiva(skiss.paket) === 'logisk' && (st.operation || st.resurstyp)) {
        fel('tillampningILogisktFlode', `${skiss.namn} steg ${var_}${i + 1}: ${st.operation || st.resurstyp} är en tillämpning; ett logiskt flöde i ${ig.roll === 'federation' ? 'en federation' : 'ett byggblock'} anger aktivitet (${Object.keys(AKTIVITETER).join(', ')}), och tjänsten binder den`);
      }
      for (const a of st.alternativ || []) kontrollera(a.steg, `${var_}${i + 1}.alt.`);
    });
    kontrollera(skiss.steg, '');
  };

  let valda;
  if (ig.roll === 'tjanst') {
    // Tjänstens valda användningsfall, plus federationens förutsättningar.
    const forut = regler.forutsattningar ? (ctx.fed?.forutsattningar || []) : [];
    valda = [...ig.anvandningsfall, ...forut.filter((n) => !ig.anvandningsfall.includes(n))].map((n) => {
      const uc = anvandningsfall.find((a) => a.anvandningsfall === n);
      if (!uc) fel(true, `Användningsfallet ${n} finns inte i något komponerat paket (extension ${forut.includes(n) ? 'forutsattning' : 'anvandningsfall'})`);
      return uc && { ...uc, forutsattning: forut.includes(n) && !ig.anvandningsfall.includes(n) };
    }).filter(Boolean);
  } else {
    valda = anvandningsfall.filter((a) => a.paket === ig.id);
  }
  const monster = ig.roll === 'tjanst' && regler.vavning ? ctx.fed?.flodesmonster : null;
  const monsterDelfloden = monster ? [...monster.fore, ...monster.foreVarje, ...monster.efter] : [];
  for (const n of monsterDelfloden) {
    if (!delfloden.has(n)) fel(true, `Flödesmönstret i ${ctx.fed.id} pekar på delflödet ${n}, som inte finns`);
  }

  const informationsmodeller = new Map(ctx.entities.filter((e) => e.kind === 'Logical').map((e) => [e.name, e]));
  // Harmonisering: profiler (helst exponerade) vars arvskedja realiserar modellen.
  const realiseringAv = (lm) => {
    const kandidater = ctx.profiles.filter((p) => {
      for (let q = p, i = 0; q && i < 20; q = ctx.parentOf(q), i++) if (ctx.realiserar(q).includes(lm)) return true;
      return false;
    });
    return kandidater.filter((p) => ctx.exposed.includes(p)).concat(kandidater.filter((p) => !ctx.exposed.includes(p)))[0];
  };

  // Förmågor som en roll har, transitivt via derivedFrom, plus genererade
  // förmågor för tjänsteaktörer som spelar rollen.
  const formagorFor = (roller, spelasAv) => {
    const namn = new Set();
    for (const r of roller) {
      for (const a of [ctx.actors.get(r), ...ctx.ancestorsOf(r).map((x) => x.actor)]) if (a?.capabilities) namn.add(a.capabilities);
    }
    for (const s of spelasAv) if (ctx.actors.get(s)?.capabilities) namn.add(ctx.actors.get(s).capabilities);
    return [...namn].map((n) => ctx.capabilities.get(n)).filter(Boolean);
  };
  // Avsändaren behöver interaktionen som klient, mottagaren som server.
  const harInteraktion = (cs, op, typ, lage) => cs.some((c) => c.rest.some((blk) => blk.mode === lage && (SYSTEM_OPS.has(op)
    ? blk.system.includes(op)
    : (blk.resurser[typ]?.interaktioner || []).includes(op))));

  const genererat = [];
  const modell = [];

  const kompilera = (skiss, arDelflode) => {
    validera(skiss);
    const banor = new Map(); // nyckel → { nyckel, titel, typ, roller[], kalla }
    const bana = (nyckel, def, kalla) => {
      const d = typeof def === 'string' ? { roll: def } : def;
      if (!banor.has(nyckel)) banor.set(nyckel, { nyckel, titel: d.titel, egenTitel: !!d.titel, roller: [], kalla, binder: d.binder });
      const b = banor.get(nyckel);
      if (d.roll && !b.roller.includes(d.roll)) b.roller.push(d.roll);
      return b;
    };
    for (const [k, def] of Object.entries(skiss.aktorer || {})) bana(k, def, skiss.namn);

    const info = new Map();
    const informationFor = (nyckel) => {
      if (!nyckel) return null;
      if (info.has(nyckel)) return info.get(nyckel);
      const lm = (skiss.informationsbehov || {})[nyckel];
      const modellE = informationsmodeller.get(lm);
      if (!modellE) fel('informationsbehovUtanModell', `${skiss.namn}: informationsbehovet ${nyckel} (${lm}) finns inte som logisk modell`);
      const profil = modellE ? realiseringAv(lm) : null;
      if (modellE && !profil) fel('informationsbehovUtanProfil', `${skiss.namn}: ingen profil realiserar informationsbehovet ${lm} (insert Realiserar)`);
      const i = { nyckel, lm, titel: modellE?.meta.Title?.replace(/^Informationsbehov: /, '') || lm, profil, typ: profil ? ctx.baseType(profil) : null };
      info.set(nyckel, i);
      return i;
    };

    const steg = [];
    let nr = 0;
    let foreVavd = false;
    const vav = (delflodeNamn, kontext, nummer) => {
      const d = delfloden.get(delflodeNamn);
      if (!d) return;
      const karta = {};
      for (const [k, def] of Object.entries(d.aktorer || {})) {
        const dd = typeof def === 'string' ? { roll: def } : def;
        if (dd.binder) {
          karta[k] = kontext[dd.binder];
          bana(kontext[dd.binder], { roll: dd.roll }, skiss.namn);
        } else {
          const ny = banor.has(k) && banor.get(k).kalla !== d.delflode ? `${k}-${d.nyckel || d.delflode}` : k;
          karta[k] = ny;
          bana(ny, dd, d.delflode);
        }
      }
      const ursprung = { delflode: d.delflode, invavd: ctx.fed.id, nyckel: d.nyckel || d.delflode };
      steg.push({ nr: String(nummer), typ: 'delflode', titel: d.titel, ...ursprung, alternativ: [] });
      (d.steg || []).forEach((s, i) => {
        steg.push(stegModell({ ...s, fran: karta[s.fran], till: karta[s.till] }, `${nummer}.${i + 1}`, ursprung, { flode: d.delflode, nr: String(i + 1) }));
      });
    };
    // ursprung: { delflode, invavd, nyckel } för steg som vävts in från ett delflöde.
    // kalla: { flode, nr } – var steget står i sin egen skiss (för tillämpningen).
    const stegModell = (s, nummer, ursprung = {}, kalla = { flode: skiss.namn, nr: String(nummer) }) => {
      const aktivitet = aktivitetAv(s);
      const i = informationFor(s.information || s.hamtar || s.skickar);
      return {
        nr: String(nummer), typ: 'operation', titel: s.titel, fran: s.fran, till: s.till, operation: s.operation,
        aktivitet, id: s.id || null, kalla,
        informationsbehov: i, riktning: AKTIVITETER[aktivitet]?.hamtar ? 'hamtar' : i ? 'skickar' : null,
        resurstyp: i?.typ || s.resurstyp || null, kravtext: s.krav, styrka: s.styrka || 'SHALL',
        ...ursprung,
        alternativ: (s.alternativ || []).map((a) => ({
          titel: a.titel,
          steg: (a.steg || []).map((as, j) => stegModell(as, `${nummer}.alt${j + 1}`, ursprung, { flode: kalla.flode, nr: `${kalla.nr}.alt${j + 1}` })),
        })),
      };
    };
    // Inkluderar ett annat användningsfall: roller binder dess aktörer till
    // detta användningsfalls aktörer.
    const inkludera = (s, nummer) => {
      const d = skisser.find((x) => x.namn === s.inkludera);
      if (!d) {
        fel(true, `${skiss.namn}: inkluderar ${s.inkludera}, som inte finns i något komponerat paket`);
        return;
      }
      inkluderade.add(d.namn);
      const karta = {};
      for (const [k, def] of Object.entries(d.aktorer || {})) {
        const dd = typeof def === 'string' ? { roll: def } : def;
        const mal = s.roller?.[k];
        if (mal) {
          karta[k] = mal;
          bana(mal, { roll: dd.roll }, skiss.namn);
        } else {
          const ny = banor.has(k) ? `${k}-${d.nyckel || d.namn}` : k;
          karta[k] = ny;
          bana(ny, dd, d.namn);
        }
      }
      steg.push({ nr: String(nummer), typ: 'inkludering', titel: d.titel, inkluderad: d.namn, alternativ: [] });
      (d.steg || []).forEach((x, i) => {
        steg.push(stegModell({ ...x, fran: karta[x.fran], till: karta[x.till] }, `${nummer}.${i + 1}`, { inkluderad: d.namn }, { flode: d.namn, nr: String(i + 1) }));
      });
    };
    for (const s of skiss.steg || []) {
      if (s.inkludera) {
        inkludera(s, ++nr);
        continue;
      }
      // Invävning: fore (ev. bara en gång), foreVarje före varje matchande
      // steg (t.ex. T2-uppslaget), efter efter varje matchande steg.
      const akt = aktivitetAv(s);
      const vavs = !arDelflode && monster && (monster.vid.includes(s.operation) || monster.vid.includes(akt));
      if (vavs && !(monster.foreEnGang && foreVavd)) {
        for (const n of monster.fore) vav(n, s, ++nr);
        foreVavd = true;
      }
      if (vavs) for (const n of monster.foreVarje) vav(n, s, ++nr);
      steg.push(stegModell(s, ++nr, null));
      if (vavs) for (const n of monster.efter) vav(n, s, ++nr);
    }
    return { skiss, banor, info, steg };
  };

  // Mottagarens serverförmåga: resurstyper med interaktioner och systeminteraktioner.
  const serverAv = (b) => {
    const typer = new Map();
    const system = new Set();
    for (const c of b.formagor) {
      for (const blk of c.rest.filter((x) => x.mode === 'server')) {
        blk.system.forEach((x) => system.add(x));
        for (const [t, v] of Object.entries(blk.resurser)) {
          if (!typer.has(t)) typer.set(t, new Set());
          v.interaktioner.forEach((x) => typer.get(t).add(x));
        }
      }
    }
    return { typer, system };
  };
  // Aktivitet + information + mottagarens förmågor → interaktion.
  const binda = (s, till) => {
    const ops = AKTIVITETER[s.aktivitet].ops;
    const server = serverAv(till);
    const resursOps = ops.filter((o) => RESOURCE_OPS.has(o));
    const typ = s.informationsbehov?.typ || s.resurstyp;
    if (typ) {
      const op = resursOps.find((o) => server.typer.get(typ)?.has(o)) || resursOps[0];
      return op ? { operation: op, resurstyp: typ } : null;
    }
    const kandidater = [...server.typer].filter(([, set]) => resursOps.some((o) => set.has(o)));
    if (kandidater.length === 1) return { operation: resursOps.find((o) => kandidater[0][1].has(o)), resurstyp: kandidater[0][0] };
    if (ops.includes('search-system') && server.system.has('search-system')) return { operation: 'search-system', resurstyp: null };
    return null;
  };
  // Specifikationen steget följer: tjänstens API för informationsmängden, annars
  // den förmåga hos mottagaren som har interaktionen (t.ex. tjänstekatalogens).
  const specifikationFor = (s, till) => {
    const mangd = s.informationsbehov && (ctx.informationsmangder || []).find((m) => m.nyckel === s.informationsbehov.lm);
    if (mangd) return mangd.namn;
    const har = (c) => c.rest.some((blk) => blk.mode === 'server' && (s.resurstyp
      ? (blk.resurser[s.resurstyp]?.interaktioner || []).includes(s.operation)
      : blk.system.includes(s.operation)));
    return (till?.formagor || []).find(har)?.name || null;
  };

  const allaSteg = (steg) => steg.flatMap((s) => [s, ...(s.alternativ || []).flatMap((a) => a.steg)]);

  const analysera = (k) => {
    const { skiss, banor } = k;
    // Aktörer: finns rollerna, och vilka tjänsteaktörer spelar banan?
    for (const b of banor.values()) {
      for (const r of b.roller) if (!ctx.actors.has(r)) fel('aktorUtanDefinition', `${skiss.namn}: rollen ${r} (${b.nyckel}) finns inte som ActorDefinition`);
      const a0 = ctx.actors.get(b.roller[0]);
      b.typ = a0?.type || 'system';
      b.titel ||= a0?.title || b.nyckel;
      b.paket = a0 ? a0.entity.origin.paket : null;
      b.stodtjanst = b.roller.some((r) => ctx.actors.get(r)?.stodtjanst);
      // Ett tillval spelas av de tjänsteaktörer som spelar dess grundroll; det
      // är systemet som väljer om det antar tillvalet.
      b.tillval = b.roller.filter((r) => ctx.actors.get(r)?.tillvalFor);
      const grund = (r) => ctx.actors.get(r)?.tillvalFor || r;
      // Roller som ett tillval i banan ärver från följer med tillvalet.
      const underTillval = new Set(b.tillval.flatMap((t) => ctx.ancestorsOf(t).map((x) => x.name)));
      const krav = b.roller.filter((r) => !underTillval.has(r));
      b.spelasAv = ctx.serviceActors.filter((s) => {
        const anc = new Set([s.name, ...ctx.ancestorsOf(s.name).map((x) => x.name)]);
        return krav.every((r) => anc.has(grund(r)));
      }).map((s) => s.name);
      if (ig.roll === 'tjanst' && b.typ === 'system' && !b.stodtjanst && !b.spelasAv.length && !k.endastInkluderad) {
        fel('rollUtanTjanstaktor', `${skiss.namn}: ingen tjänsteaktör i ${ig.id} spelar ${b.nyckel} (${b.roller.join(' + ')})`);
      }
      // I en tjänst heter scenarioaktören som den tjänsteaktör som spelar den.
      if (!b.egenTitel && b.spelasAv.length === 1) b.titel = ctx.actors.get(b.spelasAv[0]).title;
      b.formagor = formagorFor(b.roller, b.spelasAv);
    }
    // Tillämpning: varje aktivitet binds till en interaktion i mottagarens
    // förmågor, om flödet inte redan anger den.
    for (const s of allaSteg(k.steg)) {
      if (s.typ !== 'operation') continue;
      const till = banor.get(s.till);
      if (!s.aktivitet && till?.typ === 'person') s.aktivitet = 'visa';
      if (igNiva !== 'tillampad') continue;
      const over = ctx.tillampning?.[s.kalla.flode]?.[s.id || s.kalla.nr];
      if (over) {
        if ('operation' in over) s.operation = over.operation || null;
        if ('resurstyp' in over) s.resurstyp = over.resurstyp || null;
        s.bindning = 'tillampning';
      } else if (s.operation) {
        s.bindning = 'flode';
      } else if (AKTIVITETER[s.aktivitet]?.ops.length && till && s.fran !== s.till && till.typ !== 'person') {
        const b = binda(s, till);
        if (b) Object.assign(s, b, { bindning: 'harledd' });
        else fel('obundenAktivitet', `${skiss.namn} steg ${s.nr}: aktiviteten ${s.aktivitet} mot ${till.titel} går inte att binda till en interaktion i dess förmågor; ange den i ${ig.id}:s input/tillampning.yaml (${s.kalla.flode}: "${s.id || s.kalla.nr}")`);
      }
      if (s.operation) s.specifikation = specifikationFor(s, till);
    }
    // Förmågor: har avsändare och mottagare interaktionen?
    for (const s of allaSteg(k.steg)) {
      if (s.typ !== 'operation' || !s.operation) continue;
      if (!RESOURCE_OPS.has(s.operation) && !SYSTEM_OPS.has(s.operation)) continue;
      s.tackning = {};
      for (const sida of ['fran', 'till']) {
        const b = banor.get(s[sida]);
        if (!b) continue;
        if (s.fran === s.till) continue;
        const ok = (RESOURCE_OPS.has(s.operation) && !s.resurstyp) ? null : harInteraktion(b.formagor, s.operation, s.resurstyp, sida === 'fran' ? 'client' : 'server');
        s.tackning[sida] = ok;
        if (ok === false) {
          fel('formagaSaknas', `${skiss.namn} steg ${s.nr}: ${b.titel} (${b.roller.join(' + ')}) saknar ${s.operation}${s.resurstyp ? ` på ${s.resurstyp}` : ''} som ${sida === 'fran' ? 'klient' : 'server'} i sina förmågor`);
        }
      }
    }
  };

  const kompilerade = [];
  const inkluderade = new Set();
  for (const uc of valda) kompilerade.push(kompilera(uc, false));
  const anvandaDelfloden = new Set(monsterDelfloden.filter((n) => delfloden.has(n)));
  if (ig.roll !== 'tjanst') for (const d of delfloden.values()) if (d.paket === ig.id) anvandaDelfloden.add(d.delflode);
  for (const n of anvandaDelfloden) kompilerade.push(kompilera(delfloden.get(n), true));
  // Inkluderade användningsfall som inte redan är valda kompileras också,
  // så att step.workflow har något att peka på.
  for (const n of inkluderade) {
    if (kompilerade.some((k) => k.skiss.namn === n)) continue;
    const k = kompilera(skisser.find((x) => x.namn === n), true);
    k.endastInkluderad = true;
    kompilerade.push(k);
  }
  for (const k of kompilerade) analysera(k);

  // ---- FHIR: PlanDefinition (logisk) eller ExampleScenario (tillämpad), och Requirements
  const url = (typ, id) => `${ig.canonical}/${typ}/${id}`;
  const flodesTyp = igNiva === 'logisk' ? 'PlanDefinition' : 'ExampleScenario';
  for (const k of kompilerade) {
    const { skiss, banor, info, steg } = k;
    if (igNiva === 'logisk') genererat.push({ text: planDefinition(k), namn: skiss.namn });
    // Det logiska arbetsflöde ett tillämpat flöde tillämpar.
    const kallIg = ctx.ws?.get(skiss.paket);
    k.tillampar = igNiva === 'tillampad' && paketNiva(skiss.paket) === 'logisk' && kallIg ? `${kallIg.canonical}/PlanDefinition/${skiss.namn}|${kallIg.version}` : null;
    const rader = igNiva === 'logisk' ? null : [
      `Instance: ${skiss.namn}`,
      'InstanceOf: ExampleScenario',
      'Usage: #definition',
      `Title: "${fshStr(skiss.titel)}"`,
      `Description: "${fshStr(skiss.anvandningsfall ? 'Användningsfall' : 'Delflöde')} kompilerat av ig-composer från ${skiss.paket}/${skiss.fil}."`,
      `* name = "${skiss.namn}"`,
      `* title = "${fshStr(skiss.titel)}"`,
      '* status = #draft',
      skiss.syfte ? `* purpose = "${fshStr(skiss.syfte)}"` : null,
      k.tillampar ? `* extension[$tillampar].valueCanonical = "${k.tillampar}"` : null,
    ];
    if (rader) {
    const egnaSteg = allaSteg(steg).filter((s) => s.typ === 'operation' && !s.invavd && !s.inkluderad);
    const anvandaBanor = new Set(egnaSteg.flatMap((s) => [s.fran, s.till]).filter(Boolean));
    for (const b of banor.values()) {
      if (!anvandaBanor.has(b.nyckel)) continue;
      rader.push(`* actor[+].key = "${b.nyckel}"`, `* actor[=].type = #${b.typ}`, `* actor[=].title = "${fshStr(b.titel)}"`);
      for (const r of b.roller) if (ctx.actors.has(r)) rader.push(`* actor[=].extension[$scenario-aktor][+].valueCanonical = Canonical(${r})`);
    }
    const instanser = new Map();
    for (const s of egnaSteg) {
      if (s.informationsbehov?.profil) {
        const i = s.informationsbehov;
        instanser.set(i.nyckel, [
          `* instance[+].key = "${i.nyckel}"`, `* instance[=].structureType = $fhir-types#${i.typ}`,
          `* instance[=].structureProfileCanonical = Canonical(${i.profil.name})`, `* instance[=].title = "${fshStr(i.titel)}"`,
          `* instance[=].extension[$informationsbehov].valueCanonical = Canonical(${i.lm})`,
        ]);
      } else if (s.resurstyp && !s.informationsbehov) {
        const nyckel = s.resurstyp.toLowerCase();
        instanser.set(nyckel, [`* instance[+].key = "${nyckel}"`, `* instance[=].structureType = $fhir-types#${s.resurstyp}`, `* instance[=].title = "${s.resurstyp}"`]);
      }
    }
    for (const r of instanser.values()) rader.push(...r);
    const instansNyckel = (s) => (s.informationsbehov?.profil ? s.informationsbehov.nyckel : (s.resurstyp && !s.informationsbehov ? s.resurstyp.toLowerCase() : null));
    const operation = (s, p) => {
      const ut = [`${p}.operation.title = "${fshStr(s.titel)}"`];
      // Operationer utanför FHIR REST (t.ex. token) får bara en kod.
      if (s.operation) ut.push(RESTFUL.has(s.operation) ? `${p}.operation.type = $restful-interaction#${s.operation}` : `${p}.operation.type.code = #${s.operation}`);
      if (s.fran) ut.push(`${p}.operation.initiator = "${s.fran}"`);
      if (s.till) ut.push(`${p}.operation.receiver = "${s.till}"`);
      const nyckel = instansNyckel(s);
      if (nyckel) ut.push(`${p}.operation.${s.riktning === 'hamtar' ? 'response' : 'request'}.instanceReference = "${nyckel}"`);
      const stegP = p.replace(/\.operation$/, '');
      if (s.specifikation && ctx.capabilities.has(s.specifikation)) ut.push(`${stegP}.extension[$specifikation].valueCanonical = Canonical(${s.specifikation})`);
      if (s.bindning) ut.push(`${stegP}.extension[$bindning].valueCode = #${s.bindning}`);
      return ut;
    };
    rader.push('* process[0].title = "Huvudscenario"');
    if (skiss.syfte) rader.push(`* process[=].description = "${fshStr(skiss.syfte)}"`);
    for (const s of steg.filter((x) => !x.nr.includes('.'))) {
      rader.push(`* process[=].step[+].number = "${s.nr}"`);
      if (s.typ === 'delflode') {
        rader.push(`* process[=].step[=].workflow = Canonical(${s.delflode})`, `* process[=].step[=].extension[$invavd-av].valueString = "${s.invavd}"`);
        continue;
      }
      if (s.typ === 'inkludering') {
        rader.push(`* process[=].step[=].workflow = Canonical(${s.inkluderad})`);
        continue;
      }
      rader.push(...operation(s, '* process[=].step[=]'));
      for (const a of s.alternativ) {
        rader.push(`* process[=].step[=].alternative[+].title = "${fshStr(a.titel)}"`);
        for (const as of a.steg) rader.push(...operation(as, '* process[=].step[=].alternative[=].step[+]').map((r, i) => (i === 0 ? r : r.replace('step[+]', 'step[=]'))));
      }
    }
    genererat.push({ text: rader.filter(Boolean).join('\n'), namn: skiss.namn });
    }

    // Requirements per deltagande bana (inte personer): en sats per steg.
    const satser = new Map();
    const lagg = (banNyckel, sats) => {
      if (!satser.has(banNyckel)) satser.set(banNyckel, []);
      satser.get(banNyckel).push(sats);
    };
    for (const s of allaSteg(steg)) {
      if (s.typ !== 'operation') continue;
      const nyckel = `${s.nyckel || skiss.nyckel || skiss.namn}-${s.nr}`;
      const fran = banor.get(s.fran);
      const till = banor.get(s.till);
      const vad = s.informationsbehov ? s.informationsbehov.titel.toLowerCase() : (s.resurstyp || '');
      const satisfiedBy = (b) => [
        s.informationsbehov?.profil ? url('StructureDefinition', s.informationsbehov.profil.id) : null,
        ...(b?.spelasAv.length === 1 && ctx.actors.get(b.spelasAv[0])?.capabilities
          ? [url('CapabilityStatement', ctx.capabilities.get(ctx.actors.get(b.spelasAv[0]).capabilities)?.id)]
          : (b?.formagor || []).filter((c) => b.roller.some((r) => ctx.actors.get(r)?.capabilities === c.name)).map((c) => url('CapabilityStatement', c.id))),
      ].filter((x) => x && !x.endsWith('/undefined'));
      if (s.kravtext && fran) {
        lagg(s.fran, { nyckel, label: s.titel, styrka: s.styrka, krav: s.kravtext, satisfiedBy: satisfiedBy(fran), steg: s.nr });
      } else if ((s.operation || AKTIVITETER[s.aktivitet]?.ops.length) && fran && till && fran !== till) {
        const [inf, pres] = AKTIVITETER[s.aktivitet]?.verb || VERB[s.operation] || ['anropa', 'anropar'];
        if (fran.typ === 'system') lagg(s.fran, { nyckel, label: s.titel, styrka: s.styrka, krav: `${fran.titel} SKA kunna ${inf} ${vad} hos ${till.titel}.`.replace('  ', ' '), satisfiedBy: satisfiedBy(fran), steg: s.nr });
        if (till.typ === 'system') lagg(s.till, { nyckel, label: s.titel, styrka: s.styrka, krav: `${till.titel} SKA stödja att ${fran.titel} ${pres} ${vad}.`.replace('  ', ' '), satisfiedBy: satisfiedBy(till), steg: s.nr });
      }
    }
    k.krav = [];
    // I en tjänst finns delflödenas krav redan invävda i användningsfallens krav.
    // ... och inkluderade användningsfalls krav i de användningsfall som inkluderar dem.
    const genereraKrav = regler.genereraKrav && !(ig.roll === 'tjanst' && skiss.delflode) && !k.endastInkluderad;
    if (genereraKrav) {
      for (const [banNyckel, lista] of satser) {
        const b = banor.get(banNyckel);
        if (b.typ !== 'system') continue;
        const namn = `${skiss.namn}${pascal(banNyckel)}Krav`;
        const r = [
          `Instance: ${namn}`,
          'InstanceOf: Requirements',
          'Usage: #definition',
          `Title: "Krav: ${fshStr(skiss.titel)} – ${fshStr(b.titel)}"`,
          `Description: "Genererad av ig-composer ur ${skiss.anvandningsfall ? 'användningsfallet' : 'delflödet'} ${skiss.namn}: krav på ${fshStr(b.titel)}."`,
          `* name = "${namn}"`,
          `* title = "Krav: ${fshStr(skiss.titel)} – ${fshStr(b.titel)}"`,
          '* status = #draft',
          `* reference[0] = "${url(flodesTyp, skiss.namn)}"`,
          ...b.roller.filter((x) => ctx.actors.has(x)).map((x) => `* actor[+] = Canonical(${x})`),
        ];
        for (const s of lista) {
          r.push(`* statement[+].key = "${s.nyckel}"`, `* statement[=].label = "${fshStr(s.label)}"`,
            `* statement[=].conformance[0] = #${s.styrka}`, `* statement[=].requirement = "${fshStr(s.krav)}"`,
            ...s.satisfiedBy.map((u) => `* statement[=].satisfiedBy[+] = "${u}"`));
        }
        genererat.push({ text: r.join('\n'), namn });
        k.krav.push({ namn, bana: banNyckel, satser: lista });
      }
    }
  }

  for (const k of kompilerade) {
    modell.push({
      namn: k.skiss.namn,
      typ: k.skiss.anvandningsfall ? 'anvandningsfall' : 'delflode',
      niva: igNiva,
      resurs: flodesTyp,
      tillampar: k.tillampar || null,
      forutsattning: !!k.skiss.forutsattning,
      endastInkluderad: !!k.endastInkluderad,
      nyckel: k.skiss.nyckel,
      titel: k.skiss.titel,
      syfte: k.skiss.syfte,
      paket: k.skiss.paket,
      fil: k.skiss.fil,
      aktorer: [...k.banor.values()].map((b) => ({
        nyckel: b.nyckel, titel: b.titel, typ: b.typ, roller: b.roller, paket: b.paket, kalla: b.kalla,
        stodtjanst: b.stodtjanst, tillval: b.tillval, spelasAv: b.spelasAv, formagor: b.formagor.map((c) => c.name),
      })),
      informationsbehov: [...k.info.values()].map((i) => ({ nyckel: i.nyckel, modell: i.lm, titel: i.titel, profil: i.profil?.name || null, resurstyp: i.typ })),
      steg: k.steg.map(stegUt),
      krav: k.krav.map((r) => ({ namn: r.namn, bana: r.bana, satser: r.satser })),
    });
  }
  return { genererat, modell };

  // Logiskt arbetsflöde som PlanDefinition (workflow-definition): aktörer med
  // roller, en åtgärd per steg med aktivitet, deltagare och information, i
  // ordning; inkluderade flöden och delflöden som definitionCanonical.
  function planDefinition(k) {
    const { skiss, banor, steg } = k;
    const topp = steg.filter((x) => !x.nr.includes('.'));
    const anvanda = new Set(allaSteg(topp).flatMap((x) => [x.fran, x.till]).filter(Boolean));
    const r = [
      `Instance: ${skiss.namn}`,
      'InstanceOf: PlanDefinition',
      'Usage: #definition',
      `Title: "${fshStr(skiss.titel)}"`,
      `Description: "Logiskt ${skiss.anvandningsfall ? 'arbetsflöde för användningsfallet' : 'delflöde'} ${fshStr(skiss.titel)}, kompilerat av ig-composer från ${skiss.paket}/${skiss.fil}."`,
      `* name = "${skiss.namn}"`,
      `* title = "${fshStr(skiss.titel)}"`,
      '* status = #draft',
      '* type = $plan-definition-type#workflow-definition',
      skiss.syfte ? `* purpose = "${fshStr(skiss.syfte)}"` : null,
    ];
    for (const b of banor.values()) {
      if (!anvanda.has(b.nyckel)) continue;
      r.push(`* actor[+].id = "${b.nyckel}"`, `* actor[=].title = "${fshStr(b.titel)}"`,
        `* actor[=].option[+].type = $action-participant-type#${b.typ === 'person' ? 'practitioner' : 'device'}`);
      for (const roll of b.roller) if (ctx.actors.has(roll)) r.push(`* actor[=].extension[$scenario-aktor][+].valueCanonical = Canonical(${roll})`);
    }
    const atgard = (s, p) => {
      // id (för relatedAction.targetId, pld-4) och linkId följer stegnumret.
      const id = `steg-${s.nr.replace(/[^A-Za-z0-9.-]/g, '-')}`;
      const ut = [`${p}.id = "${id}"`, `${p}.linkId = "${s.nr}"`, `${p}.title = "${fshStr(s.titel)}"`];
      if (s.typ === 'delflode' || s.typ === 'inkludering') {
        ut.push(`${p}.definitionCanonical = Canonical(${s.delflode || s.inkluderad})`);
        return ut;
      }
      if (s.kravtext) ut.push(`${p}.description = "${fshStr(s.kravtext)}"`);
      if (s.aktivitet) ut.push(`${p}.code = $aktivitet#${s.aktivitet}`);
      if (s.fran) ut.push(`${p}.participant[+].actorId = "${s.fran}"`, `${p}.participant[=].function = $action-participant-function#performer`);
      if (s.till && s.till !== s.fran) ut.push(`${p}.participant[+].actorId = "${s.till}"`, `${p}.participant[=].role.text = "mottagare"`);
      const i = s.informationsbehov;
      if (i) {
        const sida = s.riktning === 'hamtar' ? 'output' : 'input';
        ut.push(`${p}.${sida}[+].title = "${fshStr(i.titel)}"`, `${p}.${sida}[=].requirement.type = #${i.typ || 'Base'}`,
          `${p}.${sida}[=].requirement.profile[+] = Canonical(${i.lm})`);
      }
      return ut;
    };
    let forra = null;
    for (const s of topp) {
      r.push(...atgard(s, '* action[+]').map((x, i) => (i === 0 ? x : x.replace('action[+]', 'action[=]'))));
      if (forra) r.push(`* action[=].relatedAction[+].targetId = "steg-${forra.replace(/[^A-Za-z0-9.-]/g, '-')}"`, '* action[=].relatedAction[=].relationship = #after');
      forra = s.nr;
      if (s.alternativ?.length) {
        r.push('* action[=].selectionBehavior = #at-most-one');
        for (const a of s.alternativ) {
          r.push(`* action[=].action[+].title = "Alternativ: ${fshStr(a.titel)}"`, '* action[=].action[=].groupingBehavior = #logical-group');
          for (const as of a.steg) r.push(...atgard(as, '* action[=].action[=].action[+]').map((x, i) => (i === 0 ? x : x.replace('action[+]', 'action[=]'))));
        }
      }
    }
    return r.filter(Boolean).join('\n');
  }
}

function stegUt(s) {
  return {
    nr: s.nr, typ: s.typ, titel: s.titel, fran: s.fran || null, till: s.till || null, operation: s.operation || null,
    aktivitet: s.aktivitet || null, id: s.id || null, kalla: s.kalla || null, bindning: s.bindning || null, specifikation: s.specifikation || null,
    informationsbehov: s.informationsbehov?.nyckel || null, modell: s.informationsbehov?.lm || null, profil: s.informationsbehov?.profil?.name || null,
    resurstyp: s.resurstyp || null, delflode: s.delflode || null, invavd: s.invavd || null, inkluderad: s.inkluderad || null,
    krav: s.kravtext || null, tackning: s.tackning || null,
    alternativ: (s.alternativ || []).map((a) => ({ titel: a.titel, steg: a.steg.map(stegUt) })),
  };
}
