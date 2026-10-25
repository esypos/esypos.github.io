/* EsyPOS Community (v11.4.0): invites every user to the official Telegram channel.
   Shown in 5 places so nobody misses it: sign-in page, sidebar, mobile menu, Dashboard, and a one-time welcome popup
   (repeats at most once every 7 days until the user taps Join). No tracking: only a local "joined / last seen" flag is stored. */
(function () {
  'use strict';
  const URL_ = 'https://t.me/esypos', HANDLE = '@esypos', KEY = 'esypos_tg';
  const PLANE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3a1.1 1.1 0 0 0-1.1-.2L2.9 11a1.1 1.1 0 0 0 .1 2.1l4.5 1.4 1.7 5.4a1.1 1.1 0 0 0 1.9.4l2.5-2.9 4.5 3.3a1.1 1.1 0 0 0 1.7-.7l3-14.6a1.1 1.1 0 0 0-.4-1.1ZM9.4 13.8l8.2-5.1-6.4 6.5-.3 3-1.5-4.4Z"/></svg>';
  const rd = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } };
  const wr = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) {} };

  function joined() { const s = rd(); s.joined = Date.now(); wr(s); }

  /* variant: 'side' (compact), 'wide' (dashboard banner) */
  function card(v) {
    return `<a class="tg-card tg-${v}" href="${URL_}" target="_blank" rel="noopener noreferrer" data-tg="1" aria-label="Join the EsyPOS Telegram channel">
      <span class="tg-ico">${PLANE}</span>
      <span class="tg-txt"><b>Join our Telegram channel</b><small>Updates, tips &amp; free support · ${HANDLE}</small></span>
      <span class="tg-go">Join <i class="fas fa-arrow-right"></i></span></a>`;
  }

  function insertSide() {
    document.querySelectorAll('.side-foot').forEach(f => {
      if (f.querySelector('.tg-card')) return;
      const t = document.createElement('div'); t.innerHTML = card('side');
      const anchor = f.querySelector('.legal-links'); f.insertBefore(t.firstChild, anchor || null);
    });
  }

  /* Dashboard: add the banner right after the page header, every time the dashboard is drawn */
  function hookDashboard() {
    const V = window.App && App.Views && App.Views.dashboard; if (!V || V._tg) return false; V._tg = 1;
    const r0 = V.render;
    V.render = function () {
      const out = r0.apply(this, arguments);
      try { const v = document.getElementById('view'); const h = v && v.querySelector('.page-head');
        if (h && !v.querySelector('.tg-wide')) h.insertAdjacentHTML('afterend', card('wide')); } catch (_) {}
      return out;
    };
    return true;
  }

  /* Sign-in page: small invite under the Google button (the page is rebuilt on sign-out, so watch for it) */
  function gateInvite() {
    const c = document.querySelector('#welcome .gate-card'); if (!c || c.querySelector('.tg-gate')) return;
    const n = c.querySelector('.consent-note'); const d = document.createElement('div'); d.className = 'tg-gate';
    d.innerHTML = `<a href="${URL_}" target="_blank" rel="noopener noreferrer" data-tg="1">${PLANE}<span>New here? <b>Join our Telegram channel</b> for help &amp; updates</span></a>`;
    c.insertBefore(d, n || null);
  }

  /* One-time (then every 7 days) welcome popup, only when the app is really open: signed in, unlocked, no other dialog */
  function popup() {
    const s = rd(); if (s.joined) return;
    if (s.seen && Date.now() - s.seen < 7 * 864e5) return;
    if (document.getElementById('tg-pop')) return;
    const el = document.createElement('div'); el.id = 'tg-pop'; el.className = 'tg-pop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'tg-h');
    el.innerHTML = `<div class="tg-sheet"><button type="button" class="tg-x" aria-label="Close"><i class="fas fa-xmark"></i></button>
      <div class="tg-hero"><span class="tg-ring">${PLANE.replace('width="22" height="22"', 'width="44" height="44"')}</span></div>
      <h3 id="tg-h">Join the EsyPOS community</h3>
      <p>Get new-feature announcements, business tips and quick help straight from the developer — free, on Telegram.</p>
      <ul><li><i class="fas fa-bell"></i> First to know about updates</li><li><i class="fas fa-life-ring"></i> Ask questions, get fast answers</li><li><i class="fas fa-lightbulb"></i> Suggest features you need</li></ul>
      <a class="btn btn-primary btn-block btn-lg tg-join" href="${URL_}" target="_blank" rel="noopener noreferrer" data-tg="1">${PLANE.replace('width="22" height="22"', 'width="20" height="20"')} Join ${HANDLE}</a>
      <button type="button" class="tg-later">Maybe later</button></div>`;
    const close = () => { s.seen = Date.now(); wr(Object.assign(rd(), { seen: s.seen })); el.classList.add('out'); setTimeout(() => el.remove(), 220); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    el.querySelector('.tg-x').onclick = close; el.querySelector('.tg-later').onclick = close;
    el.addEventListener('click', e => { if (e.target === el) close(); });
    el.querySelector('.tg-join').addEventListener('click', () => { joined(); setTimeout(close, 150); });
    document.addEventListener('keydown', esc);
    document.body.appendChild(el);
    const j = el.querySelector('.tg-join'); try { j.focus({ preventScroll: true }); } catch (_) {}
  }

  const appReady = () => !document.documentElement.classList.contains('needs-login') && !document.getElementById('splash') &&
    !document.getElementById('welcome') && !document.querySelector('.lock, .modal-back, .modal, .ui-confirm-backdrop, .gated');

  function schedule() {
    let tries = 0; const t = setInterval(() => {
      if (++tries > 40) return clearInterval(t);
      if (appReady()) { clearInterval(t); setTimeout(() => { if (appReady()) popup(); }, 2500); }
    }, 1500);
  }

  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[data-tg]'); if (a) joined(); }, true);

  function init() {
    insertSide(); gateInvite();
    if (!hookDashboard()) setTimeout(hookDashboard, 600);
    new MutationObserver(() => { gateInvite(); }).observe(document.body, { childList: true });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.Community = { url: URL_, popup, card };
})();
