// Tallgrass site: the gate (PIN / open / closed) + the page. No framework, no build step.
// The PIN is only ever sent to Supabase's site_unlock(); only the payload it returns is kept (sessionStorage).
(() => {
  'use strict'
  const C = window.TALLGRASS
  const $ = s => document.querySelector(s)
  const $$ = s => [...document.querySelectorAll(s)]
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const params = new URLSearchParams(location.search)
  const MOCK = C.mockHosts.includes(location.hostname) ? params.get('mock') : null // dev previews only
  const KEY = MOCK ? 'tallgrass:unlock:mock' : 'tallgrass:unlock'

  // ------------------------------------------------------------------ backend
  async function rpc(name, args = {}) {
    if (MOCK) return mockRpc(name, args)
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 12000)
    try {
      const r = await fetch(`${C.supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: ctl.signal,
      })
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
      return await r.json()
    } finally { clearTimeout(t) }
  }

  // Same shapes as supabase/site.sql. Mock PIN: 123456. ?mock=open|pin|closed|error
  const MOCK_RELEASE = {
    tag: 'v0.51.1', title: 'Raid Eggs every raid', date: '2026-10-23', repo: 'SoulStackStudio/tallgrass',
    win_url: 'https://github.com/SoulStackStudio/tallgrass/releases/download/v0.51.1/Tallgrass-v0.51.1.zip',
    mac_url: 'https://github.com/SoulStackStudio/tallgrass/releases/download/v0.51.1/Tallgrass-mac-v0.51.1.zip',
    win_mb: 169.2, mac_mb: 142.2, notes: 'Raid Eggs on every raid, won or lost.',
  }
  const mockFails = []
  async function mockRpc(name, { pin } = {}) {
    await sleep(350)
    if (MOCK === 'error') throw new Error('mock network error')
    const mode = ['open', 'closed'].includes(MOCK) ? MOCK : 'pin'
    if (name === 'site_status') return { mode, message: mode === 'closed' ? params.get('msg') : null }
    if (mode === 'closed') return { ok: false, reason: 'closed', message: params.get('msg') }
    if (mode === 'open') return { ok: true, mode, release: MOCK_RELEASE }
    if (!pin) return { ok: false, reason: 'need_pin' }
    const now = Date.now()
    while (mockFails.length && now - mockFails[0] > 15 * 60e3) mockFails.shift()
    if (mockFails.length >= 5) return { ok: false, reason: 'locked', wait_s: Math.ceil((mockFails[mockFails.length - 5] + 15 * 60e3 - now) / 1000) }
    if (pin === '123456') { mockFails.length = 0; return { ok: true, mode, release: MOCK_RELEASE } }
    mockFails.push(now)
    return { ok: false, reason: 'wrong', left: Math.max(0, 5 - mockFails.length) }
  }

  // ------------------------------------------------------------------ release payload
  const readSaved = () => { try { const r = JSON.parse(sessionStorage.getItem(KEY)); return r && r.win_url ? r : null } catch { return null } }
  const save = rel => { try { sessionStorage.setItem(KEY, JSON.stringify(rel)) } catch { /* private mode */ } }
  const ver = tag => String(tag || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false }
  const mb = n => n ? `${Math.round(Number(n))} MB` : ''
  const niceDate = d => { const t = d && new Date(`${String(d).slice(0, 10)}T12:00:00Z`); return t && !isNaN(t) ? t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '' }

  function applyRelease(rel) {
    if (!rel) return
    const v = String(rel.tag || '').replace(/^v/, '')
    $$('[data-ver]').forEach(el => { el.textContent = `v${v}` })
    $('#dl-version').textContent = `Version ${v}${rel.date ? `, ${niceDate(rel.date)}` : ''}`
    const set = (os, url, size) => {
      const btn = $(`#dl-${os}-btn`)
      if (url) { btn.href = url; btn.removeAttribute('aria-disabled'); btn.removeAttribute('tabindex') }
      else { btn.removeAttribute('href'); btn.setAttribute('aria-disabled', 'true'); btn.lastChild.textContent = ' Coming soon' }
      $(`[data-${os}-size]`).textContent = mb(size) || 'zip'
    }
    set('win', rel.win_url, rel.win_mb)
    set('mac', rel.mac_url, rel.mac_mb)
  }

  // A newer GitHub release than the server row (a sync that hasn't been pasted yet): use it.
  async function freshen(rel) {
    if (!rel || !rel.repo || !/^[\w.-]+\/[\w.-]+$/.test(rel.repo)) return
    try {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 5000)
      const r = await fetch(`https://api.github.com/repos/${rel.repo}/releases/latest`, { signal: ctl.signal, headers: { Accept: 'application/vnd.github+json' } })
      if (!r.ok) return
      const gh = await r.json()
      if (!newer(gh.tag_name, rel.tag)) return
      const win = gh.assets.find(a => /^Tallgrass-v[\d.]+\.zip$/.test(a.name))
      const mac = gh.assets.find(a => /^Tallgrass-mac-v[\d.]+\.zip$/.test(a.name))
      if (!win) return
      const next = { ...rel, tag: gh.tag_name, title: gh.name, date: (gh.published_at || '').slice(0, 10),
        win_url: win.browser_download_url, win_mb: win.size / 1048576,
        mac_url: mac ? mac.browser_download_url : null, mac_mb: mac ? mac.size / 1048576 : null }
      applyRelease(next); save(next)
    } catch { /* offline or rate-limited: the server copy stands */ }
  }

  // ------------------------------------------------------------------ gate
  const gate = $('#gate')
  const ball = $('#ball')
  const input = $('#pin-input')
  const msg = $('#pin-msg')
  const go = $('#pin-go')
  const BALLS = ['poke_ball', 'great_ball', 'ultra_ball', 'master_ball']
  let ballIx = 0
  let lockTimer = 0

  const site = [$('#nav'), $('#main'), document.querySelector('footer')]
  site.forEach(el => el.setAttribute('inert', ''))

  function showPane(name) {
    $$('.gate__pane').forEach(p => { p.hidden = p.dataset.pane !== name })
    gate.hidden = false
    document.body.classList.add('is-gated')
    if (name === 'pin') setTimeout(() => input.focus({ preventScroll: true }), 60)
  }
  function showClosed(message) {
    if (message) $('#closed-msg').textContent = message
    showPane('closed')
  }
  function say(text, kind = '') { msg.textContent = text; msg.className = `pin__msg${kind ? ` is-${kind}` : ''}` }
  function setBall(i) { ballIx = Math.min(i, BALLS.length - 1); ball.style.backgroundImage = `url('assets/sprites/${BALLS[ballIx]}.png')` }

  function drawSlots() {
    const v = input.value
    $$('#pin-slots span').forEach((s, i) => {
      s.classList.toggle('is-filled', i < v.length)
      s.classList.toggle('is-cursor', i === v.length && document.activeElement === input)
    })
  }
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); drawSlots(); if (msg.classList.contains('is-bad')) say('') })
  input.addEventListener('focus', drawSlots)
  input.addEventListener('blur', drawSlots)

  function shake() {
    if (reduce) return
    gate.classList.remove('is-shake'); void gate.offsetWidth; gate.classList.add('is-shake')
  }
  function stars() {
    if (reduce) return
    const box = $('#ball-stars'); box.textContent = ''
    ;[[-70, -40], [70, -40], [0, -80], [-50, 30], [50, 30]].forEach(([dx, dy], i) => {
      const s = document.createElement('i'); s.style.setProperty('--dx', `${dx}px`); s.style.setProperty('--dy', `${dy}px`); s.style.animationDelay = `${i * 40}ms`; box.append(s)
    })
  }
  function flash() {
    if (reduce) return
    const f = document.createElement('div'); f.className = 'flash'; ball.parentElement.append(f); setTimeout(() => f.remove(), 500)
  }
  const mins = s => s >= 3600 ? `${Math.ceil(s / 3600)} hours` : s >= 90 ? `${Math.ceil(s / 60)} minutes` : `${Math.max(1, Math.ceil(s))} seconds`
  function lockFor(seconds, text) {
    clearInterval(lockTimer)
    const until = Date.now() + seconds * 1000
    input.disabled = true; go.setAttribute('aria-disabled', 'true')
    const tick = () => {
      const left = (until - Date.now()) / 1000
      if (left <= 0) { clearInterval(lockTimer); input.disabled = false; go.removeAttribute('aria-disabled'); say('Ready for another throw.', ''); input.focus(); return }
      say(`${text} Try again in ${mins(left)}.`, 'warn')
    }
    tick(); lockTimer = setInterval(tick, 1000)
  }

  $('#pin-form').addEventListener('submit', async e => {
    e.preventDefault()
    if (go.getAttribute('aria-busy') === 'true' || input.disabled) return
    const pin = input.value
    if (pin.length < 4) { say('The PIN is 4 to 6 digits.', 'warn'); shake(); input.focus(); return }
    go.setAttribute('aria-busy', 'true'); say('Throwing…')
    ball.classList.remove('is-open', 'is-caught', 'is-burst'); ball.classList.add('is-wobble')
    const t0 = performance.now()
    let res
    try { res = await rpc('site_unlock', { pin }) } catch { res = { ok: false, reason: 'network' } }
    const hold = async ms => { const left = ms - (performance.now() - t0); if (left > 0 && !reduce) await sleep(left) }
    if (res.ok) {
      await hold(2100)
      ball.classList.remove('is-wobble'); ball.classList.add('is-caught'); stars()
      const pane = $('[data-pane=pin]')
      pane.querySelector('.gate__title').innerHTML = 'Gotcha! <em>Tallgrass</em> was caught!'
      pane.querySelector('.gate__lead').textContent = 'Heading into the tall grass…'
      say('')
      input.blur()
      await sleep(reduce ? 300 : 1100)
      reveal(res.release, true)
      return
    }
    await hold(900)
    ball.classList.remove('is-wobble')
    go.removeAttribute('aria-busy')
    if (res.reason === 'closed') { showClosed(res.message); return }
    if (res.reason === 'network') { say("Couldn't reach Tallgrass. Check your connection and try again.", 'bad'); return }
    // it broke free
    ball.classList.add('is-open', 'is-burst'); flash(); shake()
    setTimeout(() => { ball.classList.remove('is-open', 'is-burst'); if (res.reason === 'wrong') setBall(ballIx + 1) }, 520)
    input.value = ''; drawSlots()
    if (res.reason === 'wrong') {
      const left = Number(res.left)
      say(left > 0 ? `Oh no! It broke free. ${left} ${left === 1 ? 'try' : 'tries'} left, try a better ball.` : 'Oh no! It broke free.', 'bad')
      input.focus()
    } else if (res.reason === 'locked') lockFor(res.wait_s || 900, 'Your bag is out of balls.')
    else if (res.reason === 'busy') lockFor(res.wait_s || 60, 'Lots of trainers at the gate right now.')
    else { say('Something went wrong. Try again.', 'bad'); input.focus() }
  })

  function reveal(rel, animated) {
    applyRelease(rel); if (rel) save(rel); freshen(rel)
    site.forEach(el => el.removeAttribute('inert'))
    const done = () => { gate.hidden = true; gate.classList.remove('is-open'); document.body.classList.remove('is-gated'); startWilds() }
    if (animated && !reduce) { gate.classList.add('is-open'); setTimeout(done, 950) }
    else if (animated) { gate.classList.add('is-open'); setTimeout(done, 250) }
    else done()
  }

  async function boot() {
    showPane('loading')
    let st
    try { st = await rpc('site_status') } catch { showPane('error'); return }
    if (!st || st.mode === 'closed') { showClosed(st && st.message); return }
    if (st.mode === 'open') {
      try {
        const r = await rpc('site_unlock', {})
        if (r.ok) { reveal(r.release, false); return }
        if (r.reason === 'closed') { showClosed(r.message); return }
      } catch { showPane('error'); return }
    }
    const saved = readSaved()
    if (saved) { reveal(saved, false); return }
    setBall(0); drawSlots(); showPane('pin')
  }
  $('#retry').addEventListener('click', boot)

  // ------------------------------------------------------------------ page bits
  $$('[data-discord]').forEach(a => { a.href = C.discord; a.target = '_blank'; a.rel = 'noopener' })

  // nav background once you scroll
  const nav = $('#nav')
  const onScroll = () => nav.classList.toggle('is-solid', scrollY > 40)
  addEventListener('scroll', onScroll, { passive: true }); onScroll()

  // trailer
  const video = $('#trailer-video'), play = $('#trailer-play')
  const startTrailer = () => { play.hidden = true; video.preload = 'auto'; video.play().catch(() => { play.hidden = false }) }
  play.addEventListener('click', startTrailer)
  video.addEventListener('ended', () => { play.hidden = false })
  $('#hero-trailer').addEventListener('click', e => {
    e.preventDefault()
    $('#trailer').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    startTrailer()
  })

  // gallery lightbox
  const lb = $('#lightbox'), lbImg = $('#lightbox-img'), lbCap = $('#lightbox-cap')
  $$('.shot').forEach(b => b.addEventListener('click', () => {
    lbImg.src = b.dataset.full; lbImg.alt = b.querySelector('img').alt; lbCap.textContent = b.dataset.cap || ''
    if (lb.showModal) lb.showModal(); else window.open(b.dataset.full, '_blank')
  }))
  lb.addEventListener('click', e => { if (e.target === lb) lb.close() })

  // Mac command copy
  $('#mac-copy').addEventListener('click', async e => {
    const text = $('#mac-cmd').textContent
    try { await navigator.clipboard.writeText(text) } catch {
      const r = document.createRange(); r.selectNodeContents($('#mac-cmd')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy')
    }
    const b = e.currentTarget; b.textContent = 'Copied!'; b.classList.add('is-done')
    setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('is-done') }, 1800)
  })

  // which computer is this?
  const ua = navigator.userAgent
  const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
  const isPhone = /Android|iPhone|iPod|iPad|Mobile/i.test(ua) || (/Mac/i.test(plat) && navigator.maxTouchPoints > 1)
  const os = isPhone ? null : /Win/i.test(plat || ua) ? 'win' : /Mac/i.test(plat || ua) ? 'mac' : null
  if (isPhone) $('#phone-note').hidden = false
  if (os) { const card = $(`#dl-${os}`); card.classList.add('is-mine'); card.parentElement.prepend(card) }

  // pixel Apple logo for the Mac card (drawn, so no brand image file)
  const APPLE = ['.......##...', '......##....', '..###..###..', '.#########..', '########....', '########....', '########....', '.#########..', '.##########.', '..########..', '...##..##...']
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 11' shape-rendering='crispEdges'>${APPLE.map((row, y) => [...row].map((c, x) => c === '#' ? `<rect x='${x}' y='${y}' width='1' height='1' fill='${y < 2 ? '%237be38a' : '%23e8ebff'}'/>` : '').join('')).join('')}</svg>`
  $('.oslogo--mac').style.backgroundImage = `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E')}")`

  // patch notes
  async function loadNotes() {
    const body = $('#notes-body'), bar = $('#notes-versions')
    let list
    try { list = await (await fetch('data/patchnotes.json', { cache: 'no-cache' })).json() } catch { body.innerHTML = '<p class="muted">Patch notes are in the game: Trainer, then Patch notes.</p>'; return }
    const groups = [['notes', 'New', 'new'], ['changes', 'Changes', 'chg'], ['fixes', 'Fixes', 'fix']]
    const render = i => {
      const n = list[i]; body.textContent = ''
      const head = document.createElement('p'); head.className = 'notes__title'
      const b = document.createElement('b'); b.textContent = n.title || `Version ${n.version}`
      const s = document.createElement('span'); s.textContent = `v${n.version} · ${niceDate(n.date)}`
      head.append(b, s); body.append(head)
      const extra = (n.changes || []).length + (n.fixes || []).length
      let more = null
      if (extra) {
        more = document.createElement('details'); more.className = 'notes__more'
        const sum = document.createElement('summary'); sum.textContent = `Changes and fixes (${extra})`; more.append(sum)
      }
      for (const [k, label, cls] of groups) {
        if (!n[k] || !n[k].length) continue
        const g = document.createElement('div'); g.className = `notes__group notes__group--${cls}`
        const h = document.createElement('h4'); h.textContent = label
        const ul = document.createElement('ul')
        n[k].forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.append(li) })
        g.append(h, ul); (k === 'notes' ? body : more).append(g)
      }
      if (more) body.append(more)
      $$('.chip').forEach((c, j) => c.setAttribute('aria-selected', String(j === i)))
    }
    list.forEach((n, i) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.setAttribute('role', 'tab'); c.textContent = `v${n.version}`
      c.addEventListener('click', () => render(i)); bar.append(c)
    })
    render(0)
  }
  loadNotes()

  // wild Pokémon popping out of the hero grass
  const WILD = ['pikachu', 'eevee', 'gengar', 'dratini', 'ralts', 'gible', 'mudkip', 'treecko', 'piplup', 'charizard', 'lucario', 'snorlax',
    'bulbasaur', 'umbreon', 'absol', 'mimikyu', 'gardevoir', 'pawmot', 'rayquaza', 'lugia', 'mewtwo', 'giratina']
  let wildsOn = false, heroVisible = true
  function startWilds() {
    if (wildsOn || reduce) return
    wildsOn = true
    const box = $('#wilds')
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting }).observe($('.hero'))
    const spawn = () => {
      if (heroVisible && !document.hidden && box.childElementCount < 2) {
        const mon = WILD[Math.floor(Math.random() * WILD.length)]
        const shiny = Math.random() < 0.22
        const w = document.createElement('div'); w.className = `wild${shiny ? ' wild--shiny' : ''}`
        const narrow = innerWidth < 860
        w.style.left = `${(narrow ? 55 : 40) + Math.random() * (narrow ? 30 : 48)}%`
        w.innerHTML = `<div class="wild__bang"><img src="assets/icons/exclaim.png" alt=""></div><img src="assets/sprites/${mon}${shiny ? '_s' : ''}.png" alt="">`
        box.append(w); setTimeout(() => w.remove(), 2700)
      }
      setTimeout(spawn, 2400 + Math.random() * 2400)
    }
    setTimeout(spawn, 900)
  }

  boot()
})()
