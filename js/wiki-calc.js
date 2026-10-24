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
      const pool = [...P.common, ...P.uncommon, ...P.uncommon, ...P.rare, ...P.rare, ...P.rare].filter((s) => !L.myth.includes(s))
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

  root.TGCalc = { catchChance, stats, expGain, expFor, transferCash, powerCost, seeded, raidBoss, outbreaks }
})(typeof window !== 'undefined' ? window : globalThis)
