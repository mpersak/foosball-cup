// Checks added games, ranking, ratings, player profiles, share links and sit-out gaps: run with `node test/stats.test.js`
const assert = require('assert');
const Sched = require('../schedule.js');
const Stats = require('../stats.js');
const Share = require('../share.js');

const play = (t, pick) => t.matches.forEach(m => { if (m.w == null) { m.w = pick(m); m.at = Date.now() + m.id; } });

(async () => {
  // --- Added games: a missed 2-v-1 game counts for the players, not as a team
  const t = Sched.build(['A', 'B', 'C', 'D', 'E']);
  play(t, () => 'a');
  t.finished = new Date().toISOString();
  const before = Sched.standings(t, 'all').find(s => s.name === 'A');
  const g = Sched.addGame(t, ['A', 'B'], ['C'], 'a');
  assert.strictEqual(g.type, 'D'); assert.ok(g.extra);
  const after = Sched.standings(t, 'all').find(s => s.name === 'A');
  assert.strictEqual(after.p, before.p + 1); assert.strictEqual(after.w, before.w + 1);
  assert.ok(!Sched.teamStandings([t]).some(s => s.names.includes('')), 'no half teams');
  const s1 = Sched.addGame(t, ['D'], ['E'], 'b');
  assert.strictEqual(s1.type, 'S');
  Sched.removeGame(t, s1.id);
  assert.ok(t.matches.every((m, i) => m.id === i));
  assert.ok(!t.matches.includes(s1));

  // --- Ranking: win % decides, not number of games
  const r = { players: ['P', 'Q', 'R'], left: [], matches: [
    { type: 'S', a: ['P'], b: ['Q'], w: 'a' }, { type: 'S', a: ['P'], b: ['R'], w: 'a' },
    { type: 'S', a: ['Q'], b: ['R'], w: 'a' }, { type: 'S', a: ['Q'], b: ['R'], w: 'a' },
    { type: 'S', a: ['Q'], b: ['R'], w: 'b' }, { type: 'S', a: ['Q'], b: ['P'], w: 'a' }] };
  // P: 2-1 (67%), Q: 3-2 (60%) - Q has more wins but P ranks first
  const st = Sched.standings(r, 'all');
  assert.strictEqual(st[0].name, 'P', 'win % beats more games');
  // Someone with too few games is listed but not ranked
  r.players.push('Z');
  r.matches.push({ type: 'S', a: ['Z'], b: ['R'], w: 'a' });
  const st2 = Sched.standings(r, 'all');
  assert.ok(!st2.find(s => s.name === 'Z').ranked, '1 game is not enough to be ranked');
  assert.strictEqual(Sched.champion(r).name, 'P');

  // --- Ratings: zero-sum in singles, a winner of everything rates highest
  const u = Sched.build(['W', 'X', 'Y', 'Z']);
  play(u, m => (m.a.includes('W') ? 'a' : m.b.includes('W') ? 'b' : 'a'));
  u.finished = new Date().toISOString();
  const { rating } = Stats.ratings([u]);
  assert.strictEqual(Object.entries(rating).sort((x, y) => y[1] - x[1])[0][0], 'W');
  const at = Stats.allTime([u]);
  assert.strictEqual(at[0].name, 'W'); assert.strictEqual(at[0].cups, 1);
  const pr = Stats.profile([u], 'W');
  assert.strictEqual(pr.singles.w, pr.singles.p); assert.strictEqual(pr.doubles.w, pr.doubles.p);
  assert.strictEqual(pr.bestRun, pr.singles.p + pr.doubles.p);
  assert.strictEqual(pr.trend.length, pr.singles.p + pr.doubles.p);
  assert.strictEqual(pr.rivals.length, 3);

  // --- Share links round-trip
  const big = Sched.build(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8']);
  play(big, () => (Math.random() < .5 ? 'a' : 'b'));
  Sched.leave(big, 'M3');
  const all = [t, u, big];
  const code = await Share.encode(all);
  const back = await Share.decode(code);
  assert.strictEqual(back.length, 3);
  all.forEach((orig, i) => {
    const a = Sched.standings(orig, 'all').map(s => [s.name, s.w, s.l]);
    const b = Sched.standings(back[i], 'all').map(s => [s.name, s.w, s.l]);
    assert.deepStrictEqual(b, a, 'standings survive the link');
    assert.deepStrictEqual(Sched.teamStandings([back[i]]), Sched.teamStandings([orig]));
  });
  assert.deepStrictEqual(back[0].left, t.left);
  await assert.rejects(Share.decode('zAAAA'));
  console.log(`Share link for 3 tournaments (${all.reduce((s, x) => s + x.matches.length, 0)} games): ${code.length} characters`);

  // --- Sit-out gaps: nobody watches more than a few games in a row
  const LIMIT = { 4: 2, 5: 2, 6: 2, 7: 4, 8: 4 };
  for (let n = 4; n <= 8; n++) {
    const ps = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, n);
    for (let k = 0; k < 20; k++) {
      const s = Sched.gapScore(Sched.build(ps).matches, ps, {});
      assert.ok(Math.floor(s / 100000) <= LIMIT[n], `${n} players: longest sit-out ${Math.floor(s / 100000)}`);
    }
  }
  console.log('All stats, share and gap checks passed');
})().catch(e => { console.error(e); process.exit(1); });

// --- Swap: bring a later game forward, then undo
{
  const t = Sched.build(['A', 'B', 'C', 'D', 'E']);
  const next = t.matches.find(m => m.w == null);
  const opts = Sched.swapOptions(t);
  assert.ok(opts.length > 0 && !opts.includes(next));
  assert.ok(opts.every(m => m.type === 'S'), 'undrawn doubles are not offered');
  const busy = [...next.a, ...next.b];
  const firstClash = opts.findIndex(m => [...m.a, ...m.b].some(p => busy.includes(p)));
  if (firstClash > 0) assert.ok(opts.slice(0, firstClash).every(m => ![...m.a, ...m.b].some(p => busy.includes(p))));
  const pick = opts[0], i = next.id, j = pick.id;
  Sched.swapGames(t, i, j);
  assert.strictEqual(t.matches.find(m => m.w == null), pick);
  assert.ok(t.matches.every((m, k) => m.id === k));
  Sched.swapGames(t, i, j);
  assert.strictEqual(t.matches.find(m => m.w == null), next);
  console.log('Swap checks passed');
}
