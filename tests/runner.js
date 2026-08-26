/* Mini-runner partagé par front.html et collab.html — aucune dépendance. */
(function () {
  const css = `
 body{font-family:ui-monospace,Menlo,monospace;background:#111;color:#eee;padding:24px;line-height:1.5}
 h1{font-size:18px;letter-spacing:.1em;text-transform:uppercase;color:#c8a84b;margin:0 0 4px}
 .hint{color:#888;font-size:12px;margin-bottom:16px;max-width:70em}
 .hint code{color:#c8a84b}
 #sum{font-size:15px;padding:10px 14px;border:1px solid #333;border-radius:4px;margin-bottom:14px;background:#181818}
 .grp{color:#c8a84b;margin:16px 0 6px;font-size:13px;letter-spacing:.08em;border-bottom:1px solid #2a2a2a;padding-bottom:4px}
 li{list-style:none;font-size:13px;padding:2px 0}
 .ok::before{content:'✔ ';color:#58d68d} .ko::before{content:'✖ ';color:#e74c3c}
 .sk::before{content:'– ';color:#888} .sk{color:#888} .ko{color:#e74c3c}
 pre{color:#e79a95;font-size:12px;margin:2px 0 6px 18px;white-space:pre-wrap}
 iframe.client{position:fixed;left:-3000px;top:0;width:1000px;height:700px;border:0}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const R = { pass: 0, fail: 0, skip: 0, details: [] };
  let sum, out;
  function scaffold() {
    sum = document.getElementById('sum');
    out = document.getElementById('out');
    if (!sum) { sum = document.createElement('div'); sum.id = 'sum'; sum.textContent = 'Exécution…'; document.body.appendChild(sum); }
    if (!out) { out = document.createElement('ol'); out.id = 'out'; document.body.appendChild(out); }
  }
  const li = (cls, txt, err) => {
    const l = document.createElement('li'); l.className = cls; l.textContent = txt;
    if (err) { const p = document.createElement('pre'); p.textContent = err; l.appendChild(p); }
    out.appendChild(l);
  };

  // ?seul=<fragment> pour ne rejouer qu'un test ; ?verbeux=1 pour tout garder
  const FILTRE = new URLSearchParams(location.search).get('seul');
  let groupeCourant = '';
  // le filtre porte sur « groupe + nom du test » : ?seul=collab, ?seul=caractères…
  const retenu = nom => !FILTRE || (groupeCourant + ' ' + nom).toLowerCase().includes(FILTRE.toLowerCase());

  window.grp = n => { groupeCourant = n; scaffold(); const d = document.createElement('div'); d.className = 'grp'; d.textContent = n; out.appendChild(d); };
  window.t = async (nom, fn) => {
    if (!retenu(nom)) return;
    scaffold();
    try {
      const r = await fn();
      if (r === 'skip') { R.skip++; li('sk', nom + ' — ignoré'); R.details.push(['skip', nom]); }
      else { R.pass++; li('ok', nom); R.details.push(['pass', nom]); }
    } catch (e) {
      R.fail++; const m = (e && e.message) || String(e);
      li('ko', nom, m); R.details.push(['fail', nom, m]);
    }
  };
  window.ok = (c, m) => { if (!c) throw new Error(m || 'assertion fausse'); };
  window.eq = (a, b, m) => {
    const A = JSON.stringify(a), B = JSON.stringify(b);
    if (A !== B) throw new Error((m || 'valeurs différentes') + '\n  attendu : ' + B + '\n  reçu    : ' + A);
  };
  window.sleep = ms => new Promise(r => setTimeout(r, ms));
  /** Attend qu'une condition devienne vraie (défaut : 4 s), sinon lève. */
  window.waitFor = async (cond, msg, timeout = 4000, diag = null) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { if (cond()) return true; await window.sleep(25); }
    let etat = '';
    try { if (diag) etat = '\n  état au moment de l\'échec : ' + diag(); } catch (e) { etat = '\n  (diagnostic indisponible : ' + e.message + ')'; }
    throw new Error('délai dépassé après ' + timeout + ' ms : ' + (msg || 'condition non remplie') + etat);
  };
  window.finish = () => {
    scaffold();
    const total = R.pass + R.fail + R.skip;
    sum.innerHTML = `<b style="color:${R.fail ? '#e74c3c' : '#58d68d'}">${R.pass}/${total} tests passés</b>`
      + (R.fail ? ` · <span style="color:#e74c3c">${R.fail} échec(s)</span>` : '')
      + (R.skip ? ` · <span style="color:#888">${R.skip} ignoré(s)</span>` : '');
    window.__results = R; window.__done = true;
  };
  window.__R = R;
})();
