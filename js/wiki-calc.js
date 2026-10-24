// Tallgrass wiki: the game's formulas, ported for the calculators and the "today" widgets.
// tools/build-wiki.mjs runs these against the real game code on every build and fails loudly if they drift.
// Constants come from data/wiki/meta.json (`calc`), so a balance change only needs a rebuild.
;(function (root) {
  'use strict'

  /** catch chance of one ball (0..1). o = { cr, x, add, hp (0..1 left), st (status multiplier), umbral, prismana, legend, charm } */
  function catchChance(K, o) {
    const hp = 1 - (2 / 3) * Math.max(0, Math.min(1, o.hp))
    const crystal = o.prismana ? (o.umbral ? K.crystal.both : K.crystal.prismana) : o.umbral ? K.crystal.umbral : 1
    const legend = o.legend ? K.legend : 1
    return Math.min(K.cap, (Math.max(1, o.cr + (o.add || 0)) * o.x * hp * o.st / 255) * crystal * legend * (1 + K.charm * (o.charm || 0)))
  }

  /** a stat block: base [6], level, ivs [6], nature [up, down] (stat keys) or null, umbral, prismana */
  const KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
  function stats(K, base, level, ivs, nature, umbral, prismana, shedinja) {
    const boost = prismana ? (umbral ? K.prismana + 0.1 : K.prismana) : umbral ? K.umbral : 1
    const hpBonus = prismana ? (umbral ? 0.7 : 0.6) : umbral ? 0.4 : 0
    const out = {}
    KEYS.forEach((k, i) => {
      const core = Math.floor(((2 * base[i] + ivs[i]) * level) / 100)
      if (k === 'hp') { out.hp = shedinja ? 1 : core + level + 10 + Math.round(level * hpBonus); return }
      const n = nature && nature[0] !== nature[1] ? (nature[0] === k ? 1.1 : nature[1] === k ? 0.9 : 1) : 1
      out[k] = Math.floor(Math.floor((core + 5) * n) * boost)
    })
    return out
  }

  /** EXP for beating a foe (before the idle-pace multiplier). y = the foe's EXP yield */
  function expGain(y, foeLevel, myLevel, opt) {
    opt = opt || {}
    const scale = Math.pow((2 * foeLevel + 10) / (foeLevel + myLevel + 10), 2.5)
    let x = (Math.floor(((y * foeLevel) / 5) * scale) + 1) * 1.5
    if (opt.owned) x *= 1.5
    if (opt.prismana) x *= opt.umbral ? 4 : 3
    else if (opt.umbral) x *= 2
    if (opt.shiny) x *= 1.5
    return Math.max(1, Math.round(x))
  }

  /** the six growth curves: total EXP to reach a level */
  function expFor(level, growth) {
    const n = Math.max(1, Math.min(100, level))
    if (n <= 1) return 0
    const n3 = n ** 3
    switch (growth) {
      case 'fast': return Math.floor((4 * n3) / 5)
      case 'medium_slow': return Math.max(0, Math.floor((6 * n3) / 5 - 15 * n * n + 100 * n - 140))
      case 'slow': return Math.floor((5 * n3) / 4)
      case 'erratic':
        if (n < 50) return Math.floor((n3 * (100 - n)) / 50)
        if (n < 68) return Math.floor((n3 * (150 - n)) / 100)
        if (n < 98) return Math.floor((n3 * Math.floor((1911 - 10 * n) / 3)) / 500)
        return Math.floor((n3 * (160 - n)) / 100)
      case 'fluctuating':
        if (n < 15) return Math.floor((n3 * (Math.floor((n + 1) / 3) + 24)) / 50)
        if (n < 36) return Math.floor((n3 * (n + 14)) / 50)
        return Math.floor((n3 * (Math.floor(n / 2) + 32)) / 50)
      default: return n3
    }
  }

  /** what the Professor pays for one Pokémon: cash (items are listed on the page) */
  function transferCash(K, tier, level, looks, perfect, alpha) {
    // v0.53.4: a plain common / uncommon (no special look, not perfect, not Alpha) pays a flat price at any level
    const flat = K.plainCash && K.plainCash[tier]
    if (!looks && !perfect && !alpha && flat != null) return flat
    return Math.round(level * K.transferPer * K.transferTier[tier] * (looks ? 5 * looks : 1) * (perfect ? 3 : 1) * (alpha ? 2 : 1))
  }

  /** a Power-up's cost at Power pw (0..9) */
  function powerCost(K, pw, level, legend) {
    const k = legend ? K.legendPower : { candy: 1, money: 1 }
    return { candy: Math.ceil(K.powerCandy[pw] * k.candy), money: Math.round((level * K.powerMoney * Math.pow(pw + 1, 1.5) * k.money) / 10) * 10 }
  }

  // ---- the shared rotations (same seed and maths as the game, so every trainer sees the same) ----
  function seeded(seed) {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
  }
  const DAY = 86400000
  /** today's 5★ raid boss (one a UTC day) */
  function raidBoss(L, t) { const n = Math.floor(t / DAY); return L.raid[((n % L.raid.length) + L.raid.length) % L.raid.length] }
  function cycleSeeded(L, list, n, tag) {
    const round = Math.floor(n / list.length)
    const r = seeded(`${L.seed}|${tag}|${round}`)
    const order = list.map((s) => ({ s, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.s)
    return order[((n % list.length) + list.length) % list.length]
  }
  function costumeOutbreak(L, w) {
    const per = Math.max(1, Math.round(24 / L.hours))
    if (!L.costumeDaily || !L.halloween.length) return null
    const day = Math.floor(w / per)
    const slot = Math.floor(seeded(`${L.seed}|cosslot|${day}`)() * per)
    return ((w % per) + per) % per === slot ? cycleSeeded(L, L.halloween, day, 'cosday') : null
  }
  /** the shared Mass Outbreak list for the 6-hour window holding t: every island once, in order */
  function outbreaks(L, t) {
    const ms = L.hours * 3600000
    const w = Math.floor(t / ms)
    const r = seeded(`${L.seed}|outbreak6|${w}`)
    const order = L.order.map((region) => ({ region, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.region)
    const list = order.map((region) => {
      const P = L.pools[region]
      const pool = [...P.common, ...P.uncommon, ...P.uncommon, ...P.rare, ...P.rare, ...P.rare].filter((s) => !L.myth.includes(s) && !(L.skip || []).includes(s)) // v0.53.3: the game's ADDED_0533 stay out of outbreaks
      return { region, slug: pool[Math.floor(r() * pool.length)] || P.common[0] }
    })
    const cos = costumeOutbreak(L, w)
    if (cos) {
      const early = L.order.slice(0, L.badges + 1)
      const isl = early[Math.floor(seeded(`${L.seed}|cosisland|${w}`)() * early.length)]
      const i = list.findIndex((o) => o.region === isl)
      const [o] = list.splice(i, 1)
      list.unshift({ region: o.region, slug: L.costumeBase[cos], costume: cos })
    }
    return { window: w, start: w * ms, end: (w + 1) * ms, list }
  }

  // ---- breeding (care.ts eggOdds / compat / firstForm / halloweenBaby, game.ts nannyMins; dice.ts rollLooks) ----
  // K = META.breed. A parent = { shiny, umbral, prismana, perfect, alpha, knot } (knot = holds a Destiny Knot)
  /** the chance (0..1) per egg of each look, Perfect IVs and Alpha. o = { rank, charm, islands (caught on different islands), parents } */
  function eggOdds(K, o) {
    const pair = o.parents
    const r = K.ranks[o.rank]
    const shinyOdds = r.shiny / (1 + K.charmK * (o.charm || 0))
    const islands = pair.length === 2 && !!o.islands
    const base = (shinyOdds * K.lookX.egg) / K.lookX.wild / (islands ? 2 : 1)
    const inh = 1 / K.lookX.egg
    const has = (f) => pair.filter(f).length
    const knot = pair.some((c) => !!c.knot)
    const perfect = (1 / r.perfect + has((c) => !!c.perfect) / K.inherit.perfect) * (knot ? 3 : 1)
    return {
      shiny: 1 / base + (inh * has((c) => !!c.shiny)) / K.inherit.shiny,
      umbral: 1 / (base * K.umbralX) + (inh * has((c) => !!c.umbral)) / K.inherit.umbral,
      prismana: 1 / (base * K.prismanaX) + (inh * has((c) => !!c.prismana)) / K.inherit.prismana,
      perfect: Math.min(1, perfect), alpha: has((c) => !!c.alpha) / K.inherit.alpha, knot, islands,
    }
  }
  /** a Costume Egg's odds (events.ts costumeEgg): K.costumeEgg.k × the egg base, perfect 1 in K.costumeEgg.perfect, never Alpha */
  function costumeEggOdds(K, o) {
    const odds = ((K.ranks[o.rank].shiny / (1 + K.charmK * (o.charm || 0))) * K.lookX.egg) / K.lookX.wild
    const k = K.costumeEgg.k
    return { shiny: k / odds, umbral: k / (odds * K.umbralX), prismana: k / (odds * K.prismanaX), perfect: 1 / K.costumeEgg.perfect, alpha: 0, knot: false, islands: false }
  }
  /** do two Pokémon get along? m = { s (slug), fst (first form), t (types), bd (its line can breed) } */
  function breedCompat(a, b) {
    if (!a.bd || !b.bd) return { ok: false, rate: 0, why: "Legendaries don't lay eggs." }
    if (a.s === 'ditto' && b.s === 'ditto') return { ok: false, rate: 0, why: 'Two Ditto just copy each other. Pair Ditto with something else.' }
    if (a.s === 'ditto' || b.s === 'ditto') return { ok: true, rate: 1, why: 'Ditto gets along with anyone.' }
    if (a.fst === b.fst) return { ok: true, rate: 2, why: 'Same family: they get along great! Eggs come twice as fast.' }
    const shared = a.t.filter((t) => b.t.includes(t))
    if (shared.length) return { ok: true, rate: 1, why: `They share a type (${shared[0]}), so they get along.` }
    return { ok: false, rate: 0, why: "They don't seem to like each other. Pair the same family, a shared type, or Ditto." }
  }
  /** the possible babies (sorted): the first form of a non-Ditto parent's line, each parent equally likely */
  function breedBabies(a, b) { return [...new Set([a, b].filter((m) => m.s !== 'ditto').map((m) => m.fst))].sort() }
  /** the costume of `costume`'s line that fits `baby` (the costume itself, or one that evolves into it), or null. CO = { slug: { base, evolvesTo } } */
  function costumeFor(CO, costume, baby) {
    for (let c = costume, n = 0; c && n < 6; n++) {
      if (CO[c] && CO[c].base === baby) return c
      c = Object.keys(CO).find((k) => CO[k].evolvesTo === c)
    }
    return null
  }
  /** the Halloween costumes a baby can wear from these parents' costumes (each equally likely; [] = a plain baby) */
  function halloweenFits(CO, costumes, baby) {
    return [...new Set(costumes.map((c) => (c && CO[c] && CO[c].event === 'halloween' ? costumeFor(CO, c, baby) : null)).filter(Boolean))].sort()
  }
  /** the chance of each of the 8 look combinations. p = eggOdds(); boost = an odds event { shiny, crystal } (1 = none) */
  function looks8(p, boost) {
    const sx = (boost && boost.shiny) || 1, cx = sx * ((boost && boost.crystal) || 1)
    const s = Math.min(1, p.shiny * sx), u = Math.min(1, p.umbral * cx), q = Math.min(1, p.prismana * cx)
    const out = []
    for (let k = 0; k < 8; k++) {
      const sh = !!(k & 1), um = !!(k & 2), pr = !!(k & 4)
      out.push({ shiny: sh, umbral: um, prismana: pr, p: (sh ? s : 1 - s) * (um ? u : 1 - u) * (pr ? q : 1 - q) })
    }
    return { shiny: s, umbral: u, prismana: q, any: 1 - (1 - s) * (1 - u) * (1 - q), list: out }
  }
  /** eggs needed for a `target` (0..1) chance of at least one */
  function eggsFor(p, target) { return p >= 1 ? 1 : p <= 0 ? Infinity : Math.max(1, Math.ceil(Math.log(1 - target) / Math.log(1 - p))) }
  /** encounters of warmth an egg needs (it warms the encounter it's laid, then once per encounter; care.ts careTick) */
  function warmEncounters(total, k) {
    let left = total, n = 0
    while (left > 0 && n < 10000) { left = Math.max(0, Math.round((left - k) * 10) / 10); n++ }
    return n
  }
  /** minutes of hunting per egg the nanny hatches (0 = not a nanny); its best special look makes it faster */
  function nannyMins(K, slug, look) {
    const L = K.nannyLook || { shiny: 1, umbral: 1, prismana: 1 }
    return (K.nanny[slug] || 0) * Math.min(1, look.shiny ? L.shiny : 1, look.umbral ? L.umbral : 1, look.prismana ? L.prismana : 1)
  }

  root.TGCalc = { catchChance, stats, expGain, expFor, transferCash, powerCost, seeded, raidBoss, outbreaks,
    eggOdds, costumeEggOdds, breedCompat, breedBabies, costumeFor, halloweenFits, looks8, eggsFor, warmEncounters, nannyMins }
})(typeof window !== 'undefined' ? window : globalThis)
