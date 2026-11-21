/* TeachersInn — client application.
 * © Poornaphala Media and Infotech Services LLP. All rights reserved.
 * All dynamic values are HTML-escaped by the `html` template tag; no inline scripts or handlers (strict CSP). */
'use strict';
(() => {
  // ====================================================================== utilities
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = (s) => new Raw(s);
  const part = (v) => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : (v === false || v == null) ? '' : esc(v);
  function html(strings, ...vals) { let o = ''; strings.forEach((s, i) => { o += s; if (i < vals.length) o += part(vals[i]); }); return raw(o); }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const TZ = 'Asia/Kolkata';
  const toDate = (s) => new Date(/Z$|[+-]\d\d:\d\d$/.test(s) ? s : String(s).replace(' ', 'T') + 'Z');
  const fmtDate = (s) => s ? toDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '';
  const fmtDT = (s) => s ? toDate(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '';
  const fmtDay = (s) => toDate(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
  const fmtTime = (s) => toDate(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  const mon = (s) => toDate(s).toLocaleDateString('en-IN', { month: 'short', timeZone: TZ });
  const dayNum = (s) => toDate(s).toLocaleDateString('en-IN', { day: 'numeric', timeZone: TZ });
  function ago(s) {
    const sec = (Date.now() - toDate(s)) / 1000;
    if (sec < 60) return 'just now'; if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`; if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
    return fmtDate(s);
  }
  const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const THEME_KEY = 'teachersinn-theme';
  const THEMES = new Set(['classic', 'sky']);
  const SIDEBAR_KEY = 'teachersinn.sidebar.collapsed';
  const COLOR_MODE_KEY = 'teachersinn-color-mode';
  const normalizeTheme = (value) => THEMES.has(value) ? value : 'sky';
  function storedTheme() {
    try { return normalizeTheme(localStorage.getItem(THEME_KEY)); } catch { return 'sky'; }
  }
  function applyTheme(value, persist = true) {
    const theme = normalizeTheme(value);
    document.documentElement.dataset.theme = theme;
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage may be unavailable */ } }
    const colour = document.querySelector('meta[name="theme-color"]');
    if (colour) colour.content = theme === 'sky' ? '#2563eb' : '#fbd36b';
    return theme;
  }
  applyTheme(storedTheme(), false);
  const normalizeColorMode = value => ['system','light','dark'].includes(value) ? value : 'system';
  function storedColorMode(){ try{return normalizeColorMode(localStorage.getItem(COLOR_MODE_KEY));}catch{return 'system';} }
  function applyColorMode(value,persist=true){const mode=normalizeColorMode(value);document.documentElement.dataset.mode=mode;if(persist){try{localStorage.setItem(COLOR_MODE_KEY,mode);}catch{/* unavailable */}}return mode;}
  applyColorMode(storedColorMode(),false);
  function storedSidebarCollapsed() {
    try {
      const value = localStorage.getItem(SIDEBAR_KEY);
      return value === 'true' ? true : value === 'false' || value == null ? false : false;
    } catch { return false; }
  }
  function sidebarCollapsed() { return document.documentElement.dataset.sidebar === 'collapsed'; }
  function applySidebarState(collapsed, persist = true) {
    const isCollapsed = collapsed === true;
    document.documentElement.dataset.sidebar = isCollapsed ? 'collapsed' : 'expanded';
    if (persist) { try { localStorage.setItem(SIDEBAR_KEY, String(isCollapsed)); } catch { /* storage may be unavailable */ } }
    $$('.sidebar-toggle').forEach((button) => {
      button.setAttribute('aria-expanded', String(!isCollapsed));
      button.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
      button.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    });
    return isCollapsed;
  }
  applySidebarState(storedSidebarCollapsed(), false);
  let toastTimer;
  function toast(msg, err = false) {
    const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3200);
  }

  // ====================================================================== API
  const state = { me: null, csrf: '', cpdGoal: 50, cache: {} };
  const pendingGets = new Map();
  async function api(method, path, body) {
    const request = async () => {
      const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
      if (method !== 'GET') { opts.headers['Content-Type'] = 'application/json'; opts.headers['X-CSRF-Token'] = state.csrf; opts.body = JSON.stringify(body || {}); }
      const res = await fetch(path, opts);
      let data = null; try { data = await res.json(); } catch { /* non-JSON */ }
      if (res.status === 401 && state.me) {
        state.me = null; state.csrf = ''; state.cache = {}; pendingGets.clear();
        location.hash = '#/'; render();
      }
      if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
      if (method !== 'GET' && (/^\/api\/auth\//.test(path) || path === '/api/profile/delete')) pendingGets.clear();
      return data;
    };
    if (method !== 'GET') return request();
    if (pendingGets.has(path)) return pendingGets.get(path);
    const pending = request().finally(() => { if (pendingGets.get(path) === pending) pendingGets.delete(path); });
    pendingGets.set(path, pending);
    return pending;
  }
  async function loadMe() {
    const r = await api('GET', '/api/me');
    state.me = r.user; state.csrf = r.csrf || ''; state.cpdGoal = r.cpdGoal || 50;
  }

  // ====================================================================== icons (unicode glyphs keep the bundle tiny)
  const NAV = [
    ['Home', [['dashboard', 'Dashboard', '⌂']]],
    ['Grow', [['learn', 'Upskilling', '✦'], ['workshops', 'Workshops', '◷'], ['tutorials', 'Tutorials', '▤'], ['certificates', 'Certificates', '✪']]],
    ['Connect', [['network', 'Network', '⚇'], ['messages', 'Messages', '✉'], ['community', 'Communities', '❝']]],
    ['Work', [['planner', 'Lesson Planner', '✎'], ['jobs', 'Careers', '⚑']]],
    ['Help', [['support', 'Support', '♡'], ['settings', 'Settings', '⚙']]],
  ];
  const QUOTES = [
    'Every lesson plants something that outlives the bell.',
    'The best teachers keep learning — that is why you are here.',
    'Small, steady improvements make great classrooms.',
    'Your patience today is a student\'s confidence tomorrow.',
    'Teaching is a team sport. Lean on your network.',
  ];
  const notificationMeta = (n) => {
    const category = n.category || (String(n.link).startsWith('#/messages/') ? 'messages' : String(n.link).startsWith('#/network') ? 'connections' : String(n.link).startsWith('#/post/') || String(n.link).startsWith('#/community') ? 'community' : String(n.link).startsWith('#/workshops') ? 'workshops' : /#\/(learn|course|certificate)/.test(n.link || '') ? 'learning' : /#\/(support|ticket)/.test(n.link || '') ? 'support' : 'system');
    return ({ messages: ['Messages', '✉'], connections: ['Connections', '⚇'], community: ['Community', '❝'], workshops: ['Workshops', '◷'], learning: ['Learning & CPD', '✦'], support: ['Support', '♡'], system: ['System', '🔔'] })[category] || ['System', '🔔'];
  };
  const notificationItem = (n, compact = false) => { const [label, icon] = notificationMeta(n); return html`<li class="notification-item ${n.read_at ? 'is-read' : 'is-unread'}"><span class="notification-icon" aria-hidden="true">${icon}</span><div class="notification-copy"><div class="notification-line"><span class="notification-category">${label}</span>${!n.read_at ? html`<span class="unread-marker"><span class="sr-only">Unread notification</span></span>` : ''}</div><p>${n.text}</p><time datetime="${n.created_at}">${ago(n.created_at)}</time>${!compact ? html`<div class="notification-actions">${n.link ? html`<button class="btn sm ghost" data-action="open-notification" data-id="${n.id}" data-link="${n.link}">Open</button>` : ''}${!n.read_at ? html`<button class="btn link sm" data-action="read-notification" data-id="${n.id}">Mark as read</button>` : ''}</div>` : n.link ? html`<button class="btn link sm" data-action="open-notification" data-id="${n.id}" data-link="${n.link}">Open</button>` : ''}</div></li>`; };
  const notificationDay = (s) => { const value = toDate(s).toLocaleDateString('en-CA', { timeZone: TZ }); const now = new Date(); const today = now.toLocaleDateString('en-CA', { timeZone: TZ }); const yesterday = new Date(now.getTime() - 86400000).toLocaleDateString('en-CA', { timeZone: TZ }); return value === today ? 'Today' : value === yesterday ? 'Yesterday' : 'Earlier'; };

  // ====================================================================== layout
  function layout(active, inner) {
    const me = state.me;
    const badges = state.cache.badges || {};
    const current = NAV.flatMap(([, items]) => items).find(([key]) => key === active);
    const pageTitle = current ? current[1] : active === 'admin' ? 'Admin Console' : 'TeachersInn';
    const collapsed = sidebarCollapsed();
    const navHtml = NAV.map(([sect, items]) => html`<div class="sect"><span>${sect}</span></div>${items.map(([k, label, ico]) => html`
      <a href="#/${k}" class="${active === k ? 'active' : ''}" ${active === k ? raw('aria-current="page"') : ''} aria-label="${label}" data-nav-label="${label}" title="${collapsed ? label : ''}"><span class="ico" aria-hidden="true">${ico}</span><span class="nav-label">${label}</span>
      ${badges[k] ? html`<span class="badge">${badges[k]}</span>` : ''}</a>`)}`);
    return html`
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="side-head">
          <a class="brand" href="#/dashboard" aria-label="TeachersInn dashboard"><span class="mark">T</span><span class="brand-copy"><span>Teachers<b>Inn</b></span><small>By TheSchoolExpert</small></span></a>
          <button class="sidebar-toggle" data-action="toggle-sidebar" aria-label="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}" aria-expanded="${!collapsed}" title="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
            <svg class="collapse-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M14.5 6.5 9 12l5.5 5.5"/></svg>
            <svg class="expand-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m9.5 6.5 5.5 5.5-5.5 5.5"/></svg>
          </button>
        </div>
        <nav class="nav" aria-label="Main">${navHtml}
          ${me.role === 'admin' ? html`<div class="sect"><span>Admin</span></div><a href="#/admin" class="${active === 'admin' ? 'active' : ''}" ${active === 'admin' ? raw('aria-current="page"') : ''} aria-label="Admin Console" data-nav-label="Admin Console" title="${collapsed ? 'Admin Console' : ''}"><span class="ico" aria-hidden="true">⛨</span><span class="nav-label">Admin Console</span></a>` : ''}
        </nav>
        <div class="side-foot">© ${new Date().getFullYear()} Poornaphala Media and Infotech Services LLP. All rights reserved.</div>
      </aside>
      <button class="side-scrim" data-action="toggle-menu" aria-label="Close navigation" aria-controls="sidebar" tabindex="-1"></button>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" data-action="toggle-menu" aria-label="Open menu" aria-controls="sidebar" aria-expanded="false">☰</button>
          <div class="top-context"><span>Workspace</span><strong>${pageTitle}</strong></div>
          <form class="search" data-form="search" role="search"><input name="q" placeholder="Search educators, subjects, cities…" aria-label="Search educators"></form>
          <div class="spacer"></div>
          <label class="theme-picker"><span class="sr-only">Visual theme</span><select data-change="theme" aria-label="Visual theme">
            <option value="classic" ${storedTheme() === 'classic' ? 'selected' : ''}>Classic</option>
            <option value="sky" ${storedTheme() === 'sky' ? 'selected' : ''}>Sky Blue</option>
          </select></label>
          <div class="notification-control"><button class="icon-btn notification-bell" data-action="toggle-notifications" aria-label="Notifications${badges.notifications ? `, ${plural(badges.notifications, 'unread notification')}` : ''}" aria-haspopup="true" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>${badges.notifications ? html`<span class="notification-badge" aria-hidden="true">${badges.notifications > 9 ? '9+' : badges.notifications}</span>` : ''}</button><section class="notification-popover" id="notification-popover" aria-label="Recent notifications" hidden><div class="notification-popover-head"><div><b>Notifications</b><small>Recent activity</small></div><button class="btn link sm" data-action="read-all-notifications">Mark all read</button></div><div class="notification-preview-body"><div class="notification-loading">Loading notifications…</div></div><a class="notification-view-all" href="#/notifications">View all notifications →</a></section></div>
          <a href="#/profile" class="profile-link" aria-label="Open your profile"><span class="avatar">${initials(me.name)}</span><span><b>${me.name}</b><small>${me.designation || me.role}</small></span></a>
          <button class="btn ghost sm" data-action="logout">Sign out</button>
        </header>
        <main class="content" id="view">${inner}</main>
        <footer class="footer">
          <span>© ${new Date().getFullYear()} <b>Poornaphala Media and Infotech Services LLP</b>. TeachersInn™ — All rights reserved.</span>
          <span><a href="#/legal">Terms & Privacy</a> · <a href="#/support">Help</a></span>
        </footer>
      </div>
    </div>`;
  }
  const empty = (icon, text, action = '') => html`<div class="empty"><span class="big" aria-hidden="true">${icon}</span><p>${text}</p>${action ? html`<div class="mt">${action}</div>` : ''}</div>`;
  const pageHead = (title, sub, right = '') => html`<div class="page-head"><div><span class="eyebrow">TeachersInn workspace</span><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>${right ? html`<div class="page-actions">${right}</div>` : ''}</div>`;
  const tabs = (base, items, cur) => html`<nav class="tabs">${items.map(([k, l]) => html`<a href="#/${[base, k].filter(Boolean).join('/')}" class="${cur === k ? 'on' : ''}" ${cur === k ? raw('aria-current="page"') : ''}>${l}</a>`)}</nav>`;
  const progress = (pct, cls = '', label = 'Progress') => html`<div class="progress ${cls}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i data-w="${Math.round(pct)}"></i></div>`;
  const pct = (d, t) => t ? Math.round(d / t * 100) : 0;


  let generatedFieldId = 0;
  function applyDyn(root = document) {
    $$('[data-w]', root).forEach(el => { el.style.width = el.dataset.w + '%'; });
    $$('[data-h]', root).forEach(el => { el.style.height = el.dataset.h + '%'; });
    // Layout tweaks are applied through CSSOM so the CSP can forbid inline style attributes.
    $$('[data-s]', root).forEach(el => { el.style.cssText = el.dataset.s; });
    $$('label:not([for])', root).forEach(label => {
      const control = $('input, select, textarea', label.parentElement);
      if (!control || label.contains(control)) return;
      if (!control.id) control.id = `field-${++generatedFieldId}`;
      label.htmlFor = control.id;
    });
    syncMobileNavigation(root);
  }

  function focusRouteHeading(root) {
    const heading = $('h1', root);
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  // ====================================================================== modal
  let modalReturnFocus = null;
  function openModal(title, body) {
    const returnFocus = document.activeElement;
    closeModal(false);
    modalReturnFocus = returnFocus && typeof returnFocus.focus === 'function' ? returnFocus : null;
    const wrap = document.createElement('div');
    wrap.className = 'modal-back'; wrap.id = 'modal';
    wrap.innerHTML = html`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
      <div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close">✕</button></div>${body}</div>`.s;
    document.body.appendChild(wrap);
    applyDyn(wrap);
    const f = $('input, textarea, select, button', wrap) || $('.modal', wrap); if (f) f.focus();
  }
  function closeModal(restoreFocus = true) {
    const m = $('#modal'); if (m) m.remove();
    const target = modalReturnFocus; modalReturnFocus = null;
    if (restoreFocus && target && target.isConnected !== false) target.focus();
  }

  // ====================================================================== router
  const routes = [];
  const on = (re, fn, opts = {}) => routes.push({ re, fn, ...opts });
  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [p, qs] = h.split('?');
    return { path: p, query: new URLSearchParams(qs || '') };
  }
  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    const app = $('#app');
    const { path, query } = parseHash();
    closeModal(false);
    const r = routes.find(rt => rt.re.test(path));
    const m = r ? path.match(r.re) : null;
    if (r && r.public) {
      app.innerHTML = (await r.fn(m, query)).s; applyDyn(app); focusRouteHeading(app); window.scrollTo(0, 0); return;
    }
    if (!state.me) { app.innerHTML = landing(path === '/register' ? 'register' : 'login').s; applyDyn(app); focusRouteHeading(app); return; }
    if (!r || path === '/') { location.replace('#/dashboard'); return; }
    if (!$('#view')) app.innerHTML = layout(r.nav, html`<div class="empty">Loading…</div>`).s;
    try {
      refreshBadges();
      const inner = await r.fn(m, query);
      if (seq !== renderSeq) return;
      app.innerHTML = layout(r.nav, inner).s;
      applyDyn(app);
      focusRouteHeading(app);
      if (r.after) r.after(m, query);
      if (!r.keepScroll) window.scrollTo(0, 0);
      document.title = `${r.title || 'TeachersInn'} · TeachersInn`;
    } catch (e) {
      if (seq !== renderSeq) return;
      app.innerHTML = layout(r.nav, html`<div class="card">${empty('⚠', e.message)}</div>`).s;
    }
  }
  async function refreshBadges() {
    const userId = state.me?.id;
    if (!userId) return;
    try {
      const [d, preview] = await Promise.all([api('GET', '/api/dashboard'), api('GET', '/api/notifications/preview')]);
      if (state.me?.id !== userId) return;
      state.cache.dashboard = d;
      state.cache.notificationPreview = preview;
      const b = { messages: d.stats.unreadMessages || '', network: d.stats.pendingRequests || '', notifications: preview.unread || '' };
      const changed = JSON.stringify(b) !== JSON.stringify(state.cache.badges || {});
      state.cache.badges = b;
      if (changed) {
        for (const [k, v] of Object.entries(b)) {
          const a = $(`.nav a[href="#/${k}"]`); if (!a) continue;
          let s = $('.badge', a); if (v && !s) { s = document.createElement('span'); s.className = 'badge'; a.appendChild(s); }
          if (s) { if (v) s.textContent = v; else s.remove(); }
        }
        const bell = $('.notification-bell'); const old = bell && $('.notification-badge', bell); const count = b.notifications;
        if (bell) { bell.setAttribute('aria-label', `Notifications${count ? `, ${plural(count, 'unread notification')}` : ''}`); if (count) { if (old) old.textContent = count > 9 ? '9+' : count; else bell.insertAdjacentHTML('beforeend', html`<span class="notification-badge" aria-hidden="true">${count > 9 ? '9+' : count}</span>`.s); } else if (old) old.remove(); }
      }
    } catch { /* ignore */ }
  }

  // ====================================================================== event delegation
  const actions = {}; const forms = {};
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-action]');
    if (ev.target.classList && ev.target.classList.contains('modal-back')) return closeModal();
    if (!el) {
      const popover = $('#notification-popover'); if (popover && !ev.target.closest('.notification-control')) { popover.hidden = true; const bell = $('.notification-bell'); if (bell) bell.setAttribute('aria-expanded', 'false'); }
      if (ev.target.closest('.nav a')) closeMobileMenu();
      else if (!ev.target.closest('#sidebar') && !ev.target.closest('.menu-btn')) closeMobileMenu();
      return;
    }
    const fn = actions[el.dataset.action]; if (!fn) return;
    ev.preventDefault();
    if (el.disabled) return;
    el.disabled = true;
    try { await fn(el, ev); } catch (e) { toast(e.message, true); } finally { el.disabled = false; }
  });
  document.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('form[data-form]'); if (!form) return;
    ev.preventDefault();
    const fn = forms[form.dataset.form]; if (!fn) return;
    const data = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else data[el.name] = el.value;
    }
    const err = $('.form-error', form); if (err) { err.classList.remove('show'); err.removeAttribute('tabindex'); }
    const btn = $('button[type=submit], button:not([type])', form); if (btn) btn.disabled = true;
    try { await fn(data, form); }
    catch (e) { if (err) { err.textContent = e.message; err.setAttribute('role', 'alert'); err.tabIndex = -1; err.classList.add('show'); err.focus(); } else toast(e.message, true); }
    finally { if (btn) btn.disabled = false; }
  });
  document.addEventListener('input', (e) => {
    const input = e.target.closest('[data-message-input]'); if (!input) return;
    const button = $('button[type="submit"]', input.form); if (button) button.disabled = !input.value.trim();
  });
  document.addEventListener('keydown', (e) => {
    const modal = $('#modal');
    if (modal && e.key === 'Tab') {
      const focusable = $$('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', modal);
      if (!focusable.length) e.preventDefault();
      else if (e.shiftKey && document.activeElement === focusable[0]) { e.preventDefault(); focusable.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === focusable.at(-1)) { e.preventDefault(); focusable[0].focus(); }
    }
    const mobileSidebar = $('#sidebar');
    if (!modal && mobileSidebar?.classList.contains('open') && isMobileNavigation() && e.key === 'Tab') {
      const focusable = $$('a[href], button:not([disabled])', mobileSidebar);
      if (!focusable.length) e.preventDefault();
      else if (e.shiftKey && document.activeElement === focusable[0]) { e.preventDefault(); focusable.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === focusable.at(-1)) { e.preventDefault(); focusable[0].focus(); }
    }
    if (e.key === 'Escape') { closeModal(); closeMobileMenu(true); const popover = $('#notification-popover'); if (popover && !popover.hidden) { popover.hidden = true; const bell = $('.notification-bell'); bell?.setAttribute('aria-expanded', 'false'); bell?.focus(); } }
    const input = e.target.closest?.('[data-message-input]');
    if (input && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.value.trim()) input.form.requestSubmit(); }
  });
  window.addEventListener('hashchange', () => { closeMobileMenu(); render(); });
  window.addEventListener('resize', () => syncMobileNavigation());

  let mobileMenuTrigger = null;
  function isMobileNavigation() { return !!(window.matchMedia && window.matchMedia('(max-width: 860px)').matches); }
  function syncMobileNavigation(root = document) {
    const sidebar = $('#sidebar', root); if (!sidebar) return;
    const open = sidebar.classList.contains('open');
    const mobile = isMobileNavigation();
    sidebar.inert = mobile && !open;
    const main = $('.main'); if (main) main.inert = mobile && open;
    $$('.menu-btn').forEach(button => button.setAttribute('aria-expanded', String(open)));
  }
  function closeMobileMenu(restoreFocus = false) {
    $('#sidebar')?.classList.remove('open');
    document.body.classList.remove('nav-open');
    syncMobileNavigation();
    hideSidebarTooltip();
    if (restoreFocus && mobileMenuTrigger && mobileMenuTrigger.isConnected !== false) mobileMenuTrigger.focus();
    mobileMenuTrigger = null;
  }

  function hideSidebarTooltip() {
    const tooltip = $('#sidebar-tooltip');
    if (tooltip) tooltip.remove();
    $$('[aria-describedby="sidebar-tooltip"]').forEach((link) => link.removeAttribute('aria-describedby'));
  }
  function showSidebarTooltip(link) {
    if (!sidebarCollapsed() || (window.matchMedia && !window.matchMedia('(min-width: 861px)').matches)) return;
    hideSidebarTooltip();
    const tooltip = document.createElement('div');
    tooltip.id = 'sidebar-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = link.dataset.navLabel;
    document.body.appendChild(tooltip);
    const box = link.getBoundingClientRect();
    tooltip.style.left = `${box.right + 12}px`;
    const tipHeight = tooltip.getBoundingClientRect().height;
    const top = Math.min(window.innerHeight - tipHeight / 2 - 8, Math.max(tipHeight / 2 + 8, box.top + box.height / 2));
    tooltip.style.top = `${top}px`;
    link.setAttribute('aria-describedby', tooltip.id);
  }
  document.addEventListener('mouseover', (e) => { const link = e.target.closest('.nav a[data-nav-label]'); if (link) showSidebarTooltip(link); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('.nav a[data-nav-label]')) hideSidebarTooltip(); });
  document.addEventListener('focusin', (e) => { const link = e.target.closest('.nav a[data-nav-label]'); if (link) showSidebarTooltip(link); });
  document.addEventListener('focusout', (e) => { if (e.target.closest('.nav a[data-nav-label]')) hideSidebarTooltip(); });

  actions['toggle-menu'] = (el) => {
    const sidebar = $('#sidebar'); if (!sidebar) return;
    const opening = !sidebar.classList.contains('open');
    if (opening) mobileMenuTrigger = el.classList.contains('menu-btn') ? el : $('.menu-btn');
    sidebar.classList.toggle('open', opening);
    document.body.classList.toggle('nav-open', opening);
    syncMobileNavigation();
    if (opening) $('a[href], button:not([disabled])', sidebar)?.focus();
    if (!opening && mobileMenuTrigger && mobileMenuTrigger.isConnected !== false) mobileMenuTrigger.focus();
    if (!opening) mobileMenuTrigger = null;
  };
  actions['toggle-sidebar'] = () => { hideSidebarTooltip(); applySidebarState(!sidebarCollapsed()); };
  actions['close-modal'] = closeModal;
  actions.logout = async () => { await api('POST', '/api/auth/logout'); state.me = null; state.cache = {}; location.hash = '#/'; render(); };
  forms.search = (d) => { location.hash = `#/network?q=${encodeURIComponent(d.q || '')}`; };

  // ====================================================================== LANDING / AUTH
  function landing(tab) {
    return html`
    <div class="landing">
      <div class="l-nav">
        <a class="brand" href="#/"><span class="mark">T</span><span>Teachers<b>Inn</b></span></a>
        <a href="#/verify" class="btn ghost sm">Verify a certificate</a>
      </div>
      <section class="l-hero">
        <div>
          <span class="tag gold">For teachers & educators only</span>
          <h1>Your professional home as an <em>educator</em>.</h1>
          <p class="lede">Grow your skills, earn CPD hours, join live workshops, find a mentor, and connect with educators across India — on a platform built only for the teaching profession.</p>
          <div class="l-feats">
            <div><span class="ic">✦</span><span><b>Upskilling & CPD</b>NEP-aligned courses with certificates and a 50-hour CPD tracker.</span></div>
            <div><span class="ic">◷</span><span><b>Educator workshops</b>Live and in-person sessions led by practising teachers.</span></div>
            <div><span class="ic">⚇</span><span><b>Network & communities</b>Subject communities, connections and private messaging.</span></div>
            <div><span class="ic">♡</span><span><b>Support & mentorship</b>Helpdesk, mentors and wellbeing resources.</span></div>
            <div><span class="ic">▤</span><span><b>Tutorials</b>Step-by-step guides for everything a teacher does.</span></div>
            <div><span class="ic">✎</span><span><b>Planner & careers</b>Lesson planner and a teaching jobs board.</span></div>
          </div>
        </div>
        <div class="auth-card">
          ${tabs('', [['', 'Sign in'], ['register', 'Create account']], tab === 'register' ? 'register' : '')}
          ${tab === 'register' ? registerForm() : loginForm()}
          <div class="trust"><span>Encrypted passwords</span><span>DPDP Act aligned</span><span>No student data collected</span></div>
        </div>
      </section>
      <footer class="footer">
        <span>© ${new Date().getFullYear()} <b>Poornaphala Media and Infotech Services LLP</b>. TeachersInn™ — All rights reserved.</span>
        <span><a href="#/legal">Terms & Privacy</a></span>
      </footer>
    </div>`;
  }
  const loginForm = () => html`
    <form data-form="login" autocomplete="on">
      <div class="form-error"></div>
      <div class="field"><label for="le">Email</label><input id="le" name="email" type="email" autocomplete="username" required maxlength="254"></div>
      <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required maxlength="128"></div>
      <button class="btn" type="submit">Sign in</button>
      <p class="hint"><a href="#/forgot-password">Forgot your password?</a></p>
      <p class="hint">After 5 failed attempts your account is locked for 15 minutes to keep it safe.</p>
    </form>`;
  const registerForm = () => html`
    <form data-form="register" autocomplete="on">
      <div class="form-error"></div>
      <div class="field"><label for="rn">Full name</label><input id="rn" name="name" required minlength="2" maxlength="80" autocomplete="name"></div>
      <div class="field"><label for="re">Email</label><input id="re" name="email" type="email" required maxlength="254" autocomplete="email"></div>
      <div class="grid-2">
        <div class="field"><label for="rd">Role</label><select id="rd" name="designation">
          ${['Teacher', 'Primary Teacher', 'TGT', 'PGT', 'Special Educator', 'Counsellor', 'Coordinator / HoD', 'Principal / Head', 'Tutor / Trainer', 'B.Ed. / D.El.Ed. Student'].map(o => html`<option>${o}</option>`)}
        </select></div>
        <div class="field"><label for="rs">Subjects</label><input id="rs" name="subjects" maxlength="120" placeholder="e.g. Maths, Science"></div>
      </div>
      <div class="field"><label for="rsc">School / Institution</label><input id="rsc" name="school" maxlength="120" autocomplete="organization"></div>
      <div class="field"><label for="rp">Password</label><input id="rp" name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password">
        <div class="hint">At least 10 characters with letters and numbers.</div></div>
      <label class="check"><input type="checkbox" name="consent" required> I agree to the <a href="#/legal" target="_blank" rel="noopener">Terms & Privacy Notice</a> and consent to TeachersInn processing my profile data to provide the service.</label>
      <div class="row" data-s="margin-top:1rem"><button class="btn gold" type="submit">Create my account</button></div>
    </form>`;
  forms.login = async (d) => { await api('POST', '/api/auth/login', d); await loadMe(); location.hash = '#/dashboard'; render(); };
  forms.register = async (d) => {
    const result = await api('POST', '/api/auth/register', d);
    if (result.confirmationRequired || result.dataReady === false) {
      location.hash = '#/confirmation-sent'; render(); return;
    }
    await loadMe(); location.hash = '#/profile'; render(); toast('Welcome to TeachersInn! Complete your profile to get the most out of it.');
  };
  on(/^\/register$/, async () => landing('register'), { public: false });

  on(/^\/forgot-password$/, async () => html`<div class="landing"><div class="l-nav"><a class="brand" href="#/"><span class="mark">T</span><span>Teachers<b>Inn</b></span></a></div>
    <div class="content" data-s="max-width:480px;margin:2rem auto"><div class="card"><h1>Reset your password</h1><p class="muted">Enter your account email. We will send reset instructions if an account exists.</p>
    <form data-form="recover"><div class="form-error"></div><div class="field"><label>Email</label><input name="email" type="email" required maxlength="254" autocomplete="email"></div><button class="btn">Send reset link</button></form></div></div></div>`, { public: true });
  forms.recover = async (d) => { const r = await api('POST', '/api/auth/recover', d); toast(r.message); location.hash = '#/'; };

  on(/^\/confirmation-sent$/, async () => html`<div class="landing"><div class="content" data-s="max-width:520px;margin:3rem auto"><div class="card"><h1>Check your email</h1><p>Use the confirmation link sent to your email address. You can sign in after confirmation and account-data activation.</p><a class="btn" href="#/">Back to sign in</a></div></div></div>`, { public: true });

  on(/^\/confirm$/, async (_m, q) => {
    try {
      await api('POST', '/api/auth/verify', { token_hash: q.get('token_hash'), type: 'signup' });
      return html`<div class="landing"><div class="content" data-s="max-width:520px;margin:3rem auto"><div class="card"><h1>Email confirmed</h1><p>Your email is verified. Sign in when your TeachersInn application data is ready.</p><a class="btn" href="#/">Sign in</a></div></div></div>`;
    } catch (e) { return html`<div class="landing"><div class="content" data-s="max-width:520px;margin:3rem auto"><div class="card"><h1>Confirmation failed</h1><p>${e.message}</p><a class="btn" href="#/">Back</a></div></div></div>`; }
  }, { public: true });

  on(/^\/reset-password$/, async (_m, q) => {
    try {
      const verified = await api('POST', '/api/auth/verify', { token_hash: q.get('token_hash'), type: 'recovery' });
      state.csrf = verified.csrf || '';
      return html`<div class="landing"><div class="content" data-s="max-width:480px;margin:3rem auto"><div class="card"><h1>Choose a new password</h1>
        <form data-form="reset-password"><div class="form-error"></div><div class="field"><label>New password</label><input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></div><button class="btn">Update password</button></form></div></div></div>`;
    } catch (e) { return html`<div class="landing"><div class="content" data-s="max-width:520px;margin:3rem auto"><div class="card"><h1>Reset link unavailable</h1><p>${e.message}</p><a class="btn" href="#/forgot-password">Request another link</a></div></div></div>`; }
  }, { public: true });
  forms['reset-password'] = async (d) => { await api('POST', '/api/auth/reset-password', d); state.csrf = ''; toast('Password updated. Please sign in.'); location.hash = '#/'; };

  // ---- public pages
  on(/^\/verify(?:\/([\w-]+))?$/, async (m) => {
    let result = '';
    if (m[1]) {
      try { const r = await api('GET', `/api/certificates/verify/${encodeURIComponent(m[1])}`);
        result = html`<article class="verification-certificate"><div class="verification-status"><span aria-hidden="true">✓</span><div><b>Certificate verified</b><small>Authentic TeachersInn professional development record</small></div></div>
          <div class="certificate-brand"><span class="mark">T</span><span>Teachers<b>Inn</b><small>Professional Development</small></span></div>
          <p class="certificate-label">Certificate of Completion</p><p>This certifies that</p><h2>${r.name}</h2><p>successfully completed</p><h3>${r.title}</h3>
          <div class="verification-facts"><div><span>Completion date</span><b>${fmtDate(r.completed_at)}</b></div><div><span>CPD hours</span><b>${r.cpd_hours}</b></div><div><span>Verification ID</span><b>${r.certificate_code}</b></div><div><span>Issued by</span><b>${r.issuer}</b></div></div>
          <div class="verification-actions no-print"><button class="btn" data-action="print">Print / Save as PDF</button><button class="btn ghost" data-action="copy-verification" data-url="${r.verification_url}">Copy verification link</button></div></article>`;
      } catch (e) { result = html`<div class="card verification-message"><span class="tag red">Certificate unavailable</span><h2>We could not verify this code</h2><p>${e.message}</p><p class="muted">Check every character and try again. Verification does not reveal private account information.</p></div>`; }
    }
    return html`<div class="landing verification-page"><div class="l-nav"><a class="brand" href="#/"><span class="mark">T</span><span>Teachers<b>Inn</b></span></a><span class="tag green">Public verification</span></div>
      <main class="verification-shell"><header class="verification-hero"><span class="eyebrow">Trusted professional credentials</span><h1>Verify a TeachersInn certificate</h1><p>Confirm an educator's course completion and CPD achievement without signing in. Only certificate-safe information is displayed.</p></header>
      <form data-form="verify" class="verification-search"><label for="verification-code">Certificate verification ID</label><div class="row"><input id="verification-code" name="code" placeholder="TIN-XXXXXXXXXX" value="${m[1] || ''}" required maxlength="20" autocomplete="off"><button class="btn">Verify certificate</button></div></form>${result}</main>
      <footer class="footer"><span>© ${new Date().getFullYear()} Poornaphala Media and Infotech Services LLP. All rights reserved.</span></footer></div>`;
  }, { public: true });
  forms.verify = (d) => { location.hash = `#/verify/${encodeURIComponent(d.code.trim())}`; };

  on(/^\/legal$/, async () => html`<div class="landing"><div class="l-nav"><a class="brand" href="#/"><span class="mark">T</span><span>Teachers<b>Inn</b></span></a></div>
    <div class="content" data-s="max-width:780px;margin:0 auto" >
      <h1>Terms of Use & Privacy Notice</h1><p class="muted">Version 1.0 · TeachersInn is owned and operated by Poornaphala Media and Infotech Services LLP.</p>
      <div class="card stack">
        <div><h3>Who can use TeachersInn</h3><p>TeachersInn is a professional platform exclusively for teachers, educators, school leaders, counsellors, special educators and teacher trainees aged 18 and above.</p></div>
        <div><h3>What we collect</h3><p>Your name, email, and the professional details you choose to add (role, school, subjects, city, bio), plus your activity on the platform (courses, workshops, posts, messages, support tickets) and security logs (sign-in events and IP addresses). <b>We do not collect any information about students or children.</b> Please do not post students' names, photos or personal details.</p></div>
        <div><h3>Why we use it</h3><p>To provide the service: your learning record and certificates, workshop registrations, networking, support, and keeping your account secure. We do not sell your data.</p></div>
        <div><h3>Your rights (DPDP Act, 2023)</h3><p>You can access and download your data, correct your profile, hide yourself from the directory, withdraw consent and delete your account at any time from <b>Profile & Privacy</b>. Deletion removes your personal data from our active database.</p></div>
        <div><h3>Security</h3><p>Passwords are stored using salted, memory-hard hashing (scrypt). Sessions use secure, HTTP-only cookies with CSRF protection, rate limiting and automatic lockout after repeated failed sign-ins.</p></div>
        <div><h3>Community conduct</h3><p>Be respectful and professional. Harassment, spam, or sharing others' personal information leads to suspension. Report concerns through Support.</p></div>
        <div><h3>Contact</h3><p>Grievances and privacy requests: raise a ticket in Support (category "Report a Concern").</p></div>
      </div></div>
    <footer class="footer"><span>© ${new Date().getFullYear()} Poornaphala Media and Infotech Services LLP. All rights reserved.</span></footer></div>`, { public: true });

  // ====================================================================== DASHBOARD
  on(/^\/dashboard$/, async () => {
    const d = await api('GET', '/api/dashboard');
    const me = state.me; const s = d.stats;
    const first = me.name.split(' ')[0];
    const cpdPct = Math.min(100, pct(d.cpd.total, d.cpd.goal));
    const activeCourses = Math.max(0, s.enrolled - s.completed);
    const profileFields = ['designation', 'school', 'subjects', 'grades', 'board', 'city', 'bio'];
    const profileComplete = profileFields.filter((field) => String(me[field] || '').trim()).length;
    const profilePct = Math.round(profileComplete / profileFields.length * 100);
    const hasActivity = d.activity.some((item) => item.n > 0);
    const C = 2 * Math.PI * 50;
    const maxA = Math.max(1, ...d.activity.map(a => a.n));
    const hour = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: TZ }));
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return html`
    <section class="hello dashboard-welcome" aria-labelledby="dashboard-greeting">
      <div class="welcome-copy"><span class="eyebrow">Your educator workspace</span><h1 id="dashboard-greeting">${greet}, ${first}.</h1>
        <p class="welcome-summary">${s.workshops ? `You have ${plural(s.workshops, 'registered workshop')} coming up` : 'No workshops booked yet'} · ${plural(activeCourses, 'course')} in progress</p>
        <p class="quote">"${QUOTES[new Date().getDate() % QUOTES.length]}"</p></div>
      <div class="ring" role="progressbar" aria-label="Annual CPD progress" aria-valuemin="0" aria-valuemax="${d.cpd.goal}" aria-valuenow="${d.cpd.total}">
        <svg width="118" height="118" viewBox="0 0 118 118"><circle cx="59" cy="59" r="50" fill="none" class="ring-track" stroke-width="10"/>
          <circle cx="59" cy="59" r="50" fill="none" class="ring-fill" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * cpdPct / 100).toFixed(1)} ${C.toFixed(1)}"/></svg>
        <div class="lbl"><div><b>${d.cpd.total}</b><span>of ${d.cpd.goal} CPD hrs<br>this year</span></div></div>
      </div>
    </section>
    <section class="stats dashboard-stats" aria-label="Professional overview">
      <a class="stat" href="#/learn?cat=mine"><span class="stat-icon" aria-hidden="true">▤</span><div><div class="n">${s.enrolled}</div><div class="l">Courses enrolled</div><div class="sub">${activeCourses} currently active</div></div></a>
      <a class="stat" href="#/certificates"><span class="stat-icon" aria-hidden="true">✓</span><div><div class="n">${s.completed}</div><div class="l">Courses completed</div><div class="sub">View certificates →</div></div></a>
      <a class="stat" href="#/workshops"><span class="stat-icon" aria-hidden="true">◷</span><div><div class="n">${s.workshops}</div><div class="l">Upcoming workshops</div><div class="sub">Browse sessions →</div></div></a>
      <a class="stat" href="#/network"><span class="stat-icon" aria-hidden="true">⚇</span><div><div class="n">${s.connections}</div><div class="l">Connections</div><div class="sub">${s.pendingRequests ? plural(s.pendingRequests, 'new request') : 'Grow your network →'}</div></div></a>
      <a class="stat" href="#/messages"><span class="stat-icon" aria-hidden="true">✉</span><div><div class="n">${s.unreadMessages}</div><div class="l">Unread messages</div><div class="sub">Open inbox →</div></div></a>
    </section>
    <nav class="quick-actions card" aria-label="Dashboard quick actions"><strong>Quick actions</strong><a href="#/learn">Find a course</a><a href="#/workshops">Book a workshop</a><a href="#/planner/new">Plan a lesson</a><a href="#/network">Find educators</a></nav>
    <div class="cols dashboard-grid">
      <div>
        <section class="card dashboard-section"><div class="card-head"><div><span class="section-kicker">Learning</span><h2>Continue learning</h2></div><a href="#/learn?cat=mine">All my courses</a></div>
          ${d.learning.length ? html`<ul class="list">${d.learning.map(c => html`<li>
            <div class="row between learning-title"><div><a class="item-link" href="#/course/${c.id}">${c.title}</a><div class="meta"><span>${c.category}</span><span>${pct(c.done, c.total)}% complete</span></div></div><a class="btn sm" href="#/course/${c.id}">${c.done ? 'Continue' : 'Start course'}</a></div>
            ${progress(pct(c.done, c.total), '', `${c.title} course progress`)}</li>`)}</ul>`
            : empty('✦', 'No courses in progress. Explore the catalogue to begin your next professional-development goal.', html`<a class="btn sm" href="#/learn">Explore courses</a>`)}
        </section>
        <section class="card dashboard-section"><div class="card-head"><div><span class="section-kicker">Last eight weeks</span><h2>Learning activity</h2></div><small>Lessons completed per week</small></div>
          ${hasActivity ? html`<div class="bars" role="img" aria-label="Lessons completed during the last eight weeks">${d.activity.map(a => html`<div class="bar ${a.n ? '' : 'zero'}"><b>${a.n || ''}</b><i data-h="${Math.max(3, a.n / maxA * 85)}"></i><small class="muted">${a.label}</small></div>`)}</div>` : empty('▤', 'No recent lesson activity. Continue a course to build your learning streak.', html`<a class="btn sm ghost" href="#/learn">Browse learning</a>`)}
        </section>
        <section class="card dashboard-section"><div class="card-head"><div><span class="section-kicker">Peer learning</span><h2>From the communities</h2></div><a href="#/community">All communities</a></div>
          ${d.discussions.length ? html`<ul class="list">${d.discussions.map(p => html`<li><a class="item-link" href="#/post/${p.id}">${p.title}</a>
            <div class="meta"><span>${p.author}</span><span>in ${p.community}</span><span>${plural(p.replies, 'reply').replace('replys', 'replies')}</span><span>${ago(p.created_at)}</span></div></li>`)}</ul>` : empty('❝', 'No community discussions yet. Start a useful conversation with fellow educators.', html`<a class="btn sm ghost" href="#/community">Visit communities</a>`)}
        </section>
      </div>
      <div>
        <section class="card dashboard-section"><div class="card-head"><div><span class="section-kicker">Calendar</span><h2>Upcoming workshops</h2></div><a href="#/workshops">View all</a></div>
          ${d.upcoming.length ? html`<ul class="list">${d.upcoming.map(w => html`<li class="row"><div class="datebox"><div class="m">${mon(w.starts_at)}</div><div class="d">${dayNum(w.starts_at)}</div></div>
            <div><a class="item-link" href="#/workshops">${w.title}</a><div class="meta"><span>${fmtTime(w.starts_at)}</span><span>${w.mode}</span>${w.registered ? html`<span class="tag green">Registered</span>` : ''}</div></div></li>`)}</ul>` : empty('◷', 'No upcoming workshops are currently available.', html`<a class="btn sm ghost" href="#/workshops">Browse workshops</a>`)}
        </section>
        <section class="card dashboard-section"><div class="card-head"><div><span class="section-kicker">Annual goal</span><h2>CPD this year</h2></div><a href="#/certificates">Certificates</a></div>
          <div class="row between"><span>Courses</span><b>${d.cpd.courses} hrs</b></div>
          <div class="row between" data-s="margin:.3rem 0 .7rem"><span>Workshops attended</span><b>${d.cpd.workshops} hrs</b></div>
          ${progress(cpdPct, 'gold', 'Annual CPD goal progress')}<p class="hint"><b>${d.cpd.total} of ${d.cpd.goal} hours</b> completed. ${Math.max(0, d.cpd.goal - d.cpd.total)} hours remaining.</p>
        </section>
        <section class="card dashboard-section"><div class="card-head"><div><span class="section-kicker">Professional presence</span><h2>Profile completion</h2></div><b>${profilePct}%</b></div>
          ${progress(profilePct, '', 'Professional profile completion')}<p class="hint">${profileComplete} of ${profileFields.length} professional details completed: role, school, subjects, grades, board, city and bio.</p><a class="btn sm ghost" href="#/profile">Complete profile</a>
        </section>
        <section class="card dashboard-section"><div class="card-head"><div><span class="section-kicker">Professional network</span><h2>Your connections</h2></div><b>${s.connections}</b></div>
          ${s.connections ? html`<p class="muted">Stay connected with ${plural(s.connections, 'educator')} in your professional network.</p><a class="btn sm ghost" href="#/network">View network</a>` : empty('⚇', 'No connections yet. Discover educators by subject, school or city.', html`<a class="btn sm ghost" href="#/network">Find educators</a>`)}
        </section>
        <section class="card dashboard-section"><div class="card-head"><h2>Upcoming lesson plans</h2><a href="#/planner">Planner</a></div>
          ${d.todayPlans.length ? html`<ul class="list">${d.todayPlans.map(p => html`<li><a class="item-link" href="#/planner/${p.id}">${p.title}</a><div class="meta"><span>${fmtDate(p.plan_date)}</span><span>${p.subject}</span><span>${p.grade ? 'Grade ' + p.grade : ''}</span></div></li>`)}</ul>`
            : empty('✎', 'Nothing planned ahead.', html`<a class="btn sm ghost" href="#/planner/new">Plan a lesson</a>`)}
        </section>
        <section class="card dashboard-section"><div class="card-head"><h2>Notifications</h2><a href="#/notifications">View all</a></div>
          ${d.notifications.length ? html`<ul class="list">${d.notifications.slice(0, 4).map(n => html`<li>${n.link ? html`<a href="${n.link}">${n.text}</a>` : n.text}<div class="meta">${ago(n.created_at)}</div></li>`)}</ul>` : empty('🔔', 'You are all caught up.')}
        </section>
      </div>
    </div>`;
  }, { nav: 'dashboard', title: 'Dashboard' });

  on(/^\/notifications$/, async (m, q) => {
    const stateFilter = q.get('state') || 'all', category = q.get('category') || 'all', page = q.get('page') || '1';
    const result = await api('GET', `/api/notifications?state=${encodeURIComponent(stateFilter)}&category=${encodeURIComponent(category)}&page=${encodeURIComponent(page)}`);
    const categories = [['all','All'],['messages','Messages'],['connections','Connections'],['community','Community'],['workshops','Workshops'],['learning','Learning & CPD'],['support','Support'],['system','System']].filter(([key]) => key === 'all' || result.counts[key]);
    const groups = ['Today','Yesterday','Earlier'].map(label => [label, result.items.filter(n => notificationDay(n.created_at) === label)]).filter(([,items]) => items.length);
    const href = (p) => `#/notifications?state=${stateFilter}&category=${category}&page=${p}`;
    return html`${pageHead('Notifications & Activity', 'Stay updated with your professional learning, connections, and community.', result.unread ? html`<button class="btn" data-action="read-all-notifications">Mark all as read</button>` : '')}<section class="notification-stats"><div class="stat"><div class="n">${result.total}</div><div class="l">Matching notifications</div></div><div class="stat"><div class="n">${result.unread}</div><div class="l">Unread notifications</div></div></section><section class="card notification-tools"><nav class="notification-state-tabs" aria-label="Read status filters">${[['all','All'],['unread','Unread'],['read','Read']].map(([key,label]) => html`<a class="chip ${stateFilter===key?'on':''}" href="#/notifications?state=${key}&category=${category}">${label}</a>`)}</nav><label>Category<select data-change="notification-category" aria-label="Notification category">${categories.map(([key,label]) => html`<option value="${key}" ${category===key?'selected':''}>${label}${key!=='all'?` (${result.counts[key]})`:''}</option>`)}</select></label>${stateFilter!=='all'||category!=='all'?html`<a class="btn link" href="#/notifications">Reset filters</a>`:''}</section>${groups.length ? html`<div class="notification-feed">${groups.map(([label,items]) => html`<section><h2>${label}</h2><ul class="notification-list">${items.map(n => notificationItem(n))}</ul></section>`)}</div>` : html`<div class="card">${empty('🔔', stateFilter==='unread' ? 'You have no unread notifications.' : 'No notifications match these filters.', html`<a class="btn sm ghost" href="#/notifications">View all notifications</a>`)}</div>`}${result.pages>1?html`<nav class="pagination" aria-label="Notification pages">${result.page>1?html`<a class="btn ghost sm" href="${href(result.page-1)}">← Newer</a>`:''}<span>Page ${result.page} of ${result.pages}</span>${result.page<result.pages?html`<a class="btn ghost sm" href="${href(result.page+1)}">Older →</a>`:''}</nav>`:''}`;
  }, { nav: '', title: 'Notifications' });
  actions['toggle-notifications'] = async (el) => { const popover = $('#notification-popover'); const opening = popover.hidden; popover.hidden = !opening; el.setAttribute('aria-expanded', String(opening)); if (!opening) return; const result = await api('GET','/api/notifications/preview'); state.cache.notificationPreview = result; const body = $('.notification-preview-body', popover); body.innerHTML = result.items.length ? html`<ul class="notification-list compact">${result.items.map(n=>notificationItem(n,true))}</ul>`.s : empty('🔔','You are all caught up.').s; };
  actions['read-notification'] = async el => { await api('POST',`/api/notifications/${el.dataset.id}/read`); toast('Notification marked as read.'); await refreshBadges(); await render(); };
  actions['open-notification'] = async el => { await api('POST',`/api/notifications/${el.dataset.id}/read`); await refreshBadges(); if (/^#\/[a-z0-9/?=&._-]*$/i.test(el.dataset.link || '')) location.hash = el.dataset.link; else { toast('This notification destination is unavailable.', true); await render(); } };
  actions['read-all-notifications'] = async () => { const result = await api('POST','/api/notifications/read'); toast(result.updated ? `${result.updated} notifications marked as read.` : 'No unread notifications.'); const popover=$('#notification-popover'); if(popover) popover.hidden=true; await refreshBadges(); await render(); };

  // ====================================================================== UPSKILLING
  on(/^\/learn$/, async (m, q) => {
    const courses = await api('GET', '/api/courses');
    const cats = [...new Set(courses.map(c => c.category))];
    const legacyCat = q.get('cat') || '';
    const view = q.get('view') || (legacyCat === 'mine' ? 'enrolled' : 'all');
    const cat = legacyCat === 'mine' ? '' : legacyCat;
    const query = (q.get('q') || '').trim().toLowerCase();
    const byView = (c) => view === 'enrolled' ? c.enrolled_at : view === 'progress' ? c.enrolled_at && !c.completed_at : view === 'completed' ? c.completed_at : true;
    const show = courses.filter(c => byView(c) && (!cat || c.category === cat) && (!query || [c.title, c.category, c.summary].some(v => String(v || '').toLowerCase().includes(query))));
    const suffix = `${view !== 'all' ? `&view=${encodeURIComponent(view)}` : ''}${cat ? `&cat=${encodeURIComponent(cat)}` : ''}`;
    return html`${pageHead('Upskilling', 'Discover practical, self-paced professional learning. Complete every lesson to earn eligible CPD hours and a verified certificate.')}
      <section class="course-tools card" aria-label="Find and filter courses">
        <form class="course-search" data-form="course-search" role="search"><input type="hidden" name="view" value="${view}"><input type="hidden" name="cat" value="${cat}"><label class="sr-only" for="course-q">Search courses</label><input id="course-q" name="q" value="${q.get('q') || ''}" placeholder="Search by title, category or description"><button class="btn">Search</button>${query ? html`<a class="btn ghost" href="#/learn?${suffix.replace(/^&/, '')}">Clear</a>` : ''}</form>
        <div class="course-filter-group"><span class="filter-label">Learning status</span><div class="chips">${[['all', 'All courses'], ['enrolled', 'Enrolled'], ['progress', 'In progress'], ['completed', 'Completed']].map(([key, label]) => html`<a class="chip ${view === key ? 'on' : ''}" href="#/learn?view=${key}${cat ? `&cat=${encodeURIComponent(cat)}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}">${label}</a>`)}</div></div>
        <div class="course-filter-group"><span class="filter-label">Category</span><div class="chips"><a class="chip ${!cat ? 'on' : ''}" href="#/learn?view=${view}${query ? `&q=${encodeURIComponent(query)}` : ''}">All categories</a>${cats.map(c => html`<a class="chip ${cat === c ? 'on' : ''}" href="#/learn?view=${view}&cat=${encodeURIComponent(c)}${query ? `&q=${encodeURIComponent(query)}` : ''}">${c}</a>`)}</div></div>
      </section>
      <div class="course-results-head"><p><b>${show.length}</b> ${show.length === 1 ? 'course' : 'courses'} found</p>${view !== 'all' || cat || query ? html`<a href="#/learn">Reset all filters</a>` : ''}</div>
      ${show.length ? html`<div class="cards course-catalogue">${show.map(c => { const coursePct = pct(c.done, c.lessons); return html`<article class="card course-card">
        <a class="cover cv${c.id % 8}" href="#/course/${c.id}" aria-label="View ${c.title}"><span>${c.title.split(' ')[0]}</span></a>
        <div class="row wrap"><span class="tag">${c.category}</span><span class="tag blue">${c.level}</span><span class="tag gold">${c.cpd_hours} CPD hrs</span>${c.completed_at ? html`<span class="tag green">✓ Completed</span>` : c.enrolled_at ? html`<span class="tag green">Enrolled</span>` : ''}</div>
        <h2><a href="#/course/${c.id}">${c.title}</a></h2><p class="muted grow">${c.summary}</p>
        <div class="meta course-meta"><span>${c.instructor}</span><span>${plural(c.lessons, 'lesson')} · ${c.minutes} min</span><span>${plural(c.learners, 'learner')}</span></div>
        ${c.enrolled_at ? html`${progress(coursePct, '', `${c.title} progress`)}<div class="row between course-action"><small>${c.completed_at ? 'Course complete' : `${coursePct}% complete`}</small><a class="btn sm" href="${c.completed_at ? `#/certificate/${c.id}` : `#/course/${c.id}`}">${c.completed_at ? 'View certificate' : 'Continue learning'}</a></div>`
          : html`<div class="row between course-action"><a href="#/course/${c.id}">Preview course</a><button class="btn sm" data-action="enroll" data-id="${c.id}">Enroll free</button></div>`}
      </article>`; })}</div>` : html`<div class="card">${empty('⌕', query ? `No courses match “${q.get('q')}”. Try a broader search or reset the filters.` : 'No courses match these filters.', html`<a class="btn sm ghost" href="#/learn">View all courses</a>`)}</div>`}`;
  }, { nav: 'learn', title: 'Upskilling' });
  forms['course-search'] = (d) => {
    const params = new URLSearchParams();
    if (d.view && d.view !== 'all') params.set('view', d.view);
    if (d.cat) params.set('cat', d.cat);
    if (d.q.trim()) params.set('q', d.q.trim());
    location.hash = `#/learn${params.size ? '?' + params : ''}`;
  };
  actions.enroll = async (el) => {
    await api('POST', `/api/courses/${el.dataset.id}/enroll`);
    toast('Enrolled! Let\'s begin.');
    const target = `#/course/${el.dataset.id}`;
    if (location.hash === target) await render();
    else location.hash = target;
  };

  on(/^\/course\/(\d+)(?:\/(\d+))?$/, async (m) => {
    const { course, enrollment, lessons } = await api('GET', `/api/courses/${m[1]}`);
    const curId = Number(m[2]) || (lessons.find(l => !l.done && !l.locked) || lessons[0]).id;
    const cur = lessons.find(l => l.id === curId) || lessons[0];
    const idx = lessons.indexOf(cur);
    const done = lessons.filter(l => l.done).length;
    return html`<a href="#/learn" class="back-link">← All courses</a>
      <div class="course-overview">${pageHead(course.title, html`${course.category} · ${course.level} · ${course.cpd_hours} CPD hours · ${plural(lessons.length, 'lesson')}`,
        enrollment ? (enrollment.completed_at ? html`<a class="btn gold" href="#/certificate/${course.id}">View certificate</a>` : html`<span class="tag green">${done}/${lessons.length} lessons done</span>`)
          : html`<button class="btn" data-action="enroll" data-id="${course.id}">Enroll free</button>`)}</div>
      <div class="cols course-learning-layout">
        <article class="card lesson-reader">
          <div class="row wrap"><span class="tag">Lesson ${cur.position} of ${lessons.length} · ${cur.minutes} min</span>${!enrollment && !cur.locked ? html`<span class="tag blue">Preview lesson</span>` : ''}${cur.done ? html`<span class="tag green">✓ Completed</span>` : ''}</div>
          <h2 data-s="margin-top:.6rem">${cur.title}</h2>
          ${cur.locked ? empty('🔒', 'Enroll in this course to unlock all lessons.', html`<button class="btn" data-action="enroll" data-id="${course.id}">Enroll free</button>`)
            : html`<div class="lesson-body pre">${cur.body}</div>
            <nav class="row between lesson-controls" aria-label="Lesson navigation">
              ${idx > 0 ? html`<a class="btn ghost" href="#/course/${course.id}/${lessons[idx - 1].id}">← Previous</a>` : html`<span></span>`}
              ${enrollment ? (cur.done ? (idx < lessons.length - 1 ? html`<a class="btn" href="#/course/${course.id}/${lessons[idx + 1].id}">Next lesson →</a>` : html`<span class="tag green">✓ Done</span>`)
                : html`<button class="btn" data-action="complete-lesson" data-id="${cur.id}" data-course="${course.id}" data-next="${idx < lessons.length - 1 ? lessons[idx + 1].id : ''}">Mark complete${idx < lessons.length - 1 ? ' & continue' : ''}</button>`) : ''}
            </nav>`}
        </article>
        <div class="course-sidebar">
          <section class="card"><span class="section-kicker">Course overview</span><h2>About this course</h2><p class="muted">${course.summary}</p>${enrollment ? html`${progress(pct(done, lessons.length), '', `${course.title} course progress`)}<p class="hint">${done} of ${lessons.length} lessons completed.</p>` : html`<p class="hint">Preview the first lesson, then enroll to unlock the full curriculum.</p>`}</section>
          <section class="card"><div class="card-head"><h2>Curriculum</h2><small>${plural(lessons.length, 'lesson')}</small></div><ol class="list lesson-nav">${lessons.map(l => html`<li><span class="tick ${l.done ? 'done' : ''}" aria-hidden="true">✓</span>
            <div class="lesson-link"><small>Lesson ${l.position}</small>${l.locked ? html`<span class="muted">🔒 ${l.title}</span>` : html`<a href="#/course/${course.id}/${l.id}" class="${l.id === cur.id ? 'cur' : ''}" ${l.id === cur.id ? raw('aria-current="page"') : ''}>${l.title}</a>`}</div><small>${l.minutes}m</small></li>`)}</ol></section>
        </div>
      </div>`;
  }, { nav: 'learn', title: 'Course' });
  actions['complete-lesson'] = async (el) => {
    const r = await api('POST', `/api/lessons/${el.dataset.id}/complete`);
    if (r.certificate) { toast('🎉 Course complete! Your certificate is ready.'); location.hash = `#/certificate/${el.dataset.course}`; return; }
    toast('Lesson completed. Your progress has been saved.');
    location.hash = el.dataset.next ? `#/course/${el.dataset.course}/${el.dataset.next}` : `#/course/${el.dataset.course}`;
    if (!el.dataset.next) render();
  };

  on(/^\/certificates$/, async () => {
    const list = await api('GET', '/api/certificates');
    const total = list.reduce((s, c) => s + c.cpd_hours, 0);
    return html`${pageHead('Certificates', `Your verified achievements — ${total} CPD hours earned through courses.`)}
      ${list.length ? html`<div class="cards">${list.map(c => html`<div class="card"><span class="tag gold">✪ ${c.cpd_hours} CPD hrs</span><h3 data-s="margin-top:.6rem">${c.title}</h3>
        <div class="meta"><span>Completed ${fmtDate(c.completed_at)}</span><span>${c.certificate_code}</span></div><div class="row"><a class="btn sm" href="#/certificate/${c.course_id}">Preview & print</a><a class="btn ghost sm" href="${c.verification_url}" target="_blank" rel="noopener">Public verification</a><button class="btn link sm" data-action="copy-verification" data-url="${c.verification_url}">Copy link</button></div></div>`)}</div>`
        : html`<div class="card">${empty('✪', 'Complete a course to earn your first certificate.', html`<a class="btn sm" href="#/learn">Browse courses</a>`)}</div>`}`;
  }, { nav: 'certificates', title: 'Certificates' });

  on(/^\/certificate\/(\d+)$/, async (m) => {
    const list = await api('GET', '/api/certificates');
    const c = list.find(x => String(x.course_id) === m[1]);
    if (!c) return html`<div class="card">${empty('✪', 'Certificate not available yet — finish all lessons first.')}</div>`;
    return html`<div class="row between no-print" data-s="margin-bottom:1rem"><a href="#/certificates" class="muted">← Certificates</a><button class="btn" data-action="print">Print / Save as PDF</button></div>
      <div class="cert">
        <div class="org">TeachersInn · Professional Development</div>
        <h1>Certificate of Completion</h1><p>This is to certify that</p>
        <div class="name">${state.me.name}</div>
        <p>has successfully completed the course</p><div class="course">${c.title}</div>
        <p data-s="margin-top:.6rem">earning <b>${c.cpd_hours} hours</b> of Continuous Professional Development.</p>
        <div class="foot"><div>Completed: <b>${fmtDate(c.completed_at)}</b><br>Instructor: ${c.instructor}</div><div class="seal">VERIFIED</div>
          <div>Certificate ID: <b>${c.certificate_code}</b><br><a href="${c.verification_url}" target="_blank" rel="noopener">Verify online</a></div></div>
        <div class="verification-actions no-print"><button class="btn ghost" data-action="copy-verification" data-url="${c.verification_url}">Copy verification link</button></div>
        <p data-s="font-size:.72rem;color:#7a6c55;margin:1.6rem 0 0;font-family:var(--sans)">© ${new Date().getFullYear()} Poornaphala Media and Infotech Services LLP</p>
      </div>`;
  }, { nav: 'certificates', title: 'Certificate' });
  actions.print = () => window.print();
  actions['copy-verification'] = async (el) => { await navigator.clipboard.writeText(el.dataset.url); toast('Verification link copied.'); };

  // ====================================================================== WORKSHOPS
  on(/^\/workshops$/, async (m, q) => {
    const workshops = await api('GET', '/api/workshops');
    const now = new Date();
    const view = q.get('v') || 'upcoming';
    const mode = q.get('mode') || 'all';
    const query = (q.get('q') || '').trim().toLowerCase();
    const byView = (w) => view === 'all' ? true : view === 'mine' ? w.registered : view === 'past' ? toDate(w.starts_at) < now : view === 'attended' ? w.registered && w.attended : view === 'unverified' ? w.registered && !w.attended : toDate(w.starts_at) >= now;
    const byMode = (w) => mode === 'online' ? w.mode === 'Online' : mode === 'inperson' ? w.mode === 'In-person' : true;
    const list = workshops.filter(w => byView(w) && byMode(w) && (!query || [w.title, w.description, w.category, w.facilitator].some(value => String(value || '').toLowerCase().includes(query))));
    if (view === 'past') list.reverse();
    const admin = state.me.role === 'admin';
    const filterQuery = `${mode !== 'all' ? `&mode=${mode}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
    return html`${pageHead('Workshops', 'Discover live and in-person professional learning. CPD is awarded only after attendance is verified.', admin ? html`<button class="btn" data-action="new-workshop">+ New workshop</button>` : '')}
      <section class="workshop-tools card" aria-label="Find and filter workshops">
        <form class="workshop-search" data-form="workshop-search" role="search"><input type="hidden" name="view" value="${view}"><input type="hidden" name="mode" value="${mode}"><label class="sr-only" for="workshop-q">Search workshops</label><input id="workshop-q" name="q" value="${q.get('q') || ''}" placeholder="Search by title, topic, description or facilitator"><button class="btn">Search</button>${query ? html`<a class="btn ghost" href="#/workshops?v=${view}${mode !== 'all' ? `&mode=${mode}` : ''}">Clear</a>` : ''}</form>
        <div class="workshop-filter-row"><span class="filter-label">Schedule</span><div class="chips">${[['all', 'All'], ['upcoming', 'Upcoming'], ['past', 'Past'], ['mine', 'My registrations'], ['attended', 'Attended'], ['unverified', 'Not verified']].map(([key, label]) => html`<a class="chip ${view === key ? 'on' : ''}" href="#/workshops?v=${key}${filterQuery}">${label}</a>`)}</div></div>
        <div class="workshop-filter-row"><span class="filter-label">Delivery</span><div class="chips">${[['all', 'All modes'], ['online', 'Online'], ['inperson', 'In person']].map(([key, label]) => html`<a class="chip ${mode === key ? 'on' : ''}" href="#/workshops?v=${view}&mode=${key}${query ? `&q=${encodeURIComponent(query)}` : ''}">${label}</a>`)}</div></div>
      </section>
      <div class="workshop-results-head"><p><b>${list.length}</b> ${list.length === 1 ? 'workshop' : 'workshops'} found</p>${view !== 'upcoming' || mode !== 'all' || query ? html`<a href="#/workshops">Reset all filters</a>` : ''}</div>
      ${list.length ? html`<div class="workshop-listing">${list.map(w => {
        const left = w.capacity - w.registered_count; const past = toDate(w.starts_at) < now;
        return html`<article class="card workshop-card">
          <div class="datebox"><div class="m">${mon(w.starts_at)}</div><div class="d">${dayNum(w.starts_at)}</div></div>
          <div class="workshop-card-body"><div class="row wrap"><span class="tag">${w.category}</span><span class="tag blue">${w.mode}</span><span class="tag gold">${w.cpd_hours} CPD hrs</span>${w.attendance_status === 'attended' || w.attended ? html`<span class="tag green">✓ Attendance verified</span>` : w.attendance_status === 'absent' ? html`<span class="tag red">Absent</span>` : w.registered ? html`<span class="tag ${past ? 'gold' : 'green'}">${past ? 'Attendance pending' : '✓ Registered'}</span>` : ''}</div>
            <h2><a href="#/workshop/${w.id}">${w.title}</a></h2><p class="muted">${w.description}</p>
            <div class="meta workshop-meta"><span>👤 ${w.facilitator}</span><span>◷ ${fmtDay(w.starts_at)}, ${fmtTime(w.starts_at)} · ${w.duration_min} min</span><span>⌖ ${w.location}</span><span>${past ? 'Workshop ended' : left > 0 ? `${left} of ${w.capacity} seats available` : 'Workshop full'}</span></div>
            ${progress(pct(w.registered_count, w.capacity), 'gold', `${w.title} registration capacity`)}
          </div>
          <div class="workshop-actions"><a class="btn ghost sm" href="#/workshop/${w.id}">View details</a>${past ? '' : w.registered
            ? html`<a class="btn ghost sm" href="/api/workshops/${w.id}/ics">Add to calendar</a><button class="btn link" data-action="cancel-workshop" data-id="${w.id}">Cancel</button>`
            : html`<button class="btn sm" data-action="register-workshop" data-id="${w.id}" ${left <= 0 ? 'disabled' : ''}>${left > 0 ? 'Register' : 'Full'}</button>`}
            ${admin ? html`<button class="btn link" data-action="delete-workshop" data-id="${w.id}">Delete</button>` : ''}</div>
        </article>`; })}</div>` : html`<div class="card">${empty('◷', query ? `No workshops match “${q.get('q')}”. Try a broader search.` : view === 'mine' ? 'You have not registered for any workshops yet.' : view === 'attended' ? 'No verified attendance yet. Attendance must be confirmed before workshop CPD is awarded.' : view === 'unverified' ? 'No registrations are waiting for attendance verification.' : view === 'upcoming' ? 'No upcoming workshops are currently available.' : 'No workshops match these filters.', html`<a class="btn sm ghost" href="#/workshops?v=all">View all workshops</a>`)}</div>`}`;
  }, { nav: 'workshops', title: 'Workshops' });
  forms['workshop-search'] = (d) => {
    const params = new URLSearchParams();
    params.set('v', d.view || 'upcoming');
    if (d.mode && d.mode !== 'all') params.set('mode', d.mode);
    if (d.q.trim()) params.set('q', d.q.trim());
    location.hash = `#/workshops?${params}`;
  };

  on(/^\/workshop\/(\d+)$/, async (m) => {
    const workshops = await api('GET', '/api/workshops');
    const w = workshops.find(item => String(item.id) === m[1]);
    if (!w) return html`<div class="card">${empty('◷', 'Workshop not found.', html`<a class="btn sm ghost" href="#/workshops">Back to workshops</a>`)}</div>`;
    const past = toDate(w.starts_at) < new Date();
    const left = w.capacity - w.registered_count;
    return html`<a href="#/workshops" class="back-link">← All workshops</a>
      <section class="card workshop-detail"><div class="workshop-detail-date"><div class="datebox"><div class="m">${mon(w.starts_at)}</div><div class="d">${dayNum(w.starts_at)}</div></div><span>${fmtDay(w.starts_at)} at ${fmtTime(w.starts_at)}</span></div>
        <div class="row wrap"><span class="tag">${w.category}</span><span class="tag blue">${w.mode}</span><span class="tag gold">${w.cpd_hours} CPD hrs after verified attendance</span>${w.attendance_status === 'attended' || w.attended ? html`<span class="tag green">✓ Attendance verified</span>` : w.attendance_status === 'absent' ? html`<span class="tag red">Absent</span>` : w.registered ? html`<span class="tag ${past ? 'gold' : 'green'}">${past ? 'Attendance pending' : '✓ Registered'}</span>` : ''}</div>
        <h1>${w.title}</h1><p class="workshop-lede">${w.description}</p>
        <dl class="workshop-facts"><div><dt>Facilitator</dt><dd>${w.facilitator}</dd></div><div><dt>Schedule</dt><dd>${fmtDay(w.starts_at)}, ${fmtTime(w.starts_at)} · ${w.duration_min} minutes</dd></div><div><dt>Delivery</dt><dd>${w.mode} · ${w.location}</dd></div><div><dt>Availability</dt><dd>${past ? 'Workshop ended' : left > 0 ? `${left} of ${w.capacity} seats available` : 'Workshop full'}</dd></div></dl>
        <div class="workshop-detail-actions">${past && w.registered ? (w.attendance_status === 'attended' || w.attended ? html`<p class="notice success">Your attendance has been verified. ${w.cpd_hours} CPD hours are included in your dashboard.</p>` : w.attendance_status === 'absent' ? html`<p class="notice danger">Attendance was not verified for this workshop.</p>` : html`<p class="notice warm">Attendance verification is pending. CPD hours are not awarded until verification.</p>`) : past ? '' : w.registered ? html`<a class="btn ghost" href="/api/workshops/${w.id}/ics">Add to calendar</a><button class="btn link" data-action="cancel-workshop" data-id="${w.id}">Cancel registration</button>` : html`<button class="btn" data-action="register-workshop" data-id="${w.id}" ${left <= 0 ? 'disabled' : ''}>${left > 0 ? 'Register for workshop' : 'Workshop full'}</button>`}</div>
      </section>`;
  }, { nav: 'workshops', title: 'Workshop details' });
  actions['register-workshop'] = async (el) => { await api('POST', `/api/workshops/${el.dataset.id}/register`); toast('You\'re registered! Add it to your calendar.'); render(); };
  actions['cancel-workshop'] = async (el) => { if (!confirm('Cancel your registration?')) return; await api('POST', `/api/workshops/${el.dataset.id}/cancel`); toast('Registration cancelled.'); render(); };
  actions['delete-workshop'] = async (el) => { if (!confirm('Delete this workshop? Registered educators will be notified.')) return; await api('DELETE', `/api/admin/workshops/${el.dataset.id}`); toast('Workshop deleted.'); render(); };
  actions['new-workshop'] = () => openModal('New workshop', html`<form data-form="new-workshop"><div class="form-error"></div>
    <div class="field"><label>Title</label><input name="title" required minlength="5" maxlength="150"></div>
    <div class="field"><label>Description</label><textarea name="description" required minlength="20" maxlength="3000"></textarea></div>
    <div class="grid-2"><div class="field"><label>Facilitator</label><input name="facilitator" required maxlength="80"></div>
      <div class="field"><label>Category</label><input name="category" required maxlength="60" value="Pedagogy"></div>
      <div class="field"><label>Mode</label><select name="mode"><option>Online</option><option>In-person</option><option>Hybrid</option></select></div>
      <div class="field"><label>Location / link</label><input name="location" maxlength="150" value="Live on TeachersInn"></div>
      <div class="field"><label>Starts at (your local time)</label><input name="starts_at" type="datetime-local" required></div>
      <div class="field"><label>Duration (min)</label><input name="duration_min" type="number" min="15" max="600" value="90" required></div>
      <div class="field"><label>Capacity</label><input name="capacity" type="number" min="1" max="10000" value="50" required></div>
      <div class="field"><label>CPD hours</label><input name="cpd_hours" type="number" min="0" max="40" value="2" required></div></div>
    <button class="btn">Publish workshop</button></form>`);
  forms['new-workshop'] = async (d) => { d.starts_at = new Date(d.starts_at).toISOString(); await api('POST', '/api/admin/workshops', d); closeModal(); toast('Workshop published.'); render(); };

  // ====================================================================== NETWORK
  const personCard = (p, actionsHtml) => html`<article class="card educator-card"><div class="educator-card-head"><span class="avatar lg" aria-hidden="true">${initials(p.name)}</span><div class="who"><h2><a href="#/network/profile/${p.id}">${p.name}</a></h2><p>${p.designation || 'Educator'}</p>${p.school ? html`<small>${p.school}</small>` : ''}</div></div>
    <div class="educator-details">${p.subjects ? html`<span>📘 ${p.subjects}</span>` : ''}${p.city ? html`<span>⌖ ${[p.city, p.state].filter(Boolean).join(', ')}</span>` : ''}${p.open_to_mentor ? html`<span class="tag gold">Open to mentoring</span>` : ''}</div>
    ${p.bio ? html`<p class="educator-bio">${p.bio}</p>` : html`<p class="educator-bio muted">Professional educator on TeachersInn.</p>`}<div class="educator-actions"><a class="btn ghost sm" href="#/network/profile/${p.id}">View profile</a>${actionsHtml}</div></article>`;

  const connectionAction = (p) => {
    const status = p.connection_status ?? p.status; const direction = p.direction;
    if (status === 'accepted') return html`<a class="btn sm" href="#/messages/${p.id}">Message</a><button class="btn link sm" data-action="remove-connection" data-id="${p.connection_id}">Remove</button>`;
    if (status === 'pending' && direction === 'in') return html`<button class="btn sm" data-action="respond-conn" data-id="${p.connection_id}" data-v="accept">Accept</button><button class="btn ghost sm" data-action="respond-conn" data-id="${p.connection_id}" data-v="decline">Decline</button>`;
    if (status === 'pending' && direction === 'out') return html`<span class="tag gold">Request sent</span><button class="btn link sm" data-action="cancel-connection" data-id="${p.connection_id}">Cancel</button>`;
    return html`<button class="btn sm" data-action="connect" data-id="${p.id}">+ Connect</button>`;
  };

  on(/^\/network(?:\/(requests|connections))?$/, async (m, q) => {
    const tab = m[1] || '';
    const head = pageHead('Educator Network', 'Discover teachers, build professional connections, and collaborate securely.');
    const t = tabs('network', [['', 'Discover educators'], ['connections', 'My connections'], ['requests', 'Requests']], tab);
    if (tab) {
      const c = await api('GET', '/api/connections');
      if (tab === 'connections') return html`${head}${t}<div class="network-section-head"><div><h2>My Connections</h2><p>${plural(c.accepted.length, 'professional connection')}</p></div></div>${c.accepted.length ? html`<div class="educator-grid">${c.accepted.map(p => personCard(p, connectionAction(p)))}</div>` : html`<div class="card">${empty('⚇', 'No connections yet. Discover educators and start building your network.', html`<a class="btn sm" href="#/network">Discover educators</a>`)}</div>`}`;
      return html`${head}${t}<section class="network-request-section"><div class="network-section-head"><div><h2>Received Requests</h2><p>${plural(c.incoming.length, 'request')} awaiting your response</p></div></div>${c.incoming.length ? html`<div class="educator-grid">${c.incoming.map(p => personCard(p, connectionAction({ ...p, direction: 'in' })))}</div>` : html`<div class="card">${empty('✉', 'No incoming connection requests.')}</div>`}</section>
        <section class="network-request-section"><div class="network-section-head"><div><h2>Sent Requests</h2><p>${plural(c.outgoing.length, 'request')} pending</p></div></div>${c.outgoing.length ? html`<div class="educator-grid">${c.outgoing.map(p => personCard(p, connectionAction({ ...p, direction: 'out' })))}</div>` : html`<div class="card">${empty('↗', 'No outgoing connection requests.')}</div>`}</section>`;
    }
    const qv = q.get('q') || ''; const view = ['connections', 'sent', 'received'].includes(q.get('view')) ? q.get('view') : 'all'; const subject = q.get('subject') || ''; const city = q.get('city') || '';
    const params = new URLSearchParams({ q: qv, view, subject, city });
    const people = await api('GET', `/api/educators?${params}`);
    return html`${head}${t}<section class="card network-tools" aria-label="Search and filter educators"><form data-form="net-search" class="network-search"><input type="hidden" name="view" value="${view}"><label class="sr-only" for="network-q">Search educators</label><input id="network-q" name="q" value="${qv}" placeholder="Search name, subject, school, city or designation"><input name="subject" value="${subject}" placeholder="Subject"><input name="city" value="${city}" placeholder="City"><button class="btn">Search</button></form>
      <div class="chips network-chips">${[['all', 'All educators'], ['connections', 'My connections'], ['sent', 'Requests sent'], ['received', 'Requests received']].map(([key, label]) => html`<a class="chip ${view === key ? 'on' : ''}" href="#/network?view=${key}${qv ? `&q=${encodeURIComponent(qv)}` : ''}${subject ? `&subject=${encodeURIComponent(subject)}` : ''}${city ? `&city=${encodeURIComponent(city)}` : ''}">${label}</a>`)}</div></section>
      <div class="network-results"><p><b>${people.length}</b> ${people.length === 1 ? 'educator' : 'educators'} found</p>${qv || subject || city || view !== 'all' ? html`<a href="#/network">Reset filters</a>` : ''}</div>
      ${people.length ? html`<div class="educator-grid">${people.map(p => personCard(p, connectionAction(p)))}</div>` : html`<div class="card">${empty('⚇', 'No educators match these filters. Try a broader search.', html`<a class="btn sm ghost" href="#/network">Clear filters</a>`)}</div>`}`;
  }, { nav: 'network', title: 'Network' });
  forms['net-search'] = (d) => { const p = new URLSearchParams(); if (d.q.trim()) p.set('q', d.q.trim()); if (d.subject.trim()) p.set('subject', d.subject.trim()); if (d.city.trim()) p.set('city', d.city.trim()); if (d.view !== 'all') p.set('view', d.view); location.hash = `#/network${p.toString() ? `?${p}` : ''}`; };
  actions.connect = async (el) => { const r = await api('POST', '/api/connections', { user_id: Number(el.dataset.id) }); toast(r.status === 'accepted' ? 'You are now connected!' : 'Connection request sent.'); render(); };
  actions['respond-conn'] = async (el) => { await api('POST', `/api/connections/${el.dataset.id}/respond`, { action: el.dataset.v }); toast(el.dataset.v === 'accept' ? 'Connected!' : 'Request declined.'); render(); };
  actions['cancel-connection'] = async (el) => { if (!confirm('Cancel this connection request?')) return; await api('DELETE', `/api/connections/${el.dataset.id}`); toast('Connection request cancelled.'); render(); };
  actions['remove-connection'] = async (el) => { if (!confirm('Remove this professional connection? Your message history will no longer be accessible unless you reconnect.')) return; await api('DELETE', `/api/connections/${el.dataset.id}`); toast('Connection removed.'); render(); };

  on(/^\/network\/profile\/(\d+)$/, async (m) => {
    const p = await api('GET', `/api/educators/${m[1]}`);
    return html`<a class="back-link" href="#/network">← Educator directory</a><section class="card educator-profile"><header class="educator-profile-head"><span class="avatar xl" aria-hidden="true">${initials(p.name)}</span><div><span class="eyebrow">Professional educator</span><h1>${p.name}</h1><p>${[p.designation, p.school, p.city].filter(Boolean).join(' · ')}</p><div class="educator-actions">${connectionAction({ ...p, connection_status: p.status })}</div></div></header>
      <div class="educator-profile-grid"><div><h2>Professional information</h2><dl class="profile-facts">${p.subjects ? html`<div><dt>Subjects</dt><dd>${p.subjects}</dd></div>` : ''}${p.grades ? html`<div><dt>Grades</dt><dd>${p.grades}</dd></div>` : ''}${p.board ? html`<div><dt>Education board</dt><dd>${p.board}</dd></div>` : ''}${p.experience_years ? html`<div><dt>Experience</dt><dd>${plural(p.experience_years, 'year')}</dd></div>` : ''}</dl></div><div><h2>About</h2><p class="educator-profile-bio">${p.bio || 'This educator has not added a professional biography yet.'}</p>${p.open_to_mentor ? html`<span class="tag gold">Open to mentoring</span>` : ''}</div></div></section>`;
  }, { nav: 'network', title: 'Educator profile' });

  // ---- messages
  on(/^\/messages(?:\/(\d+))?$/, async (m, q) => {
    const convos = await api('GET', '/api/messages');
    const search = (q.get('q') || '').toLowerCase(); const shown = convos.filter(c => !search || `${c.name} ${c.last_body}`.toLowerCase().includes(search));
    let threadHtml = html`<section class="message-empty">${empty('✉', convos.length ? 'Select a conversation to view your messages.' : 'No conversations yet. Connect with educators to start messaging.', html`<a class="btn sm" href="#/network/connections">View connections</a>`)}</section>`;
    if (m[1]) {
      const t = await api('GET', `/api/messages/${m[1]}`);
      threadHtml = html`<section class="message-thread-panel"><header class="message-thread-head"><a class="message-back" href="#/messages" aria-label="Back to conversations">←</a><a class="person" href="#/network/profile/${t.person.id}"><span class="avatar">${initials(t.person.name)}</span><span class="who"><b>${t.person.name}</b><small>${[t.person.designation, t.person.school].filter(Boolean).join(' · ')}</small></span></a></header>
        <div class="thread" id="thread" aria-live="polite">${t.messages.length ? t.messages.map(x => html`<div class="bubble ${x.sender_id === state.me.id ? 'me' : ''}"><span>${x.body}</span><time>${fmtDT(x.created_at)}</time></div>`) : html`<div class="thread-empty"><p>No messages yet.</p><small>Send a professional introduction to begin the conversation.</small></div>`}</div>
        <form class="composer" data-form="send-msg" data-to="${t.person.id}"><div class="form-error"></div><label class="sr-only" for="message-body">Message ${t.person.name}</label><textarea id="message-body" name="body" required maxlength="2000" rows="1" placeholder="Write a message…" data-message-input></textarea><button class="btn" type="submit" disabled>Send</button></form></section>`;
    }
    return html`${pageHead('Messages', 'Private conversations with your connections and mentors.')}
      <div class="message-workspace ${m[1] ? 'has-thread' : ''}"><aside class="conversation-panel"><form data-form="conversation-search" class="conversation-search" role="search"><label class="sr-only" for="conversation-q">Search conversations</label><input id="conversation-q" name="q" value="${q.get('q') || ''}" placeholder="Search conversations"><button class="btn ghost sm">Search</button></form>
        <div class="conversation-head"><h2>Conversations</h2><span>${convos.length}</span></div>${shown.length ? html`<nav class="conversation-list" aria-label="Recent conversations">${shown.map(c => html`<a class="conversation-item ${String(c.id) === m[1] ? 'active' : ''}" href="#/messages/${c.id}"><span class="avatar">${initials(c.name)}</span><span class="conversation-copy"><span><b>${c.name}</b><time>${ago(c.last_at)}</time></span><small>${c.last_body.slice(0, 72)}</small></span>${c.unread ? html`<span class="unread-count" aria-label="${plural(c.unread, 'unread message')}">${c.unread}</span>` : ''}</a>`)}</nav>` : html`<div class="conversation-empty">${empty('✉', search ? 'No conversations match your search.' : 'No conversations yet.')}</div>`}</aside>${threadHtml}</div>`;
  }, { nav: 'messages', title: 'Messages', after: () => { const t = $('#thread'); if (t) t.scrollTop = t.scrollHeight; } });
  forms['conversation-search'] = (d) => { location.hash = `#/messages${d.q.trim() ? `?q=${encodeURIComponent(d.q.trim())}` : ''}`; };
  forms['send-msg'] = async (d, f) => { const body = d.body.trim(); if (!body) return; await api('POST', `/api/messages/${f.dataset.to}`, { body }); await render(); };

  // ---- communities
  const discussionCard = (p) => {
    const canDelete = p.user_id === state.me.id || state.me.role === 'admin';
    return html`<article class="card discussion-card"><header><span class="avatar" aria-hidden="true">${initials(p.author)}</span><div><a class="discussion-author" href="#/network/profile/${p.user_id}">${p.author}</a><small>${p.designation || 'Educator'} · ${ago(p.created_at)}</small></div><span class="tag">${p.icon || '✎'} ${p.community}</span></header><h2><a href="#/post/${p.id}">${p.title}</a></h2><p class="discussion-preview">${p.body.slice(0, 260)}${p.body.length > 260 ? '…' : ''}</p><footer><div class="meta"><span>${plural(p.replies, 'reply').replace('replys', 'replies')}</span><span>Active ${ago(p.last_activity || p.created_at)}</span></div><div class="discussion-actions"><a class="btn ghost sm" href="#/post/${p.id}">Open discussion</a><a class="btn link sm" href="#/post/${p.id}#reply">Reply</a>${canDelete ? html`<button class="btn link sm" data-action="delete-post" data-id="${p.id}" data-c="${p.community_id}">Delete</button>` : ''}</div></footer></article>`;
  };

  on(/^\/community$/, async (m, q) => {
    const [communities, discussions] = await Promise.all([api('GET', '/api/communities'), api('GET', `/api/discussions?${new URLSearchParams({ q: q.get('q') || '', community: q.get('community') || '', mine: q.get('mine') === '1' ? '1' : '', sort: q.get('sort') || 'active' })}`)]);
    const qv = q.get('q') || ''; const community = q.get('community') || ''; const mine = q.get('mine') === '1'; const sort = ['recent', 'discussed'].includes(q.get('sort')) ? q.get('sort') : 'active';
    return html`${pageHead('Educator Community', 'Share practical teaching knowledge, ask thoughtful questions, and learn with educators across India.', html`<button class="btn" data-action="new-post">+ Start a discussion</button>`)}
      <div class="community-layout"><main><section class="card community-tools"><form class="community-search" data-form="community-search"><label class="sr-only" for="discussion-q">Search discussions</label><input id="discussion-q" name="q" value="${qv}" placeholder="Search discussions, content, categories or authors"><select name="community" aria-label="Filter by category"><option value="">All categories</option>${communities.map(c => html`<option value="${c.id}" ${String(c.id) === community ? 'selected' : ''}>${c.name}</option>`)}</select><select name="sort" aria-label="Sort discussions"><option value="active" ${sort === 'active' ? 'selected' : ''}>Recently active</option><option value="recent" ${sort === 'recent' ? 'selected' : ''}>Recently created</option><option value="discussed" ${sort === 'discussed' ? 'selected' : ''}>Most discussed</option></select><label class="check"><input type="checkbox" name="mine" ${mine ? 'checked' : ''}> My discussions</label><button class="btn">Search</button></form></section><div class="discussion-results"><p><b>${discussions.length}</b> ${discussions.length === 1 ? 'discussion' : 'discussions'} found</p>${qv || community || mine || sort !== 'active' ? html`<a href="#/community">Reset filters</a>` : ''}</div>${discussions.length ? html`<div class="discussion-feed">${discussions.map(discussionCard)}</div>` : html`<div class="card">${empty('❝', mine ? 'You have not started any discussions yet.' : qv || community ? 'No discussions match these filters.' : 'No discussions yet — start the first useful conversation.', html`<button class="btn sm" data-action="new-post">Start a discussion</button>`)}</div>`}</main>
        <aside class="community-sidebar"><section class="card"><span class="section-kicker">Community overview</span><h2>Professional peer learning</h2><p class="muted">Keep conversations constructive, protect student privacy, and share practices other educators can use.</p><button class="btn" data-action="new-post">Create discussion</button></section><section class="card"><div class="card-head"><h2>Categories</h2><span>${communities.length}</span></div><nav class="category-list" aria-label="Discussion categories"><a class="${!community ? 'active' : ''}" href="#/community"><span>All discussions</span><b>${communities.reduce((sum, c) => sum + c.posts, 0)}</b></a>${communities.map(c => html`<a class="${String(c.id) === community ? 'active' : ''}" href="#/community?community=${c.id}"><span>${c.icon} ${c.name}</span><b>${c.posts}</b></a>`)}</nav></section></aside></div>`;
  }, { nav: 'community', title: 'Community' });

  on(/^\/community\/(\d+)$/, async (m) => {
    const { community, posts } = await api('GET', `/api/communities/${m[1]}/posts`);
    return html`<a href="#/community" class="back-link">← Community feed</a>${pageHead(`${community.icon} ${community.name}`, community.description, html`<button class="btn" data-action="new-post" data-id="${community.id}">+ Start a discussion</button>`)}
      ${posts.length ? html`<div class="discussion-feed">${posts.map(p => discussionCard({ ...p, community_id: community.id, community: community.name, icon: community.icon, last_activity: p.created_at }))}</div>` : html`<div class="card">${empty('❝', 'No discussions in this category yet.', html`<button class="btn sm" data-action="new-post" data-id="${community.id}">Start the first discussion</button>`)}</div>`}`;
  }, { nav: 'community', title: 'Community' });
  actions['new-post'] = async (el) => { const communities = await api('GET', '/api/communities'); const selected = el.dataset.id || ''; openModal('Start a professional discussion', html`<form data-form="new-post"><div class="form-error"></div><div class="field"><label>Category</label><select name="community_id" required><option value="">Select a community</option>${communities.map(c => html`<option value="${c.id}" ${String(c.id) === selected ? 'selected' : ''}>${c.icon} ${c.name}</option>`)}</select></div>
    <div class="field"><label>Discussion title</label><input name="title" required minlength="5" maxlength="150" placeholder="Ask a clear question or share a useful teaching idea"><div class="hint">5–150 characters</div></div>
    <div class="field"><label>Discussion content</label><textarea name="body" required minlength="10" maxlength="5000" rows="8" placeholder="Add context, what you have tried, and what kind of input would help."></textarea><div class="hint">10–5,000 characters. Do not include students' names, photos, or personal details.</div></div>
    <button class="btn">Publish discussion</button></form>`); };
  forms['community-search'] = (d) => { const p = new URLSearchParams(); if (d.q.trim()) p.set('q', d.q.trim()); if (d.community) p.set('community', d.community); if (d.sort !== 'active') p.set('sort', d.sort); if (d.mine) p.set('mine', '1'); location.hash = `#/community${p.toString() ? `?${p}` : ''}`; };
  forms['new-post'] = async (d) => { const communityId = d.community_id; delete d.community_id; const r = await api('POST', `/api/communities/${communityId}/posts`, d); closeModal(); toast(r.duplicate ? 'This discussion was already published.' : 'Discussion published.'); location.hash = `#/post/${r.id}`; };

  on(/^\/post\/(\d+)$/, async (m) => {
    const { post, replies } = await api('GET', `/api/posts/${m[1]}`);
    const canDel = post.user_id === state.me.id || state.me.role === 'admin';
    return html`<a href="#/community?community=${post.community_id}" class="back-link">← ${post.community}</a><article class="card discussion-detail"><header><div class="row wrap"><span class="tag">${post.community}</span><span class="muted">Started ${fmtDT(post.created_at)}</span></div><h1>${post.title}</h1><div class="discussion-author-row"><span class="avatar">${initials(post.author)}</span><div><b>${post.author}</b><small>${post.designation || 'Educator'}</small></div>${canDel ? html`<button class="btn link" data-action="delete-post" data-id="${post.id}" data-c="${post.community_id}">${state.me.role === 'admin' && post.user_id !== state.me.id ? 'Remove discussion' : 'Delete discussion'}</button>` : ''}</div></header><div class="discussion-body pre">${post.body}</div></article>
      <section class="reply-section"><div class="network-section-head"><div><h2>Replies</h2><p>${plural(replies.length, 'reply').replace('replys', 'replies')} in this conversation</p></div></div>${replies.length ? html`<div class="reply-list">${replies.map(r => { const canDeleteReply = r.user_id === state.me.id || state.me.role === 'admin'; return html`<article class="card reply-card"><span class="avatar">${initials(r.author)}</span><div><header><div><b>${r.author}</b><small>${r.designation || 'Educator'} · ${ago(r.created_at)}</small></div>${canDeleteReply ? html`<button class="btn link sm" data-action="delete-reply" data-id="${r.id}">${state.me.role === 'admin' && r.user_id !== state.me.id ? 'Remove' : 'Delete'}</button>` : ''}</header><p class="pre">${r.body}</p></div></article>`; })}</div>` : html`<div class="card">${empty('↩', 'No replies yet. Share the first thoughtful response.')}</div>`}</section>
      <section class="card reply-composer" id="reply"><h2>Add your reply</h2><form data-form="reply" data-id="${post.id}"><div class="form-error"></div><label class="sr-only" for="rb">Your reply</label><textarea id="rb" name="body" required minlength="2" maxlength="3000" rows="5" placeholder="Share a constructive response…"></textarea><div class="row between"><span class="hint">2–3,000 characters</span><button class="btn">Submit reply</button></div></form></section>`;
  }, { nav: 'community', title: 'Discussion' });
  forms.reply = async (d, f) => { const r = await api('POST', `/api/posts/${f.dataset.id}/replies`, d); toast(r.duplicate ? 'This reply was already posted.' : 'Reply posted.'); render(); };
  actions['delete-post'] = async (el) => { if (!confirm('Delete this discussion?')) return; await api('DELETE', `/api/posts/${el.dataset.id}`); if (el.dataset.c) location.hash = `#/community/${el.dataset.c}`; else { toast('Discussion removed and moderation recorded.'); await render(); } };
  actions['delete-reply'] = async (el) => { if (!confirm('Delete this reply?')) return; await api('DELETE', `/api/replies/${el.dataset.id}`); toast('Reply deleted.'); render(); };

  // ====================================================================== TUTORIALS
  on(/^\/tutorials$/, async (m, q) => {
    const list = await api('GET', '/api/tutorials');
    const cats = [...new Set(list.map(t => t.category))];
    const cat = q.get('cat') || ''; const term = (q.get('q') || '').toLowerCase();
    let show = cat === 'saved' ? list.filter(t => t.saved) : cat ? list.filter(t => t.category === cat) : list;
    if (term) show = show.filter(t => (t.title + t.summary + t.category).toLowerCase().includes(term));
    return html`${pageHead('Tutorials', 'Short, step-by-step guides for everything a teacher does — from lesson plans to parent meetings.')}
      <form data-form="tut-search" class="row" data-s="margin-bottom:.8rem"><input name="q" value="${q.get('q') || ''}" placeholder="Search tutorials…"><button class="btn">Search</button></form>
      <div class="chips"><a class="chip ${!cat ? 'on' : ''}" href="#/tutorials">All</a><a class="chip ${cat === 'saved' ? 'on' : ''}" href="#/tutorials?cat=saved">★ Saved</a>
        ${cats.map(c => html`<a class="chip ${cat === c ? 'on' : ''}" href="#/tutorials?cat=${encodeURIComponent(c)}">${c}</a>`)}</div>
      ${show.length ? html`<div class="cards">${show.map(t => html`<a class="card stat" href="#/tutorial/${t.id}"><div class="row between"><span class="tag">${t.category}</span>${t.saved ? html`<span class="tag gold">★ Saved</span>` : t.viewed_at ? html`<small>Viewed</small>` : ''}</div>
        <h3 data-s="margin-top:.6rem">${t.title}</h3><p class="muted" data-s="margin:0">${t.summary}</p><div class="meta" data-s="margin-bottom:0"><span>◷ ${t.minutes} min read</span></div></a>`)}</div>` : html`<div class="card">${empty('▤', 'No tutorials found.')}</div>`}`;
  }, { nav: 'tutorials', title: 'Tutorials' });
  forms['tut-search'] = (d) => { location.hash = `#/tutorials?q=${encodeURIComponent(d.q)}`; };

  on(/^\/tutorial\/(\d+)$/, async (m) => {
    const t = await api('GET', `/api/tutorials/${m[1]}`);
    return html`<a href="#/tutorials" class="muted">← Tutorials</a>
      ${pageHead(t.title, html`${t.category} · ${t.minutes} min`, html`<button class="btn ${t.saved ? 'gold' : 'ghost'}" data-action="save-tut" data-id="${t.id}">${t.saved ? '★ Saved' : '☆ Save'}</button>`)}
      <div class="cols"><div class="card"><p class="lesson-body">${t.summary}</p><ol class="steps">${t.steps.map(s => html`<li><h4>${s.title}</h4><p class="muted">${s.body}</p></li>`)}</ol></div>
        <div><div class="card"><h3>Related tutorials</h3>${t.related.length ? html`<ul class="list">${t.related.map(r => html`<li><a href="#/tutorial/${r.id}">${r.title}</a><div class="meta">${r.minutes} min</div></li>`)}</ul>` : html`<p class="muted">More coming soon.</p>`}</div>
        <div class="card"><h3>Still stuck?</h3><p class="muted">Ask the community or raise a support request — real educators will help.</p><div class="row wrap"><a class="btn sm" href="#/community">Ask the community</a><a class="btn sm ghost" href="#/support">Get support</a></div></div></div></div>`;
  }, { nav: 'tutorials', title: 'Tutorial' });
  actions['save-tut'] = async (el) => { const r = await api('POST', `/api/tutorials/${el.dataset.id}/save`); toast(r.saved ? 'Saved to your tutorials.' : 'Removed from saved.'); render(); };

  // ====================================================================== LESSON PLANNER
  const planTemplates = {
    standard: { name: 'Standard lesson plan', description: 'Opening, guided learning, independent practice and conclusion.', activities: 'Introduction:\n\nMain teaching activity:\n\nStudent participation / practice:\n\nConclusion:' },
    activity: { name: 'Activity-based learning', description: 'Participation, practical work and reflection.', activities: 'Starter / context:\n\nActivity instructions:\n\nStudent participation:\n\nSharing and reflection:\n\nConclusion:' },
    discussion: { name: 'Discussion-based lesson', description: 'Prompts, collaborative discussion and synthesis.', activities: 'Opening question:\n\nDiscussion prompts:\n\nSmall-group participation:\n\nWhole-class synthesis:\n\nConclusion:' },
    assessment: { name: 'Assessment-focused lesson', description: 'Checks for understanding, feedback and next steps.', activities: 'Prior-learning check:\n\nModelled example:\n\nStudent practice:\n\nFeedback and correction:\n\nConclusion:', assessment: 'Success criteria:\n\nChecks for understanding:\n\nAssessment method:\n\nHomework / next step:' },
  };
  const plannerTabs = (active = '') => tabs('planner', [['', 'My plans'], ['calendar', 'Calendar'], ['templates', 'Templates']], active);
  const planForm = (p = {}) => html`<form data-form="plan" data-id="${p.id || ''}" class="plan-builder"><div class="form-error" role="alert"></div><fieldset><legend>1. Basic information</legend>
    <div class="field"><label>Lesson title</label><input name="title" required minlength="3" maxlength="150" value="${p.title || ''}" placeholder="e.g. Comparing fractions with visual models"></div>
    <div class="grid-2"><div class="field"><label>Subject</label><input name="subject" maxlength="60" value="${p.subject || ''}"></div>
      <div class="field"><label>Grade / Class</label><input name="grade" maxlength="20" value="${p.grade || ''}"></div>
      <div class="field"><label>Date</label><input name="plan_date" type="date" value="${p.plan_date || ''}"></div>
      <div class="field"><label>Duration (minutes)</label><input name="duration_min" type="number" min="5" max="600" value="${p.duration_min || 40}"></div></div></fieldset>
    <fieldset><legend>2. Learning objectives</legend><div class="field"><label>Expected outcomes and key concepts</label><textarea name="objectives" maxlength="3000" rows="5" placeholder="By the end of the lesson, students will be able to…">${p.objectives || ''}</textarea></div></fieldset>
    <fieldset><legend>3. Teaching activities</legend><div class="field"><label>Introduction, main activity, participation and conclusion</label><textarea name="activities" maxlength="6000" rows="10">${p.activities || ''}</textarea></div></fieldset>
    <fieldset><legend>4. Assessment</legend><div class="field"><label>Questions, learning checks, assessment methods and homework</label><textarea name="assessment" maxlength="3000" rows="6">${p.assessment || ''}</textarea></div></fieldset>
    <fieldset><legend>5. Teaching resources</legend><div class="field"><label>Materials, teaching aids and digital resources</label><textarea name="materials" maxlength="2000" rows="5">${p.materials || ''}</textarea></div></fieldset>
    <fieldset><legend>6. Review and save</legend><div class="field"><label>Reflection after teaching</label><textarea name="reflection" maxlength="3000" rows="5" placeholder="What worked? What will you change next time?">${p.reflection || ''}</textarea></div><div class="row wrap"><button class="btn">${p.id ? 'Save changes' : 'Save lesson plan'}</button><a class="btn ghost" href="${p.id ? `#/planner/${p.id}` : '#/planner'}">Cancel</a></div></fieldset></form>`;

  const planCard = (p) => html`<article class="card plan-card"><div class="row between"><span class="tag ${p.plan_date ? 'blue' : 'gold'}">${p.plan_date ? fmtDate(p.plan_date) : 'Unscheduled'}</span><small>Updated ${fmtDate(p.updated_at)}</small></div><h2><a href="#/planner/${p.id}">${p.title}</a></h2><div class="meta">${p.subject ? html`<span>${p.subject}</span>` : ''}${p.grade ? html`<span>Grade / Class ${p.grade}</span>` : ''}<span>${p.duration_min} min</span></div><p>${p.objectives || 'No learning objectives added yet.'}</p><div class="row wrap"><a class="btn sm" href="#/planner/${p.id}">View plan</a><a class="btn sm ghost" href="#/planner/${p.id}/edit">Edit</a><button class="btn sm ghost" data-action="duplicate-plan" data-id="${p.id}">Duplicate</button></div></article>`;

  on(/^\/planner$/, async (m, q) => { const params = new URLSearchParams(); for (const k of ['q','scope','subject','grade']) if (q.get(k)) params.set(k, q.get(k)); const [stats, plans] = await Promise.all([api('GET','/api/plans/overview'), api('GET',`/api/plans?${params}`)]); const filtered = [...params].length;
    return html`${pageHead('Lesson planning workspace','Create, schedule, reuse and reflect on private lesson plans.',html`<a class="btn" href="#/planner/new">+ Create lesson plan</a>`)}${plannerTabs('')}<section class="planner-hero card"><span class="eyebrow">Teaching tools</span><h2>Plan every lesson with purpose</h2><p>Keep outcomes, activities, checks for understanding and resources together.</p><div class="row wrap"><a class="btn" href="#/planner/new">Create lesson plan</a><a class="btn ghost" href="#/planner/calendar">Open calendar</a><a class="btn ghost" href="#/planner/templates">Browse templates</a></div></section><div class="planner-stats">${[['Saved plans',stats.total],['Upcoming lessons',stats.upcoming],['Next 7 days',stats.thisWeek],['Unscheduled',stats.undated]].map(([l,n])=>html`<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`)}</div><section class="card plan-tools"><h2>My lesson plans</h2><form data-form="plan-search" class="plan-search"><input name="q" aria-label="Search plans" value="${q.get('q')||''}" placeholder="Search title, subject, grade or content"><select name="scope" aria-label="Date filter">${[['all','All plans'],['upcoming','Upcoming'],['past','Past'],['undated','Unscheduled']].map(([v,l])=>html`<option value="${v}" ${(q.get('scope')||'all')===v?'selected':''}>${l}</option>`)}</select><input name="subject" aria-label="Subject filter" value="${q.get('subject')||''}" placeholder="Subject"><input name="grade" aria-label="Grade filter" value="${q.get('grade')||''}" placeholder="Grade / Class"><button class="btn">Search</button>${filtered?html`<a class="btn ghost" href="#/planner">Reset</a>`:''}</form><p><b>${plans.length}</b> ${plans.length===1?'plan':'plans'} found</p></section>${plans.length?html`<div class="plan-grid">${plans.map(planCard)}</div>`:html`<div class="card">${empty('✎',filtered?'No lesson plans match these filters.':'Your lesson-plan library is ready for its first plan.',html`<a class="btn sm" href="#/planner/new">Create lesson plan</a>`)}</div>`}`; }, { nav:'planner', title:'Lesson Planner' });

  on(/^\/planner\/new$/, async (m,q) => { const t=planTemplates[q.get('template')]; const date=/^\d{4}-\d{2}-\d{2}$/.test(q.get('date')||'')?q.get('date'):''; const p={plan_date:date,...(t?{activities:t.activities,assessment:t.assessment||''}:{})}; return html`<a class="back-link" href="#/planner">← My plans</a>${pageHead('Create lesson plan',t?`${t.name} selected. Every prompt remains editable.`:'Build a clear, practical plan private to your account.')}<div class="planner-builder-layout"><section class="card">${planForm(p)}</section><aside class="card planner-help"><h2>Planning assistance</h2><p>Editable structure prompts only—no external AI or invented curriculum content.</p><a class="btn ghost sm" href="#/planner/templates">Choose a structure</a></aside></div>`; }, {nav:'planner',title:'Create Lesson Plan'});
  on(/^\/planner\/templates$/, async () => html`${pageHead('Lesson plan templates','Choose a structure, then add your own teaching content.')}${plannerTabs('templates')}<div class="template-grid">${Object.entries(planTemplates).map(([k,t])=>html`<article class="card template-card"><span class="eyebrow">Editable structure</span><h2>${t.name}</h2><p>${t.description}</p><a class="btn" href="#/planner/new?template=${k}">Use this structure</a></article>`)}</div>`, {nav:'planner',title:'Lesson Templates'});
  on(/^\/planner\/calendar$/, async (m,q) => { const plans=await api('GET','/api/plans'); const now=new Date(); const raw=/^\d{4}-\d{2}$/.test(q.get('month')||'')?q.get('month'):`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const [y,mo]=raw.split('-').map(Number), first=new Date(y,mo-1,1), days=new Date(y,mo,0).getDate(), selected=/^\d{4}-\d{2}-\d{2}$/.test(q.get('day')||'')?q.get('day'):''; const shift=n=>{const d=new Date(y,mo-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}; const cells=[...Array(first.getDay()).fill(0),...Array.from({length:days},(_,i)=>i+1)]; const date=d=>`${raw}-${String(d).padStart(2,'0')}`; const chosen=plans.filter(p=>p.plan_date===selected);
    return html`${pageHead('Lesson calendar','View actual scheduled lessons by month.',html`<a class="btn" href="#/planner/new${selected?`?date=${selected}`:''}">+ Plan a lesson</a>`)}${plannerTabs('calendar')}<section class="card lesson-calendar"><header><a class="btn ghost sm" aria-label="Previous month" href="#/planner/calendar?month=${shift(-1)}">← Previous</a><h2>${first.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><a class="btn ghost sm" aria-label="Next month" href="#/planner/calendar?month=${shift(1)}">Next →</a></header><div class="calendar-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>html`<span>${d}</span>`)}</div><div class="calendar-grid">${cells.map(d=>d?(()=>{const k=date(d),n=plans.filter(p=>p.plan_date===k).length;return html`<a class="calendar-day ${selected===k?'selected':''}" href="#/planner/calendar?month=${raw}&day=${k}" aria-label="${k}, ${plural(n,'lesson')}"><b>${d}</b>${n?html`<span>${n}</span>`:''}</a>`})():html`<span class="calendar-day blank"></span>`)}</div></section>${selected?html`<section class="card selected-day"><h2>${fmtDate(selected)}</h2>${chosen.length?html`<div class="plan-grid">${chosen.map(planCard)}</div>`:empty('◫','No lessons are scheduled for this day.',html`<a class="btn sm" href="#/planner/new?date=${selected}">Create for this date</a>`)}</section>`:html`<p class="hint">Choose a date to review its lessons.</p>`}`; }, {nav:'planner',title:'Lesson Calendar'});
  on(/^\/planner\/(\d+)\/edit$/, async m => { const p=await api('GET',`/api/plans/${m[1]}`); return html`<a class="back-link" href="#/planner/${p.id}">← Lesson details</a>${pageHead('Edit lesson plan','Update and save your private plan.')}<div class="planner-builder-layout"><section class="card">${planForm(p)}</section><aside class="card planner-help"><h2>Safe editing</h2><p>If saving fails, your entered content remains in this form so you can try again.</p></aside></div>`; }, {nav:'planner',title:'Edit Lesson Plan'});
  on(/^\/planner\/(\d+)$/, async m => { const p=await api('GET',`/api/plans/${m[1]}`); const sec=(t,v)=>v?html`<section><h2>${t}</h2><p class="pre">${v}</p></section>`:''; return html`<a class="back-link no-print" href="#/planner">← My plans</a><div class="plan-detail-layout"><article class="card plan-detail print-plan"><header><span class="eyebrow">TeachersInn lesson plan</span><h1>${p.title}</h1><dl class="plan-facts"><div><dt>Subject</dt><dd>${p.subject||'Not specified'}</dd></div><div><dt>Grade / Class</dt><dd>${p.grade||'Not specified'}</dd></div><div><dt>Scheduled date</dt><dd>${p.plan_date?fmtDate(p.plan_date):'Unscheduled'}</dd></div><div><dt>Duration</dt><dd>${p.duration_min} minutes</dd></div></dl></header>${sec('Learning objectives',p.objectives)}${sec('Teaching activities',p.activities)}${sec('Assessment and follow-up',p.assessment)}${sec('Teaching resources',p.materials)}${sec('Reflection',p.reflection)}</article><aside class="card plan-detail-actions no-print"><h2>Plan actions</h2><a class="btn" href="#/planner/${p.id}/edit">Edit plan</a><button class="btn ghost" data-action="print">Print / Save as PDF</button><button class="btn ghost" data-action="duplicate-plan" data-id="${p.id}">Duplicate plan</button><button class="btn link" data-action="delete-plan" data-id="${p.id}">Delete plan</button></aside></div>`; }, {nav:'planner',title:'Lesson Plan'});
  forms.plan = async (d, f) => {
    if (f.dataset.id) { await api('PUT', `/api/plans/${f.dataset.id}`, d); toast('Plan saved.'); location.hash = `#/planner/${f.dataset.id}`; }
    else { const r = await api('POST', '/api/plans', d); toast(r.duplicate ? 'This plan was already saved.' : 'Lesson plan created.'); location.hash = `#/planner/${r.id}`; }
  };
  forms['plan-search'] = d => { const p=new URLSearchParams(); for(const k of ['q','scope','subject','grade']) if(String(d[k]||'').trim() && !(k==='scope'&&d[k]==='all')) p.set(k,String(d[k]).trim()); location.hash=`#/planner${p.toString()?`?${p}`:''}`; };
  actions['duplicate-plan'] = async el => { const r=await api('POST',`/api/plans/${el.dataset.id}/duplicate`); toast('Editable copy created.'); location.hash=`#/planner/${r.id}`; };
  actions['delete-plan'] = async (el) => { if (!confirm('Delete this lesson plan?')) return; await api('DELETE', `/api/plans/${el.dataset.id}`); toast('Plan deleted.'); location.hash = '#/planner'; };

  // ====================================================================== CAREERS
  const careerTabs = (active) => tabs('jobs', [['', 'Overview'], ['browse', 'Browse jobs'], ['applications', 'My applications'], ['cv', 'CV Builder']], active);
  const applicationTag = (status) => html`<span class="tag ${status === 'applied' ? 'blue' : status === 'selected' ? 'green' : status === 'rejected' ? 'red' : 'gold'}">${String(status || '').replace('_', ' ')}</span>`;
  on(/^\/jobs(?:\/(browse|applications|cv))?$/, async (m, q) => {
    const tab = m[1] || '';
    const adminAction = state.me.role === 'admin' ? html`<button class="btn" data-action="new-job">+ Post a job</button>` : '';
    const head = pageHead('Teacher Career Hub', 'Build your professional profile, prepare your CV, discover teaching roles, and track applications.', adminAction);
    const nav = careerTabs(tab);
    if (!tab) {
      const [career, applications] = await Promise.all([api('GET', '/api/career'), api('GET', '/api/applications')]);
      return html`${head}${nav}<section class="career-hero card"><div><span class="eyebrow">Career readiness</span><h2>Shape your next professional step</h2><p>Keep your educator profile current, maintain an ATS-friendly CV, and manage every TeachersInn application in one place.</p><div class="career-actions"><a class="btn" href="#/jobs/cv">${career.hasCv ? 'Update CV' : 'Build CV'}</a><a class="btn ghost" href="#/jobs/browse">Browse jobs</a><a class="btn ghost" href="#/jobs/applications">View applications</a><a class="btn link" href="#/profile">Edit career profile</a></div></div><div class="career-readiness" role="progressbar" aria-label="Career profile completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${career.profileCompletion}"><strong>${career.profileCompletion}%</strong><span>Profile complete</span></div></section>
        <div class="career-stats"><div class="stat"><div class="n">${career.hasCv ? '✓' : '—'}</div><div class="l">Professional CV</div><div class="sub">${career.hasCv ? 'Saved and editable' : 'Not created yet'}</div></div><div class="stat"><div class="n">${career.applications}</div><div class="l">Applications</div><div class="sub">Submitted through TeachersInn</div></div><div class="stat"><div class="n">${career.applied}</div><div class="l">Awaiting updates</div><div class="sub">Currently marked applied</div></div></div>
        <section class="card"><div class="card-head"><div><span class="section-kicker">Recent activity</span><h2>Latest applications</h2></div><a href="#/jobs/applications">View all</a></div>${applications.length ? html`<ul class="list">${applications.slice(0, 4).map(a => html`<li class="row between"><div><a class="item-link" href="#/job/${a.job_id}">${a.title}</a><div class="meta"><span>${a.school}</span><span>${fmtDate(a.applied_at)}</span></div></div>${applicationTag(a.status)}</li>`)}</ul>` : empty('⚑', 'No applications yet. Browse current teaching opportunities.', html`<a class="btn sm" href="#/jobs/browse">Browse jobs</a>`)}</section>`;
    }
    if (tab === 'browse') {
      const qv = q.get('q') || ''; const subject = q.get('subject') || ''; const city = q.get('city') || ''; const type = q.get('type') || ''; const applied = q.get('applied') === '1';
      const params = new URLSearchParams({ q: qv, subject, city, type }); if (applied) params.set('applied', '1');
      const jobs = await api('GET', `/api/jobs?${params}`);
      return html`${head}${nav}<section class="card job-tools"><form class="job-search" data-form="job-search"><label class="sr-only" for="job-q">Search jobs</label><input id="job-q" name="q" value="${qv}" placeholder="Search title, school, subject or city"><input name="subject" value="${subject}" placeholder="Subject"><input name="city" value="${city}" placeholder="Location"><select name="type" aria-label="Employment type"><option value="">All employment types</option>${['Full-time', 'Part-time', 'Contract', 'Internship'].map(value => html`<option ${type === value ? 'selected' : ''}>${value}</option>`)}</select><label class="check"><input type="checkbox" name="applied" ${applied ? 'checked' : ''}> Applied jobs</label><button class="btn">Search</button></form></section>
        <div class="job-results"><p><b>${jobs.length}</b> ${jobs.length === 1 ? 'role' : 'roles'} found</p>${qv || subject || city || type || applied ? html`<a href="#/jobs/browse">Reset filters</a>` : ''}</div>
        ${jobs.length ? html`<div class="job-grid">${jobs.map(j => html`<article class="card job-card"><div class="row wrap"><span class="tag blue">${j.job_type}</span>${j.subject ? html`<span class="tag">${j.subject}</span>` : ''}${j.applied ? applicationTag(j.application_status) : ''}</div><h2><a href="#/job/${j.id}">${j.title}</a></h2><p class="job-school">${j.school}</p><div class="meta"><span>⌖ ${j.city}</span><span>Posted ${ago(j.created_at)}</span></div><p class="job-summary">${j.description}</p><div class="job-card-actions"><a class="btn ghost sm" href="#/job/${j.id}">View details</a>${j.applied ? html`<span class="muted">Application submitted</span>` : html`<button class="btn sm" data-action="apply-job" data-id="${j.id}" data-title="${j.title}">Apply</button>`}${state.me.role === 'admin' ? html`<button class="btn link sm" data-action="close-job" data-id="${j.id}">Close</button>` : ''}</div></article>`)}</div>` : html`<div class="card">${empty('⚑', 'No teaching roles match these filters.', html`<a class="btn sm ghost" href="#/jobs/browse">Clear filters</a>`)}</div>`}`;
    }
    if (tab === 'applications') {
      const applications = await api('GET', '/api/applications'); const status = q.get('status') || ''; const shown = status ? applications.filter(a => a.status === status) : applications;
      return html`${head}${nav}<div class="application-filter chips"><a class="chip ${!status ? 'on' : ''}" href="#/jobs/applications">All (${applications.length})</a><a class="chip ${status === 'applied' ? 'on' : ''}" href="#/jobs/applications?status=applied">Applied (${applications.filter(a => a.status === 'applied').length})</a></div>
        ${shown.length ? html`<div class="application-list">${shown.map(a => html`<article class="card application-card"><div><span class="eyebrow">Application #${a.id}</span><h2><a href="#/job/${a.job_id}">${a.title}</a></h2><p>${a.school} · ${a.city}</p><div class="meta"><span>Applied ${fmtDate(a.applied_at)}</span><span>Updated ${fmtDate(a.updated_at)}</span><span>${a.job_status === 'open' ? 'Listing open' : 'Listing closed'}</span></div></div><div>${applicationTag(a.status)}<a class="btn ghost sm" href="#/job/${a.job_id}">View job</a></div></article>`)}</div>` : html`<div class="card">${empty('⚑', status ? 'No applications have this status.' : 'You have not submitted any applications yet.', html`<a class="btn sm" href="#/jobs/browse">Browse jobs</a>`)}</div>`}`;
    }
    const p = await api('GET', '/api/career-profile');
    return html`${head}${nav}<div class="cv-builder-layout"><section class="card cv-builder"><div class="cv-steps" aria-label="CV sections">${['Personal information', 'Professional summary', 'Experience', 'Qualifications', 'Skills', 'Preview'].map((label, index) => html`<span><b>${index + 1}</b>${label}</span>`)}</div><form data-form="career-profile"><div class="form-error"></div>
      <fieldset><legend>Personal & professional details</legend><p class="hint">Core details come from your TeachersInn profile.</p><div class="grid-2"><div class="field"><label>Full name</label><input value="${p.name}" disabled></div><div class="field"><label>Designation</label><input value="${p.designation || ''}" disabled></div><div class="field"><label>School / organization</label><input value="${p.school || ''}" disabled></div><div class="field"><label>City</label><input value="${p.city || ''}" disabled></div></div><a href="#/profile">Edit core profile details →</a></fieldset>
      <fieldset><legend>Professional summary</legend><div class="field"><label for="cv-summary">Editable professional summary</label><textarea id="cv-summary" name="professional_summary" maxlength="2000" rows="5" placeholder="Summarise your teaching approach and professional strengths.">${p.professional_summary || p.bio || ''}</textarea><div class="hint">Suggestions use a local rule-based template and never invent qualifications.</div></div><button type="button" class="btn ghost sm" data-action="suggest-summary">Create draft summary</button></fieldset>
      <fieldset><legend>Teaching experience</legend><div class="field"><label>Previous institutions</label><textarea name="previous_institutions" maxlength="3000" rows="4">${p.previous_institutions || ''}</textarea></div><div class="field"><label>Roles and responsibilities</label><textarea name="responsibilities" maxlength="4000" rows="5">${p.responsibilities || ''}</textarea></div></fieldset>
      <fieldset><legend>Education & qualifications</legend><div class="field"><label>Qualifications</label><textarea name="qualifications" maxlength="3000">${p.qualifications || ''}</textarea></div><div class="grid-2"><div class="field"><label>Certifications</label><textarea name="certifications" maxlength="3000">${p.certifications || ''}</textarea></div><div class="field"><label>Relevant training</label><textarea name="training" maxlength="3000">${p.training || ''}</textarea></div></div></fieldset>
      <fieldset><legend>Skills & specializations</legend><div class="grid-2"><div class="field"><label>Teaching skills</label><textarea name="skills" maxlength="2000">${p.skills || ''}</textarea></div><div class="field"><label>Specializations</label><textarea name="specializations" maxlength="2000">${p.specializations || ''}</textarea></div></div><div class="field"><label>CV layout</label><select name="cv_template"><option value="classic" ${p.cv_template !== 'modern' ? 'selected' : ''}>Classic Professional</option><option value="modern" ${p.cv_template === 'modern' ? 'selected' : ''}>Modern Educator</option></select></div></fieldset><div class="cv-form-actions"><button class="btn">Save CV</button><button type="button" class="btn ghost" data-action="print">Print / Save as PDF</button></div></form></section>
      <aside class="cv-preview-wrap"><div class="cv-preview ${p.cv_template === 'modern' ? 'modern' : 'classic'}" id="cv-preview"><header><h1>${p.name}</h1><p>${[p.designation, p.city].filter(Boolean).join(' · ')}</p><small>${p.email}</small></header>${p.professional_summary || p.bio ? html`<section><h2>Professional Summary</h2><p>${p.professional_summary || p.bio}</p></section>` : ''}${p.experience_years || p.previous_institutions || p.responsibilities ? html`<section><h2>Teaching Experience</h2>${p.experience_years ? html`<p><b>${plural(p.experience_years, 'year')} of experience</b>${p.school ? ` · ${p.school}` : ''}</p>` : ''}${p.previous_institutions ? html`<p class="pre">${p.previous_institutions}</p>` : ''}${p.responsibilities ? html`<p class="pre">${p.responsibilities}</p>` : ''}</section>` : ''}${p.qualifications || p.certifications || p.training ? html`<section><h2>Education & Qualifications</h2>${p.qualifications ? html`<p class="pre">${p.qualifications}</p>` : ''}${p.certifications ? html`<p class="pre">${p.certifications}</p>` : ''}${p.training ? html`<p class="pre">${p.training}</p>` : ''}</section>` : ''}<section><h2>Teaching Expertise</h2><p>${[p.subjects, p.grades, p.board, p.skills, p.specializations].filter(Boolean).join(' · ') || 'Add your subjects, grades, board, skills, or specializations.'}</p></section></div><p class="hint">Export uses your browser’s print dialog. Choose “Save as PDF” if supported by your device.</p></aside></div>`;
  }, { nav: 'jobs', title: 'Career Hub' });

  on(/^\/job\/(\d+)$/, async (m) => {
    const j = await api('GET', `/api/jobs/${m[1]}`);
    return html`<a class="back-link" href="#/jobs/browse">← Browse jobs</a><div class="job-detail-layout"><main class="card job-detail"><div class="row wrap"><span class="tag blue">${j.job_type}</span>${j.subject ? html`<span class="tag">${j.subject}</span>` : ''}${j.applied ? applicationTag(j.application_status) : ''}</div><h1>${j.title}</h1><p class="job-school">${j.school}</p><dl class="job-facts"><div><dt>Location</dt><dd>${j.city}</dd></div><div><dt>Employment type</dt><dd>${j.job_type}</dd></div><div><dt>Subject</dt><dd>${j.subject || 'Not specified'}</dd></div><div><dt>Posted</dt><dd>${fmtDate(j.created_at)}</dd></div></dl><section><h2>Job description</h2><p class="pre job-description">${j.description}</p></section></main><aside><div class="card job-apply-card"><h2>Application</h2>${j.status !== 'open' ? html`<p>This listing is closed.</p>` : j.applied ? html`${applicationTag(j.application_status)}<p>Your application was submitted through TeachersInn.</p><a class="btn ghost" href="#/jobs/applications">View applications</a>` : html`<p>Review the role carefully before submitting. Your authenticated account will be recorded as the applicant.</p><button class="btn" data-action="apply-job" data-id="${j.id}" data-title="${j.title}">Apply now</button>`}${j.status === 'open' ? html`<a class="btn link" href="mailto:${j.apply_email}?subject=${encodeURIComponent('Application: ' + j.title)}">Apply by email instead</a><p class="hint">Email applications are handled outside TeachersInn and will not appear in your tracker.</p>` : ''}<hr><p class="hint">TeachersInn never charges teachers to apply. Report suspicious listings through Support.</p></div></aside></div>`;
  }, { nav: 'jobs', title: 'Job details' });

  forms['job-search'] = (d) => { const p = new URLSearchParams(); if (d.q.trim()) p.set('q', d.q.trim()); if (d.subject.trim()) p.set('subject', d.subject.trim()); if (d.city.trim()) p.set('city', d.city.trim()); if (d.type) p.set('type', d.type); if (d.applied) p.set('applied', '1'); location.hash = `#/jobs/browse${p.toString() ? `?${p}` : ''}`; };
  forms['career-profile'] = async (d) => { await api('PUT', '/api/career-profile', d); toast('Career profile and CV saved.'); await render(); };
  actions['suggest-summary'] = async () => { const result = await api('POST', '/api/career-profile/summary-suggestion'); const field = $('#cv-summary'); if (field) { field.value = result.suggestion; field.dispatchEvent(new Event('input', { bubbles: true })); } toast('Rule-based draft added. Review and edit before saving.'); };
  actions['apply-job'] = async (el) => { if (!confirm(`Submit your application for ${el.dataset.title}?`)) return; await api('POST', `/api/jobs/${el.dataset.id}/apply`); toast('Application submitted.'); await render(); };
  actions['new-job'] = () => openModal('Post a job', html`<form data-form="new-job"><div class="form-error"></div>
    <div class="grid-2"><div class="field"><label>Job title</label><input name="title" required maxlength="120"></div><div class="field"><label>School / Institution</label><input name="school" required maxlength="120"></div>
      <div class="field"><label>City</label><input name="city" required maxlength="60"></div><div class="field"><label>Type</label><select name="job_type"><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option></select></div>
      <div class="field"><label>Subject</label><input name="subject" maxlength="60"></div><div class="field"><label>Application email</label><input name="apply_email" type="email" required></div></div>
    <div class="field"><label>Description</label><textarea name="description" required minlength="20" maxlength="3000"></textarea></div><button class="btn">Publish</button></form>`);
  forms['new-job'] = async (d) => { await api('POST', '/api/admin/jobs', d); closeModal(); toast('Job posted.'); render(); };
  actions['close-job'] = async (el) => { if (!confirm('Close this listing?')) return; await api('POST', `/api/admin/jobs/${el.dataset.id}/close`); render(); };

  // ====================================================================== SUPPORT
  const TICKET_CATS = ['Account & Login', 'Courses & Certificates', 'Workshops', 'Technical Issue', 'Classroom Help', 'Report a Concern', 'Other'];
  const statusTag = (s) => html`<span class="tag ${s === 'open' ? 'gold' : s === 'in_progress' ? 'blue' : s === 'resolved' ? 'green' : ''}">${s.replace('_', ' ')}</span>`;
  on(/^\/support(?:\/(mentorship|wellbeing))?$/, async (m) => {
    const tab = m[1] || '';
    const head = pageHead('Support', 'Help when you need it — from our team, from mentors, and for your own wellbeing.');
    const t = tabs('support', [['', 'Helpdesk'], ['mentorship', 'Mentorship'], ['wellbeing', 'Wellbeing']], tab);
    if (tab === 'wellbeing') return html`${head}${t}<div class="cols"><div>
      <div class="card"><h2>You matter too</h2><p>Teaching is demanding work. Feeling stretched is common — and support is available. These resources are confidential and free.</p>
        <ul class="list"><li><b>Tele-MANAS (Govt. of India)</b> — 24×7 mental health support, many Indian languages. Call <b>14416</b> or <b>1-800-891-4416</b>.</li>
          <li><b>Emergency</b> — If you or someone is in immediate danger, call <b>112</b>.</li>
          <li><b>Your school counsellor or EAP</b> — Many schools offer confidential counselling for staff.</li></ul></div>
      <div class="card"><h3>Practical guides</h3><ul class="list"><li><a href="#/course/7">Teacher Wellbeing & Resilience (course)</a></li><li><a href="#/tutorials?cat=${encodeURIComponent('Wellbeing & Workload')}">Workload & balance tutorials</a></li><li><a href="#/workshops">Teacher Wellbeing Circle (workshop)</a></li></ul></div></div>
      <div class="card"><h3>Talk to someone who gets it</h3><p class="muted">Our mentors include experienced teachers and counsellors.</p><a class="btn sm" href="#/support/mentorship">Find a mentor</a></div></div>`;
    if (tab === 'mentorship') {
      const [mentors, mine] = await Promise.all([api('GET', '/api/mentors'), api('GET', '/api/mentorships')]);
      const asMentor = mine.filter(x => x.mentor_id === state.me.id); const asMentee = mine.filter(x => x.mentee_id === state.me.id);
      return html`${head}${t}
        ${asMentor.length ? html`<div class="card"><h3>Requests to you (as mentor)</h3><ul class="list">${asMentor.map(x => html`<li><div class="row between"><b>${x.mentee_name} — ${x.topic}</b>${statusTag(x.status)}</div><p class="muted pre">${x.message}</p>
          <div class="row">${x.status === 'requested' ? html`<button class="btn sm" data-action="mentor-respond" data-id="${x.id}" data-v="accept">Accept</button><button class="btn ghost sm" data-action="mentor-respond" data-id="${x.id}" data-v="decline">Decline</button>` : x.status === 'active' ? html`<a class="btn sm" href="#/messages/${x.mentee_id}">Message</a><button class="btn ghost sm" data-action="mentor-respond" data-id="${x.id}" data-v="complete">Mark complete</button>` : ''}</div></li>`)}</ul></div>` : ''}
        ${asMentee.length ? html`<div class="card"><h3>Your mentorship requests</h3><ul class="list">${asMentee.map(x => html`<li class="row between"><span><b>${x.mentor_name}</b> — ${x.topic}</span><span class="row">${statusTag(x.status)}${x.status === 'active' ? html`<a class="btn sm" href="#/messages/${x.mentor_id}">Message</a>` : ''}</span></li>`)}</ul></div>` : ''}
        <h2 data-s="margin-top:1.2rem">Mentors</h2><p class="muted">Experienced educators who volunteer their time. Turn on "Open to mentoring" in your profile to become one.</p>
        ${mentors.length ? html`<div class="cards">${mentors.map(p => personCard(p, html`<button class="btn sm" data-action="ask-mentor" data-id="${p.id}" data-name="${p.name}">Request mentorship</button>`))}</div>` : html`<div class="card">${empty('♡', 'No mentors available yet.')}</div>`}`;
    }
    const tickets = await api('GET', '/api/tickets');
    return html`${head}${t}<div class="cols"><div class="card"><div class="card-head"><h3>Your support requests</h3><button class="btn sm" data-action="new-ticket">+ New request</button></div>
      ${tickets.length ? html`<ul class="list">${tickets.map(x => html`<li class="row between"><div><a class="item-link" href="#/ticket/${x.id}">#${x.id} · ${x.subject}</a><div class="meta"><span>${x.category}</span><span>Updated ${ago(x.updated_at)}</span></div></div>${statusTag(x.status)}</li>`)}</ul>` : empty('♡', 'No support requests. We\'re here if you need us.')}</div>
      <div><div class="card"><h3>Quick help</h3><ul class="list"><li><a href="#/tutorials">Browse tutorials</a></li><li><a href="#/community">Ask the community</a></li><li><a href="#/profile/security">Security & password</a></li><li><a href="#/legal">Privacy & your data</a></li></ul></div>
      <div class="card"><h3>Classroom help</h3><p class="muted" data-s="font-size:.9rem">Stuck with a classroom challenge? Raise a "Classroom Help" request or ask a mentor — no question is too small.</p></div></div></div>`;
  }, { nav: 'support', title: 'Support' });
  actions['new-ticket'] = () => openModal('New support request', html`<form data-form="ticket"><div class="form-error"></div>
    <div class="field"><label>Category</label><select name="category">${TICKET_CATS.map(c => html`<option>${c}</option>`)}</select></div>
    <div class="field"><label>Subject</label><input name="subject" required minlength="4" maxlength="150"></div>
    <div class="field"><label>Describe the issue</label><textarea name="body" required minlength="10" maxlength="4000" rows="6"></textarea><div class="hint">Never share passwords. Avoid students' personal details.</div></div>
    <button class="btn">Submit request</button></form>`);
  forms.ticket = async (d) => { const r = await api('POST', '/api/tickets', d); closeModal(); toast('Request submitted. We\'ll get back to you soon.'); location.hash = `#/ticket/${r.id}`; };
  actions['ask-mentor'] = (el) => openModal(`Request mentorship from ${el.dataset.name}`, html`<form data-form="mentor-req" data-id="${el.dataset.id}"><div class="form-error"></div>
    <div class="field"><label>Topic</label><input name="topic" required minlength="3" maxlength="120" placeholder="e.g. Managing a large Grade 7 class"></div>
    <div class="field"><label>Introduce yourself and what you'd like help with</label><textarea name="message" required minlength="10" maxlength="1500" rows="6"></textarea></div><button class="btn">Send request</button></form>`);
  forms['mentor-req'] = async (d, f) => { await api('POST', '/api/mentorships', { ...d, mentor_id: Number(f.dataset.id) }); closeModal(); toast('Mentorship request sent.'); render(); };
  actions['mentor-respond'] = async (el) => { await api('POST', `/api/mentorships/${el.dataset.id}/respond`, { action: el.dataset.v }); toast('Updated.'); render(); };

  on(/^\/ticket\/(\d+)$/, async (m) => {
    const { ticket: t, replies } = await api('GET', `/api/tickets/${m[1]}`);
    return html`<a href="${state.me.role === 'admin' && t.user_id !== state.me.id ? '#/admin/tickets' : '#/support'}" class="muted">← Back</a>
      <div class="card" data-s="margin-top:.8rem"><div class="row between"><h1 data-s="margin:0">#${t.id} · ${t.subject}</h1>${statusTag(t.status)}</div>
        <div class="meta"><span>${t.category}</span><span>${t.requester}</span><span>${fmtDT(t.created_at)}</span><span>Priority: ${t.priority}</span></div><div class="pre">${t.body}</div></div>
      ${replies.map(r => html`<div class="card person"><span class="avatar">${r.role === 'admin' ? '⛨' : initials(r.author)}</span><div class="who"><b>${r.role === 'admin' ? 'TeachersInn Support' : r.author}</b><small>${fmtDT(r.created_at)}</small><div class="pre" data-s="margin-top:.4rem">${r.body}</div></div></div>`)}
      ${t.status !== 'closed' ? html`<div class="card"><form data-form="ticket-reply" data-id="${t.id}"><div class="form-error"></div><label>Add a reply</label><textarea name="body" required minlength="2" maxlength="4000"></textarea><button class="btn" data-s="margin-top:.6rem">Send</button></form></div>` : ''}`;
  }, { nav: 'support', title: 'Support request' });
  forms['ticket-reply'] = async (d, f) => { await api('POST', `/api/tickets/${f.dataset.id}/replies`, d); render(); };

  // ====================================================================== SETTINGS & ACCOUNT
  const settingsNav = active => html`<nav class="settings-nav" aria-label="Settings sections">${[['','Account overview','⌂'],['personal','Personal information','◉'],['professional','Professional profile','⚇'],['security','Security','⛨'],['privacy','Privacy','◌'],['notifications','Notifications','♢'],['appearance','Appearance','◐'],['data','Data & account','▤']].map(([key,label,icon])=>html`<a class="${active===key?'on':''}" href="#/settings${key?`/${key}`:''}"><span aria-hidden="true">${icon}</span>${label}</a>`)}</nav>`;
  on(/^\/settings(?:\/(personal|professional|security|privacy|notifications|appearance|data))?$/, async (m) => {
    await loadMe(); const me=state.me, tab=m[1]||'', settings=await api('GET','/api/settings'); const head=pageHead('Settings & Preferences','Manage your account, professional information, privacy, and application preferences.'); let content;
    if(!tab) content=html`<section class="settings-section"><span class="section-kicker">Account overview</span><h2>Your TeachersInn account</h2><div class="settings-overview"><article class="card settings-identity"><span class="avatar lg">${initials(me.name)}</span><div><h3>${me.name}</h3><p>${me.email}</p><div class="row wrap"><span class="tag ${me.role==='admin'?'red':'blue'}">${me.role}</span><span class="tag green">${me.status}</span></div></div></article><article class="card"><h3>Profile completion</h3><div class="settings-completion"><b>${settings.profileCompletion}%</b>${progress(settings.profileCompletion,'','Profile completion')}</div><p class="hint">Based on supported professional profile fields.</p><a href="#/settings/professional">Complete professional profile →</a></article></div><div class="card settings-summary"><dl><div><dt>Member since</dt><dd>${fmtDate(me.created_at)}</dd></div><div><dt>Last sign-in</dt><dd>${me.last_login_at?fmtDT(me.last_login_at):'Current session'}</dd></div><div><dt>Career Hub profile</dt><dd>${settings.hasCareerProfile?'Created':'Not created'}</dd></div><div><dt>Directory visibility</dt><dd>${me.directory_visible?'Visible':'Hidden'}</dd></div></dl></div></section>`;
    if(tab==='personal') content=html`<section class="settings-section"><span class="section-kicker">Personal information</span><h2>Basic account details</h2><p>Changes update your dashboard, account header, and visible educator profile where applicable.</p><form class="card" data-form="settings-personal"><div class="form-error" role="alert"></div><div class="field"><label>Full name</label><input name="name" required minlength="2" maxlength="80" value="${me.name}"></div><div class="grid-2"><div class="field"><label>Email address</label><input type="email" value="${me.email}" disabled><div class="hint">Email changes are not supported by the active legacy authentication system.</div></div><div class="field"><label>City</label><input name="city" maxlength="60" value="${me.city||''}"></div><div class="field"><label>State</label><input name="state" maxlength="60" value="${me.state||''}"></div></div><div class="field"><label>Professional biography</label><textarea name="bio" maxlength="600" rows="6">${me.bio||''}</textarea></div><div class="row wrap"><button class="btn">Save changes</button><button type="reset" class="btn ghost">Reset</button></div></form></section>`;
    if(tab==='professional') content=html`<section class="settings-section"><span class="section-kicker">Professional profile</span><h2>Educator information</h2><p>These fields support your network profile. Private Career Hub CV drafts remain separate.</p><form class="card" data-form="settings-professional"><div class="form-error" role="alert"></div><div class="grid-2"><div class="field"><label>Designation</label><input name="designation" maxlength="80" value="${me.designation||''}"></div><div class="field"><label>School / Institution</label><input name="school" maxlength="120" value="${me.school||''}"></div><div class="field"><label>Subjects</label><input name="subjects" maxlength="120" value="${me.subjects||''}"></div><div class="field"><label>Grades taught</label><input name="grades" maxlength="40" value="${me.grades||''}"></div><div class="field"><label>Education board</label><input name="board" maxlength="40" value="${me.board||''}"></div><div class="field"><label>Years of experience</label><input name="experience_years" type="number" min="0" max="60" value="${me.experience_years||0}"></div></div><label class="check"><input type="checkbox" name="open_to_mentor" ${me.open_to_mentor?'checked':''}> I am open to mentoring educators</label><div class="row wrap"><button class="btn">Save professional profile</button><a class="btn ghost" href="#/jobs/cv">Open private CV Builder</a></div></form></section>`;
    if(tab==='security'){const sessions=await api('GET','/api/auth/sessions');content=html`<section class="settings-section"><span class="section-kicker">Account security</span><h2>Password and sessions</h2><div class="settings-two"><form class="card" data-form="password"><div class="form-error" role="alert"></div><h3>Change password</h3><div class="field"><label>Current password</label><input name="current" type="password" required autocomplete="current-password"></div><div class="field"><label>New password</label><input name="next" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></div><div class="field"><label>Confirm new password</label><input name="confirm" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></div><p class="hint">A successful change revokes every other active session.</p><button class="btn">Update password</button></form><article class="card"><div class="card-head"><h3>Active sessions</h3>${sessions.length>1?html`<button class="btn sm ghost" data-action="logout-others">Sign out others</button>`:''}</div><ul class="list">${sessions.map(s=>html`<li><b>${s.user_agent.split(') ')[0].replace('Mozilla/5.0 (','')||'Unknown device'}</b>${s.current?html` <span class="tag green">This device</span>`:''}<div class="meta"><span>IP ${s.ip}</span><span>Active ${ago(new Date(s.last_seen).toISOString())}</span></div></li>`)}</ul></article></div></section>`;}
    if(tab==='privacy') content=html`<section class="settings-section"><span class="section-kicker">Privacy</span><h2>Profile visibility</h2><form class="card" data-form="settings-privacy"><div class="form-error" role="alert"></div><label class="settings-toggle"><span><b>Educator directory visibility</b><small>Allow other authenticated educators to discover your professional profile.</small></span><input type="checkbox" name="directory_visible" ${me.directory_visible?'checked':''}></label><p class="notice">Messages, private CV drafts, lesson plans, applications, and account information remain protected by their existing ownership rules.</p><button class="btn">Save privacy setting</button></form></section>`;
    if(tab==='notifications') content=html`<section class="settings-section"><span class="section-kicker">In-app notifications</span><h2>Activity preferences</h2><p>Disabling a category prevents new optional in-app notifications. Existing history is preserved. Essential system and account notices cannot be disabled.</p><form class="card" data-form="settings-notifications"><div class="form-error" role="alert"></div>${[['messages','Messages','New educator messages'],['connections','Connections','Connection requests and accepted connections'],['community','Community','Replies to your discussions'],['workshops','Workshops','Registration and attendance updates'],['learning','Learning & CPD','Course completion and certificate activity'],['mentorship','Mentorship','Mentorship requests and relationship updates'],['support','Support','Support ticket replies and status changes']].map(([key,label,desc])=>html`<label class="settings-toggle"><span><b>${label}</b><small>${desc}</small></span><input type="checkbox" name="${key}" ${settings.notifications[key]?'checked':''}></label>`) }<button class="btn">Save notification preferences</button></form></section>`;
    if(tab==='appearance'){const theme=storedTheme(),mode=storedColorMode();content=html`<section class="settings-section"><span class="section-kicker">Appearance</span><h2>Theme and color mode</h2><p>Theme and light/dark mode are independent and stored only in this browser.</p><div class="card"><fieldset class="appearance-options"><legend>Visual theme</legend><label class="theme-choice ${theme==='sky'?'selected':''}"><input type="radio" name="settings-theme" value="sky" data-change="settings-theme" ${theme==='sky'?'checked':''}><span class="theme-swatch sky"></span><span><b>Sky Blue</b><small>Default professional blue theme</small></span></label><label class="theme-choice ${theme==='classic'?'selected':''}"><input type="radio" name="settings-theme" value="classic" data-change="settings-theme" ${theme==='classic'?'checked':''}><span class="theme-swatch classic"></span><span><b>Classic Golden</b><small>Warm TeachersInn gold theme</small></span></label></fieldset><div class="field"><label>Light / dark appearance</label><select data-change="color-mode" aria-label="Color mode"><option value="system" ${mode==='system'?'selected':''}>Follow device setting</option><option value="light" ${mode==='light'?'selected':''}>Light</option><option value="dark" ${mode==='dark'?'selected':''}>Dark</option></select></div><p class="hint">Sky Blue remains the default when no valid theme preference exists.</p></div></section>`;}
    if(tab==='data') content=html`<section class="settings-section"><span class="section-kicker">Data & account</span><h2>Your records and controls</h2><div class="settings-link-grid">${[['#/learn','Course progress'],['#/certificates','Certificates'],['#/planner','Lesson plans'],['#/jobs/applications','Applications'],['#/jobs/cv','Private Career Hub CV']].map(([href,label])=>html`<a class="card" href="${href}">${label}<span>→</span></a>`)}</div><article class="card"><h3>Download your information</h3><p>The existing JSON export contains your account and supported TeachersInn records.</p><a class="btn ghost" href="/api/profile/export" download>Download my data</a></article><article class="card danger-zone"><h3>Delete account</h3><p>Existing account deletion permanently removes interconnected active records. This cannot be undone.</p><form data-form="delete-account"><div class="form-error" role="alert"></div><div class="field"><label>Confirm with your password</label><input name="password" type="password" required autocomplete="current-password"></div><button class="btn danger">Delete my account</button></form></article></section>`;
    return html`${head}<div class="settings-layout">${settingsNav(tab)}<main>${content}</main></div>`;
  },{nav:'settings',title:'Settings'});

  forms['settings-personal']=async d=>{await api('PUT','/api/profile',{...state.me,...d,open_to_mentor:!!state.me.open_to_mentor,directory_visible:!!state.me.directory_visible});toast('Personal information saved.');await render();};
  forms['settings-professional']=async d=>{await api('PUT','/api/profile',{...state.me,...d,directory_visible:!!state.me.directory_visible});toast('Professional profile saved.');await render();};
  forms['settings-privacy']=async d=>{await api('PUT','/api/profile',{...state.me,directory_visible:!!d.directory_visible,open_to_mentor:!!state.me.open_to_mentor});toast('Privacy setting saved.');await render();};
  forms['settings-notifications']=async d=>{await api('PUT','/api/settings/notifications',d);toast('Notification preferences saved.');await render();};

  // ====================================================================== PROFILE & PRIVACY (legacy routes retained)
  on(/^\/profile(?:\/(security|privacy))?$/, async (m) => {
    await loadMe(); const me = state.me; const tab = m[1] || '';
    const head = pageHead('Profile & Privacy', 'Manage how you appear to other educators, your security and your data.');
    const t = tabs('profile', [['', 'Profile'], ['security', 'Security'], ['privacy', 'Privacy & data']], tab);
    if (tab === 'security') {
      const sessions = await api('GET', '/api/auth/sessions');
      return html`${head}${t}<div class="cols"><div class="card"><h3>Change password</h3><form data-form="password"><div class="form-error"></div>
        <div class="field"><label>Current password</label><input name="current" type="password" required autocomplete="current-password"></div>
        <div class="field"><label>New password</label><input name="next" type="password" required minlength="10" maxlength="128" autocomplete="new-password"><div class="hint">At least 10 characters with letters and numbers. Changing it signs you out everywhere else.</div></div>
        <button class="btn">Update password</button></form></div>
        <div class="card"><div class="card-head"><h3>Active sessions</h3>${sessions.length > 1 ? html`<button class="btn sm ghost" data-action="logout-others">Sign out others</button>` : ''}</div>
          <ul class="list">${sessions.map(s => html`<li><b>${s.user_agent.split(') ')[0].replace('Mozilla/5.0 (', '') || 'Unknown device'}</b> ${s.current ? html`<span class="tag green">This device</span>` : ''}<div class="meta"><span>IP ${s.ip}</span><span>Active ${ago(new Date(s.last_seen).toISOString())}</span></div></li>`)}</ul>
          <p class="hint">Last sign-in: ${me.last_login_at ? fmtDT(me.last_login_at) : 'now'}</p></div></div>`;
    }
    if (tab === 'privacy') return html`${head}${t}<div class="cols"><div>
      <div class="card"><h3>Your data</h3><p class="muted">Under the Digital Personal Data Protection Act, 2023 you can access, correct and erase your personal data.</p>
        <p>Consent given: <b>${fmtDT(me.consent_at)}</b> (notice v${me.consent_version}) · <a href="#/legal">Read the notice</a></p>
        <a class="btn ghost" href="/api/profile/export" download>⤓ Download my data (JSON)</a></div>
      <div class="card"><h3>Directory visibility</h3><p class="muted">Currently: <b>${me.directory_visible ? 'Visible' : 'Hidden'}</b> in the educator directory. Change this on the Profile tab.</p></div></div>
      <div class="card"><h3 data-s="color:var(--brick)">Delete account</h3><p class="muted">Permanently removes your profile, learning record, messages, posts and plans. This cannot be undone.</p>
        <form data-form="delete-account"><div class="form-error"></div><div class="field"><label>Confirm with your password</label><input name="password" type="password" required autocomplete="current-password"></div><button class="btn danger">Delete my account</button></form></div></div>`;
    return html`${head}${t}<div class="cols"><div class="card"><form data-form="profile"><div class="form-error"></div>
      <div class="grid-2"><div class="field"><label>Full name</label><input name="name" required minlength="2" maxlength="80" value="${me.name}"></div>
        <div class="field"><label>Designation</label><input name="designation" maxlength="80" value="${me.designation}"></div>
        <div class="field"><label>School / Institution</label><input name="school" maxlength="120" value="${me.school}"></div>
        <div class="field"><label>Subjects</label><input name="subjects" maxlength="120" value="${me.subjects}"></div>
        <div class="field"><label>Grades taught</label><input name="grades" maxlength="40" value="${me.grades}" placeholder="e.g. 6–8"></div>
        <div class="field"><label>Board</label><select name="board">${['', 'CBSE', 'ICSE / ISC', 'State Board', 'IB', 'Cambridge (IGCSE)', 'NIOS', 'Other'].map(b => html`<option value="${b}" ${me.board === b ? 'selected' : ''}>${b || '— Select —'}</option>`)}</select></div>
        <div class="field"><label>City</label><input name="city" maxlength="60" value="${me.city}"></div>
        <div class="field"><label>State</label><input name="state" maxlength="60" value="${me.state}"></div>
        <div class="field"><label>Years of experience</label><input name="experience_years" type="number" min="0" max="60" value="${me.experience_years}"></div></div>
      <div class="field"><label>Short bio</label><textarea name="bio" maxlength="600">${me.bio}</textarea></div>
      <label class="check"><input type="checkbox" name="open_to_mentor" ${me.open_to_mentor ? 'checked' : ''}> I'm open to mentoring other educators</label>
      <label class="check"><input type="checkbox" name="directory_visible" ${me.directory_visible ? 'checked' : ''}> Show me in the educator directory</label>
      <button class="btn" data-s="margin-top:1rem">Save profile</button></form></div>
      <div class="card person"><span class="avatar lg">${initials(me.name)}</span><div class="who"><b>${me.name}</b><small>${me.email}</small><div class="meta"><span class="tag ${me.role === 'admin' ? 'red' : me.role === 'mentor' ? 'gold' : 'green'}">${me.role}</span><span>Member since ${fmtDate(me.created_at)}</span></div></div></div></div>`;
  }, { nav: 'profile', title: 'Profile' });
  forms.profile = async (d) => { await api('PUT', '/api/profile', d); toast('Profile saved.'); render(); };
  forms.password = async (d, f) => { if (d.confirm !== undefined && d.next !== d.confirm) throw new Error('New passwords do not match.'); await api('POST', '/api/auth/password', { current:d.current,next:d.next }); f.reset(); toast('Password updated. Other sessions signed out.'); render(); };
  actions['logout-others'] = async () => { const r = await api('POST', '/api/auth/logout-others'); toast(`Signed out ${plural(r.revoked, 'other session')}.`); render(); };
  forms['delete-account'] = async (d) => {
    if (!confirm('This permanently deletes your TeachersInn account and data. Continue?')) return;
    await api('POST', '/api/profile/delete', d); state.me = null; location.hash = '#/'; render(); toast('Your account has been deleted.');
  };

  // ====================================================================== ADMIN
  on(/^\/admin(?:\/(users|tickets|attendance|content|audit|analytics|courses|workshops|jobs|community|mentorship))?$/, async (m, q) => {
    if (state.me.role !== 'admin') return html`<div class="card">${empty('⛨', 'Administrators only.')}</div>`;
    const tab = m[1] || '';
    const head = pageHead('Administrator Dashboard', `Welcome, ${state.me.name}. Monitor TeachersInn and manage supported platform operations.`);
    const t = html`<nav class="admin-nav" aria-label="Administrator sections"><span>Overview</span><a class="${!tab?'on':''}" href="#/admin">Dashboard</a><a class="${tab==='analytics'?'on':''}" href="#/admin/analytics">Analytics</a><span>Management</span><a class="${tab==='users'?'on':''}" href="#/admin/users">Teachers</a><a class="${tab==='courses'?'on':''}" href="#/admin/courses">Courses</a><a class="${tab==='workshops'?'on':''}" href="#/admin/workshops">Workshops</a><a class="${tab==='attendance'?'on':''}" href="#/admin/attendance">Attendance</a><a class="${tab==='jobs'?'on':''}" href="#/admin/jobs">Jobs</a><a class="${tab==='community'?'on':''}" href="#/admin/community">Community</a><span>Operations</span><a class="${tab==='tickets'?'on':''}" href="#/admin/tickets">Support</a><a class="${tab==='mentorship'?'on':''}" href="#/admin/mentorship">Mentorship</a><a class="${tab==='audit'?'on':''}" href="#/admin/audit">Audit log</a></nav>`;
    if (tab === 'analytics') { const period = ['7','30','all'].includes(q.get('period')) ? q.get('period') : '30'; const a = await api('GET', `/api/admin/analytics?period=${period}`); const metrics = [['Course enrollments',a.enrollments,'✦'],['Course completions',a.completions,'✓'],['Certificates issued',a.certificates,'✪'],['Workshop registrations',a.workshopRegistrations,'◷'],['Verified attendance',a.attended,'✓'],['Discussions',a.discussions,'❝'],['Replies',a.replies,'↩'],['Jobs published',a.jobs,'⚑'],['Applications',a.applications,'▣'],['Connections',a.connections,'⚇'],['Accepted connections',a.acceptedConnections,'✓']]; return html`${head}${t}<section class="card admin-toolbar"><div><h2>Platform analytics</h2><p>Metrics use persisted platform records only.</p></div><nav class="chips" aria-label="Analytics period">${[['7','Last 7 days'],['30','Last 30 days'],['all','All time']].map(([v,l])=>html`<a class="chip ${period===v?'on':''}" href="#/admin/analytics?period=${v}">${l}</a>`)}</nav></section><div class="admin-metrics">${metrics.map(([l,n,i])=>html`<article class="stat"><span class="admin-stat-icon">${i}</span><div class="n">${n}</div><div class="l">${l}</div></article>`)}</div>`; }
    if (tab === 'courses') { const courses=await api('GET','/api/admin/courses'); const search=(q.get('q')||'').toLowerCase(),status=q.get('status')||''; const shown=courses.filter(c=>(!search||`${c.title} ${c.category} ${c.instructor}`.toLowerCase().includes(search))&&(!status||c.status===status)); return html`${head}${t}<div class="admin-section-head"><div><h2>Course management</h2><p>Create drafts, manage curriculum and publish learning safely.</p></div><button class="btn" data-action="new-course">+ Create course</button></div>
      <form class="card admin-filters" data-form="admin-course-search"><input name="q" value="${q.get('q')||''}" aria-label="Search courses" placeholder="Search title, category or instructor"><select name="status" aria-label="Filter course status"><option value="">All statuses</option>${['draft','published','archived'].map(v=>html`<option value="${v}" ${status===v?'selected':''}>${v}</option>`)}</select><button class="btn">Filter</button><a class="btn ghost" href="#/admin/courses">Reset</a></form>
      <div class="card table-wrap"><table><thead><tr><th>Course</th><th>Category</th><th>Lessons</th><th>CPD</th><th>Enrollments</th><th>Status</th><th>Actions</th></tr></thead><tbody>${shown.map(c=>html`<tr><td><b>${c.title}</b><br><small>${c.instructor}</small></td><td>${c.category}<br><small>${c.level}</small></td><td>${c.lessons}</td><td>${c.cpd_hours} hours</td><td>${c.enrollments}</td><td><span class="tag ${c.status==='published'?'green':c.status==='archived'?'red':'gold'}">${c.status}</span></td><td><a class="btn sm" href="#/admin/courses/${c.id}">Edit</a>${c.published?html` <a class="btn link sm" href="#/course/${c.id}">Preview</a>`:''}</td></tr>`)}</tbody></table>${shown.length?'':empty('✦','No courses match these filters.',html`<button class="btn sm" data-action="new-course">Create course</button>`)}</div>`; }
    if (tab === 'workshops') { const workshops=await api('GET','/api/admin/workshops'); return html`${head}${t}<div class="admin-section-head"><div><h2>Workshop management</h2><p>Review schedules, registrations and verified attendance.</p></div><button class="btn" data-action="new-workshop">+ Schedule workshop</button></div><div class="admin-record-grid">${workshops.map(w=>html`<article class="card admin-record"><span class="tag blue">${w.mode}</span><h2><a href="#/workshop/${w.id}">${w.title}</a></h2><p>${fmtDT(w.starts_at)} · ${w.cpd_hours} CPD hours</p><div class="admin-record-stats"><span><b>${w.registrations}</b> registered</span><span><b>${w.attended}</b> attended</span><span><b>${w.pending}</b> pending</span></div><a class="btn sm ghost" href="#/admin/attendance?workshop=${w.id}">Manage attendance</a></article>`)}</div>${workshops.length?'':html`<div class="card">${empty('◷','No workshops are available.')}</div>`}`; }
    if (tab === 'jobs') { const jobs=await api('GET','/api/admin/jobs'); return html`${head}${t}<div class="admin-section-head"><div><h2>Job management</h2><p>Manage verified listings and review aggregate application counts.</p></div><button class="btn" data-action="new-job">+ Post job</button></div><div class="card table-wrap"><table><thead><tr><th>Role</th><th>Organization</th><th>Details</th><th>Posted</th><th>Applications</th><th>Status</th></tr></thead><tbody>${jobs.map(j=>html`<tr><td><a href="#/job/${j.id}"><b>${j.title}</b></a></td><td>${j.school}<br><small>${j.city}</small></td><td>${j.subject||'—'} · ${j.job_type}</td><td>${fmtDate(j.created_at)}</td><td>${j.applications}</td><td><span class="tag ${j.status==='open'?'green':'red'}">${j.status}</span>${j.status==='open'?html`<button class="btn link sm" data-action="close-job" data-id="${j.id}">Close</button>`:''}</td></tr>`)}</tbody></table>${jobs.length?'':empty('⚑','No job listings are available.')}</div>`; }
    if (tab === 'community') { const posts=await api('GET','/api/admin/discussions'); return html`${head}${t}<div class="admin-section-head"><div><h2>Community moderation</h2><p>Review discussions and use existing audited moderation controls.</p></div><a class="btn ghost" href="#/community">Open community</a></div><div class="card table-wrap"><table><thead><tr><th>Discussion</th><th>Author</th><th>Category</th><th>Created</th><th>Replies</th><th>Action</th></tr></thead><tbody>${posts.map(p=>html`<tr><td><a href="#/post/${p.id}"><b>${p.title}</b></a></td><td>${p.author}</td><td>${p.category}</td><td>${fmtDate(p.created_at)}</td><td>${p.replies}</td><td><button class="btn link sm" data-action="delete-post" data-id="${p.id}">Remove</button></td></tr>`)}</tbody></table>${posts.length?'':empty('❝','No discussions are available.')}</div>`; }
    if (tab === 'mentorship') { const rows=await api('GET','/api/admin/mentorships'); return html`${head}${t}<div class="admin-section-head"><div><h2>Mentorship activity</h2><p>Relationship status only; private mentorship messages are not exposed.</p></div></div><div class="card table-wrap"><table><thead><tr><th>Topic</th><th>Mentee</th><th>Mentor</th><th>Requested</th><th>Status</th></tr></thead><tbody>${rows.map(x=>html`<tr><td>${x.topic}</td><td>${x.mentee}</td><td>${x.mentor}</td><td>${fmtDate(x.created_at)}</td><td><span class="tag">${x.status}</span></td></tr>`)}</tbody></table>${rows.length?'':empty('♡','No mentorship relationships are available.')}</div>`; }
    if (tab === 'users') {
      const qv = q.get('q') || '', role=q.get('role')||'', status=q.get('status')||'', recent=q.get('recent')==='1'; const params=new URLSearchParams({q:qv,role,status}); if(recent)params.set('recent','1'); const users = await api('GET', `/api/admin/users?${params}`);
      return html`${head}${t}<form data-form="admin-user-search" class="card admin-filters"><input name="q" value="${qv}" aria-label="Search teachers" placeholder="Search name, email or school"><select name="role" aria-label="Filter role"><option value="">All roles</option>${['educator','mentor','admin'].map(v=>html`<option ${role===v?'selected':''}>${v}</option>`)}</select><select name="status" aria-label="Filter account status"><option value="">All statuses</option>${['active','suspended'].map(v=>html`<option ${status===v?'selected':''}>${v}</option>`)}</select><label class="check"><input type="checkbox" name="recent" ${recent?'checked':''}> Joined in 30 days</label><button class="btn">Search</button><a class="btn ghost" href="#/admin/users">Reset</a></form>
        <div class="card table-wrap"><table><thead><tr><th>Member</th><th>School</th><th>Joined</th><th>Last sign-in</th><th>Role</th><th>Status</th></tr></thead><tbody>
        ${users.map(u => html`<tr><td><a href="#/admin/users/${u.id}"><b>${u.name}</b></a><br><small>${u.email}</small><br><small>${u.profile_completion}% profile</small>${u.locked ? html`<br><span class="tag red">Locked</span> <button class="btn link" data-action="admin-unlock" data-id="${u.id}">Unlock</button>` : ''}</td><td>${u.school||'—'}<br><small>${u.city}</small></td><td>${fmtDate(u.created_at)}</td><td>${u.last_login_at ? ago(u.last_login_at) : '—'}</td>
          <td>${u.id === state.me.id ? u.role : html`<select data-change="admin-role" data-id="${u.id}">${['educator', 'mentor', 'admin'].map(r => html`<option ${u.role === r ? 'selected' : ''}>${r}</option>`)}</select>`}</td>
          <td>${u.id === state.me.id ? u.status : html`<select data-change="admin-status" data-id="${u.id}">${['active', 'suspended'].map(r => html`<option ${u.status === r ? 'selected' : ''}>${r}</option>`)}</select>`}</td></tr>`)}
        </tbody></table>${users.length?'':empty('⚇','No teachers match these filters.')}</div>`;
    }
    if (tab === 'tickets') {
      const status=q.get('status')||'', qv=q.get('q')||''; const tickets = await api('GET', `/api/admin/tickets?status=${encodeURIComponent(status)}&q=${encodeURIComponent(qv)}`);
      return html`${head}${t}<form class="card admin-filters" data-form="admin-ticket-filter"><input name="q" value="${qv}" aria-label="Search support tickets" placeholder="Search subject or requester"><select name="status" aria-label="Filter ticket status"><option value="">All statuses</option>${['open','in_progress','resolved','closed'].map(v=>html`<option value="${v}" ${status===v?'selected':''}>${v.replace('_',' ')}</option>`)}</select><button class="btn">Filter</button><a class="btn ghost" href="#/admin/tickets">Reset</a></form><div class="card table-wrap"><table><thead><tr><th>#</th><th>Subject</th><th>From</th><th>Updated</th><th>Priority</th><th>Status</th></tr></thead><tbody>
        ${tickets.map(x => html`<tr><td>${x.id}</td><td><a href="#/ticket/${x.id}">${x.subject}</a><br><small>${x.category}</small></td><td>${x.requester}<br><small>${x.email}</small></td><td>${ago(x.updated_at)}</td>
          <td><select data-change="admin-ticket" data-field="priority" data-id="${x.id}">${['low', 'normal', 'high'].map(s => html`<option ${x.priority === s ? 'selected' : ''}>${s}</option>`)}</select></td>
          <td><select data-change="admin-ticket" data-field="status" data-id="${x.id}">${['open', 'in_progress', 'resolved', 'closed'].map(s => html`<option value="${s}" ${x.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`)}</select></td></tr>`)}
        </tbody></table>${tickets.length ? '' : empty('♡', qv||status?'No support tickets match these filters.':'No support tickets are available.')}</div>`;
    }
    if (tab === 'attendance') {
      const workshops = await api('GET', '/api/admin/workshops');
      const selectedId = q.get('workshop') || String(workshops[0]?.id || '');
      const status = ['pending', 'attended', 'absent'].includes(q.get('status')) ? q.get('status') : '';
      const search = q.get('q') || '';
      const selected = workshops.find(w => String(w.id) === selectedId);
      const params = new URLSearchParams(); if (status) params.set('status', status); if (search) params.set('q', search);
      const registrations = selected ? await api('GET', `/api/admin/workshops/${selected.id}/registrations${params.toString() ? `?${params}` : ''}`) : [];
      return html`${head}${t}<div class="admin-section-head"><div><h2>Workshop attendance</h2><p>Verify attendance only after a workshop has ended.</p></div></div>
        <section class="card attendance-controls"><div class="attendance-select"><label for="attendance-workshop">Workshop</label><select id="attendance-workshop" data-change="attendance-workshop">${workshops.map(w => html`<option value="${w.id}" ${String(w.id) === selectedId ? 'selected' : ''}>${w.title} · ${fmtDate(w.starts_at)}</option>`)}</select></div>
          ${selected ? html`<div class="attendance-summary" aria-label="Attendance summary"><div><b>${selected.registrations}</b><span>Registered</span></div><div><b>${selected.pending}</b><span>Pending</span></div><div><b>${selected.attended}</b><span>Attended</span></div><div><b>${selected.absent}</b><span>Absent</span></div></div>` : ''}</section>
        ${selected ? html`<form class="card attendance-filters" data-form="admin-attendance-filter"><input type="hidden" name="workshop" value="${selected.id}"><label class="sr-only" for="attendance-q">Search registered teachers</label><input id="attendance-q" name="q" value="${search}" placeholder="Search teacher name or email"><select name="status" aria-label="Filter attendance status"><option value="">All statuses</option>${['pending', 'attended', 'absent'].map(value => html`<option value="${value}" ${status === value ? 'selected' : ''}>${value[0].toUpperCase() + value.slice(1)}</option>`)}</select><button class="btn">Filter</button><a class="btn ghost" href="#/admin/attendance?workshop=${selected.id}">Reset</a></form>
          <div class="card table-wrap attendance-table"><table><thead><tr><th>Teacher</th><th>Registered</th><th>Workshop</th><th>Status</th><th>Verified</th><th>Administrator action</th></tr></thead><tbody>${registrations.map(r => html`<tr><td data-label="Teacher"><b>${r.name}</b><br><small>${r.email}</small></td><td data-label="Registered">${fmtDT(r.registered_at)}</td><td data-label="Workshop"><b>${r.workshop_title}</b><br><small>${fmtDT(r.starts_at)}</small></td><td data-label="Status"><span class="tag ${r.attendance_status === 'attended' ? 'green' : r.attendance_status === 'absent' ? 'red' : 'gold'}">${r.attendance_status}</span></td><td data-label="Verified">${r.attendance_verified_at ? fmtDT(r.attendance_verified_at) : '—'}</td><td data-label="Action"><select aria-label="Attendance for ${r.name}" data-change="admin-attendance" data-workshop="${r.workshop_id}" data-registration="${r.registration_id}" data-current="${r.attendance_status}">${['pending', 'attended', 'absent'].map(value => html`<option value="${value}" ${r.attendance_status === value ? 'selected' : ''}>${value[0].toUpperCase() + value.slice(1)}</option>`)}</select></td></tr>`)}</tbody></table>${registrations.length ? '' : empty('◷', search || status ? 'No registrations match these filters.' : 'No teachers have registered for this workshop.')}</div>` : html`<div class="card">${empty('◷', 'No workshops are available for attendance management.')}</div>`}`;
    }
    if (tab === 'content') return html`${head}${t}<div class="cards">
      <div class="card"><h3>Courses</h3><p class="muted">Publish a new self-paced course with lessons and CPD hours.</p><button class="btn sm" data-action="new-course">+ New course</button></div>
      <div class="card"><h3>Workshops</h3><p class="muted">Schedule live or in-person sessions.</p><button class="btn sm" data-action="new-workshop">+ New workshop</button></div>
      <div class="card"><h3>Jobs</h3><p class="muted">Post verified teaching opportunities.</p><button class="btn sm" data-action="new-job">+ Post a job</button></div></div>`;
    if (tab === 'audit') {
      const qv=q.get('q')||'', page=q.get('page')||'1'; const log = await api('GET', `/api/admin/audit-log?q=${encodeURIComponent(qv)}&page=${page}`);
      return html`${head}${t}<form class="card admin-filters" data-form="admin-audit-search"><input name="q" value="${qv}" aria-label="Search audit records" placeholder="Search action, detail or administrator"><button class="btn">Search</button>${qv?html`<a class="btn ghost" href="#/admin/audit">Reset</a>`:''}</form><div class="card table-wrap"><table><thead><tr><th>When</th><th>Event</th><th>Administrator / user</th><th>Detail</th><th>IP</th></tr></thead><tbody>
        ${log.items.map(a => html`<tr><td>${fmtDT(a.created_at)}</td><td><span class="tag ${/fail|lock|denied|suspend/.test(a.action) ? 'red' : /admin/.test(a.action) ? 'gold' : ''}">${a.action}</span></td><td>${a.name || 'System'}<br><small>${a.email || ''}</small></td><td>${a.detail || '—'}</td><td><small>${a.ip || '—'}</small></td></tr>`)}
        </tbody></table>${log.items.length?'':empty('⛨','No audit records match this search.')}</div>${log.pages>1?html`<nav class="pagination" aria-label="Audit pages">${log.page>1?html`<a class="btn ghost sm" href="#/admin/audit?q=${encodeURIComponent(qv)}&page=${log.page-1}">← Newer</a>`:''}<span>Page ${log.page} of ${log.pages}</span>${log.page<log.pages?html`<a class="btn ghost sm" href="#/admin/audit?q=${encodeURIComponent(qv)}&page=${log.page+1}">Older →</a>`:''}</nav>`:''}`;
    }
    const o = await api('GET', '/api/admin/overview');
    const maxS = Math.max(1, ...o.signups.map(s => s.n));
    const overviewMetrics=[['Registered teachers',o.teachers,'⚇'],['Courses',o.courses,'✦'],['Course enrollments',o.enrollments,'✓'],['Workshops',o.workshops,'◷'],['Workshop registrations',o.workshopRegs,'▣'],['Published jobs',o.jobs,'⚑'],['Job applications',o.applications,'▤'],['Community discussions',o.posts,'❝'],['Support tickets',o.tickets,'♡']];
    return html`${head}${t}<section class="admin-welcome card"><div><span class="eyebrow">Platform operations</span><h2>TeachersInn at a glance</h2><p>Real activity from the current SQLite platform records.</p></div><span>${new Date().toLocaleDateString('en-IN',{dateStyle:'long',timeZone:TZ})}</span></section><div class="admin-metrics">${overviewMetrics.map(([l,n,i])=>html`<article class="stat"><span class="admin-stat-icon">${i}</span><div class="n">${n}</div><div class="l">${l}</div></article>`)}</div><section class="card admin-quick"><div class="card-head"><div><span class="section-kicker">Quick actions</span><h2>Platform management</h2></div></div><div>${[['#/admin/users','Manage teachers'],['#/admin/courses','Manage courses'],['#/admin/workshops','Manage workshops'],['#/admin/attendance','Review attendance'],['#/admin/jobs','Manage jobs'],['#/admin/community','Moderate community'],['#/admin/tickets','Review support'],['#/admin/audit','View audit log']].map(([h,l])=>html`<a class="btn ghost" href="${h}">${l}</a>`)}</div></section>
      <div class="cols"><div class="card"><h3>Sign-ups, last 30 days</h3>${o.signups.length ? html`<div class="bars">${o.signups.map(s => html`<div class="bar"><b>${s.n}</b><i data-h="${s.n / maxS * 85}"></i><small class="muted">${s.d.slice(5)}</small></div>`)}</div>` : html`<p class="muted">No sign-ups in this period.</p>`}</div>
        <div><div class="card"><h3>Security</h3><p><b class="${o.failedLogins24h > 20 ? '' : ''}">${o.failedLogins24h}</b> failed sign-ins in 24h</p><a href="#/admin/audit">View security log →</a></div>
        <div class="card"><h3>Popular courses</h3><ul class="list">${o.popularCourses.map(c => html`<li class="row between"><span>${c.title}</span><b>${c.n}</b></li>`)}</ul></div></div></div>`;
  }, { nav: 'admin', title: 'Admin' });
  on(/^\/admin\/courses\/(\d+)$/, async (m) => {
    if(state.me.role!=='admin') return html`<div class="card">${empty('⛨','Administrators only.')}</div>`;
    const data=await api('GET',`/api/admin/courses/${m[1]}`),c=data.course;
    const lessonText=data.lessons.map(l=>`${l.title}\nMinutes: ${l.minutes}\n${l.body}`).join('\n---\n');
    const locked=Number(data.history.enrollments)>0;
    return html`<a class="back-link" href="#/admin/courses">← Course management</a>${pageHead('Edit course', 'Manage details, curriculum and publication without changing learning history.')}
      <section class="card course-editor-status"><div><span class="tag ${c.status==='published'?'green':c.status==='archived'?'red':'gold'}">${c.status}</span><h2>${c.title}</h2><p>${data.lessons.length} lessons · ${data.history.enrollments||0} enrollments · ${data.history.certificates||0} certificates</p></div><div class="row">${c.status!=='published'?html`<button class="btn" data-action="course-status" data-id="${c.id}" data-status="published">Publish</button>`:html`<button class="btn ghost" data-action="course-status" data-id="${c.id}" data-status="draft">Unpublish</button>`}<button class="btn ghost" data-action="course-status" data-id="${c.id}" data-status="archived">Archive</button>${c.published?html`<a class="btn link" href="#/course/${c.id}">Teacher preview</a>`:''}</div></section>
      <div class="course-editor-grid"><form class="card" data-form="admin-course-details" data-id="${c.id}"><div class="form-error" role="alert"></div><h2>Course details</h2>
        <div class="field"><label>Course title</label><input name="title" value="${c.title}" required minlength="5" maxlength="150"></div><div class="grid-2"><div class="field"><label>Category</label><input name="category" value="${c.category}" required maxlength="60"></div><div class="field"><label>Difficulty</label><select name="level">${['Beginner','Intermediate','Advanced'].map(v=>html`<option ${c.level===v?'selected':''}>${v}</option>`)}</select></div><div class="field"><label>Instructor</label><input name="instructor" value="${c.instructor}" required maxlength="80"></div><div class="field"><label>CPD hours</label><input name="cpd_hours" type="number" min="0" max="100" value="${c.cpd_hours}"></div><div class="field"><label>Estimated duration (minutes)</label><input name="estimated_minutes" type="number" min="0" max="100000" value="${c.estimated_minutes}"></div><div class="field"><label>Thumbnail URL</label><input name="thumbnail" type="url" maxlength="500" value="${c.thumbnail}"></div></div>
        <div class="field"><label>Short description</label><textarea name="summary" required minlength="20" maxlength="600">${c.summary}</textarea></div><div class="field"><label>Detailed description</label><textarea name="description" required minlength="20" maxlength="8000">${c.description}</textarea></div><div class="field"><label>Learning objectives</label><textarea name="objectives" maxlength="3000">${c.objectives}</textarea></div><div class="field"><label>Prerequisites</label><textarea name="prerequisites" maxlength="2000">${c.prerequisites}</textarea></div><button class="btn">Save course details</button></form>
        <form class="card" data-form="admin-course-lessons" data-id="${c.id}"><div class="form-error" role="alert"></div><h2>Curriculum</h2><p class="muted">Reorder lesson blocks to change sequence. Each block uses title, optional <code>Minutes: 20</code>, then plain-text lesson content.</p>${locked?html`<div class="notice">Curriculum replacement is locked because teachers have enrolled. Details and publication status remain editable; archive instead of deleting learning history.</div>`:''}<div class="field"><label>Lesson blocks</label><textarea name="lessons" rows="22" ${locked?'disabled':''}>${lessonText}</textarea></div><button class="btn" ${locked?'disabled':''}>Save curriculum</button></form></div>`;
  }, {nav:'admin',title:'Edit Course'});
  on(/^\/admin\/users\/(\d+)$/, async (m) => { if(state.me.role!=='admin') return html`<div class="card">${empty('⛨','Administrators only.')}</div>`; const u=await api('GET',`/api/admin/users/${m[1]}`); return html`<a class="back-link" href="#/admin/users">← Teacher directory</a>${pageHead('Teacher account', 'Administrative account overview. Private messages, lesson plans and CV content are not exposed.')}<div class="admin-profile-layout"><article class="card"><span class="avatar lg">${initials(u.name)}</span><h1>${u.name}</h1><p>${u.designation||'Educator'} · ${u.school||'School not provided'}</p><dl class="admin-profile-facts"><div><dt>Email</dt><dd>${u.email}</dd></div><div><dt>Role</dt><dd>${u.role}</dd></div><div><dt>Status</dt><dd>${u.status}</dd></div><div><dt>Joined</dt><dd>${fmtDate(u.created_at)}</dd></div><div><dt>Location</dt><dd>${[u.city,u.state].filter(Boolean).join(', ')||'Not provided'}</dd></div><div><dt>Directory</dt><dd>${u.directory_visible?'Visible':'Hidden'}</dd></div></dl></article><aside class="card"><h2>Supported activity totals</h2><ul class="list"><li class="row between"><span>Course enrollments</span><b>${u.enrollments}</b></li><li class="row between"><span>Course completions</span><b>${u.completions}</b></li><li class="row between"><span>Workshop registrations</span><b>${u.workshops}</b></li><li class="row between"><span>Accepted connections</span><b>${u.connections}</b></li></ul></aside></div>`; }, {nav:'admin',title:'Teacher Account'});
  forms['admin-user-search'] = (d) => { const p=new URLSearchParams(); for(const k of ['q','role','status'])if(String(d[k]||'').trim())p.set(k,String(d[k]).trim()); if(d.recent)p.set('recent','1'); location.hash = `#/admin/users${p.toString()?`?${p}`:''}`; };
  forms['admin-course-search'] = (d) => { const p=new URLSearchParams(); if(d.q.trim())p.set('q',d.q.trim());if(d.status)p.set('status',d.status);location.hash=`#/admin/courses${p.toString()?`?${p}`:''}`; };
  forms['admin-audit-search'] = (d) => { location.hash=`#/admin/audit${d.q.trim()?`?q=${encodeURIComponent(d.q.trim())}`:''}`; };
  forms['admin-ticket-filter'] = (d) => { const p=new URLSearchParams(); if(d.q.trim())p.set('q',d.q.trim()); if(d.status)p.set('status',d.status); location.hash=`#/admin/tickets${p.toString()?`?${p}`:''}`; };
  forms['admin-attendance-filter'] = (d) => { const p = new URLSearchParams({ workshop: d.workshop }); if (d.q) p.set('q', d.q); if (d.status) p.set('status', d.status); location.hash = `#/admin/attendance?${p}`; };
  actions['admin-unlock'] = async (el) => { await api('POST', `/api/admin/users/${el.dataset.id}`, { unlock: true }); toast('Account unlocked.'); render(); };
  document.addEventListener('change', async (ev) => {
    const el = ev.target.closest('[data-change]'); if (!el) return;
    try {
      if (el.dataset.change === 'theme') { applyTheme(el.value); return; }
      if (el.dataset.change === 'settings-theme') { applyTheme(el.value); await render(); return; }
      if (el.dataset.change === 'color-mode') { applyColorMode(el.value); await render(); return; }
      if (el.dataset.change === 'notification-category') { const q = new URLSearchParams(location.hash.split('?')[1] || ''); q.set('category', el.value); q.delete('page'); location.hash = `#/notifications?${q}`; return; }
      if (el.dataset.change === 'admin-role') await api('POST', `/api/admin/users/${el.dataset.id}`, { role: el.value });
      if (el.dataset.change === 'admin-status') { if (el.value === 'suspended' && !confirm('Suspend this member? They will be signed out immediately.')) { render(); return; } await api('POST', `/api/admin/users/${el.dataset.id}`, { status: el.value }); }
      if (el.dataset.change === 'admin-ticket') await api('POST', `/api/admin/tickets/${el.dataset.id}`, { [el.dataset.field]: el.value });
      if (el.dataset.change === 'attendance-workshop') { location.hash = `#/admin/attendance?workshop=${el.value}`; return; }
      if (el.dataset.change === 'admin-attendance') {
        if (el.dataset.current === 'attended' && el.value !== 'attended' && !confirm('This will revoke verified workshop CPD for this teacher. Continue?')) { render(); return; }
        await api('POST', `/api/admin/workshops/${el.dataset.workshop}/registrations/${el.dataset.registration}/attendance`, { status: el.value });
      }
      toast('Saved.');
    } catch (e) { toast(e.message, true); render(); }
  });
  const courseLessonsFromText = (value) => String(value||'').split(/^\s*---\s*$/m).map(b=>b.trim()).filter(Boolean).map(block=>{const lines=block.split('\n'),title=lines.shift().trim();let minutes=10;if(/^Minutes:\s*\d+$/i.test(lines[0]||''))minutes=Number(lines.shift().split(':')[1]);return{title,minutes,body:lines.join('\n').trim()};});
  actions['new-course'] = () => openModal('Create course draft', html`<form data-form="new-course"><div class="form-error"></div>
    <div class="field"><label>Title</label><input name="title" required minlength="5" maxlength="150"></div>
    <div class="grid-2"><div class="field"><label>Category</label><input name="category" required maxlength="60"></div><div class="field"><label>Level</label><select name="level"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div>
      <div class="field"><label>Instructor</label><input name="instructor" required maxlength="80"></div><div class="field"><label>CPD hours</label><input name="cpd_hours" type="number" min="0" max="100" value="2"></div><div class="field"><label>Estimated duration (minutes)</label><input name="estimated_minutes" type="number" min="0" max="100000" value="0"></div><div class="field"><label>Thumbnail URL</label><input name="thumbnail" type="url" maxlength="500"></div></div>
    <div class="field"><label>Short description</label><textarea name="summary" required minlength="20" maxlength="600"></textarea></div><div class="field"><label>Detailed description</label><textarea name="description" required minlength="20" maxlength="8000"></textarea></div><div class="field"><label>Learning objectives</label><textarea name="objectives" maxlength="3000" placeholder="One objective per line"></textarea></div><div class="field"><label>Prerequisites</label><textarea name="prerequisites" maxlength="2000"></textarea></div>
    <div class="field"><label>Initial lessons (optional for drafts)</label><textarea name="lessons" rows="10" placeholder="Lesson title&#10;Minutes: 20&#10;Plain-text lesson content&#10;---&#10;Next lesson title&#10;Content…"></textarea><div class="hint">Separate lessons with a line containing only <code>---</code>.</div></div>
    <div class="field"><label>Initial status</label><select name="status"><option value="draft">Save as draft</option><option value="published">Publish now (requires a lesson)</option></select></div><button class="btn">Create course</button></form>`);
  forms['new-course'] = async (d) => {
    d.lessons = courseLessonsFromText(d.lessons);
    const r = await api('POST', '/api/admin/courses', d); closeModal(); toast(r.status==='published'?'Course published.':'Course draft created.'); location.hash = `#/admin/courses/${r.id}`;
  };
  forms['admin-course-details'] = async (d,f) => { await api('PUT',`/api/admin/courses/${f.dataset.id}`,d);toast('Course details saved.');render(); };
  forms['admin-course-lessons'] = async (d,f) => { await api('PUT',`/api/admin/courses/${f.dataset.id}/lessons`,{lessons:courseLessonsFromText(d.lessons)});toast('Curriculum saved.');render(); };
  actions['course-status'] = async (el) => { const label=el.dataset.status;if((label==='archived'||label==='draft')&&!confirm(`${label==='archived'?'Archive':'Unpublish'} this course? Existing learning history will be preserved.`))return;await api('POST',`/api/admin/courses/${el.dataset.id}/status`,{status:label});toast(`Course ${label}.`);render(); };

  // ====================================================================== boot
  (async () => {
    if (location.pathname === '/verify') {
      const code = new URLSearchParams(location.search).get('code');
      history.replaceState(null, '', `/#/verify${code ? `/${encodeURIComponent(code)}` : ''}`);
    }
    try { await loadMe(); } catch { state.me = null; }
    render();
    setInterval(() => { if (state.me && document.visibilityState === 'visible') refreshBadges(); }, 60_000);
  })();
})();
