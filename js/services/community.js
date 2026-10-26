/* EsyPOS Community (v11.4.1): invites users to the official Telegram channel.
   Shown in two places only: the header (next to Backup) and under the menu. No tracking, no pop-ups. */
(function () {
  'use strict';
  const URL_ = 'https://t.me/esypos', HANDLE = '@esypos';
  /* Telegram logo: round badge with the paper plane */
  const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#2AABEE"/><path fill="#fff" d="M10.9 23.6c7-3.1 11.7-5.1 14-6.1 6.7-2.8 8.1-3.3 9-3.3.2 0 .6 0 .9.3.2.2.3.5.3.7 0 .2 0 .8-.1 1.2-.4 3.8-2 13-2.8 17.3-.4 1.8-1 2.4-1.7 2.5-1.4.1-2.5-.9-3.9-1.8-2.1-1.4-3.3-2.2-5.3-3.5-2.3-1.5-.8-2.3.5-3.7.3-.4 6.5-6 6.6-6.5 0-.1 0-.3-.1-.4-.1-.1-.3-.1-.4-.1-.2 0-3.5 2.2-9.8 6.5-.9.6-1.800.9-2.600.9-.9 0-2.500-.5-3.800-.9-1.500-.5-2.700-.7-2.600-1.600 0-.5.7-1 1.900-1.500z"/></svg>';

  /* 1) Header: round Telegram icon next to the Backup button (phone top bar + desktop title bar) */
  function btn() {
    return `<a class="tg-btn" href="${URL_}" target="_blank" rel="noopener noreferrer" title="EsyPOS on Telegram ${HANDLE}" aria-label="Join the EsyPOS Telegram channel">${LOGO}</a>`;
  }
  /* 2) Menu: one slim row under the menu list (desktop sidebar + phone drawer) */
  function link() {
    return `<a class="tg-link" href="${URL_}" target="_blank" rel="noopener noreferrer" aria-label="Join the EsyPOS Telegram channel"><span class="tg-ico">${LOGO}</span><span class="tg-t">Telegram <small>${HANDLE}</small></span></a>`;
  }
  function fill() {
    document.querySelectorAll('.topbar-actions').forEach(a => { if (!a.querySelector('.tg-btn')) a.insertAdjacentHTML('beforeend', btn()); });
    document.querySelectorAll('.db-tg').forEach(a => { if (!a.querySelector('.tg-btn')) a.innerHTML = btn(); });
    document.querySelectorAll('.side-foot').forEach(f => {
      if (f.querySelector('.tg-link')) return;
      const t = document.createElement('div'); t.innerHTML = link();
      f.insertBefore(t.firstChild, f.querySelector('.legal-links') || null);
    });
  }

  /* Sign-in page: feature chips on phones (the page is rebuilt on sign-out, so watch for it) */
  function gate() {
    const g = document.getElementById('welcome'); if (!g) return;
    const b = g.querySelector('.gate-brand');
    if (b && !b.querySelector('.gate-chips')) { const d = document.createElement('div'); d.className = 'gate-chips';
      d.innerHTML = '<span><i class="fas fa-circle-check"></i> Free</span><span><i class="fas fa-wifi"></i> Works offline</span><span><i class="fas fa-shield-halved"></i> Secure</span>'; b.appendChild(d); }
  }

  function init() {
    fill(); gate();
    new MutationObserver(gate).observe(document.body, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.Community = { url: URL_, fill };
})();
