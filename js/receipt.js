/* Kaspa, on receipt. Live numbers from the public api.kaspa.org; if it can't be reached we say SIMULATED and keep the rhythm. */
(() => {
  const API = 'https://api.kaspa.org', D = window.KDATA, $ = s => document.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n, d = 0) => n == null || isNaN(n) ? '…' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { online: null, score: null, first: null, rate: 10, tips: null, reward: null, hash: null, circ: null, max: 28704035605, next: null, nextAmt: null };
  const t0 = Date.now();
  async function j(path, ms = 6000) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(API + path, { signal: c.signal, cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
  }

  /* ---- status light ---- */
  function setOnline(v) {
    if (S.online === v) return; S.online = v;
    const led = $('#led'); led.className = 'led ' + (v ? 'on' : 'off');
    $('#ledtxt').textContent = v ? 'live · mainnet' : 'offline · simulated';
    if (!v) $('#lastread').innerHTML = '<span>LAST READ: none, network unreachable</span>';
    if (!v) { $('#t-src').innerHTML = '<b>SIMULATED.</b> api.kaspa.org didn\'t answer, so the tape keeps a 10-a-second rhythm and the numbers above are blank. It retries every few seconds.'; }
    else $('#t-src').innerHTML = 'Live from <a href="https://api.kaspa.org/docs">api.kaspa.org</a><sup><a class="r" href="#r8">8</a></sup>. If it can\'t be reached, this says SIMULATED.';
    paint();
  }

  /* ---- polling ---- */
  const hist = []; let fails = 0;
  async function pollScore() {
    if (document.hidden) return;
    try {
      const sc = Number((await j('/info/virtual-chain-blue-score', 4000)).blueScore); if (!sc) throw 0;
      fails = 0; const now = performance.now();
      if (S.first == null) S.first = sc;
      if (S.score !== sc) hist.push([now, sc]);
      while (hist.length > 2 && now - hist[0][0] > 120000) hist.shift();
      if (hist.length > 2) { const [a, sa] = hist[0], [b, sb] = hist[hist.length - 1]; if (b - a > 20000) S.rate = Math.max(1, Math.min(20, (sb - sa) / ((b - a) / 1000))); }
      S.score = sc; if (est == null || sc > est) est = sc; setOnline(true); paint();
    } catch (e) { if (++fails >= 3) setOnline(false); }
  }
  async function pollInfo() {
    const r = await Promise.allSettled([j('/info/hashrate'), j('/info/blockreward'), j('/info/coinsupply'), j('/info/halving')]);
    if (r[0].status === 'fulfilled') S.hash = r[0].value.hashrate;
    if (r[1].status === 'fulfilled') S.reward = r[1].value.blockreward;
    if (r[2].status === 'fulfilled') { S.circ = Number(BigInt(r[2].value.circulatingSupply) / 100000000n); S.max = Number(BigInt(r[2].value.maxSupply) / 100000000n); }
    if (r[3].status === 'fulfilled') { S.next = r[3].value.nextHalvingTimestamp * 1000; S.nextAmt = r[3].value.nextHalvingAmount; }
    paint(); supply();
  }
  let real = null;
  async function sample() {
    if (document.hidden || !S.online) return;
    try {
      const dag = await j('/info/blockdag', 5000); S.tips = (dag.tipHashes || []).length;
      const b = await j('/blocks/' + dag.tipHashes[0] + '?includeTransactions=false', 5000), v = b.verboseData || {}, h = b.header || {};
      real = { score: Number(v.blueScore), merged: (v.mergeSetBluesHashes || []).length + (v.mergeSetRedsHashes || []).length - 1,
        parents: (h.parents && h.parents[0] && h.parents[0].parentHashes || []).length, txs: (v.transactionIds || []).length };
      $('#merged').textContent = Math.max(0, real.merged); $('#parentsn').textContent = real.parents;
      $('#lastread').innerHTML = `<span>LAST READ <b>${fmt(real.score)}</b></span><span>${real.parents} parents · ${real.txs} tx</span>`; paint();
    } catch (e) { /* the sample is a garnish */ }
  }

  /* ---- totals ---- */
  function paint() {
    const off = S.online === false, dash = off ? 'offline' : '…';
    $('#t-score').textContent = S.score ? fmt(S.score) : dash;
    $('#t-tips').textContent = S.tips != null ? S.tips : dash;
    $('#t-reward').textContent = S.reward ? fmt(S.reward, 2) + ' KAS' : dash;
    $('#t-hash').textContent = S.hash ? fmt(S.hash / 1000) + ' quadrillion' : dash;
    $('#t-supply').textContent = S.circ ? (S.circ / S.max * 100).toFixed(1) + '% of max' : dash;
    $('#p-now').textContent = S.reward ? fmt(S.reward, 2) + ' KAS' : dash;
    $('#p-next').textContent = S.next ? fmt(S.nextAmt, 2) + ' on ' + new Date(S.next).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : dash;
    $('#p-pct').textContent = S.circ ? `${(S.circ / 1e9).toFixed(2)}bn of ${(S.max / 1e9).toFixed(2)}bn` : dash;
  }

  /* ---- the tape: one line per block at the measured rate ---- */
  const tape = $('#tape'); let est = null, nextAt = 0;
  function line() {
    if (est != null && (S.score == null || est < S.score + (S.rate || 10))) est++; else if (est != null) return; // never run far ahead, never go back
    const li = document.createElement('li'), d = new Date(), L = est ? 'BLK ' + fmt(est) : 'BLK ———',
      R = d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + Math.floor(d.getMilliseconds() / 100);
    if (S.online === false) li.className = 'offl';
    li.innerHTML = `<span>${L}</span><span>${R}</span>`; tape.append(li);
    while (tape.children.length > 9) tape.firstChild.remove();
  }
  function tick(now) {
    requestAnimationFrame(tick); if (document.hidden) return;
    if (!nextAt || nextAt < now - 1000) nextAt = now;
    let n = 0; while (now >= nextAt && n < 30) { line(); n++; nextAt += -Math.log(1 - Math.random()) / (S.rate || 10) * 1000; }
  }
  if (reduced) { setInterval(() => { for (let i = 0; i < Math.round(S.rate); i++) line(); }, 1000); $('#tapecap').innerHTML += ' Motion is reduced, so it prints once a second.'; }
  else requestAnimationFrame(tick);

  /* ---- 02 tills ---- */
  const rule = r => {
    document.querySelectorAll('[data-rule]').forEach(b => b.setAttribute('aria-pressed', b.dataset.rule === r));
    const chain = r === 'chain'; $('#slipB').classList.toggle('dead', chain); $('#parents').textContent = chain ? 'A' : 'A and B';
    $('#tillout').textContent = chain ? 'One-till rules (Bitcoin): slip B is voided. Its work is thrown away, and if it held your payment, you wait for the next page.' : 'Kaspa rules: the next slip points back to both, so A and B are both kept and put in order. Nothing is thrown away.';
  };
  document.querySelectorAll('[data-rule]').forEach(b => b.onclick = () => rule(b.dataset.rule)); rule('chain');

  /* ---- 03 cheat ---- */
  const hide = $('#hide'); hide.oninput = () => $('#hidev').textContent = hide.value;
  $('#reveal').onclick = () => {
    const s = +hide.value, mine = Math.round(s * 10 / 3), honest = Math.round(s * 10 * 2 / 3), red = honest > 124;
    const row = (a, b) => a.padEnd(15, ' ') + b;
    $('#cheatout').textContent = [row('YOU HID', s + ' s'), row('YOUR SLIPS', mine + ' (you own a third of the printers)'), row('HONEST SLIPS', honest + ', none of them saw yours'), row('LIMIT (k)', '124'),
      row('RESULT', red ? 'RED: kept, ordered last, not paid' : 'BLUE: counted as normal'), row('DOUBLE SPEND', red ? 'failed, the honest spend comes first' : 'failed, the honest side has more work behind it'),
      '', red ? 'You spent ' + s + ' seconds of electricity to get a slip stamped red.' : 'Under 124 unseen slips, yours just count as slow, honest-ish printing. Hide longer.', 'Toy model. The real rule: GHOSTDAG [4], k from bps.rs [5].'].join('\n');
  };

  /* ---- 04 supply ---- */
  const T = D.TABLE, MONTH = 2629800e3, ANCHOR = [1793800618e3, T.indexOf(2060172230)];
  function supply() {
    let cur = S.reward ? T.reduce((bi, v, i) => Math.abs(v - S.reward * 1e9) < Math.abs(T[bi] - S.reward * 1e9) ? i : bi, 0) : null, next = S.next;
    if (cur == null || !next) { next = ANCHOR[0]; cur = ANCHOR[1]; while (next < Date.now()) { next += MONTH; cur++; } $('#p-est').textContent = ' (dates estimated)'; } else $('#p-est').textContent = '';
    const start = i => new Date(next - (cur + 1 - i) * MONTH), out = [];
    for (let i = 0; i <= 96; i += 12) {
      const v = T[i] / 1e8, bar = '█'.repeat(Math.max(1, Math.round(v / 440 * 22))) + (v / 440 * 22 < 1 ? '' : '');
      out.push(String(start(i).getUTCFullYear()).padEnd(5) + v.toFixed(v < 1 ? 2 : 1).padStart(6) + '  ' + (v / 440 * 22 < .5 ? '▏' : bar) + (cur >= i && cur < i + 12 ? '  ◄ now' : ''));
    }
    const last = T.length - 2; out.push('  ⋮', String(start(last).getUTCFullYear()).padEnd(5) + '        last new coin (about)');
    $('#bars').textContent = out.join('\n');
  }
  supply();

  /* ---- 05 board ---- */
  const ST = { live: 'PAID', test: 'ON ORDER', page: 'QUOTE', comp: 'IOU' };
  $('#board').innerHTML = ['live', 'test', 'page', 'comp'].flatMap(k => D.items.filter(x => x[0] === k)).map(x =>
    `<li><div class="t"><b>${esc(x[1])}</b><span class="st ${x[0]}">${ST[x[0]]}</span></div><p>${esc(x[2])}</p><div class="meta">${esc(x[3])} · receipt: <a href="${esc(x[5])}">${esc(x[4])}</a></div></li>`).join('');

  /* ---- 06 feed ---- */
  const dfmt = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  fetch('data/x-feed.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
    $('#feedupd').textContent = 'Real posts from Kaspa builders, updated ' + dfmt(d.updated) + '. Plain-English lines are ours.';
    $('#feed').innerHTML = d.items.slice(0, 2).map(p => `<li><div class="who"><span>@${esc(p.handle)}</span><time datetime="${esc(p.date)}">${dfmt(p.date)}</time></div><p>${esc(p.plain)}</p>${p.caveat ? `<p class="small">Note: ${esc(p.caveat)}</p>` : ''}<div class="meta">${esc(p.tag)} · <a href="${esc(p.url)}">read the post on X</a></div></li>`).join('');
  }).catch(() => { $('#feed').innerHTML = '<li>The feed file didn\'t load. Reload to try again.</li>'; });

  /* ---- footer: visit, barcode, print, copy ---- */
  const C39 = { 0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw', 5: 'wnnwwnnnn', 6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn', '*': 'nwnnwnwnn' };
  let bcFor = null;
  function barcode() {
    const n = S.score ? String(S.score) : null; if (!n || n === bcFor) return; bcFor = n;
    let x = 0, r = ''; for (const ch of '*' + n + '*') { [...C39[ch]].forEach((e, i) => { const w = e === 'w' ? 3 : 1; if (i % 2 === 0) r += `<rect x="${x}" width="${w}" height="50"/>`; x += w; }); x += 1; }
    $('#barcode').innerHTML = `<svg viewBox="-10 0 ${x + 20} 50" preserveAspectRatio="none" aria-hidden="true"><rect x="-10" width="${x + 20}" height="50" fill="#f5f2e9"/><g fill="#1d1c1a">${r}</g></svg>`;
    $('#bcnum').textContent = '*' + n + '* · your block';
  }
  function visit() {
    const s = Math.floor((Date.now() - t0) / 1000); $('#f-time').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    const approx = '~' + fmt(Math.round(s * (S.rate || 10))); // measured rate × time: the API's score lags in jumps
    $('#f-blocks').textContent = approx;
    if (!bcFor) barcode();
  }
  setInterval(visit, 1000);
  $('#print').onclick = () => print();
  $('#copy').onclick = async () => {
    const L = (a, b) => a.padEnd(26, '.') + ' ' + b;
    const txt = ['KASPA · a shop that never closes', 'fan-made, not official, no prices', '------------------------------------', L('Block No.', $('#t-score').textContent), L('Slips not yet stapled', $('#t-tips').textContent), L('New KAS per block', $('#t-reward').textContent), L('Coins issued', $('#t-supply').textContent), L('Time at the counter', $('#f-time').textContent), L('Blocks added meanwhile', $('#f-blocks').textContent), L('Slips thrown away', '0'), '------------------------------------', location.href.split('#')[0]].join('\n');
    try { await navigator.clipboard.writeText(txt); $('#copy').textContent = 'Copied'; } catch (e) { $('#copy').textContent = 'Copy blocked'; }
    setTimeout(() => $('#copy').textContent = 'Copy as text', 1800);
  };

  pollScore(); pollInfo(); setTimeout(sample, 800);
  setInterval(pollScore, 1000); setInterval(pollInfo, 60000); setInterval(sample, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollScore(); });
})();
