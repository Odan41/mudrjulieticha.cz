/* Administrace – editor ordinačních hodin a upozornění.
 * Ukládá soubor data/data.json přímo do GitHub repozitáře (GitHub API).
 * Přístup je chráněn osobním přístupovým klíčem (fine-grained token) s právem zápisu jen do tohoto repozitáře. */
(function () {
  'use strict';

  var CFG = window.ADMIN_CONFIG || {};
  var API = (CFG.apiBase || 'https://api.github.com').replace(/\/$/, '');
  var TOKEN_KEY = 'ticha-admin-token';
  var WEEKDAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek'];
  var ALL_DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
  var STYLES = { info: 'Informace (modrá)', warning: 'Důležité (červená)', success: 'Pozitivní (zelená)' };

  var app = document.getElementById('app');
  var topActions = document.getElementById('topbar-actions');
  var token = null;
  var state = null;   // upravovaná data
  var sha = null;     // verze souboru na GitHubu (ochrana proti přepsání cizí změny)
  var dirty = false;
  var statusEl;

  /* ---------- Pomocné ---------- */

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) e.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function pad(t) { if (!t) return ''; var p = String(t).split(':'); return ('0' + p[0]).slice(-2) + ':' + p[1]; }
  function unpad(t) { var p = String(t).split(':'); return (+p[0]) + ':' + p[1]; }
  function fmtDate(iso) { var p = iso.split('-'); return (+p[2]) + '. ' + (+p[1]) + '. ' + p[0]; }
  function todayIso() { return window.TichaWeb.pragueNow().iso; }
  function store() { try { return window.localStorage; } catch (e) { return null; } }
  function sstore() { try { return window.sessionStorage; } catch (e) { return null; } }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'save-status ' + (kind || '');
  }
  function markDirty() { dirty = true; setStatus('Máte neuložené změny.', 'warn'); }

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // UTF-8 <-> base64 (GitHub API posílá obsah souborů v base64)
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- GitHub API ---------- */

  function gh(method, url, body) {
    return fetch(API + url, {
      method: method,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (json) {
        if (!r.ok) {
          var msg = json && json.message ? json.message : 'HTTP ' + r.status;
          if (r.status === 401) msg = 'Přístupový klíč je neplatný nebo vypršel.';
          else if (r.status === 403) msg = 'Klíč nemá oprávnění zapisovat do repozitáře (' + msg + ').';
          else if (r.status === 404) msg = 'Repozitář nebo soubor nenalezen – zkontrolujte admin/config.js a oprávnění klíče.';
          else if (r.status === 409 || r.status === 422) msg = 'Data mezitím změnil někdo jiný. Obnovte stránku a úpravy zopakujte.';
          var err = new Error(msg); err.status = r.status; throw err;
        }
        return json;
      });
    });
  }

  function contentsUrl() {
    return '/repos/' + encodeURIComponent(CFG.owner) + '/' + encodeURIComponent(CFG.repo) +
      '/contents/' + CFG.path.split('/').map(encodeURIComponent).join('/');
  }

  function loadRemote() {
    return gh('GET', contentsUrl() + '?ref=' + encodeURIComponent(CFG.branch)).then(function (f) {
      sha = f.sha;
      return JSON.parse(b64decode(f.content));
    });
  }

  function saveRemote(data) {
    var json = JSON.stringify(data, null, 2) + '\n';
    return gh('PUT', contentsUrl(), {
      message: 'Úprava webu z administrace (' + new Date().toLocaleString('cs-CZ') + ')',
      content: b64encode(json),
      sha: sha,
      branch: CFG.branch
    }).then(function (res) { sha = res.content && res.content.sha; return data; });
  }

  /* ---------- Přihlášení ---------- */

  function renderLogin(error) {
    topActions.hidden = true;
    app.textContent = '';
    var input = el('input', { type: 'password', autocomplete: 'current-password', required: true, spellcheck: 'false', id: 'token' });
    var remember = el('input', { type: 'checkbox', checked: true });
    var err = el('p', { class: 'err', text: error || '' });
    if (!error) err.hidden = true;
    var btn = el('button', { class: 'btn', type: 'submit' }, ['Přihlásit']);
    var form = el('form', { class: 'stack', onsubmit: function (e) {
      e.preventDefault();
      var t = input.value.trim();
      if (!t) return;
      btn.disabled = true; btn.textContent = 'Ověřuji…';
      login(t, remember.checked).catch(function (e2) {
        btn.disabled = false; btn.textContent = 'Přihlásit';
        err.textContent = e2.message; err.hidden = false;
      });
    } }, [
      el('label', { for: 'token' }, ['Přístupový klíč', input]),
      el('label', { class: 'check' }, [remember, el('span', {}, ['Zapamatovat na tomto zařízení', el('small', { text: 'na cizím počítači nezaškrtávejte' })])]),
      btn
    ]);
    app.appendChild(el('section', { class: 'panel login' }, [
      el('h1', { text: 'Přihlášení' }),
      el('p', { class: 'muted', text: 'Pro úpravu ordinačních hodin a upozornění zadejte přístupový klíč. Klíč se nikam neodesílá kromě GitHubu.' }),
      err, form,
      el('p', { class: 'small' }, [el('a', { href: '../', text: '← zpět na web' })])
    ]));
    if (!CFG.owner || /DOPLNTE/.test(CFG.owner)) {
      app.insertBefore(el('p', { class: 'err', text: 'Administrace není nastavená – doplňte uživatele a repozitář v souboru admin/config.js.' }), app.firstChild);
    }
    input.focus();
  }

  function login(t, remember) {
    token = t;
    return loadRemote().then(function (data) {
      var ls = store(), ss = sstore();
      if (remember && ls) ls.setItem(TOKEN_KEY, t);
      else if (ss) ss.setItem(TOKEN_KEY, t);
      start(data);
    }).catch(function (e) { token = null; throw e; });
  }

  function logout() {
    if (dirty && !confirm('Máte neuložené změny. Opravdu odhlásit?')) return;
    var ls = store(), ss = sstore();
    if (ls) ls.removeItem(TOKEN_KEY);
    if (ss) ss.removeItem(TOKEN_KEY);
    token = null; state = null; dirty = false;
    renderLogin();
  }
  document.getElementById('logout').addEventListener('click', logout);

  /* ---------- Ordinační hodiny ---------- */

  function dayData(name) {
    var d = state.hours.filter(function (h) { return h.day === name; })[0];
    if (!d) { d = { day: name, blocks: [] }; state.hours.push(d); }
    return d;
  }

  function renderHours() {
    var rows = WEEKDAYS.map(function (name) {
      var d = dayData(name);
      var list = el('div', { class: 'blocks' });

      function draw() {
        list.textContent = '';
        if (!d.blocks.length) list.appendChild(el('p', { class: 'muted small', text: 'Zavřeno (bez ordinace)' }));
        d.blocks.forEach(function (b, i) {
          list.appendChild(el('div', { class: 'block-row' }, [
            el('input', { type: 'time', value: pad(b.from), 'aria-label': name + ' od', required: true,
              oninput: function (e) { b.from = e.target.value; markDirty(); } }),
            el('span', { text: '–' }),
            el('input', { type: 'time', value: pad(b.to), 'aria-label': name + ' do', required: true,
              oninput: function (e) { b.to = e.target.value; markDirty(); } }),
            el('input', { type: 'text', value: b.note || '', placeholder: 'poznámka (nepovinné)', class: 'note-input',
              maxlength: 120, 'aria-label': name + ' poznámka',
              oninput: function (e) { b.note = e.target.value; markDirty(); } }),
            el('button', { type: 'button', class: 'icon-btn', title: 'Odebrat čas', 'aria-label': 'Odebrat čas',
              onclick: function () { d.blocks.splice(i, 1); markDirty(); draw(); } }, ['✕'])
          ]));
        });
      }
      draw();

      return el('div', { class: 'day' }, [
        el('div', { class: 'day-name', text: name }),
        list,
        el('button', { type: 'button', class: 'link-btn',
          onclick: function () {
            if (d.blocks.length >= 4) return;
            var last = d.blocks[d.blocks.length - 1];
            d.blocks.push(last ? { from: last.to, to: '', note: '' } : { from: '7:00', to: '12:00', note: '' });
            markDirty(); draw();
          } }, ['+ přidat čas'])
      ]);
    });

    return el('section', { class: 'panel' }, [
      el('h2', { text: 'Ordinační hodiny' }),
      el('p', { class: 'muted small', text: 'Den bez časů se na webu zobrazí jako „zavřeno“. Státní svátky web pozná sám.' }),
      el('div', { class: 'days' }, rows),
      el('label', { class: 'field' }, [
        'Poznámka pod tabulkou hodin',
        el('textarea', { rows: 2, maxlength: 1000, oninput: function (e) { state.hoursNote = e.target.value; markDirty(); } }, [state.hoursNote || ''])
      ]),
      el('label', { class: 'field' }, [
        'Zástup v nepřítomnosti',
        el('input', { type: 'text', value: state.substitute || '', maxlength: 300,
          oninput: function (e) { state.substitute = e.target.value; markDirty(); } })
      ])
    ]);
  }

  /* ---------- Upozornění ---------- */

  function noticeState(n) {
    var today = todayIso();
    if (!n.active) return { text: 'Vypnuto', cls: 'off' };
    if (n.from && today < n.from) return { text: 'Naplánováno od ' + fmtDate(n.from), cls: 'planned' };
    if (n.to && today > n.to) return { text: 'Skončilo ' + fmtDate(n.to), cls: 'off' };
    return { text: 'Zobrazuje se', cls: 'live' };
  }

  function renderNotices() {
    var list = el('div', { class: 'notice-list' });

    function draw() {
      list.textContent = '';
      if (!state.notices.length) list.appendChild(el('p', { class: 'muted', text: 'Žádná upozornění.' }));
      state.notices.forEach(function (n, i) {
        var badge = el('span', { class: 'badge' });
        var preview = el('div', { class: 'preview notice ' + n.style });
        function refresh() {
          var s = noticeState(n);
          badge.textContent = s.text;
          badge.className = 'badge ' + s.cls;
          preview.className = 'preview notice ' + n.style;
          preview.textContent = '';
          preview.appendChild(el('strong', { text: n.title || '(bez nadpisu)' }));
          window.TichaWeb.formatText(n.text, preview);
        }
        function upd(key, val) { n[key] = val; markDirty(); refresh(); }
        function check(key, label, hint) {
          return el('label', { class: 'check' }, [
            el('input', { type: 'checkbox', checked: !!n[key], onchange: function (e) { upd(key, e.target.checked); } }),
            el('span', {}, [label, hint ? el('small', { text: hint }) : null])
          ]);
        }

        var card = el('article', { class: 'notice-card' }, [
          el('div', { class: 'notice-card-head' }, [
            badge,
            el('div', { class: 'row-actions' }, [
              el('button', { type: 'button', class: 'icon-btn', title: 'Posunout nahoru', 'aria-label': 'Posunout nahoru', disabled: i === 0,
                onclick: function () { state.notices.splice(i - 1, 0, state.notices.splice(i, 1)[0]); markDirty(); draw(); } }, ['↑']),
              el('button', { type: 'button', class: 'icon-btn', title: 'Posunout dolů', 'aria-label': 'Posunout dolů', disabled: i === state.notices.length - 1,
                onclick: function () { state.notices.splice(i + 1, 0, state.notices.splice(i, 1)[0]); markDirty(); draw(); } }, ['↓']),
              el('button', { type: 'button', class: 'icon-btn danger', title: 'Smazat', 'aria-label': 'Smazat upozornění',
                onclick: function () {
                  if (confirm('Opravdu smazat upozornění „' + (n.title || '') + '“?')) { state.notices.splice(i, 1); markDirty(); draw(); }
                } }, ['✕'])
            ])
          ]),
          el('label', { class: 'field' }, ['Nadpis',
            el('input', { type: 'text', value: n.title, maxlength: 150, required: true, oninput: function (e) { upd('title', e.target.value); } })]),
          el('label', { class: 'field' }, ['Text',
            el('textarea', { rows: 5, maxlength: 5000, oninput: function (e) { upd('text', e.target.value); } }, [n.text || '']),
            el('small', { class: 'muted', text: 'Nový řádek = nový odstavec. **text** = tučně. Adresy www… se změní na odkaz.' })]),
          el('div', { class: 'grid-2' }, [
            el('label', { class: 'field' }, ['Zobrazit od (nepovinné)',
              el('input', { type: 'date', value: n.from || '', onchange: function (e) { upd('from', e.target.value); } })]),
            el('label', { class: 'field' }, ['Zobrazit do (nepovinné)',
              el('input', { type: 'date', value: n.to || '', onchange: function (e) { upd('to', e.target.value); } })])
          ]),
          el('label', { class: 'field' }, ['Barva',
            el('select', { onchange: function (e) { upd('style', e.target.value); } },
              Object.keys(STYLES).map(function (k) { return el('option', { value: k, selected: n.style === k, text: STYLES[k] }); }))]),
          el('div', { class: 'checks' }, [
            check('active', 'Zapnuto', 'vypnuté upozornění se nikde nezobrazí'),
            check('banner', 'Zobrazit na stránce', 'pruh nad ordinačními hodinami'),
            check('popup', 'Vyskakovací okno', 'zobrazí se při otevření webu – každému jen jednou'),
            check('closed', 'Ordinace je v tomto období zavřena', 'např. dovolená – web ukáže „Dnes zavřeno“')
          ]),
          el('details', { class: 'preview-wrap' }, [el('summary', { text: 'Náhled' }), preview])
        ]);
        refresh();
        list.appendChild(card);
      });
    }
    draw();

    return el('section', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [
        el('h2', { text: 'Upozornění' }),
        el('button', { type: 'button', class: 'btn',
          onclick: function () {
            state.notices.unshift({ id: '', title: 'Nové upozornění', text: '', style: 'warning', active: true, banner: true, popup: false, closed: false, from: '', to: '' });
            markDirty(); draw();
            var first = list.querySelector('input[type=text]');
            if (first) { first.focus(); first.select(); }
          } }, ['+ Nové upozornění'])
      ]),
      el('p', { class: 'muted small', text: 'Upozornění s vyplněným datem se zobrazí a skryjí automaticky. Pořadí zde = pořadí na webu.' }),
      list
    ]);
  }

  /* ---------- Kontrola a úprava dat před uložením ---------- */

  function clean(s, max) { return String(s || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim().slice(0, max); }
  function randomId() { return 'n-' + Math.random().toString(36).slice(2, 10); }

  function normalize(src) {
    var errors = [];
    var hours = ALL_DAYS.map(function (name) {
      var d = src.hours.filter(function (h) { return h.day === name; })[0];
      if (!d) return null;
      var blocks = d.blocks.map(function (b) {
        if (!b.from || !b.to) { errors.push(name + ': vyplňte oba časy.'); return null; }
        if (pad(b.from) >= pad(b.to)) { errors.push(name + ': čas „od“ musí být dříve než „do“.'); return null; }
        return { from: unpad(b.from), to: unpad(b.to), note: clean(b.note, 120) };
      }).filter(Boolean).sort(function (a, b) { return pad(a.from) < pad(b.from) ? -1 : 1; });
      return (WEEKDAYS.indexOf(name) !== -1 || blocks.length) ? { day: name, blocks: blocks } : null;
    }).filter(Boolean);

    var ids = {};
    var notices = src.notices.map(function (n) {
      var title = clean(n.title, 150);
      if (!title) errors.push('Každé upozornění musí mít nadpis.');
      if (n.from && n.to && n.from > n.to) errors.push('„' + title + '“: datum „od“ je později než „do“.');
      var id = /^[a-z0-9-]{1,60}$/.test(n.id || '') && !ids[n.id] ? n.id : randomId();
      ids[id] = true;
      return {
        id: id, title: title, text: clean(n.text, 5000),
        style: STYLES[n.style] ? n.style : 'info',
        active: !!n.active, banner: !!n.banner, popup: !!n.popup, closed: !!n.closed,
        from: /^\d{4}-\d{2}-\d{2}$/.test(n.from || '') ? n.from : '',
        to: /^\d{4}-\d{2}-\d{2}$/.test(n.to || '') ? n.to : ''
      };
    });

    return {
      errors: errors,
      data: {
        updated: new Date().toISOString(),
        hours: hours,
        hoursNote: clean(src.hoursNote, 1000),
        substitute: clean(src.substitute, 300),
        notices: notices
      }
    };
  }

  /* ---------- Uložení ---------- */

  var saving = false;
  function save() {
    if (saving) return;
    var res = normalize(state);
    if (res.errors.length) { setStatus(res.errors[0], 'err'); return; }
    saving = true;
    setStatus('Ukládám…');
    saveRemote(res.data).then(function (data) {
      saving = false;
      dirty = false;
      state = JSON.parse(JSON.stringify(data));
      setStatus('Uloženo. Na webu se změna objeví do 1–2 minut…', 'ok');
      waitForPublish(data.updated);
    }).catch(function (e) {
      saving = false;
      setStatus('Chyba: ' + e.message, 'err');
      if (e.status === 401) setTimeout(logout, 1500);
    });
  }

  // Počká, až GitHub Pages zveřejní novou verzi data.json
  function waitForPublish(updated) {
    var tries = 0;
    (function poll() {
      if (dirty || tries++ > 30) return;
      fetch('../' + CFG.path + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.updated === updated) setStatus('Uloženo – změny už jsou na webu ✓', 'ok');
          else setTimeout(poll, 10000);
        })
        .catch(function () { setTimeout(poll, 10000); });
    })();
  }

  /* ---------- Start ---------- */

  function start(data) {
    state = data;
    state.hours = state.hours || [];
    state.notices = state.notices || [];
    dirty = false;
    topActions.hidden = false;
    app.textContent = '';
    statusEl = el('span', { class: 'save-status', text: 'Vše uloženo.' });
    app.appendChild(renderHours());
    app.appendChild(renderNotices());
    app.appendChild(el('div', { class: 'savebar' }, [
      statusEl,
      el('button', { type: 'button', class: 'btn btn-save', onclick: save }, ['Uložit změny'])
    ]));
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && state) { e.preventDefault(); save(); }
  });

  var ls = store(), ss = sstore();
  var saved = (ls && ls.getItem(TOKEN_KEY)) || (ss && ss.getItem(TOKEN_KEY));
  if (saved) {
    token = saved;
    loadRemote().then(start).catch(function (e) {
      if (e.status === 401) { if (ls) ls.removeItem(TOKEN_KEY); if (ss) ss.removeItem(TOKEN_KEY); }
      token = null;
      renderLogin(e.message);
    });
  } else {
    renderLogin();
  }
})();
