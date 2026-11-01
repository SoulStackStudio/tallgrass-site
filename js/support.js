// Tallgrass site: the Support section (#support). Sign in with Discord (Supabase Auth, the game's own project + provider) -> pick a
// tier -> the edge function paystack-start answers Paystack's checkout link -> back here with ?support=thanks (the thank-you state).
// "Manage or cancel" asks paystack-manage for Paystack's own manage-subscription page. No secret lives here: the session token is the
// player's own (sessionStorage, this tab only), and every decision (tier, plan, who) is made on the server.
// Plain "support" tiers: nothing here names an in-game perk.
// Localhost previews: ?mock=open&sup=out|in|active|thanks|error (never on the live site).
(() => {
  'use strict'
  const C = window.TALLGRASS
  const $ = s => document.querySelector(s)
  const $$ = s => [...document.querySelectorAll(s)]
  const params = new URLSearchParams(location.search)
  const MOCK = C.mockHosts.includes(location.hostname) && params.get('mock') ? (params.get('sup') || 'out') : null
  const KEY = MOCK ? 'tallgrass:sb:mock' : 'tallgrass:sb'
  const TIERS = { shiny: ['Shiny', 5], void: ['Void', 10], prismatic: ['Prismatic', 15] }
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  // hidden until supportOpen (config.js); ?preview=1 opens it for this tab (kept through the Discord / Paystack round trip)
  try { if (params.get('preview') === '1') sessionStorage.setItem('tallgrass:suppreview', '1') } catch { /* private mode */ }
  const OPEN = C.supportOpen || !!MOCK || (() => { try { return sessionStorage.getItem('tallgrass:suppreview') === '1' } catch { return false } })()
  if (!OPEN) return
  document.documentElement.classList.add('sup-open')

  // ------------------------------------------------------------------ session (Supabase Auth, implicit flow, no library)
  // Back from Discord the address ends in #access_token=...: keep it for this tab, then tidy the address to #support.
  ;(function takeReturn() {
    const h = new URLSearchParams(location.hash.slice(1))
    if (h.get('access_token')) {
      const exp = Number(h.get('expires_in')) || 3600
      try { sessionStorage.setItem(KEY, JSON.stringify({ at: h.get('access_token'), rt: h.get('refresh_token') || '', exp: Date.now() + exp * 1000 })) } catch { /* private mode */ }
      history.replaceState(null, '', `${location.pathname}${location.search}#support`)
    } else if (h.get('error') || h.get('error_description')) {
      history.replaceState(null, '', `${location.pathname}${location.search}#support`)
      sessionStorage.setItem('tallgrass:sup:err', h.get('error_description') || h.get('error'))
    }
  })()
  const readSession = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) } catch { return null } }
  const dropSession = () => { try { sessionStorage.removeItem(KEY) } catch { /* */ } }

  async function token() {
    if (MOCK) return MOCK === 'out' ? null : 'mock'
    const s = readSession()
    if (!s || !s.at) return null
    if (s.exp - Date.now() > 60_000) return s.at
    if (!s.rt) { dropSession(); return null }
    try { // refresh an old session once
      const r = await fetch(`${C.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.rt }) })
      if (!r.ok) throw new Error('refresh')
      const j = await r.json()
      sessionStorage.setItem(KEY, JSON.stringify({ at: j.access_token, rt: j.refresh_token || '', exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 }))
      return j.access_token
    } catch { dropSession(); return null }
  }

  function signIn(tier) {
    if (tier) sessionStorage.setItem('tallgrass:sup:pick', tier) // carry on with this tier after the sign-in
    if (MOCK) { location.search = new URLSearchParams({ mock: params.get('mock'), sup: 'in' }).toString(); return }
    const back = `${location.origin}${location.pathname}`
    location.href = `${C.supabaseUrl}/auth/v1/authorize?provider=discord&redirect_to=${encodeURIComponent(back)}`
  }
  function signOut() {
    if (MOCK) { location.search = new URLSearchParams({ mock: params.get('mock'), sup: 'out' }).toString(); return }
    dropSession(); draw()
  }

  // ------------------------------------------------------------------ backend
  const MOCK_USER = { name: 'Jay', avatar: 'assets/img/icon-192.png' }
  async function me(tok) {
    if (MOCK) return MOCK_USER
    const r = await fetch(`${C.supabaseUrl}/auth/v1/user`, { headers: { apikey: C.supabaseKey, Authorization: `Bearer ${tok}` } })
    if (r.status === 401 || r.status === 403) { dropSession(); return null }
    if (!r.ok) throw new Error('user')
    const u = await r.json()
    const d = (u.identities || []).find(i => i.provider === 'discord')
    const m = { ...(u.user_metadata || {}), ...((d && d.identity_data) || {}) }
    const cc = m.custom_claims || {}
    return { name: String(cc.global_name || m.full_name || m.name || 'trainer').replace(/#0$/, '').slice(0, 40), avatar: m.avatar_url || '', discord: !!d }
  }
  async function fn(name, tok, body = {}) {
    if (MOCK) return mockFn(name, body)
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000)
    try {
      const r = await fetch(`${C.supabaseUrl}/functions/v1/${name}`, {
        method: 'POST', signal: ctl.signal,
        headers: { apikey: C.supabaseKey, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (r.status === 401) dropSession()
      return { status: r.status, ...j }
    } finally { clearTimeout(t) }
  }
  async function mockFn(name, body) {
    await sleep(400)
    if (MOCK === 'error') return { status: 502, error: 'unavailable' }
    const active = MOCK === 'active' || MOCK === 'thanks'
    if (name === 'paystack-manage') {
      if (body.link) return { status: 200, url: '#support' }
      return { status: 200, sub: active ? { tier: 'void', status: 'active', next: new Date(Date.now() + 23 * 864e5).toISOString() } : null }
    }
    if (name === 'paystack-start') {
      if (active) return { status: 409, error: 'already', tier: 'void' }
      return { status: 200, url: `?${new URLSearchParams({ mock: params.get('mock'), sup: 'thanks', support: 'thanks', reference: 'mock_ref' })}#support` }
    }
    return { status: 404, error: 'no such function' }
  }

  // ------------------------------------------------------------------ the section
  const say = (t, kind = '') => { const m = $('#sup-msg'); m.textContent = t; m.className = `sup-msg${kind ? ` is-${kind}` : ''}` }
  const niceDate = d => { const t = d && new Date(d); return t && !isNaN(t) ? t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '' }
  let sub = null

  function showSub(s) {
    sub = s
    $$('.sup-tier').forEach(c => c.classList.toggle('is-mine', !!s && c.dataset.tier === s.tier))
    $('#sup-manage').hidden = !s
    const st = $('#sup-status'); st.className = 'sup-who__status'
    if (!s) { st.textContent = ''; return }
    const nm = (TIERS[s.tier] || ['Supporter'])[0]
    st.textContent = s.status === 'non-renewing' || s.status === 'cancelled'
      ? `${nm} supporter until ${niceDate(s.until || s.next)} (cancelled, thank you for your support!)`
      : `${nm} supporter${s.next ? `, next payment ${niceDate(s.next)}` : ''}. Thank you!`
  }

  async function draw() {
    const err = sessionStorage.getItem('tallgrass:sup:err')
    if (err) { sessionStorage.removeItem('tallgrass:sup:err'); say(`Discord sign-in didn't finish (${err.slice(0, 80)}). Try again.`, 'bad') }
    const tok = await token()
    const out = $('[data-sup=out]'), inn = $('[data-sup=in]')
    let u = null
    if (tok) { try { u = await me(tok) } catch { say("Couldn't reach Tallgrass just now. Try again in a minute.", 'bad') } }
    out.hidden = !!u; inn.hidden = !u
    if (!u) { showSub(null); return }
    $('#sup-name').textContent = u.name
    if (u.avatar) $('#sup-avatar').src = u.avatar
    try { const r = await fn('paystack-manage', tok); showSub(r.status === 200 ? r.sub : null) } catch { showSub(null) }
    const pick = sessionStorage.getItem('tallgrass:sup:pick')
    if (pick) { sessionStorage.removeItem('tallgrass:sup:pick'); if (!sub) start(pick) }
  }

  async function start(tier) {
    if (!TIERS[tier]) return
    const tok = await token()
    if (!tok) { signIn(tier); return }
    if (sub) { say(`You're already supporting as ${TIERS[sub.tier] ? TIERS[sub.tier][0] : 'a supporter'}. To change tier, cancel under "Manage or cancel" first, then pick the new one.`, 'warn'); return }
    const btn = $(`.sup-pick[data-tier=${tier}]`)
    btn.setAttribute('aria-busy', 'true'); say('Opening Paystack…')
    let r
    try { r = await fn('paystack-start', tok, { tier }) } catch { r = { status: 0 } }
    btn.removeAttribute('aria-busy')
    if (r.status === 200 && r.url) { location.href = r.url; return }
    if (r.status === 401) { say('Your sign-in ran out. Sign in again and pick your tier.', 'warn'); draw(); return }
    if (r.error === 'already') { say("You're already supporting. Use \"Manage or cancel\" to change it.", 'warn'); draw(); return }
    if (r.error === 'no_discord') { say('Sign in with Discord (not another login) so your support is linked to you.', 'warn'); return }
    if (r.error === 'need_email') { say('Your Discord account has no email on it. Add one in Discord, sign out here and sign in again.', 'warn'); return }
    say("Couldn't open Paystack just now. Nothing was charged. Try again in a minute, or use Patreon below.", 'bad')
  }

  async function manage() {
    const tok = await token(); if (!tok) { signIn(); return }
    const b = $('#sup-manage'); b.setAttribute('aria-busy', 'true'); say('Opening Paystack…')
    let r
    try { r = await fn('paystack-manage', tok, { link: true }) } catch { r = { status: 0 } }
    b.removeAttribute('aria-busy')
    if (r.status === 200 && r.url) { if (MOCK) { say('(mock) Paystack\'s manage page would open here.'); return } location.href = r.url; return }
    say("Couldn't open the manage page just now. Try again in a minute, or ask in the Discord.", 'bad')
  }

  // the thank-you state: Paystack sends the payer back to ?support=thanks (plus its own ?reference=)
  function thanks() {
    if (params.get('support') !== 'thanks' && !params.get('reference') && !params.get('trxref')) return
    $('#sup-thanks').hidden = false
    $('#sup-thanks-close').addEventListener('click', () => {
      $('#sup-thanks').hidden = true
      const q = new URLSearchParams(location.search); ['support', 'reference', 'trxref'].forEach(k => q.delete(k))
      history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}#support`)
    })
  }

  // #support (the game's Support buttons link here): the page is behind the gate, so scroll once the gate opens
  function scrollWhenOpen() {
    if (location.hash !== '#support') return
    const go = () => { const el = $('#support'); if (el) el.scrollIntoView({ block: 'start' }) }
    if (!document.body.classList.contains('is-gated')) { go(); return }
    const mo = new MutationObserver(() => { if (!document.body.classList.contains('is-gated')) { mo.disconnect(); setTimeout(go, 50) } })
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  }

  $('#sup-signin').addEventListener('click', () => signIn())
  $('#sup-signout').addEventListener('click', signOut)
  $('#sup-manage').addEventListener('click', manage)
  $$('.sup-pick').forEach(b => b.addEventListener('click', () => start(b.dataset.tier)))
  thanks(); scrollWhenOpen(); draw()
})()
