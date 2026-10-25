// Tallgrass wiki: embedded in the download page. Data: data/wiki/*.json (built by tools/build-wiki.mjs from the game's code).
// Routes live in the hash: #wiki, #wiki/<page>, #wiki/pokemon/<slug>, #wiki/move/<id>, #wiki/item/<key>, #wiki/ability/<key>,
// #wiki/pokedex?type=fire&tier=r… No framework, no build step. Starts only once the page is unlocked (app.js's gate).
;(() => {
  'use strict'
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const C = window.TGCalc
  const D = 'data/wiki/'
  const ART = 'assets/wiki/'
  const cache = {}
  const load = (f) => (cache[f] ||= fetch(D + f, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(f); return r.json() }))
  let META = null, PAGES = null, DEX = null, BY = null
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const n = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v)
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1)
  const pctS = (v, dp = 1) => `${(Math.round(v * 100 * 10 ** dp) / 10 ** dp).toFixed(dp).replace(/\.0+$/, '')}%`
  const oneIn = (p) => (p >= 1 ? 'always' : p <= 0 ? 'never' : `1 in ${Math.round(1 / p).toLocaleString('en-US')}`)
  const TIER = { c: ['Common', 'c'], u: ['Uncommon', 'u'], r: ['Rare', 'r'], l: ['Legendary', 'l'], m: ['Mythical', 'm'] }
  const SRC = { wild: 'Wild', legend: 'Wild legendary', evolve: 'Evolve', egg: 'Egg', raid: 'Raids', boss: 'Boss joins', starter: 'Starter', form: 'Battle form', costume: 'Costume', none: 'Not found yet' }
  const STATN = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe']
  const STATK = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
  const GEN_ENDS = [151, 251, 386, 493, 649, 721, 809, 905, 1025]
  const genOf = (no) => GEN_ENDS.findIndex((e) => no <= e) + 1
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  // ---------------------------------------------------------------- sprites + icons
  function spr(idx, size = 48, o = {}) {
    if (idx == null || idx < 0) return `<i class="spr spr--none" style="width:${size}px;height:${size}px"></i>`
    const S = META.sheet
    const sheet = Math.floor(idx / S.per), at = idx % S.per
    const col = at % S.cols, row = Math.floor(at / S.cols)
    const url = `${ART}dex-${o.shiny ? 's-' : ''}${sheet}.webp`
    const look = o.prismana && o.umbral ? ' spr--umbral spr--prismana' : o.prismana ? ' spr--prismana' : o.umbral ? ' spr--umbral' : ''
    return `<i class="spr${look}${o.cls ? ` ${o.cls}` : ''}" role="img" aria-label="${esc(o.alt || '')}" style="width:${size}px;height:${size}px;background-image:url('${url}');background-size:${S.cols * size}px auto;background-position:${-col * size}px ${-row * size}px"></i>`
  }
  function ispr(key, size = 24) {
    const i = META.atlas[key]
    if (i == null) return ''
    const S = META.isheet
    return `<i class="ispr" style="width:${size}px;height:${size}px;background-size:${S.cols * size}px auto;background-position:${-(i % S.cols) * size}px ${-Math.floor(i / S.cols) * size}px"></i>`
  }
  const ic = (k, cls = '') => (String(k).startsWith('item:') ? ispr(k.slice(5), 24) : `<img class="ic ${cls}" src="${ART}i/${k}.png" alt="" loading="lazy">`)
  const typePill = (t, link = true) => `<${link ? `a href="#wiki/pokedex?type=${t}"` : 'span'} class="ty" style="--tc:${META.typeColors[t] || '#888'}">${ic(`type_${t}`)}<span>${cap(t)}</span></${link ? 'a' : 'span'}>`
  const tierPill = (tr) => `<span class="tier tier--${TIER[tr]?.[1] || 'c'}">${TIER[tr]?.[0] || 'Common'}</span>`
  const rolePill = (r) => { const R = META.roles[r]; return R ? `<span class="role" style="--rc:${R.color}" data-tip="${esc(R.desc)}">${ic(R.icon)}${R.name}</span>` : '' }
  const monLink = (slug, size = 24) => { const m = BY?.get(slug); return m ? `<a class="wl-mon" href="#wiki/pokemon/${m.s}">${spr(BY.idx.get(slug), size, { alt: m.nm })}<span>${esc(m.nm)}</span></a>` : esc(slug) }

  // ---------------------------------------------------------------- inline markup
  function md(t) {
    let s = esc(t)
    s = s.replace(/\{mon:([a-z0-9_-]+)\|([^|}]*)\|(-?\d+)\}/g, (_, slug, name, i) => `<a class="wl-mon" href="#wiki/pokemon/${slug}">${spr(+i, 24, { alt: name })}<span>${name}</span></a>`)
    s = s.replace(/\{item:([a-z0-9_-]+)\|([^}]*)\}/g, (_, k, name) => {
      const inner = `${ispr(k)}${name ? `<span>${name}</span>` : ''}`
      return META.itemKeys.includes(k) && name ? `<a class="wl-item" href="#wiki/item/${k}">${inner}</a>` : `<span class="wl-item">${inner}</span>`
    })
    s = s.replace(/\{type:([a-z]+)\}/g, (_, t) => typePill(t))
    s = s.replace(/\{i:([a-z0-9_-]+)\}/g, (_, k) => ic(k))
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
    s = s.replace(/\[([^\]]+)\]\((#wiki[^)]*)\)/g, '<a class="link" href="$2">$1</a>')
    return s
  }

  // ---------------------------------------------------------------- blocks
  let uid = 0
  const slugify = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  function blocks(list) { return list.map(block).join('') }
  function block(b) {
    switch (b.t) {
      case 'p': return `<p>${md(b.x)}</p>`
      case 'h': return `<h3 class="w-h" id="h-${slugify(b.x)}">${md(b.x)}${b.sub ? `<small>${md(b.sub)}</small>` : ''}</h3>`
      case 'ul': return `<ul class="w-list">${b.items.map((i) => `<li>${md(i)}</li>`).join('')}</ul>`
      case 'ol': return `<ol class="w-list">${b.items.map((i) => `<li>${md(i)}</li>`).join('')}</ol>`
      case 'note': return `<div class="w-note w-note--${b.tone}">${ic(b.tone === 'warn' ? 'warn' : 'exclaim')}<p>${md(b.x)}</p></div>`
      case 'kv': return `<dl class="w-kv">${b.items.map(([k, v]) => `<div><dt>${md(k)}</dt><dd>${md(String(v))}</dd></div>`).join('')}</dl>`
      case 'table': return table(b)
      case 'cards': return `<div class="w-cards">${b.items.map(([icon, title, x, to]) => `<a class="w-card" href="#wiki/${to}">${ic(icon)}<b>${esc(title)}</b><span>${esc(x)}</span></a>`).join('')}</div>`
      case 'steps': return `<ol class="w-steps">${b.items.map(([icon, title, x], i) => `<li><span class="w-steps__n">${i + 1}</span>${ic(icon)}<b>${esc(title)}</b><p>${md(x)}</p></li>`).join('')}</ol>`
      case 'mons': {
        const chips = `<div class="w-mons">${b.list.map(([slug, name, i]) => `<a href="#wiki/pokemon/${slug}" title="${esc(name)}">${spr(i, 40, { alt: name })}<span>${esc(name)}</span></a>`).join('')}</div>`
        if (b.fold) return `<details class="w-fold"><summary>${esc(b.label)}</summary>${chips}</details>`
        return `${b.label ? `<h4 class="w-h4">${esc(b.label)}</h4>` : ''}${chips}`
      }
      case 'fold': return `<details class="w-fold"><summary>${b.icon?.startsWith('item:') ? ispr(b.icon.slice(5)) : ''}${esc(b.title)}</summary>${blocks(b.blocks)}</details>`
      case 'faq': return `<div class="w-faq">${b.items.map(([q, a]) => `<details class="w-fold"><summary>${esc(q)}</summary><p>${md(a)}</p></details>`).join('')}</div>`
      case 'calc': return `<div class="w-calc" data-calc="${b.k}" id="calc-${++uid}"></div>`
      case 'live': return `<div class="w-live" data-live="${b.k}"></div>`
      case 'typechart': return typeChart()
      case 'gyms': return gyms(b.list)
      case 'abilities': return `<div data-abilities></div>`
      default: return ''
    }
  }
  // sortable / filterable tables (rows are inline markup)
  const plain = (s) => String(s ?? '').replace(/\{(?:mon|item):[a-z0-9_-]+\|([^|}]*)(?:\|-?\d+)?\}/g, '$1').replace(/\{type:([a-z]+)\}/g, '$1').replace(/\{i:[^}]+\}/g, '').replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  const numOf = (s) => { const m = plain(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : -Infinity }
  const tables = new Map()
  function table(b) {
    const id = `t${++uid}`
    tables.set(id, b)
    const filters = b.cols.map((c, i) => (c.filter ? i : -1)).filter((i) => i >= 0)
    const tools = (filters.length || b.search) ? `<div class="w-tools">${b.search ? `<input type="search" class="w-in" placeholder="Filter…" data-tsearch="${id}">` : ''}${filters.map((i) => `<select class="w-in" data-tfilter="${id}" data-col="${i}"><option value="">${esc(b.cols[i].label)}: all</option>${[...new Set(b.rows.map((r) => plain(r[i])))].filter(Boolean).sort().map((v) => `<option>${esc(v)}</option>`).join('')}</select>`).join('')}</div>` : ''
    return `${tools}<div class="w-tablewrap"><table class="w-table" id="${id}"><thead><tr>${b.cols.map((c, i) => `<th${c.num ? ' class="num"' : ''}${b.sort ? ` data-sort="${i}" tabindex="0" aria-sort="none"` : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rowsHtml(b, b.rows)}</tbody></table></div>`
  }
  const rowsHtml = (b, rows) => rows.map((r) => `<tr>${r.map((c, i) => `<td${b.cols[i]?.num ? ' class="num"' : ''}>${md(String(c ?? ''))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${b.cols.length}" class="muted">Nothing matches.</td></tr>`
  function refreshTable(id) {
    const b = tables.get(id), el = document.getElementById(id)
    if (!b || !el) return
    const q = ($(`[data-tsearch="${id}"]`)?.value || '').toLowerCase()
    const fs = $$(`[data-tfilter="${id}"]`).map((s) => [+s.dataset.col, s.value]).filter(([, v]) => v)
    let rows = b.rows.filter((r) => (!q || r.some((c) => plain(c).toLowerCase().includes(q))) && fs.every(([i, v]) => plain(r[i]) === v))
    const th = $('th[aria-sort="ascending"], th[aria-sort="descending"]', el)
    if (th) {
      const i = +th.dataset.sort, dir = th.getAttribute('aria-sort') === 'ascending' ? 1 : -1
      const isNum = rows.every((r) => numOf(r[i]) !== -Infinity || plain(r[i]) === '–' || plain(r[i]) === '')
      rows = [...rows].sort((a, c) => (isNum ? (numOf(a[i]) - numOf(c[i])) : plain(a[i]).localeCompare(plain(c[i]))) * dir)
    }
    $('tbody', el).innerHTML = rowsHtml(b, rows)
  }

  function typeChart() {
    const T = META.types
    const amp = (e) => (e > 1 ? e * META.amp.up : e > 0 && e < 1 ? e * META.amp.down : e)
    const cell = (e) => { const k = e === 0 ? 'z' : e > 1 ? 's' : e < 1 ? 'r' : 'n'; return `<td class="tc tc--${k}" data-e="${e}" data-a="${amp(e)}">${e === 1 ? '' : `<span class="std">${e === 0.5 ? '½' : e}</span><span class="tg">${+amp(e).toFixed(2)}</span>`}</td>` }
    return `<div class="w-tools"><label class="w-check"><input type="checkbox" data-tg-amp> Show Tallgrass multipliers</label><span class="muted small">Rows attack, columns defend.</span></div>
      <div class="w-tablewrap"><table class="w-chart"><thead><tr><th></th>${T.map((t) => `<th title="${cap(t)}"><span class="tdot" style="--tc:${META.typeColors[t]}">${ic(`type_${t}`)}</span></th>`).join('')}</tr></thead>
      <tbody>${T.map((a) => `<tr><th>${typePill(a, false)}</th>${T.map((dd) => cell(META.chart[a][dd])).join('')}</tr>`).join('')}</tbody></table></div>`
  }
  function gyms(list) {
    return `<div class="w-gyms">${list.map((g, i) => `<article class="w-gym" style="--g1:${g.colors[0]};--g2:${g.colors[1]}">
      <header><img class="px" src="${ART}g/${g.sprite}.png" alt="" width="64" height="64"><div><small>Gym ${i + 1} · ${esc(g.island)}</small><h4>${esc(g.leader)}</h4>${typePill(g.type)}</div><img class="px w-gym__badge" src="${ART}g/badge_${g.region}.png" alt="${esc(g.badge)}" width="32" height="32"></header>
      <p class="w-gym__intro">“${esc(g.intro)}”</p>
      <div class="w-gym__team">${g.team.map(([slug, name, idx, lv]) => `<a href="#wiki/pokemon/${slug}">${spr(idx, 48, { alt: name })}<span>${esc(name)}</span><small>Lv${lv}</small></a>`).join('')}</div>
      <dl class="w-kv w-kv--sm"><div><dt>Needs</dt><dd>${n(g.bosses)} island bosses</dd></div><div><dt>Badge</dt><dd>${esc(g.badge)}</dd></div><div><dt>Prize</dt><dd>$${n(g.cash)} + ${ispr(g.prize)}${esc(g.prizeName)}</dd></div><div><dt>Cap after</dt><dd>${i < list.length - 1 ? `Lv ${list[i + 1].cap}` : 'none'}</dd></div></dl>
    </article>`).join('')}</div>`
  }

  // ---------------------------------------------------------------- layout
  let root, side, main, sinput, sres
  function shell() {
    root = $('#wiki')
    root.innerHTML = `
      <div class="wk-top">
        <button class="wk-menu btn btn--ghost btn--sm" type="button" aria-expanded="false" aria-controls="wk-side">${ic('grid')} Menu</button>
        <a class="wk-brand" href="#wiki"><span class="wordmark wordmark--nav"><span>Tall</span><span>grass</span></span><b>Wiki</b></a>
        <div class="wk-search" role="search">
          <input id="wk-q" type="search" placeholder="Search Pokémon, moves, items, mechanics…" autocomplete="off" spellcheck="false" aria-label="Search the wiki" aria-controls="wk-results" aria-expanded="false">
          <kbd>/</kbd>
          <div class="wk-results" id="wk-results" role="listbox" hidden></div>
        </div>
        <a class="wk-back link" href="#top">Back to Tallgrass</a>
      </div>
      <div class="wk-body">
        <nav class="wk-side" id="wk-side" aria-label="Wiki sections"></nav>
        <article class="wk-main" id="wk-main" tabindex="-1"><p class="muted">Loading the wiki…</p></article>
      </div>`
    side = $('#wk-side'); main = $('#wk-main'); sinput = $('#wk-q'); sres = $('#wk-results')
    const sp = [...META.special]
    side.innerHTML = `<a class="wk-side__home" href="#wiki">${ic('grass')} Wiki home</a>` + META.cats.map(([id, name, icon]) => {
      const list = [...sp.filter((p) => p.cat === id), ...META.pages.filter((p) => p.cat === id)]
      return `<div class="wk-side__cat"><h4>${ic(icon)}${esc(name)}</h4>${list.map((p) => `<a href="#wiki/${p.id}" data-page="${p.id}">${esc(p.title)}</a>`).join('')}</div>`
    }).join('') + `<p class="wk-side__foot muted">Data from Tallgrass v${esc(META.version)}</p>`
    $('.wk-menu', root).addEventListener('click', (e) => { const on = root.classList.toggle('side-open'); e.currentTarget.setAttribute('aria-expanded', String(on)) })
    side.addEventListener('click', (e) => { if (e.target.closest('a')) root.classList.remove('side-open') })
    wireSearch()
    // delegated widgets
    root.addEventListener('click', onClick)
    root.addEventListener('input', onInput)
    root.addEventListener('change', onInput)
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('th[data-sort]')) e.target.click() })
  }
  function onClick(e) {
    const th = e.target.closest('th[data-sort]')
    if (th) {
      const t = th.closest('table')
      const was = th.getAttribute('aria-sort')
      $$('th[data-sort]', t).forEach((x) => x.setAttribute('aria-sort', 'none'))
      th.setAttribute('aria-sort', was === 'ascending' ? 'descending' : 'ascending')
      refreshTable(t.id)
      return
    }
    const look = e.target.closest('[data-look]')
    if (look) { const box = look.closest('.mp-art'); $$('[data-look]', box).forEach((b) => b.setAttribute('aria-pressed', String(b === look))); paintArt(box, look.dataset.look); return }
    const more = e.target.closest('[data-tutor]')
    if (more) { showTutor(more.dataset.tutor, more); return }
  }
  function onInput(e) {
    const t = e.target
    if (t.dataset.tsearch) refreshTable(t.dataset.tsearch)
    if (t.dataset.tfilter) refreshTable(t.dataset.tfilter)
    if (t.matches('[data-tg-amp]')) t.closest('.wk-main').classList.toggle('show-amp', t.checked)
    const calc = t.closest('.w-calc')
    if (calc) runCalc(calc, t)
    if (t.closest('.dx-filters')) dexFilter()
    if (t.closest('.ab-tools')) abilitiesRefresh()
  }

  // ---------------------------------------------------------------- search
  let SEARCH = null, sel = -1, hits = []
  const KIND = { p: 'Guide', m: 'Pokémon', v: 'Move', i: 'Item', a: 'Ability' }
  function score(e, q, words) {
    const name = e[1].toLowerCase()
    let s = 0
    if (name === q) s = 100
    else if (name.startsWith(q)) s = 80
    else if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) s = 60
    else if (name.includes(q)) s = 40
    else if (words.every((w) => name.includes(w))) s = 35
    else if (e[0] === 'm' && /^#?\d+$/.test(q) && e[2].startsWith(`#${q.replace('#', '').padStart(4, '0')}`)) s = 90
    else if (e[5] && words.every((w) => e[5].includes(w) || name.includes(w))) s = 20
    else if (e[2] && e[2].toLowerCase().includes(q) && q.length > 3) s = 10
    if (!s) return 0
    return s + ({ p: 6, m: 4, i: 2, v: 1, a: 0 })[e[0]] - name.length / 100
  }
  function find(q) {
    q = q.trim().toLowerCase()
    if (!q || !SEARCH) return []
    const words = q.split(/\s+/).filter(Boolean)
    const out = []
    for (const e of SEARCH) { const s = score(e, q, words); if (s) out.push([s, e]) }
    return out.sort((a, b) => b[0] - a[0]).slice(0, 24).map((x) => x[1])
  }
  function entryIcon(e) {
    if (e[0] === 'm') return spr(e[4], 32)
    if (e[0] === 'i') return e[4] >= 0 ? `<i class="ispr" style="width:24px;height:24px;background-size:${META.isheet.cols * 24}px auto;background-position:${-(e[4] % META.isheet.cols) * 24}px ${-Math.floor(e[4] / META.isheet.cols) * 24}px"></i>` : ic('held')
    if (e[0] === 'v') return ic(e[4])
    if (e[0] === 'p') return ic(e[4])
    return ic('gear')
  }
  function showResults(list, box = sres, input = sinput) {
    hits = list; sel = list.length ? 0 : -1
    if (!input.value.trim()) { box.hidden = true; input.setAttribute('aria-expanded', 'false'); return }
    box.innerHTML = list.length ? list.map((e, i) => `<a role="option" id="wr-${i}" class="wk-hit${i === sel ? ' is-sel' : ''}" href="#wiki/${e[3]}" aria-selected="${i === sel}">${entryIcon(e)}<span><b>${esc(e[1])}</b><small>${esc(e[2] || '')}</small></span><em>${KIND[e[0]]}</em></a>`).join('') : '<p class="muted wk-none">No matches. Try a Pokémon, move, item or a word like “shiny”.</p>'
    box.hidden = false
    input.setAttribute('aria-expanded', 'true')
  }
  function moveSel(d, box, input) {
    if (!hits.length) return
    sel = (sel + d + hits.length) % hits.length
    $$('.wk-hit', box).forEach((a, i) => { a.classList.toggle('is-sel', i === sel); a.setAttribute('aria-selected', String(i === sel)) })
    $(`#wr-${sel}`, box)?.scrollIntoView({ block: 'nearest' })
    input.setAttribute('aria-activedescendant', `wr-${sel}`)
  }
  function bindSearch(input, box) {
    const go = async () => { if (!SEARCH) SEARCH = await load('search.json'); showResults(find(input.value), box, input) }
    input.addEventListener('focus', () => { load('search.json').then((s) => { SEARCH = s }) })
    input.addEventListener('input', go)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1, box, input) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1, box, input) }
      else if (e.key === 'Enter') { e.preventDefault(); const h = hits[sel]; if (h) { location.hash = `#wiki/${h[3]}`; input.value = ''; box.hidden = true; input.blur() } }
      else if (e.key === 'Escape') { if (input.value) { input.value = ''; box.hidden = true } else input.blur() }
    })
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; input.setAttribute('aria-expanded', 'false') }, 160))
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', (e) => { if (e.target.closest('a')) { input.value = ''; box.hidden = true } })
  }
  function wireSearch() {
    bindSearch(sinput, sres)
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (document.body.classList.contains('is-gated')) return
      e.preventDefault()
      if (document.body.classList.contains('wiki-on')) sinput.focus()
      else { const tq = $('#wt-q'); if (tq) { tq.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); tq.focus({ preventScroll: true }) } }
    })
  }

  // ---------------------------------------------------------------- router
  const SITE_SECTIONS = () => $$('#main > section')
  let lastRoute = null, lastKey = null
  function route() {
    const h = decodeURIComponent(location.hash || '')
    const on = h === '#wiki' || h.startsWith('#wiki/')
    document.body.classList.toggle('wiki-on', on)
    SITE_SECTIONS().forEach((el) => { if (el.id !== 'wiki') el.hidden = on })
    root.hidden = !on
    $$('.nav__links a').forEach((a) => a.classList.toggle('is-on', on && a.getAttribute('href') === '#wiki'))
    if (!on) {
      if (lastRoute) { lastRoute = null; lastKey = null; document.title = SITE_TITLE; const id = h.slice(1); const el = id && document.getElementById(id); if (el) requestAnimationFrame(() => el.scrollIntoView()) }
      return
    }
    const [path, query] = h.replace(/^#wiki\/?/, '').split('?')
    const parts = path.split('/').filter(Boolean)
    const q = new URLSearchParams(query || '')
    const key = parts.join('/')
    const same = lastKey === key
    lastRoute = h
    lastKey = key
    $$('a[data-page]', side).forEach((a) => a.classList.toggle('is-on', a.dataset.page === (parts[0] === 'pokemon' ? 'pokedex' : parts[0] === 'move' ? 'moves' : parts[0] === 'item' ? 'items' : parts[0] === 'ability' ? 'abilities' : parts[0] || '')))
    if (same && parts[0] === 'pokedex') { dexFromQuery(q); return }
    render(parts, q).then(() => {
      const at = q.get('at') && document.getElementById(q.get('at')) // #wiki/<page>?at=<heading id> (search / FAQ links to a section)
      if (at) at.scrollIntoView({ block: 'start' })
      else if (!same) window.scrollTo({ top: Math.max(0, root.offsetTop - 70), behavior: 'auto' })
      document.title = `${$('.wk-main h1')?.textContent || 'Wiki'} · Tallgrass Wiki`
    })
  }
  const SITE_TITLE = document.title
  async function render(parts, q) {
    const [a, b] = parts
    tables.clear()
    try {
      if (!a) return home()
      if (a === 'pokedex') return pokedex(q)
      if (a === 'pokemon') return monPage(b)
      if (a === 'moves') return movesPage()
      if (a === 'move') return movePage(b)
      if (a === 'items') return itemsPage()
      if (a === 'item') return itemPage(b)
      if (a === 'ability') return abilityPage(b)
      const pg = PAGES.find((p) => p.id === a)
      if (!pg) return notFound()
      main.innerHTML = `${crumbs([[catName(pg.cat)], [pg.title]])}<h1 class="w-title">${ic(pg.icon)}${esc(pg.title)}</h1><p class="w-sum">${esc(pg.sum)}</p>${toc(pg)}${blocks(pg.blocks)}${pager(pg.id)}`
      await mount()
    } catch (err) {
      console.error(err)
      main.innerHTML = '<h1 class="w-title">Couldn\'t load that</h1><p>Check your connection and try again.</p>'
    }
  }
  const catName = (id) => META.cats.find((c) => c[0] === id)?.[1] || ''
  const crumbs = (list) => `<nav class="w-crumbs" aria-label="Breadcrumb"><a href="#wiki">Wiki</a>${list.map(([t, h]) => ` <span>/</span> ${h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`}`).join('')}</nav>`
  function toc(pg) {
    const hs = pg.blocks.filter((b) => b.t === 'h')
    if (hs.length < 3) return ''
    return `<nav class="w-toc" aria-label="On this page">${hs.map((b) => `<a href="#" data-to="h-${slugify(b.x)}">${md(b.x).replace(/<a [^>]*>|<\/a>/g, '')}</a>`).join('')}</nav>`
  }
  function pager(id) {
    const all = [...META.special, ...META.pages]
    const order = META.cats.flatMap(([c]) => all.filter((p) => p.cat === c))
    const i = order.findIndex((p) => p.id === id)
    const pv = order[i - 1], nx = order[i + 1]
    return `<nav class="w-pager">${pv ? `<a href="#wiki/${pv.id}"><small>Previous</small>${esc(pv.title)}</a>` : '<span></span>'}${nx ? `<a href="#wiki/${nx.id}" class="nx"><small>Next</small>${esc(nx.title)}</a>` : ''}</nav>`
  }
  const notFound = () => { main.innerHTML = `<h1 class="w-title">Not found</h1><p>That page isn't in the wiki. Try the search, or the <a class="link" href="#wiki">wiki home</a>.</p>` }
  async function mount() {
    $$('.w-toc a', main).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); document.getElementById(a.dataset.to)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }) }))
    const need = $$('.w-calc, .w-live, [data-abilities]', main).length
    if (need) await ensureDex()
    $$('.w-calc', main).forEach((c) => buildCalc(c))
    $$('.w-live', main).forEach((c) => live(c))
    if ($('[data-abilities]', main)) await abilitiesBlock($('[data-abilities]', main))
  }

  // ---------------------------------------------------------------- data helpers
  async function ensureDex() {
    if (DEX) return DEX
    DEX = await load('dex.json')
    BY = new Map(DEX.map((m) => [m.s, m]))
    BY.idx = new Map(DEX.map((m, i) => [m.s, i]))
    return DEX
  }
  const bst = (m) => m.st.reduce((a, b) => a + b, 0)
  const island = (i) => META.islands[i]?.name || ''

  // ---------------------------------------------------------------- home
  async function home() {
    await ensureDex()
    const tiles = [['pokedex', 'pokedex'], ['guide', 'grass'], ['looks', 'star'], ['catching', 'caught'], ['islands', 'grass'], ['raids', 'raid_pass'], ['daycare', 'egg'], ['items', 'held'], ['tower', 'boss'], ['squads', 'friends'], ['market', 'lantern'], ['faq', 'exclaim']]
    const all = [...META.special, ...META.pages]
    const c = META.counts
    main.innerHTML = `
      <section class="wh-hero">
        <h1 class="w-title wh-title">The Tallgrass Wiki</h1>
        <p class="w-sum">Every Pokémon, stat, odd and system in Tallgrass, straight from the game's code. ${n(c.species)} species, ${n(c.forms)} forms, ${n(c.moves)} moves, ${n(c.items)} items and ${n(c.pages)} guides.</p>
        <p class="muted small">Press <kbd>/</kbd> anywhere to search.</p>
      </section>
      <div class="wh-today"><div class="w-live" data-live="raid"></div><div class="w-live" data-live="outbreaks-mini"></div></div>
      <h2 class="w-h2">Start here</h2>
      <div class="w-cards w-cards--big">${tiles.map(([id, icon]) => { const p = all.find((x) => x.id === id); return p ? `<a class="w-card" href="#wiki/${id}">${ic(icon)}<b>${esc(p.title)}</b><span>${esc(p.sum)}</span></a>` : '' }).join('')}</div>
      <h2 class="w-h2">Everything</h2>
      <div class="wh-cats">${META.cats.map(([id, name, icon]) => `<section class="wh-cat"><h3>${ic(icon)}${esc(name)}</h3>${all.filter((p) => p.cat === id).map((p) => `<a href="#wiki/${p.id}">${esc(p.title)}</a>`).join('')}</section>`).join('')}</div>
      <p class="muted small wh-foot">Built from Tallgrass v${esc(META.version)} on ${esc(META.built)}. Tallgrass is a free fan game; Pokémon belongs to Nintendo, Game Freak, Creatures and The Pokémon Company.</p>`
    $$('.w-live', main).forEach((el) => live(el))
  }

  // ---------------------------------------------------------------- live widgets (shared rotations)
  const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s` }
  let liveTimer = 0
  function live(el) {
    const L = META.live
    const draw = () => {
      if (!document.body.contains(el)) return
      const now = Date.now()
      if (el.dataset.live === 'raid') {
        const today = C.raidBoss(L, now), next = C.raidBoss(L, now + 86400000)
        const t = BY.get(today), x = BY.get(next)
        const end = (Math.floor(now / 86400000) + 1) * 86400000
        el.innerHTML = `<div class="lv-card lv-raid"><h4>${ic('raid_pass')} Today's 5★ raid boss</h4>
          <a class="lv-boss" href="#wiki/pokemon/${today}">${spr(BY.idx.get(today), 96, { alt: t?.nm })}<span><b>${esc(t?.nm || today)}</b>${t ? t.t.map((ty) => typePill(ty, false)).join('') : ''}<small>Changes in ${clock(end - now)} (midnight UTC)</small></span></a>
          <p class="lv-next">Next: ${monLink(next, 32)}</p></div>`
      } else {
        const ob = C.outbreaks(L, now)
        const mini = el.dataset.live === 'outbreaks-mini'
        const row = (o, i) => { const m = BY.get(o.slug); const cos = o.costume && BY.get(o.costume); const sIdx = BY.idx.get(o.costume || o.slug); return `<li class="${i < 3 ? 'top' : ''}"><span class="lv-isl">${esc(META.islands.find((r) => r.id === o.region)?.name || o.region)}</span><a href="#wiki/pokemon/${o.costume || o.slug}">${spr(sIdx, mini ? 32 : 40, { alt: m?.nm })}<span>${esc(cos ? cos.nm : m?.nm || o.slug)}</span></a></li>` }
        el.innerHTML = `<div class="lv-card lv-ob"><h4>${ic('outbreak')} Mass Outbreaks now <small>ends in ${clock(ob.end - now)}</small></h4>
          <ol class="lv-list">${(mini ? ob.list.slice(0, 4) : ob.list).map(row).join('')}</ol>
          <p class="muted small">${mini ? `<a class="link" href="#wiki/outbreaks">All islands and how outbreaks work</a>` : `You get the first ${L.slots.map(([b, k]) => `${k} (${b} badges)`).join(' / ')} islands in this order <b>that you can reach</b>. Live events from the Tallgrass team come first. Outbreak Pokémon have ×${META.outbreakLooks} rare-look odds.`}</p></div>`
      }
    }
    draw()
    clearInterval(liveTimer)
    liveTimer = setInterval(() => $$('.w-live', main).forEach((e) => e.dispatchEvent(new Event('tick'))), 1000)
    el.addEventListener('tick', draw)
  }

  // ---------------------------------------------------------------- Pokédex (virtual list)
  const DX = { list: [], rows: [], q: null }
  async function pokedex(q) {
    await ensureDex()
    const opts = (arr) => arr.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')
    main.innerHTML = `${crumbs([['Pokémon'], ['Pokédex']])}<h1 class="w-title">${ic('pokedex')}Pokédex</h1><p class="w-sum">${esc(META.special[0].sum)}</p>
      <div class="dx-filters">
        <input type="search" class="w-in dx-q" name="q" placeholder="Name, #number or category" aria-label="Search the Pokédex">
        <select class="w-in" name="type" aria-label="Type"><option value="">All types</option>${opts(META.types.map((t) => [t, cap(t)]))}</select>
        <select class="w-in" name="tier" aria-label="Rarity"><option value="">Any rarity</option>${opts(Object.entries(TIER).map(([k, v]) => [k, v[0]]))}</select>
        <select class="w-in" name="isl" aria-label="Island"><option value="">Any island</option>${opts(META.islands.map((r, i) => [i, r.name]))}</select>
        <select class="w-in" name="src" aria-label="How to get"><option value="">Any way to get</option>${opts(Object.entries(SRC).map(([k, v]) => [k, v]))}</select>
        <select class="w-in" name="role" aria-label="Role"><option value="">Any role</option>${opts(Object.entries(META.roles).map(([k, r]) => [k, r.name]))}</select>
        <select class="w-in" name="gen" aria-label="Generation"><option value="">Any generation</option>${opts(GEN_ENDS.map((_, i) => [i + 1, `Gen ${i + 1}`]))}</select>
        <select class="w-in" name="form" aria-label="Forms"><option value="">Species</option><option value="all">Species + forms</option><option value="forms">Forms only (Mega, fusions…)</option><option value="costume">Costumes only</option><option value="regional">Regional forms</option></select>
        <select class="w-in" name="sort" aria-label="Sort"><option value="no">Sort: Pokédex no.</option><option value="name">Name</option><option value="bst">Base stat total</option>${STATN.map((s, i) => `<option value="s${i}">${s}</option>`).join('')}<option value="cr">Catch rate</option></select>
        <button class="w-in dx-dir" name="dir" type="button" aria-label="Reverse order" data-dir="1">↓</button>
      </div>
      <p class="dx-count muted small" aria-live="polite"></p>
      <div class="dx-head" aria-hidden="true"><span></span><span>#</span><span>Name</span><span>Types</span><span>Rarity</span><span class="dx-h-isl">Where</span><span class="num">BST</span>${STATN.map((s) => `<span class="num dx-st">${s}</span>`).join('')}</div>
      <div class="dx-scroll" tabindex="0" aria-label="Pokémon list"><div class="dx-pad"></div><div class="dx-rows" role="list"></div></div>`
    const box = $('.dx-scroll', main)
    box.addEventListener('scroll', dexPaint, { passive: true })
    addEventListener('resize', dexPaint, { passive: true })
    $('.dx-dir', main).addEventListener('click', (e) => { const b = e.currentTarget; b.dataset.dir = b.dataset.dir === '1' ? '-1' : '1'; b.textContent = b.dataset.dir === '1' ? '↓' : '↑'; dexFilter() })
    dexFromQuery(q)
  }
  function dexFromQuery(q) {
    const f = $('.dx-filters', main)
    if (!f) return
    for (const el of $$('[name]', f)) { if (el.tagName === 'BUTTON') { const v = q.get('dir') || '1'; el.dataset.dir = v; el.textContent = v === '1' ? '↓' : '↑' } else { el.value = q.get(el.name) || ''; if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0 } }
    dexFilter(true)
  }
  function dexFilter(fromHash) {
    const f = $('.dx-filters', main)
    if (!f) return
    const v = Object.fromEntries($$('[name]', f).map((el) => [el.name, el.tagName === 'BUTTON' ? el.dataset.dir : el.value]))
    const q = v.q.trim().toLowerCase().replace(/^#/, '')
    let list = DEX.filter((m) => {
      if (v.form === 'forms' ? !(m.k && m.k !== 'costume') : v.form === 'costume' ? m.k !== 'costume' : v.form === 'regional' ? !m.rg : v.form === 'all' ? false : !!m.k) return false
      if (v.type && !m.t.includes(v.type)) return false
      if (v.tier && m.tr !== v.tier) return false
      if (v.isl !== '' && !(m.w || []).some((w) => w[0] === +v.isl)) return false
      if (v.src && !m.src.includes(v.src)) return false
      if (v.role && m.rl !== v.role) return false
      if (v.gen && genOf(m.n) !== +v.gen) return false
      if (q) { if (/^\d+$/.test(q)) return String(m.n) === String(+q) || String(m.n).startsWith(q); return m.nm.toLowerCase().includes(q) || m.s.includes(q.replace(/\s+/g, '_')) || m.c.toLowerCase().includes(q) }
      return true
    })
    const dir = +v.dir || 1
    const key = v.sort
    const val = (m) => (key === 'name' ? m.nm : key === 'bst' ? bst(m) : key === 'cr' ? m.cr : key && key[0] === 's' ? m.st[+key.slice(1)] : m.n + (m.k ? 0.5 : 0) + (m.rg ? 0.25 : 0))
    list = list.slice().sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || a.n - b.n })
    DX.list = list
    $('.dx-count', main).textContent = `${n(list.length)} Pokémon`
    $('.dx-pad', main).style.height = `${list.length * rowH()}px`
    $('.dx-scroll', main).scrollTop = 0
    DX.last = ''
    dexPaint()
    if (!fromHash) {
      const qs = new URLSearchParams(Object.entries(v).filter(([k, x]) => x && !(k === 'dir' && x === '1')))
      const h = `#wiki/pokedex${qs.toString() ? `?${qs}` : ''}`
      if (location.hash !== h) { lastRoute = h; history.replaceState(null, '', h) }
    }
  }
  const rowH = () => (innerWidth < 720 ? 64 : 56)
  function dexPaint() {
    const box = $('.dx-scroll', main)
    if (!box) return
    const H = rowH()
    const from = Math.max(0, Math.floor(box.scrollTop / H) - 6)
    const to = Math.min(DX.list.length, Math.ceil((box.scrollTop + box.clientHeight) / H) + 6)
    const sig = `${from}-${to}-${DX.list.length}-${H}`
    if (sig === DX.last) return
    DX.last = sig
    const rows = $('.dx-rows', main)
    rows.style.transform = `translateY(${from * H}px)`
    rows.innerHTML = DX.list.slice(from, to).map((m) => {
      const where = m.k === 'costume' ? 'Costume' : m.k ? 'Battle form' : m.w ? m.w.map((w) => island(w[0])).join(', ') : m.src.map((s) => SRC[s]).join(', ')
      return `<a class="dx-row" role="listitem" href="#wiki/pokemon/${m.s}" style="height:${H}px">${spr(BY.idx.get(m.s), 48, { alt: m.nm })}<span class="dx-no">${m.k ? '' : `#${String(m.n).padStart(4, '0')}`}</span><span class="dx-nm"><b>${esc(m.nm)}</b><small>${esc(m.c ? `${m.c} Pokémon` : '')}</small></span><span class="dx-ty">${m.t.map((t) => typePill(t, false)).join('')}</span><span>${tierPill(m.tr)}</span><span class="dx-isl">${esc(where)}</span><span class="num dx-bst">${bst(m)}</span>${m.st.map((s) => `<span class="num dx-st">${s}</span>`).join('')}</a>`
    }).join('')
  }

  // ---------------------------------------------------------------- one Pokémon
  async function monPage(slug) {
    await ensureDex()
    const m = BY.get(slug)
    if (!m) return notFound()
    const idx = BY.idx.get(slug)
    const base = m.b ? BY.get(m.b) : null
    const order = DEX.filter((x) => !x.k)
    const oi = order.findIndex((x) => x.s === slug)
    const pv = oi > 0 ? order[oi - 1] : null, nx = oi >= 0 && oi < order.length - 1 ? order[oi + 1] : null
    const total = bst(m)
    const statRow = (v, i) => `<div class="mp-stat"><span>${STATN[i]}</span><b>${v}</b><i><em style="width:${Math.min(100, (v / 200) * 100)}%;--h:${Math.min(120, v * 0.75)}"></em></i></div>`
    const legend = m.tr === 'l' || m.tr === 'm'
    const [abTxt] = await Promise.all([load('moves.json')])
    const AB = abTxt.abilities
    const abil = m.ab.map((a, i) => a && (i < 2 || a !== m.ab[0]) ? `<div><dt>${i === 2 ? 'Hidden (5%)' : `Ability ${i + 1}`}</dt><dd><a class="link" href="#wiki/ability/${a}">${esc(AB[a]?.[0] || a)}</a><small>${esc(AB[a]?.[1] || '')}</small></dd></div>` : '').join('')
    const gender = m.f < 0 ? 'Genderless' : `${pctS((100 - m.f) / 100)} ♂ · ${pctS(m.f / 100)} ♀`
    const R = META.roles[m.rl]
    main.innerHTML = `${crumbs([['Pokémon'], ['Pokédex', '#wiki/pokedex'], [m.nm]])}
      <header class="mp-head">
        <div class="mp-art" data-idx="${idx}">
          <div class="mp-art__stage">${spr(idx, 192, { alt: m.nm })}</div>
          <div class="mp-looks" role="group" aria-label="Look">${[['n', 'Normal', ''], ['s', 'Shiny', 'star'], ['u', 'Void', 'umbral'], ['p', 'Prismatic', 'prismana']].map(([k, l, i2], j) => `<button type="button" data-look="${k}" aria-pressed="${j === 0}">${i2 ? ic(i2) : ''}${l}</button>`).join('')}</div>
        </div>
        <div class="mp-id">
          <p class="mp-no">${m.k ? (m.k === 'costume' ? 'Costume' : `${cap(m.k === 'mega' ? 'Mega' : m.k)} form`) + (base ? ` of <a class="link" href="#wiki/pokemon/${base.s}">${esc(base.nm)}</a>` : '') : `#${String(m.n).padStart(4, '0')} · Gen ${genOf(m.n)}`}</p>
          <h1 class="w-title mp-name">${esc(m.nm)}</h1>
          <p class="mp-cat">${m.c ? `${esc(m.c)} Pokémon` : ''}</p>
          <div class="mp-pills">${m.t.map((t) => typePill(t)).join('')}${tierPill(m.tr)}${rolePill(m.rl)}${m.rg ? '<span class="tag2">Regional form</span>' : ''}${m.ub ? '<span class="tag2">Ultra Beast</span>' : ''}</div>
          <dl class="w-kv w-kv--sm mp-facts">
            <div><dt>Catch rate</dt><dd>${m.cr}</dd></div><div><dt>Growth</dt><dd>${cap(m.g.replace('_', ' '))} (${n(META.growthTo100[m.g])} EXP to Lv100)</dd></div>
            <div><dt>Weight</dt><dd>${m.kg} kg</dd></div><div><dt>Gender</dt><dd>${gender}</dd></div>
            <div><dt>EXP yield</dt><dd>${m.y}</dd></div><div><dt>Tower cost</dt><dd>${m.rc} pts</dd></div>
          </dl>
        </div>
        <nav class="mp-nav">${pv ? `<a href="#wiki/pokemon/${pv.s}">‹ ${esc(pv.nm)}</a>` : '<span></span>'}${nx ? `<a href="#wiki/pokemon/${nx.s}">${esc(nx.nm)} ›</a>` : ''}</nav>
      </header>
      <div class="mp-grid">
        <section class="mp-sec"><h3 class="w-h">Base stats</h3>${m.st.map(statRow).join('')}<div class="mp-stat mp-total"><span>Total</span><b>${total}</b></div></section>
        <section class="mp-sec"><h3 class="w-h">Where to find it</h3>${whereHtml(m)}</section>
        <section class="mp-sec mp-wide"><h3 class="w-h">Evolution</h3>${evoHtml(m)}</section>
        <section class="mp-sec"><h3 class="w-h">Abilities</h3><dl class="w-kv w-kv--col">${abil || '<p class="muted">None</p>'}</dl></section>
        <section class="mp-sec"><h3 class="w-h">In a squad</h3>
          <p>${R ? `${rolePill(m.rl)} ${esc(R.desc)}` : ''}</p>
          <p><b>Leader skill${m.ld[2] ? ' (signature)' : ''}: ${esc(m.ld[0])}</b><br>${esc(m.ld[1])}</p>
          ${m.bd ? `<p class="muted small">Breeds at the Day Care (babies hatch as ${esc(BY.get(m.fst || m.s)?.nm || m.nm)}).</p>` : legend ? '<p class="muted small">Legendaries don\'t breed.</p>' : ''}
        </section>
        <section class="mp-sec mp-wide"><h3 class="w-h">Type matchups <small>(Tallgrass multipliers)</small></h3>${matchups(m.t)}</section>
        <section class="mp-sec mp-wide"><h3 class="w-h">Catch chance</h3><div class="w-calc" data-calc="catch" data-mon="${m.s}"></div></section>
        ${formsHtml(m)}
        <section class="mp-sec mp-wide"><h3 class="w-h">Level-up moves</h3><div data-learn="${m.s}"><p class="muted">Loading moves…</p></div></section>
        <section class="mp-sec mp-wide"><h3 class="w-h">Move Tutor moves</h3><div data-tutorbox><button class="btn btn--ghost btn--sm" type="button" data-tutor="${m.k === 'costume' ? m.b : m.s}">Show the moves it can be taught</button></div></section>
      </div>`
    $$('.w-calc', main).forEach((c) => buildCalc(c))
    learnTable(m)
  }
  function paintArt(box, look) {
    const idx = +box.dataset.idx
    $('.mp-art__stage', box).innerHTML = spr(idx, 192, { shiny: look === 's', umbral: look === 'u', prismana: look === 'p' })
  }
  function whereHtml(m) {
    const out = []
    if (m.k === 'costume') {
      out.push(`<p>A costume look of ${monLink(m.b, 32)}. Found: ${esc((m.cf || []).join(', '))}${m.ce ? ` (${esc(cap(m.ce))} event)` : ''}. See <a class="link" href="#wiki/costumes">Costume Pokémon</a>.</p>`)
      return out.join('')
    }
    if (m.k) {
      out.push(`<p>A battle form of ${monLink(m.b, 32)}. ${m.k === 'fusion' ? `Fuse it with ${monLink(m.wi, 32)} from the PC (Evolution tab).` : `Give ${esc(BY.get(m.b)?.nm || '')} its item from the PC; it changes mid-battle once charged (${META.megaAt} charge: +1 a turn, +1 more when hit).`}${m.stn ? ` Item: ${ispr(m.stn)}<a class="link" href="#wiki/item/${m.stn}">${esc(m.stn.replace(/_/g, ' '))}</a>.` : ''}</p>`)
      out.push('<p><a class="link" href="#wiki/forms">Mega Evolution & forms</a></p>')
      return out.join('')
    }
    if (m.w) out.push(`<ul class="mp-where">${m.w.map(([r, t, lo, hi]) => `<li><a class="link" href="#wiki/islands">${esc(island(r))}</a> ${tierPill(t)} <span class="muted">Lv ${lo}–${hi}</span></li>`).join('')}</ul>`)
    const tags = m.src.filter((s) => !['wild', 'legend'].includes(s))
    const why = {
      evolve: `Evolve ${monLink(m.fr, 24)}.`,
      egg: `Hatches from Day Care eggs of its family${m.tr === 'u' || m.tr === 'r' ? ' (and friend Gift Eggs)' : ''}.`,
      raid: `A 5★ <a class="link" href="#wiki/raids">raid boss</a>: its Raid Eggs hatch it.`,
      boss: 'Can appear as an Alpha or Gigantamax island boss, and sometimes joins you after you beat it.',
      starter: 'One of the starters you can pick.',
      none: 'Not found in the wild, eggs or raids right now.',
    }
    if (tags.length) out.push(`<ul class="w-list">${tags.map((s) => `<li>${why[s] || SRC[s]}</li>`).join('')}</ul>`)
    if (m.src.includes('legend')) out.push(`<p class="muted small">Wild legendaries wake once you've beaten that island's Gym and hold 3 badges. <a class="link" href="#wiki/legends">Legendaries & Mythicals</a></p>`)
    if (m.tr === 'm') out.push('<p class="muted small">Mythicals never appear in the wild: they come from Raid Eggs.</p>')
    return out.join('') || '<p class="muted">Unknown.</p>'
  }
  function evoHtml(m) {
    const root = BY.get(m.fam || m.s) || m
    const kids = (x) => (x.ev || []).filter(([to, how]) => BY.get(to) && !/regional form/i.test(how))
    const node = (x) => `<a class="evo-mon${x.s === m.s ? ' is-me' : ''}" href="#wiki/pokemon/${x.s}">${spr(BY.idx.get(x.s), 64, { alt: x.nm })}<span>${esc(x.nm)}</span></a>`
    const tree = (x, depth = 0) => {
      const ks = kids(x)
      if (!ks.length || depth > 4) return node(x)
      return `<div class="evo-step">${node(x)}<div class="evo-branches${ks.length > 1 ? ' many' : ''}">${ks.map(([to, how]) => `<div class="evo-branch"><span class="evo-how">${esc(how)}</span>${tree(BY.get(to), depth + 1)}</div>`).join('')}</div></div>`
    }
    const reg = (root.ev || []).concat(...DEX.filter((x) => x.fam === root.s || x.s === root.s).map((x) => x.ev || [])).filter(([, how]) => /regional form/i.test(how))
    const br = DEX.filter((x) => (x.fam || x.s) === root.s && x.br)
    return `<div class="evo">${kids(root).length ? tree(root) : `<p class="muted">${esc(m.nm)} doesn't evolve.</p>`}</div>
      ${br.length ? '<p class="muted small">Branching lines never evolve on their own: when one reaches an evolution, press Evolve in the PC and pick.</p>' : ''}
      ${reg.length ? `<p class="muted small">Regional forms in this family (${[...new Set(reg.map(([to]) => to))].map((to) => monLink(to, 24)).join(', ')}) are only found in the wild.</p>` : ''}`
  }
  function formsHtml(m) {
    const forms = DEX.filter((x) => x.b === m.s && x.k)
    if (!forms.length && !m.ms && !m.fu) return ''
    return `<section class="mp-sec mp-wide"><h3 class="w-h">Forms</h3><div class="w-mons">${forms.map((x) => `<a href="#wiki/pokemon/${x.s}">${spr(BY.idx.get(x.s), 48, { alt: x.nm })}<span>${esc(x.nm)}</span>${x.stn ? `<small>${ispr(x.stn, 16)}</small>` : ''}</a>`).join('')}</div></section>`
  }
  function matchups(types) {
    const amp = (e) => (e > 1 ? e * META.amp.up : e > 0 && e < 1 ? e * META.amp.down : e)
    const groups = {}
    for (const a of META.types) { const e = types.reduce((p, d) => p * META.chart[a][d], 1); if (e !== 1) (groups[amp(e)] ||= []).push(a) }
    const keys = Object.keys(groups).map(Number).sort((a, b) => b - a)
    return `<div class="mu">${keys.map((k) => `<div class="mu-row mu--${k > 1 ? 'weak' : k === 0 ? 'immune' : 'resist'}"><b>×${+k.toFixed(3)}</b><span>${groups[k].map((t) => typePill(t)).join('')}</span></div>`).join('')}</div>`
  }
  async function learnTable(m) {
    const [L, MV] = await Promise.all([load('learn.json'), load('moves.json')])
    const box = $(`[data-learn="${m.s}"]`, main)
    if (!box) return
    const list = L[m.s] || (m.b ? L[m.b] : null) || []
    const rows = []
    for (let i = 0; i < list.length; i += 2) rows.push([list[i], list[i + 1]])
    box.innerHTML = rows.length ? moveTable(rows.map(([lv, id]) => [lv === 0 ? 'Evo' : lv, id]), MV.moves, true) : '<p class="muted">No level-up moves.</p>'
  }
  const CAT = ['Physical', 'Special', 'Status']
  function moveTable(rows, MV, withLv) {
    const id = `t${++uid}`
    const b = { cols: [...(withLv ? [{ k: 'l', label: 'Lv', num: true }] : []), { k: 'm', label: 'Move' }, { k: 't', label: 'Type' }, { k: 'c', label: 'Cat.' }, { k: 'p', label: 'Power', num: true }, { k: 'a', label: 'Acc.', num: true }, { k: 'pp', label: 'PP', num: true }], sort: true,
      rows: rows.map(([lv, mid]) => { const v = MV[mid]; return v ? [...(withLv ? [lv] : []), `[${v[0]}](#wiki/move/${mid})${v[8] ? ' {i:caught}' : ''}`, `{type:${v[1]}}`, CAT[v[4]], v[2] > 1 ? v[2] : '–', v[3] || '–', v[5]] : null }).filter(Boolean) }
    tables.set(id, b)
    return `<div class="w-tablewrap"><table class="w-table w-table--moves" id="${id}"><thead><tr>${b.cols.map((c, i) => `<th${c.num ? ' class="num"' : ''} data-sort="${i}" tabindex="0" aria-sort="none">${c.label}</th>`).join('')}</tr></thead><tbody>${rowsHtml(b, b.rows)}</tbody></table></div>`
  }
  async function showTutor(slug, btn) {
    btn.disabled = true; btn.textContent = 'Loading…'
    const [T, MV] = await Promise.all([load('tutor.json'), load('moves.json')])
    const ids = T.all.includes(slug) ? Object.keys(MV.moves).map(Number) : T.tutor[slug] || []
    const box = btn.closest('[data-tutorbox]')
    if (!ids.length) { box.innerHTML = '<p class="muted">The Move Tutor has nothing for it.</p>'; return }
    const id = `t${++uid}`
    const b = { cols: [{ k: 'm', label: 'Move' }, { k: 't', label: 'Type' }, { k: 'c', label: 'Cat.' }, { k: 'p', label: 'Power', num: true }, { k: 'a', label: 'Acc.', num: true }, { k: '$', label: 'Tutor price', num: true }], sort: true,
      rows: ids.map((mid) => { const v = MV.moves[mid]; return v ? [`[${v[0]}](#wiki/move/${mid})${v[8] ? ' {i:caught}' : ''}`, `{type:${v[1]}}`, CAT[v[4]], v[2] > 1 ? v[2] : '–', v[3] || '–', `$${n(v[9])}`] : null }).filter(Boolean) }
    tables.set(id, b)
    box.innerHTML = `<p class="muted small">${T.all.includes(slug) ? 'Smeargle can be taught every move.' : `${ids.length} moves it can be taught (beyond its level-up list).`} {i:caught} = a catch move.`.replace('{i:caught}', ic('caught')) + `</p><div class="w-tablewrap"><table class="w-table w-table--moves" id="${id}"><thead><tr>${b.cols.map((c, i) => `<th${c.num ? ' class="num"' : ''} data-sort="${i}" tabindex="0" aria-sort="none">${c.label}</th>`).join('')}</tr></thead><tbody>${rowsHtml(b, b.rows)}</tbody></table></div>`
  }

  // ---------------------------------------------------------------- moves
  async function movesPage() {
    const MV = (await load('moves.json')).moves
    const rows = Object.entries(MV).map(([id, v]) => [`[${v[0]}](#wiki/move/${id})${v[8] ? ' {i:caught}' : ''}`, `{type:${v[1]}}`, CAT[v[4]], v[2] > 1 ? v[2] : '–', v[3] || '–', v[5], v[6] ? (v[6] > 0 ? `+${v[6]}` : v[6]) : '', `$${n(v[9])}`, v[7]])
    main.innerHTML = `${crumbs([['Pokémon'], ['Moves']])}<h1 class="w-title">${ic('cat_physical')}Moves</h1><p class="w-sum">${esc(META.special[1].sum)} ${ic('caught')} marks catch moves (a Catcher uses them so wild Pokémon aren't knocked out).</p>` +
      table({ cols: [{ k: 'n', label: 'Move' }, { k: 't', label: 'Type', filter: true }, { k: 'c', label: 'Category', filter: true }, { k: 'p', label: 'Power', num: true }, { k: 'a', label: 'Acc.', num: true }, { k: 'pp', label: 'PP', num: true }, { k: 'pr', label: 'Priority', num: true }, { k: '$', label: 'Tutor', num: true }, { k: 'd', label: 'Effect' }], rows, sort: true, search: true })
  }
  async function movePage(id) {
    const [MVD] = await Promise.all([load('moves.json'), ensureDex()])
    const v = MVD.moves[id]
    if (!v) return notFound()
    main.innerHTML = `${crumbs([['Pokémon'], ['Moves', '#wiki/moves'], [v[0]]])}<h1 class="w-title">${typePill(v[1], false)} ${esc(v[0])}</h1><p class="w-sum">${esc(v[7])}</p>
      <dl class="w-kv"><div><dt>Type</dt><dd>${typePill(v[1])}</dd></div><div><dt>Category</dt><dd>${CAT[v[4]]}</dd></div><div><dt>Power</dt><dd>${v[2] > 1 ? v[2] : '–'}</dd></div><div><dt>Accuracy</dt><dd>${v[3] ? `${v[3]}%` : 'Never misses'}</dd></div><div><dt>PP</dt><dd>${v[5]}</dd></div><div><dt>Priority</dt><dd>${v[6] || 0}</dd></div>${v[10] ? `<div><dt>Hits</dt><dd>${v[10]} times</dd></div>` : ''}<div><dt>Move Tutor</dt><dd>$${n(v[9])}</dd></div>${v[8] ? `<div><dt>Catch move</dt><dd>${ic('caught')} A Catcher uses it</dd></div>` : ''}</dl>
      <h3 class="w-h">Learned by levelling up</h3><div data-mlearn><p class="muted">Loading…</p></div>
      <h3 class="w-h">Taught by the Move Tutor</h3><div data-mtutor><button class="btn btn--ghost btn--sm" type="button">Show who can be taught it</button></div>`
    const L = await load('learn.json')
    const who = []
    for (const [slug, arr] of Object.entries(L)) for (let i = 0; i < arr.length; i += 2) if (arr[i + 1] === +id) { if (BY.get(slug) && !BY.get(slug).k) who.push([slug, arr[i]]); break }
    $('[data-mlearn]', main).innerHTML = who.length ? `<div class="w-mons">${who.sort((a, b) => BY.get(a[0]).n - BY.get(b[0]).n).map(([s, lv]) => `<a href="#wiki/pokemon/${s}">${spr(BY.idx.get(s), 40)}<span>${esc(BY.get(s).nm)}</span><small>${lv ? `Lv ${lv}` : 'Evo'}</small></a>`).join('')}</div>` : '<p class="muted">No Pokémon learn it by level.</p>'
    $('[data-mtutor] button', main).addEventListener('click', async (e) => {
      e.currentTarget.textContent = 'Loading…'
      const T = await load('tutor.json')
      const list = Object.entries(T.tutor).filter(([s, ids]) => ids.includes(+id) && BY.get(s) && !BY.get(s).k).map(([s]) => s).sort((a, b) => BY.get(a).n - BY.get(b).n)
      $('[data-mtutor]', main).innerHTML = `<p class="muted small">${list.length} Pokémon (plus Smeargle, who learns everything).</p><div class="w-mons">${list.map((s) => `<a href="#wiki/pokemon/${s}">${spr(BY.idx.get(s), 40)}<span>${esc(BY.get(s).nm)}</span></a>`).join('')}</div>`
    })
  }

  // ---------------------------------------------------------------- items
  const KINDN = { ball: 'Ball', candy: 'Candy', evolve: 'Evolution', mega: 'Mega & forms', lure: 'Radar', treasure: 'Treasure', heal: 'Healing', status: 'Healing', revive: 'Healing', pp: 'Healing', held: 'Held item' }
  async function itemsPage() {
    const IT = await load('items.json')
    const rows = IT.map((i) => [`{item:${i.k}|${i.nm}}`, KINDN[i.kind] || cap(i.kind), i.p ? `$${n(i.p)}` : '–', i.p ? (i.need ? `${i.need} rank` : i.b ? `${i.b} badge${i.b > 1 ? 's' : ''}` : 'Start') : '–', i.sl ? `$${n(i.sl)}` : '–', i.d])
    main.innerHTML = `${crumbs([['Progress & money'], ['Items & the Mart']])}<h1 class="w-title">${ic('held')}Items & the Mart</h1><p class="w-sum">${esc(META.special[2].sum)} Rare Candy isn't sold: it drops from wilds, bosses, raids and prizes.</p>` +
      table({ cols: [{ k: 'n', label: 'Item' }, { k: 'k', label: 'Kind', filter: true }, { k: 'p', label: 'Mart', num: true }, { k: 'b', label: 'Sold from' }, { k: 's', label: 'Sells for', num: true }, { k: 'd', label: 'What it does' }], rows, sort: true, search: true })
  }
  async function itemPage(key) {
    const [IT] = await Promise.all([load('items.json'), ensureDex()])
    const it = IT.find((i) => i.k === key)
    if (!it) return notFound()
    const nm = it.nm.toLowerCase()
    const users = DEX.filter((m) => (m.ev || []).some(([, how]) => how.toLowerCase().includes(`use a ${nm}`) || how.toLowerCase().includes(`use an ${nm}`)) || (key === 'linking_cord' && (m.ev || []).some(([, how]) => /linking cord/i.test(how))))
    const megaFor = DEX.filter((m) => m.stn === key)
    main.innerHTML = `${crumbs([['Progress & money'], ['Items & the Mart', '#wiki/items'], [it.nm]])}
      <header class="it-head">${ispr(key, 72)}<div><h1 class="w-title">${esc(it.nm)}</h1><p class="w-sum">${esc(it.d)}</p></div></header>
      <dl class="w-kv"><div><dt>Kind</dt><dd>${esc(KINDN[it.kind] || cap(it.kind))}${it.hr ? ` · ${esc(it.hr)} role` : ''}</dd></div><div><dt>Mart price</dt><dd>${it.p ? `$${n(it.p)}` : 'Not sold'}</dd></div><div><dt>Sold from</dt><dd>${it.p ? (it.need ? `${esc(it.need)} rank` : it.b ? `${it.b} badge${it.b > 1 ? 's' : ''}` : 'the start') : '–'}</dd></div><div><dt>Mart pays</dt><dd>${it.sl ? `$${n(it.sl)}` : 'Can\'t be sold'}</dd></div></dl>
      ${it.src.length ? `<h3 class="w-h">Where to get it</h3><ul class="w-list">${it.src.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${users.length ? `<h3 class="w-h">Evolves</h3><div class="w-mons">${users.map((m) => `<a href="#wiki/pokemon/${m.s}">${spr(BY.idx.get(m.s), 40)}<span>${esc(m.nm)}</span><small>→ ${esc((m.ev.find(([, h]) => h.toLowerCase().includes(nm) || /linking cord/i.test(h)) || [''])[0] ? BY.get(m.ev.find(([, h]) => h.toLowerCase().includes(nm) || /linking cord/i.test(h))[0])?.nm || '' : '')}</small></a>`).join('')}</div>` : ''}
      ${megaFor.length ? `<h3 class="w-h">Changes into</h3><div class="w-mons">${megaFor.map((m) => `<a href="#wiki/pokemon/${m.s}">${spr(BY.idx.get(m.s), 48)}<span>${esc(m.nm)}</span></a>`).join('')}</div>` : ''}`
  }

  // ---------------------------------------------------------------- abilities
  async function abilitiesBlock(el) {
    const AB = (await load('moves.json')).abilities
    const count = {}
    for (const m of DEX) if (!m.k) m.ab.forEach((a, i) => { if (a && (i < 2 || a !== m.ab[0])) count[a] = (count[a] || 0) + 1 })
    el.innerHTML = `<div class="w-tools ab-tools"><input type="search" class="w-in" placeholder="Filter abilities…"></div><div class="w-tablewrap"><table class="w-table ab-table"><thead><tr><th>Ability</th><th class="num">Pokémon</th><th>Effect</th></tr></thead><tbody></tbody></table></div>`
    el._rows = Object.entries(AB).filter(([k]) => count[k]).sort((a, b) => a[1][0].localeCompare(b[1][0])).map(([k, [nm, desc]]) => ({ k, nm, desc, c: count[k] }))
    abilitiesRefresh()
  }
  function abilitiesRefresh() {
    const el = $('[data-abilities]', main)
    if (!el?._rows) return
    const q = ($('.ab-tools input', el).value || '').toLowerCase()
    $('tbody', el).innerHTML = el._rows.filter((r) => !q || r.nm.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)).map((r) => `<tr><td><a class="link" href="#wiki/ability/${r.k}">${esc(r.nm)}</a></td><td class="num">${r.c}</td><td>${esc(r.desc)}</td></tr>`).join('')
  }
  async function abilityPage(key) {
    const [MV] = await Promise.all([load('moves.json'), ensureDex()])
    const a = MV.abilities[key]
    if (!a) return notFound()
    const slot = (m) => m.ab.indexOf(key)
    const list = DEX.filter((m) => !m.k && m.ab.includes(key))
    main.innerHTML = `${crumbs([['Pokémon'], ['Abilities', '#wiki/abilities'], [a[0]]])}<h1 class="w-title">${esc(a[0])}</h1><p class="w-sum">${esc(a[1])}</p>
      <h3 class="w-h">Pokémon with ${esc(a[0])} (${list.length})</h3><div class="w-mons">${list.map((m) => `<a href="#wiki/pokemon/${m.s}">${spr(BY.idx.get(m.s), 40)}<span>${esc(m.nm)}</span>${slot(m) === 2 ? '<small>Hidden</small>' : ''}</a>`).join('')}</div>`
  }

  // ---------------------------------------------------------------- calculators
  const BALLN = { poke_ball: 'Poké Ball', great_ball: 'Great Ball', ultra_ball: 'Ultra Ball', quick_ball: 'Quick Ball', timer_ball: 'Timer Ball', dusk_ball: 'Dusk Ball', net_ball: 'Net Ball', dive_ball: 'Dive Ball', nest_ball: 'Nest Ball', repeat_ball: 'Repeat Ball', level_ball: 'Level Ball', fast_ball: 'Fast Ball', heavy_ball: 'Heavy Ball', moon_ball: 'Moon Ball', love_ball: 'Love Ball', dream_ball: 'Dream Ball', beast_ball: 'Beast Ball', luxury_ball: 'Luxury Ball', heal_ball: 'Heal Ball', premier_ball: 'Premier Ball' }
  function monPicker(name, value) { return `<input class="w-in" name="${name}" list="dl-mons" value="${esc(BY.get(value)?.nm || value || '')}" placeholder="Pokémon" aria-label="Pokémon">${$('#dl-mons') ? '' : `<datalist id="dl-mons">${DEX.filter((m) => !m.k || m.k === 'mega').map((m) => `<option value="${esc(m.nm)}">`).join('')}</datalist>`}` }
  const monByName = (v) => DEX.find((m) => m.nm.toLowerCase() === String(v).trim().toLowerCase()) || BY.get(String(v).trim().toLowerCase())
  function buildCalc(el) {
    const k = el.dataset.calc
    if (k === 'catch') {
      const fixed = el.dataset.mon
      el.innerHTML = `<div class="calc">
        ${fixed ? '' : `<label>Pokémon ${monPicker('mon', 'pikachu')}</label>`}
        <label>HP left <span class="calc-v" data-v="hp"></span><input type="range" name="hp" min="1" max="100" value="100"></label>
        <label>Status <select class="w-in" name="st"><option value="none">None</option><option value="slp">Asleep / frozen (×${META.status.slp})</option><option value="par">Other status (×${META.status.par})</option></select></label>
        <label>Look <select class="w-in" name="look"><option value="">Normal / Shiny</option><option value="u">Void</option><option value="p">Prismatic</option><option value="up">Void Prismatic</option></select></label>
        <label>Catching Charm <span class="calc-v" data-v="charm"></span><input type="range" name="charm" min="0" max="${META.catcherMax}" value="0"></label>
        <label>Foe level <input class="w-in" type="number" name="lv" min="1" max="100" value="20"></label>
        <label class="w-check"><input type="checkbox" name="cond"> Special balls' condition met</label>
      </div><div class="calc-out"></div><p class="muted small">Per throw, before the Break bonus (auto battles add up to +8% × Break strength per Guard down). A Master Ball always works.</p>`
    } else if (k === 'odds') {
      el.innerHTML = `<div class="calc">
        <label>Rank <select class="w-in" name="rank">${META.ranks.map((r, i) => `<option value="${i}"${i === 4 ? ' selected' : ''}>${esc(r.name)} (${r.need}+ species)</option>`).join('')}</select></label>
        <label>Shiny Charm <span class="calc-v" data-v="charm"></span><input type="range" name="charm" min="0" max="${META.charmMax}" value="0"></label>
        <label>Where <select class="w-in" name="ctx"><option value="w">Wild</option><option value="o">Mass Outbreak Pokémon</option><option value="r">Poké Radar chain</option><option value="e">Day Care egg (same island parents)</option><option value="e2">Day Care egg (different islands)</option></select></label>
        <label>Radar chain <input class="w-in" type="number" name="chain" min="0" max="999" value="200"></label>
        <label>Event boost <select class="w-in" name="ev"><option value="1">None</option><option value="2">×2 Shiny event</option><option value="3">×3 Shiny event</option></select></label>
      </div><div class="calc-out"></div>`
    } else if (k === 'stats') {
      el.innerHTML = `<div class="calc">
        <label>Pokémon ${monPicker('mon', 'garchomp')}</label>
        <label>Level <input class="w-in" type="number" name="lv" min="1" max="100" value="50"></label>
        <label>IVs <select class="w-in" name="iv"><option value="31">All 31 (perfect)</option><option value="25">All 25</option><option value="15" selected>All 15</option><option value="0">All 0</option></select></label>
        <label>Nature <select class="w-in" name="nat">${META.natures.map((x, i) => `<option value="${i}">${x[0]}${x[1] !== x[2] ? ` (+${x[1]} −${x[2]})` : ''}</option>`).join('')}</select></label>
        <label>Look <select class="w-in" name="look"><option value="">Normal / Shiny</option><option value="u">Void</option><option value="p">Prismatic</option><option value="up">Void Prismatic</option></select></label>
      </div><div class="calc-out"></div><p class="muted small">Stats before power multipliers (rarity, Shiny, Alpha, Perfect, Power-ups, role, squad) and held items.</p>`
    } else if (k === 'transfer') {
      el.innerHTML = `<div class="calc">
        <label>Rarity <select class="w-in" name="tier"><option value="common">Common</option><option value="uncommon">Uncommon</option><option value="rare">Rare</option><option value="legendary">Legendary</option></select></label>
        <label>Level <input class="w-in" type="number" name="lv" min="1" max="100" value="30"></label>
        <label>Special looks <select class="w-in" name="looks"><option value="0">None</option><option value="1">One (Shiny, Void or Prismatic)</option><option value="2">Two</option><option value="3">All three</option></select></label>
        <label class="w-check"><input type="checkbox" name="perfect"> Perfect IVs</label>
        <label class="w-check"><input type="checkbox" name="alpha"> Alpha</label>
      </div><div class="calc-out"></div>`
    } else if (k === 'breed') breedBuild(el)
    runCalc(el)
  }

  // ---------------------------------------------------------------- Breeding calculator (Day Care page)
  // Every number comes from TGCalc's breeding port (checked against the game's eggOdds / compat / nanny on every build)
  const LOOKS3 = [['shiny', 'Shiny', 'star'], ['umbral', 'Void', 'umbral'], ['prismana', 'Prismatic', 'prismana']]
  const lookLabel = (l) => [l.shiny && 'Shiny', l.umbral && 'Void', l.prismana && 'Prismatic'].filter(Boolean).join(' ') || 'Normal'
  const pctA = (p) => (p >= 1 ? '100%' : p <= 0 ? '0%' : p >= 0.001 ? pctS(p, p >= 0.1 ? 1 : 2) : `${(p * 100).toFixed(Math.min(12, Math.ceil(-Math.log10(p * 100)) + 1)).replace(/0+$/, '')}%`)
  const oneInA = (p) => (p >= 1 ? 'always' : p <= 0 ? 'never' : 1 / p < 10 ? `1 in ${+(1 / p).toFixed(2)}` : `1 in ${Math.round(1 / p).toLocaleString('en-US')}`)
  const eggsA = (p, t) => { const e = C.eggsFor(p, t); return e === Infinity ? '–' : `${n(e)} egg${e === 1 ? '' : 's'}` }
  const mins = (sec) => { const m = sec / 60; if (m < 1) return `${Math.max(1, Math.round(sec))}s`; if (m < 60) return `${+m.toFixed(m < 10 ? 1 : 0)} min`; const h = Math.floor(m / 60); return `${h}h ${String(Math.round(m % 60)).padStart(2, '0')}m` }
  const breedRec = (m) => ({ s: m.s, fst: m.fst || m.s, t: m.t, bd: !!m.bd })
  const costumesOf = (slug) => DEX.filter((x) => x.k === 'costume' && x.b === slug)
  function breedBuild(el) {
    const K = META.breed
    const hw = Date.now() < K.halloweenEnd
    if (!$('#dl-breed')) document.body.insertAdjacentHTML('beforeend', `<datalist id="dl-breed">${DEX.filter((m) => !m.k).map((m) => `<option value="${esc(m.nm)}">`).join('')}</datalist>`)
    const par = (p, title, slug, on) => `<fieldset class="bc-par" data-par="${p}">
        <legend>${title}</legend>
        <div class="bc-par__top"><span class="bc-par__spr" data-pspr="${p}"></span>
          <label class="bc-par__mon"><span>Species</span><input class="w-in" name="${p}_mon" list="dl-breed" value="${esc(BY.get(slug)?.nm || slug)}" placeholder="Search a Pokémon" autocomplete="off" aria-label="${title} species"></label></div>
        <div class="bc-chips">${[...LOOKS3, ['perfect', 'Perfect', 'perfect'], ['alpha', 'Alpha', 'alpha']].map(([key, l, i2]) => `<label class="bc-chip${on.includes(key) ? ' on' : ''}"><input type="checkbox" name="${p}_${key}"${on.includes(key) ? ' checked' : ''}>${ic(i2)}<span>${l}</span></label>`).join('')}</div>
        <div class="bc-par__row">
          <label class="bc-cos" data-cos="${p}" hidden><span>Costume</span><select class="w-in" name="${p}_cos"></select></label>
          <label class="bc-chip bc-chip--item"><input type="checkbox" name="${p}_knot">${ispr('destiny_knot', 20)}<span>Destiny Knot</span></label>
          <label class="bc-chip bc-chip--item"><input type="checkbox" name="${p}_ever">${ispr('everstone', 20)}<span>Everstone</span></label>
        </div>
      </fieldset>`
    el.innerHTML = `<div class="bc">
      <div class="bc-mode" role="radiogroup" aria-label="Egg">
        <label class="bc-seg on"><input type="radio" name="mode" value="pair" checked>${ic('egg')}<span>Day Care pair</span></label>
        <label class="bc-seg"><input type="radio" name="mode" value="cegg">${ic('fav')}<span>Costume Egg</span></label>
      </div>
      <div class="bc-parents">${par('a', 'Parent A', 'pikachu', ['shiny'])}${par('b', 'Parent B', 'ditto', ['umbral'])}</div>
      <div class="bc-cegg calc" hidden><label>Costume <select class="w-in" name="cegg">${DEX.filter((m) => m.k === 'costume').map((m) => `<option value="${m.s}">${esc(m.nm)}</option>`).join('')}</select></label></div>
      <div class="calc bc-opts">
        <label>Your trainer rank <select class="w-in" name="rank">${META.ranks.map((r, i) => `<option value="${i}"${i === 4 ? ' selected' : ''}>${esc(r.name)} (${r.need}+ species)</option>`).join('')}</select></label>
        <label><span>Shiny Charm <b class="calc-v" data-v="charm"></b></span><input type="range" name="charm" min="0" max="${META.charmMax}" value="0"></label>
        <label>Odds event <select class="w-in" name="ev"><option value="1">None</option><option value="2">×2 Shiny event</option><option value="3">×3 Shiny event</option></select></label>
        <label class="w-check bc-paironly"><input type="checkbox" name="islands"> Parents caught on different islands</label>
      </div>
      <div class="calc bc-opts bc-paironly">
        <label>Egg warmer (Hearth / party) <select class="w-in" name="warm"><option value="1">None (×1)</option><option value="${K.warm.fire}">A Fire type (×${K.warm.fire})</option><option value="${K.warm.ability}">${esc(K.warm.abilities.join(' / '))} (×${K.warm.ability})</option></select></label>
        <label><span>Sweet Scent <b class="calc-v" data-v="speed"></b></span><input type="range" name="speed" min="0" max="${K.encSecs.length - 1}" value="0"></label>
        <label>Nanny <select class="w-in" name="nanny"><option value="">No nanny</option>${Object.keys(K.nanny).map((s) => `<option value="${s}">${esc(BY.get(s)?.nm || cap(s))} (${K.nanny[s]} min)</option>`).join('')}</select></label>
        <label>Nanny's look <select class="w-in" name="nlook"><option value="">Normal</option>${K.nannyLook ? LOOKS3.map(([key, l]) => `<option value="${key}">${l} (−${Math.round((1 - K.nannyLook[key]) * 100)}%)</option>`).join('') : ''}</select></label>
      </div>
      </div><div class="calc-out"></div>
      <p class="muted small">Per egg. Each look rolls on its own, so combinations multiply. ${hw ? `Until 1 Nov 2026 (UTC) a parent in a Halloween costume passes it on.` : 'Halloween costumes passed on until 1 Nov 2026 (UTC).'} The nanny only changes how fast eggs hatch, never what hatches.</p>`
  }
  function breedRun(el, v) {
    const K = META.breed
    const out = $('.calc-out', el)
    const cegg = v.mode === 'cegg'
    el.classList.toggle('bc--cegg', cegg)
    $$('.bc-seg', el).forEach((s) => s.classList.toggle('on', $('input', s).checked))
    $$('.bc-chip', el).forEach((s) => s.classList.toggle('on', $('input', s).checked))
    $('.bc-parents', el).hidden = cegg
    $('.bc-cegg', el).hidden = !cegg
    $$('.bc-paironly', el).forEach((x) => { x.hidden = cegg })
    const sv = $('[data-v="speed"]', el)
    if (sv) sv.textContent = `Lv ${v.speed} · ${+K.encSecs[+v.speed || 0].toFixed(1)}s`
    const hw = Date.now() < K.halloweenEnd
    const boost = { shiny: +v.ev || 1, crystal: 1 }
    const rank = +v.rank || 0, charm = +v.charm || 0
    // the parents
    const P = ['a', 'b'].map((p) => {
      const m = monByName(v[`${p}_mon`])
      const m2 = m && !m.k ? m : null
      const box = $(`[data-cos="${p}"]`, el), sel = $('select', box)
      const list = m2 ? costumesOf(m2.s) : []
      if (sel.dataset.for !== (m2?.s || '')) {
        sel.dataset.for = m2?.s || ''
        sel.innerHTML = `<option value="">No costume</option>${list.map((c) => `<option value="${c.s}">${esc(c.nm)}${c.ce === 'halloween' ? ' (Halloween)' : ''}</option>`).join('')}`
        sel.value = ''
      }
      box.hidden = !list.length
      const cos = list.length ? sel.value : ''
      const look = { shiny: !!v[`${p}_shiny`], umbral: !!v[`${p}_umbral`], prismana: !!v[`${p}_prismana`] }
      const art = cos ? BY.idx.get(cos) : m2 ? BY.idx.get(m2.s) : -1
      $(`[data-pspr="${p}"]`, el).innerHTML = spr(art, 64, { ...look, alt: m2?.nm || '' })
      return m2 && { m: m2, cos, look, perfect: !!v[`${p}_perfect`], alpha: !!v[`${p}_alpha`], knot: !!v[`${p}_knot`], everstone: !!v[`${p}_ever`] }
    })
    const tile = (i2, label, p, sub) => `<div class="bc-tile">${ic(i2)}<span>${label}</span><b>${pctA(p)}</b><small>${oneInA(p)}</small>${p > 0 && p < 1 ? `<em>50%: ${eggsA(p, 0.5)} · 90%: ${eggsA(p, 0.9)}</em>` : sub ? `<em>${sub}</em>` : ''}</div>`
    const lookGrid = (L, art, nm) => `<div class="bc-looks">${L.list.map((x) => `<div class="bc-look${x.shiny ? ' is-s' : ''}${x.umbral ? ' is-u' : ''}${x.prismana ? ' is-p' : ''}">${spr(art, 64, { shiny: x.shiny, umbral: x.umbral, prismana: x.prismana, alt: `${lookLabel(x)} ${nm}` })}<span>${lookLabel(x)}</span><b>${pctA(x.p)}</b><small>${oneInA(x.p)}</small><em>${x.p >= 0.5 ? 'most eggs' : `90%: ${eggsA(x.p, 0.9)}`}</em></div>`).join('')}</div>`
    const oddsHtml = (o, L) => `<div class="bc-tiles">${tile('star', 'Shiny', L.shiny)}${tile('umbral', 'Void', L.umbral)}${tile('prismana', 'Prismatic', L.prismana)}${tile('perfect', 'Perfect IVs', o.perfect, o.knot ? '×3 Destiny Knot' : '')}${tile('alpha', 'Alpha', o.alpha, o.alpha ? '' : cegg ? 'never from this egg' : 'needs an Alpha parent')}<div class="bc-tile any">${ic('burst')}<span>Any special look</span><b>${pctA(L.any)}</b><small>${oneInA(L.any)}</small>${L.any > 0 && L.any < 1 ? `<em>50%: ${eggsA(L.any, 0.5)} · 90%: ${eggsA(L.any, 0.9)}</em>` : ''}</div></div>`
    if (cegg) {
      const c = BY.get(v.cegg)
      if (!c) { out.innerHTML = '<p class="muted">Pick a costume.</p>'; return }
      const o = C.costumeEggOdds(K, { rank, charm })
      const L = C.looks8(o, boost)
      out.innerHTML = `<div class="bc-baby"><div class="bc-baby__one">${spr(BY.idx.get(c.s), 96, { alt: c.nm })}<b>${esc(c.nm)}</b><small>hatches from the Costume Egg</small></div>
        <p class="muted small">A Costume Egg (from gifts and prizes) hatches the costume Pokémon itself, at Lv 5. It's ready at once and never takes a basket slot. Its looks use ${K.costumeEgg.k}× the egg odds; perfect IVs ${oneIn(o.perfect)}.</p></div>
        <h4 class="w-h4">Chances per egg</h4>${oddsHtml(o, L)}<h4 class="w-h4">All 8 looks</h4>${lookGrid(L, BY.idx.get(c.s), c.nm)}`
      return
    }
    if (!P[0] || !P[1]) { out.innerHTML = `<p class="muted">Pick ${!P[0] && !P[1] ? 'both parents' : `Parent ${P[0] ? 'B' : 'A'}`} from the list.</p>`; return }
    const match = C.breedCompat(breedRec(P[0].m), breedRec(P[1].m))
    const babies = C.breedBabies(breedRec(P[0].m), breedRec(P[1].m))
    const o = C.eggOdds(K, { rank, charm, islands: !!v.islands, parents: P.map((p) => ({ ...p.look, perfect: p.perfect, alpha: p.alpha, knot: p.knot, everstone: p.everstone })) })
    const L = C.looks8(o, boost)
    const head = `<div class="bc-match ${match.ok ? 'ok' : 'no'}">${ic(match.ok ? 'heart' : 'warn')}<span><b>${match.ok ? (match.rate === 2 ? 'They get along great' : 'They get along') : 'No eggs'}</b> ${esc(match.why)}</span></div>`
    if (!match.ok) { out.innerHTML = head; return }
    // the baby (each non-Ditto parent equally likely) and the Halloween costume it can wear
    const bsel = babies.includes(el.dataset.baby) ? el.dataset.baby : babies[0]
    el.dataset.baby = bsel
    const babyInfo = babies.map((s) => {
      const fits = hw ? C.halloweenFits(K.costumes, P.map((p) => p.cos || null), s) : []
      return { s, m: BY.get(s), fits }
    })
    const cosNote = (b) => {
      const tried = P.filter((p) => p.cos)
      if (!tried.length) return ''
      if (b.fits.length) return `Wears ${b.fits.map((f) => `<b>${esc(BY.get(f)?.nm || f)}</b>`).join(' or ')}${b.fits.length > 1 ? ' (one of them, 50/50)' : ''}.`
      if (!hw && tried.some((p) => K.costumes[p.cos]?.event === 'halloween')) return 'Halloween costumes stopped passing on after 31 Oct 2026.'
      return tried.some((p) => K.costumes[p.cos]?.event === 'halloween') ? 'No costume of that line fits this baby: it hatches plain.' : 'Only Halloween costumes pass on: this baby hatches plain.'
    }
    const babyHtml = `<div class="bc-baby">${babyInfo.map((b) => `<label class="bc-baby__one${babies.length > 1 ? ' pick' : ''}${b.s === bsel ? ' on' : ''}">${babies.length > 1 ? `<input type="radio" name="baby" value="${b.s}"${b.s === bsel ? ' checked' : ''}>` : ''}${spr(BY.idx.get(b.fits[0] || b.s), 96, { alt: b.m?.nm || b.s })}<b>${esc(b.m?.nm || b.s)}</b><small>${babies.length > 1 ? `${pctS(1 / babies.length)} of eggs` : 'every egg'}</small>${cosNote(b) ? `<em>${cosNote(b)}</em>` : ''}</label>`).join('')}
      <p class="muted small">${babies.length > 1 ? 'The baby is the first form of either parent\'s line (each parent half the time). Tap one to preview its looks.' : `The baby is always the first form of ${P.some((p) => p.m.s === 'ditto') ? 'the non-Ditto parent\'s' : 'the parents\''} line.`}</p></div>`
    const cur = babyInfo.find((b) => b.s === bsel)
    const art = BY.idx.get(cur.fits[0] || cur.s)
    // hatch time
    const sec = K.encSecs[+v.speed || 0]
    const tierKey = { c: 'common', u: 'uncommon', r: 'rare', l: 'legendary', m: 'legendary' }[cur.m?.tr] || 'common'
    const total = K.hatch[tierKey] || 30
    const layEnc = Math.ceil(K.eggAt / match.rate)
    const warmEnc = C.warmEncounters(total, +v.warm || 1)
    const nan = v.nanny ? C.nannyMins(K, v.nanny, { shiny: v.nlook === 'shiny', umbral: v.nlook === 'umbral', prismana: v.nlook === 'prismana' }) : 0
    const layMin = (layEnc * sec) / 60
    const handsFree = nan ? Math.min(60 / layMin, 60 / nan) : 0
    const hatchHtml = `<dl class="w-kv bc-time">
      <div><dt>${ic('egg')} New egg</dt><dd>every <b>${layEnc}</b> encounters (${mins(layEnc * sec)})${match.rate === 2 ? ', same family = twice as fast' : ''}</dd></div>
      <div><dt>${ic('clock')} Ready to hatch</dt><dd><b>${warmEnc}</b> encounters of warmth (${mins(warmEnc * sec)}) for a ${tierKey} baby (${total} warmth)</dd></div>
      <div><dt>${ic('check')} Without a nanny</dt><dd>you open each egg as soon as it's ready: about <b>${mins((layEnc + warmEnc - 1) * sec)}</b> from an empty pen to a baby, then ${+(60 / layMin).toFixed(1)} eggs an hour</dd></div>
      <div><dt>${ic('heart')} With ${nan ? `${esc(BY.get(v.nanny)?.nm || v.nanny)}${v.nlook ? ` (${LOOKS3.find((x) => x[0] === v.nlook)[1]})` : ''}` : 'a nanny'}</dt><dd>${nan ? `hatches one ready egg every <b>${+nan.toFixed(2)} min</b> of hunting: about <b>${+handsFree.toFixed(1)}</b> babies an hour from this pen, hands-free${60 / nan < 60 / layMin ? ' (the nanny is the bottleneck: eggs wait in the basket)' : ''}` : 'pick a nanny above to see its hands-free pace'}</dd></div>
    </dl>`
    out.innerHTML = `${head}${babyHtml}<h4 class="w-h4">Chances per egg</h4>${oddsHtml(o, L)}<h4 class="w-h4">All 8 looks <small class="muted">${esc(cur.m?.nm || '')}</small></h4>${lookGrid(L, art, cur.m?.nm || '')}<h4 class="w-h4">Hatch time</h4>${hatchHtml}
      ${o.islands ? '<p class="muted small">Parents from different islands: base look odds doubled.</p>' : ''}
      <p class="muted small">${o.everstone ? `${ispr('everstone', 16)} Everstone: every baby gets the holder's nature${P.every((p) => p.everstone) ? ' (both hold one: either parent\'s, egg by egg)' : ''}. Looks and odds stay the same.` : 'Nature: random (1 in 25 for any one nature). An Everstone on a parent passes its nature.'} ${o.knot ? `${ispr('destiny_knot', 16)} Destiny Knot: each baby keeps the best of 3 IV rolls${o.everstone ? ' with that nature' : ''}, and ×3 perfect IVs${P.every((p) => p.knot) ? ' (two Knots work the same as one)' : ''}.` : ''}</p>`
  }
  function runCalc(el, t0) {
    const v = Object.fromEntries($$('[name]', el).filter((i) => i.type !== 'radio' || i.checked).map((i) => [i.name, i.type === 'checkbox' ? i.checked : i.value]))
    const out = $('.calc-out', el)
    $$('[data-v]', el).forEach((s) => { s.textContent = s.dataset.v === 'hp' ? `${v.hp}%` : v[s.dataset.v] })
    const k = el.dataset.calc
    if (k === 'catch') {
      const m = el.dataset.mon ? BY.get(el.dataset.mon) : monByName(v.mon)
      if (!m) { out.innerHTML = '<p class="muted">Pick a Pokémon.</p>'; return }
      const K = META.calc, S = META.sballs, lv = +v.lv || 20
      const base = { cr: m.cr, hp: (+v.hp || 100) / 100, st: META.status[v.st] || 1, umbral: v.look.includes('u'), prismana: v.look.includes('p'), legend: m.tr === 'l', charm: +v.charm || 0 }
      const ub = META.ub.includes(m.b || m.s)
      const ballX = (b) => {
        if (META.balls[b] != null) return { x: META.balls[b], add: 0, on: true }
        if (b === 'heavy_ball') { const [a3, a2, lo] = S.heavy_ball; const add = m.kg >= 300 ? a3 : m.kg >= 200 ? a2 : m.kg >= 100 ? 0 : lo; return { x: 1, add, on: add > 0 } }
        if (b === 'fast_ball') return m.st[5] >= 100 ? { x: S.fast_ball, add: 0, on: true } : { x: 1, add: 0, on: false }
        if (b === 'beast_ball') return ub ? { x: S.beast_ball, add: 0, on: true } : { x: S.beast_off, add: 0, on: false }
        if (b === 'nest_ball') { const x = lv < 30 ? Math.max(1, (41 - lv) / 10) : 1; return { x, add: 0, on: x > 1 } }
        if (b === 'level_ball') return v.cond ? { x: S.level_ball[0], add: 0, on: true } : { x: 1, add: 0, on: false }
        if (b === 'dream_ball') return v.st === 'slp' ? { x: S.dream_ball, add: 0, on: true } : { x: 1, add: 0, on: false }
        const x = S[b]
        return v.cond && x > 1 ? { x, add: 0, on: true } : { x: 1, add: 0, on: false }
      }
      const balls = Object.keys(BALLN)
      const res = balls.map((b) => { const bx = ballX(b); const p = C.catchChance(K, { ...base, x: bx.x, add: bx.add }); return [b, p, bx] }).sort((a, b) => b[1] - a[1])
      out.innerHTML = `<div class="calc-balls">${res.map(([b, p, bx]) => `<div class="cb${bx.on ? ' on' : ''}" title="${esc(META.ballUse[b] || '')}">${ispr(b)}<span>${BALLN[b]}${bx.on && META.balls[b] == null ? ' <em>active</em>' : ''}</span><b>${pctS(p)}</b><small>${p > 0 ? `${Math.ceil(Math.log(0.1) / Math.log(1 - Math.min(p, 0.999999)))} for 90%` : ''}</small></div>`).join('')}</div>`
    } else if (k === 'odds') {
      const r = META.ranks[+v.rank]
      const charm = +v.charm || 0
      let s = r.shiny / (1 + 0.12 * charm)
      const ev = +v.ev || 1
      if (v.ctx === 'o') s /= META.outbreakLooks
      if (v.ctx === 'r') s /= 1 + Math.min(200, +v.chain || 0) / 100
      if (v.ctx === 'e' || v.ctx === 'e2') s = s * 2 / 3 / (v.ctx === 'e2' ? 2 : 1)
      const ps = ev / s, pu = ev / (s * META.umbralX), pp = ev / (s * META.prismanaX)
      const any = 1 - (1 - ps) * (1 - pu) * (1 - pp)
      out.innerHTML = `<div class="calc-odds">${[['star', 'Shiny', ps], ['umbral', 'Void', pu], ['prismana', 'Prismatic', pp], ['perfect', 'Perfect IVs', v.ctx.startsWith('e') ? null : 1 / r.perfect]].map(([i2, l, p]) => p == null ? '' : `<div>${ic(i2)}<span>${l}</span><b>${oneIn(p)}</b></div>`).join('')}<div class="any"><span>Any special look</span><b>${oneIn(any)}</b></div></div>${v.ctx.startsWith('e') ? '<p class="muted small">Eggs: plus a bonus per parent that has the look; perfect IVs use the rank odds plus perfect parents (×3 with a Destiny Knot).</p>' : ''}`
    } else if (k === 'stats') {
      const m = monByName(v.mon)
      if (!m) { out.innerHTML = '<p class="muted">Pick a Pokémon.</p>'; return }
      const nat = META.natures[+v.nat]
      const ivs = Array(6).fill(+v.iv)
      const st = C.stats(META.calc, m.st, Math.max(1, Math.min(100, +v.lv || 50)), ivs, [nat[1], nat[2]], v.look.includes('u'), v.look.includes('p'), m.s === 'shedinja')
      out.innerHTML = `<div class="calc-stats">${STATK.map((k2, i) => `<div><span>${STATN[i]}</span><b>${st[k2]}</b></div>`).join('')}</div>`
    } else if (k === 'transfer') {
      const cash = C.transferCash(META.calc, v.tier, +v.lv || 1, +v.looks, v.perfect, v.alpha)
      out.innerHTML = `<div class="calc-odds"><div class="any"><span>The Professor pays</span><b>$${n(cash)}</b></div></div>`
    } else if (k === 'breed') {
      if (t0 && t0.name === 'baby') el.dataset.baby = t0.value
      breedRun(el, v)
    }
  }

  // ---------------------------------------------------------------- start (after the gate opens)
  async function init() {
    try {
      [META, PAGES] = await Promise.all([load('meta.json'), load('pages.json')])
    } catch { $('#wiki').innerHTML = '<p class="muted">The wiki couldn\'t load. Refresh to try again.</p>'; return }
    shell()
    teaser()
    addEventListener('hashchange', route)
    route()
  }
  function teaser() {
    const t = $('#wiki-teaser')
    if (!t) return
    const c = META.counts
    $('[data-wcount]', t).textContent = `${n(c.species)} species, ${n(c.forms)} forms, ${n(c.moves)} moves, ${n(c.items)} items and ${n(c.pages)} guides, straight from the game's code.`
    const tq = $('#wt-q'), tr = $('#wt-results')
    bindSearch(tq, tr)
  }
  const open = () => !document.body.classList.contains('is-gated') && !$('#main').hasAttribute('inert')
  function whenOpen(f) {
    if (open()) { f(); return }
    const mo = new MutationObserver(() => { if (open()) { mo.disconnect(); f() } })
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    mo.observe($('#main'), { attributes: true, attributeFilter: ['inert'] })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => whenOpen(init))
  else whenOpen(init)
})()
