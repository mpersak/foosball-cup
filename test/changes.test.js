// Checks leaving / late joining and team stats: run with `node test/changes.test.js`
const assert = require('assert');
const Sched = require('../schedule.js');
const { key } = Sched;
const NAMES = ['Matevz', 'Zoki', 'Aljosa', 'David', 'Cica', 'P6', 'P7', 'P8'];

// Play the next k games, revealing draws as the app would
function playSome(t, k) {
  for (let i = 0; i < k; i++) {
    const m = t.matches.find(x => x.w == null);
    if (!m) return;
    if (m.type === 'D' && !t.revealed.includes(m.round)) t.revealed.push(m.round);
    m.w = Math.random() < .5 ? 'a' : 'b';
  }
}

function check(t, playedBefore) {
  const active = t.players.filter(p => !t.left.includes(p));
  const unplayed = t.matches.filter(m => m.w == null);
  // ids sequential, played games untouched
  t.matches.forEach((m, i) => assert.strictEqual(m.id, i));
  playedBefore.forEach(p => assert.ok(t.matches.some(m => m.w === p.w && key(...m.a) === key(...p.a) && key(...m.b) === key(...p.b) && m.type === p.type), 'played game kept'));
  assert.strictEqual(t.matches.filter(m => m.w != null).length, playedBefore.length);
  // nobody who left has a game to play
  // (the game in progress is the exception: it is finished first)
  unplayed.filter(m => m.id !== t.live).forEach(m => [...m.a, ...m.b].forEach(p => assert.ok(active.includes(p), 'leaver scheduled')));
  // every active singles pairing played or scheduled exactly once
  active.forEach((x, i) => active.slice(i + 1).forEach(y => {
    const n = t.matches.filter(m => m.type === 'S' && !m.extra && key(m.a[0], m.b[0]) === key(x, y)).length;
    assert.strictEqual(n, 1, `singles ${x}-${y} x${n}`);
  }));
  // every active pair partners at least once (played or scheduled) when doubles are possible
  if (active.length >= 4) {
    const teams = new Set(t.matches.filter(m => m.type === 'D').flatMap(m => [key(...m.a), key(...m.b)]));
    active.forEach((x, i) => active.slice(i + 1).forEach(y => assert.ok(teams.has(key(x, y)), `partners ${x}-${y}`)));
  }
  // unplayed rounds come in order, singles before doubles within a round
  for (let i = 1; i < unplayed.length; i++) assert.ok(unplayed[i].round >= unplayed[i - 1].round, 'round order');
  // every unplayed doubles game has a draw
  unplayed.filter(m => m.type === 'D').forEach(m => assert.ok(t.draws[m.round], 'draw exists'));
}

for (let run = 0; run < 2000; run++) {
  const n = 4 + (run % 5);
  const t = Sched.build(NAMES.slice(0, n));
  playSome(t, Math.floor(Math.random() * t.matches.length));
  if (Math.random() < .3 && t.matches.some(m => m.w == null)) t.live = t.matches.find(m => m.w == null).id;
  const liveBefore = t.live != null ? t.matches[t.live] : null;

  // someone leaves
  const active = t.players.filter(p => !t.left.includes(p));
  if (active.length > 2) {
    const lv = t.live != null ? t.matches[t.live] : null;
    const leaver = lv && Math.random() < .5 ? lv.a[0] : active[Math.floor(Math.random() * active.length)];
    const before = t.matches.filter(m => m.w != null).map(m => ({ ...m }));
    Sched.leave(t, leaver);
    check(t, before);
    // A game in progress is never dropped, even if the leaver is playing in it
    if (liveBefore) {
      assert.notStrictEqual(t.live, null, 'live game dropped');
      const lm = t.matches[t.live];
      assert.strictEqual(lm, t.matches.find(m => m.w == null), 'live is next game');
      const sides = m => [key(...m.a), key(...m.b)].sort().join(' v ');
      assert.strictEqual(sides(lm), sides(liveBefore), 'live kept same game');
    }
  }
  playSome(t, Math.floor(Math.random() * 6));

  // someone new joins (if room), or the leaver comes back
  const act2 = t.players.filter(p => !t.left.includes(p));
  if (act2.length < 8) {
    const joiner = Math.random() < .5 && t.left.length ? t.left[0] : NAMES.find(p => !t.players.includes(p)) || t.left[0];
    if (joiner) {
      const before = t.matches.filter(m => m.w != null).map(m => ({ ...m }));
      Sched.join(t, joiner);
      check(t, before);
    }
  }
  assert.ok(t.changed);
  const st = Sched.standings(t, 'all');
  const firstLeft = st.findIndex(s => s.left);
  if (firstLeft >= 0) assert.ok(st.slice(firstLeft).every(s => s.left), 'left players at bottom');
}

// Team stats
const t = Sched.build(['A', 'B', 'C', 'D', 'E', 'F']);
t.matches.forEach(m => { m.w = 'a'; });
const ts = Sched.teamStandings([t]);
assert.strictEqual(ts.length, 15, 'every pair is a team once');
const dGames = t.matches.filter(m => m.type === 'D').length;
assert.strictEqual(ts.reduce((s, x) => s + x.p, 0), dGames * 2);
assert.strictEqual(ts.reduce((s, x) => s + x.w, 0), dGames);
assert.ok(ts.every((x, i) => i === 0 || x.w / x.p <= ts[i - 1].w / ts[i - 1].p), 'sorted by win %');
console.log('All leave/join and team checks passed');
