// Checks the schedule for 4-8 players: run with `node test/schedule.test.js`
const assert = require('assert');
const Sched = require('../schedule.js');
const NAMES = ['Matevz', 'Zoki', 'Aljosa', 'David', 'Cica', 'P6', 'P7', 'P8'];
const key = (x, y) => [x, y].sort().join('|');

for (let n = 4; n <= 8; n++) {
  for (let run = 0; run < 200; run++) {
    const players = NAMES.slice(0, n);
    const t = Sched.build(players);
    const c = Sched.counts(n);
    const S = t.matches.filter(m => m.type === 'S'), D = t.matches.filter(m => m.type === 'D');
    assert.strictEqual(S.length, c.singles, `singles count n=${n}`);
    assert.strictEqual(D.length, c.doubles, `doubles count n=${n}`);

    // Every singles pairing exactly once
    const sp = new Set(S.map(m => key(m.a[0], m.b[0])));
    assert.strictEqual(sp.size, n * (n - 1) / 2);

    // Every pair are teammates in exactly one draw; nobody twice in a draw; byes spread evenly
    const mates = new Map(), byes = {};
    t.draws.forEach(d => {
      const seen = d.teams.flat().concat(d.bye ? [d.bye] : []);
      assert.strictEqual(new Set(seen).size, n, 'draw uses each player once');
      d.teams.forEach(([x, y]) => mates.set(key(x, y), (mates.get(key(x, y)) || 0) + 1));
      if (d.bye) byes[d.bye] = (byes[d.bye] || 0) + 1;
    });
    assert.strictEqual(mates.size, n * (n - 1) / 2, 'all partnerships covered');
    assert.ok([...mates.values()].every(v => v === 1), 'each partnership once');
    if (n % 2) assert.ok(players.every(p => byes[p] === 1), 'each player sits out once');

    // Within a draw every team plays every other team once
    t.draws.forEach((d, r) => {
      const games = D.filter(m => m.round === r);
      const k = d.teams.length;
      assert.strictEqual(games.length, k * (k - 1) / 2);
    });

    // Order: each round = singles first, then that round's doubles; no leftover round
    assert.ok(t.matches.every(m => m.round < t.draws.length), 'no leftover singles');
    t.draws.forEach((d, r) => {
      const ms = t.matches.filter(m => m.round === r).map(m => m.type).join('');
      assert.match(ms, /^S+D+$/, `round shape ${ms}`);
      assert.strictEqual(ms.split('S').length - 1, c.singlesPerRound);
    });

    // Everyone plays the same number of games
    const games = {};
    t.matches.forEach(m => [...m.a, ...m.b].forEach(p => { games[p] = (games[p] || 0) + 1; }));
    assert.strictEqual(new Set(Object.values(games)).size, 1, 'equal games per player');
  }
  const c = Sched.counts(n);
  const per = Object.values((() => { const g = {}; Sched.build(NAMES.slice(0, n)).matches.forEach(m => [...m.a, ...m.b].forEach(p => g[p] = (g[p] || 0) + 1)); return g; })())[0];
  console.log(`${n} players: ${c.singles} singles + ${c.doubles} doubles = ${c.total} games, ${c.draws} rounds, ${per} games each`);
}

// Standings sanity
const t = Sched.build(['A', 'B', 'C', 'D', 'E']);
t.matches.forEach(m => { m.w = 'a'; });
const st = Sched.standings(t, 'all');
assert.strictEqual(st.reduce((s, x) => s + x.w, 0), t.matches.reduce((s, m) => s + m.a.length, 0));
assert.strictEqual(st.reduce((s, x) => s + x.l, 0), t.matches.reduce((s, m) => s + m.b.length, 0));
assert.ok(st.every((x, i) => i === 0 || st[i - 1].w >= x.w), 'sorted by wins');
console.log('All schedule checks passed');
