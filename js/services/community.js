/* Old POS Community (v11.4.1): invites users to the official Telegram channel.
   Shown in two places only: the header (next to Backup) and under the menu. No tracking, no pop-ups. */
(function () {
  'use strict';
  const URL_ = 'https://t.me/old_pos', HANDLE = 'Updates & support';
  /* Telegram logo: round badge with the paper plane */
  const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#2AABEE"/><path fill="#fff" d="M10.6 23.4 34.7 14.1c1.1-.4 2.1.3 1.7 1.9l-4.1 19.300c-.3 1.4-1.1 1.7-2.2 1.1l-6.100-4.500-2.900 2.800c-.3.3-.6.6-1.200.6l.4-6.200 11.300-10.200c.5-.4-.1-.7-.8-.3l-14 8.800-6-1.900c-1.300-.4-1.300-1.300.3-1.900z"/></svg>';

  /* 1) Header: round Telegram icon next to the Backup button (phone top bar + desktop title bar) */
  function btn() {
    return `<a class="tg-btn" href="${URL_}" target="_blank" rel="noopener noreferrer" title="Old POS on Telegram" aria-label="Join the Old POS Telegram channel">${LOGO}</a>`;
  }
  /* 2) Menu: one slim row under the menu list (desktop sidebar + phone drawer) */
  function link() {
    return `<a class="tg-link" href="${URL_}" target="_blank" rel="noopener noreferrer" aria-label="Join the Old POS Telegram channel"><span class="tg-ico">${LOGO}</span><span class="tg-t">Telegram <small>${HANDLE}</small></span></a>`;
  }
  /* 3) Sign-in page: full Telegram join card */
  function card() {
    return `<a class="tg-card" href="${URL_}" target="_blank" rel="noopener noreferrer" aria-label="Join the Old POS Telegram community"><span class="tg-ico">${LOGO}</span><span class="tg-txt"><b>Join our Telegram community</b><small>Updates, support &amp; tips from the Old POS team</small></span><span class="tg-go">Join</span></a>`;
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

  function gate() { document.querySelectorAll('.js-tg-slot').forEach(s => { if (!s.firstElementChild) s.innerHTML = card(); }); }   // sign-in page Telegram card

  function init() {
    fill(); gate();
    new MutationObserver(gate).observe(document.body, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.Community = { url: URL_, fill, card, logo: LOGO };
})();
