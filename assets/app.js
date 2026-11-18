/* MUDr. Julie Tichá – načtení ordinačních hodin a upozornění z data/data.json */
(function () {
  'use strict';

  var DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
  var DAYS_ACC = ['v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu', 'v neděli'];

  /* ---------- Pomocné funkce ---------- */

  // Aktuální datum a čas v Praze (nezávisle na časové zóně návštěvníka)
  function pragueNow(date) {
    var parts = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date || new Date()).forEach(function (p) { parts[p.type] = p.value; });
    var y = +parts.year, m = +parts.month, d = +parts.day;
    var local = new Date(Date.UTC(y, m - 1, d));
    return {
      date: local,                                   // půlnoc daného dne (UTC)
      iso: parts.year + '-' + parts.month + '-' + parts.day,
      weekday: (local.getUTCDay() + 6) % 7,          // 0 = pondělí
      minutes: (+parts.hour % 24) * 60 + (+parts.minute)
    };
  }

  function isoOf(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
  function toMin(t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function fmtTime(t) { var m = toMin(t); return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); }
  function fmtDate(iso) { var p = iso.split('-'); return (+p[2]) + '. ' + (+p[1]) + '. ' + p[0]; }

  // České státní svátky (pevné + Velký pátek a Velikonoční pondělí)
  function holidays(year) {
    var fixed = ['01-01', '05-01', '05-08', '07-05', '07-06', '09-28', '10-28', '11-17', '12-24', '12-25', '12-26'];
    var a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    var easter = new Date(Date.UTC(year, month - 1, day));
    var list = fixed.map(function (md) { return year + '-' + md; });
    list.push(isoOf(addDays(easter, -2)), isoOf(addDays(easter, 1)));
    return list;
  }
  function isHoliday(iso) { return holidays(+iso.slice(0, 4)).indexOf(iso) !== -1; }

  function noticeVisible(n, iso) {
    if (!n || n.active === false) return false;
    if (n.from && iso < n.from) return false;
    if (n.to && iso > n.to) return false;
    return true;
  }

  // Bezpečné formátování textu: řádky -> odstavce, **tučně**, odkazy (www… / https://…)
  function formatText(text, container) {
    String(text || '').split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var p = document.createElement('p');
      var re = /(\*\*([^*]+)\*\*)|((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?])/g, last = 0, m;
      while ((m = re.exec(line))) {
        if (m.index > last) p.appendChild(document.createTextNode(line.slice(last, m.index)));
        if (m[1]) {
          var s = document.createElement('strong'); s.textContent = m[2]; p.appendChild(s);
        } else {
          var a = document.createElement('a');
          a.href = /^https?:/.test(m[3]) ? m[3] : 'https://' + m[3];
          a.textContent = m[3]; a.target = '_blank'; a.rel = 'noopener';
          p.appendChild(a);
        }
        last = re.lastIndex;
      }
      if (last < line.length) p.appendChild(document.createTextNode(line.slice(last)));
      container.appendChild(p);
    });
    return container;
  }

  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(36);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- Ordinační hodiny ---------- */

  function hoursByWeekday(data) {
    var map = {};
    (data.hours || []).forEach(function (h) {
      var idx = DAYS.indexOf(h.day);
      if (idx !== -1) map[idx] = (h.blocks || []).filter(function (b) { return b.from && b.to; });
    });
    return map;
  }

  function renderHours(data, now) {
    var body = document.getElementById('hours-body');
    if (!body) return;
    body.textContent = '';
    (data.hours || []).forEach(function (h) {
      var tr = el('tr');
      if (DAYS.indexOf(h.day) === now.weekday) tr.className = 'today';
      tr.appendChild(el('th', null, h.day)).setAttribute('scope', 'row');
      var td = el('td');
      var blocks = (h.blocks || []).filter(function (b) { return b.from && b.to; });
      if (!blocks.length) td.appendChild(el('span', 'closed-day', 'zavřeno'));
      blocks.forEach(function (b) {
        var span = el('span', 'block');
        span.appendChild(el('span', 'time', fmtTime(b.from) + ' – ' + fmtTime(b.to)));
        if (b.note) span.appendChild(el('span', 'note', b.note));
        td.appendChild(span);
      });
      tr.appendChild(td);
      body.appendChild(tr);
    });

    var note = document.getElementById('hours-note');
    if (note && data.hoursNote) { note.textContent = data.hoursNote; note.hidden = false; }
  }

  function closureFor(data, iso) {
    var list = (data.notices || []).filter(function (n) { return n.closed && noticeVisible(n, iso); });
    return list[0] || null;
  }

  function computeStatus(data, now) {
    var week = hoursByWeekday(data);
    var closure = closureFor(data, now.iso);
    if (closure) return { open: false, text: 'Dnes zavřeno – ' + closure.title };
    if (isHoliday(now.iso)) return { open: false, text: 'Dnes je státní svátek – zavřeno' };

    var today = week[now.weekday] || [];
    for (var i = 0; i < today.length; i++) {
      var b = today[i];
      if (now.minutes >= toMin(b.from) && now.minutes < toMin(b.to)) {
        return { open: true, text: 'Nyní ordinujeme do ' + fmtTime(b.to) + (b.note ? ' (' + b.note + ')' : '') };
      }
    }
    for (i = 0; i < today.length; i++) {
      if (now.minutes < toMin(today[i].from)) {
        return { open: false, text: 'Nyní zavřeno · otevíráme dnes v ' + fmtTime(today[i].from) };
      }
    }
    for (var n = 1; n <= 21; n++) {
      var d = addDays(now.date, n), iso = isoOf(d), wd = (d.getUTCDay() + 6) % 7;
      var blocks = week[wd] || [];
      if (!blocks.length || isHoliday(iso) || closureFor(data, iso)) continue;
      var when = n === 1 ? 'zítra' : (n < 7 ? DAYS_ACC[wd] : fmtDate(iso));
      return { open: false, text: 'Nyní zavřeno · otevíráme ' + when + ' v ' + fmtTime(blocks[0].from) };
    }
    return { open: false, text: 'Nyní zavřeno' };
  }

  function renderStatus(data) {
    var st = document.getElementById('status');
    if (!st) return;
    var s = computeStatus(data, pragueNow());
    st.textContent = s.text;
    st.className = 'status' + (s.open ? ' open' : '');
    st.hidden = false;
  }

  /* ---------- Upozornění ---------- */

  function renderNotices(data, now) {
    var box = document.getElementById('notices');
    if (!box) return;
    box.textContent = '';
    (data.notices || []).forEach(function (n) {
      if (!n.banner || !noticeVisible(n, now.iso)) return;
      var div = el('section', 'notice ' + (n.style || 'info'));
      div.setAttribute('aria-label', n.title || 'Upozornění');
      if (n.title) div.appendChild(el('h2', null, n.title));
      if (n.from || n.to) {
        div.appendChild(el('p', 'dates',
          (n.from ? fmtDate(n.from) : '') + (n.from && n.to ? ' – ' : '') + (n.to ? (n.from ? '' : 'do ') + fmtDate(n.to) : '')));
      }
      var body = formatText(n.text, el('div', 'notice-body'));
      div.appendChild(body);
      // dlouhé upozornění sbalit, aby neodsouvalo ordinační hodiny
      if (body.children.length > 2) {
        div.classList.add('collapsed');
        var more = el('button', 'more', 'Zobrazit celé upozornění');
        more.type = 'button';
        more.setAttribute('aria-expanded', 'false');
        more.addEventListener('click', function () {
          var open = div.classList.toggle('collapsed') === false;
          more.textContent = open ? 'Skrýt' : 'Zobrazit celé upozornění';
          more.setAttribute('aria-expanded', String(open));
        });
        div.appendChild(more);
      }
      box.appendChild(div);
    });
  }

  function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } }

  function showPopup(data, now) {
    var dlg = document.getElementById('popup');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    var items = (data.notices || []).filter(function (n) {
      return n.popup && noticeVisible(n, now.iso) &&
        !storageGet('popup:' + n.id + ':' + hash((n.title || '') + (n.text || '') + (n.from || '') + (n.to || '')));
    });
    if (!items.length) return;

    var title = document.getElementById('popup-title');
    var body = document.getElementById('popup-body');
    body.textContent = '';
    if (items.length === 1) {
      title.textContent = items[0].title || 'Upozornění';
      formatText(items[0].text, body);
    } else {
      title.textContent = 'Důležitá upozornění';
      items.forEach(function (n) {
        var wrap = el('div', 'notice-item');
        wrap.appendChild(el('h3', null, n.title));
        formatText(n.text, wrap);
        body.appendChild(wrap);
      });
    }
    dlg.className = 'popup ' + (items[0].style || 'warning');
    dlg.addEventListener('close', function () {
      items.forEach(function (n) {
        storageSet('popup:' + n.id + ':' + hash((n.title || '') + (n.text || '') + (n.from || '') + (n.to || '')), '1');
      });
    }, { once: true });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.showModal();
  }

  /* ---------- Mapa (načte se až po kliknutí – rychlost + soukromí) ---------- */

  function initMap() {
    var btn = document.getElementById('map-load');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2555.51147078799!2d16.266966415924948!3d50.1702726153941!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x470ddfc79a8fccef%3A0x1dbd1baf6f372223!2sTich%C3%A1+Julie+MUDr.!5e0!3m2!1scs!2scz!4v1504180310354';
      f.title = 'Mapa – Jiráskova 1389, Rychnov nad Kněžnou';
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      btn.replaceWith(f);
    });
  }

  /* ---------- Start ---------- */

  function apply(data) {
    var now = pragueNow();
    renderNotices(data, now);
    renderHours(data, now);
    renderStatus(data);
    var sub = document.getElementById('substitute');
    if (sub && data.substitute) sub.textContent = data.substitute;
    var up = document.getElementById('updated');
    if (up && data.updated) up.textContent = 'Aktualizováno ' + fmtDate(String(data.updated).slice(0, 10));
    showPopup(data, now);
    setInterval(function () { renderStatus(data); }, 60000);
  }

  function init() {
    initMap();
    if (!document.getElementById('hours-body')) return;
    // ?v= mění se každou minutu – obejde cache CDN GitHub Pages, aby se úpravy projevily rychle
    fetch('data/data.json?v=' + Math.floor(Date.now() / 60000), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(apply)
      .catch(function () {
        var body = document.getElementById('hours-body');
        if (body) {
          body.innerHTML = '<tr><td>Ordinační hodiny se nepodařilo načíst. Volejte prosím <a href="tel:+420494515620">494 515 620</a>.</td></tr>';
        }
      });
  }

  // Sdílené funkce pro náhled v administraci
  window.TichaWeb = { formatText: formatText, computeStatus: computeStatus, pragueNow: pragueNow, noticeVisible: noticeVisible };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
