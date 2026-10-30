// Tournament scheduling logic. Pure functions, no DOM - shared by the app and the test script.
(function (root) {
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Circle-method round robin. Each round pairs everyone once; with an odd count one item gets a bye.
  // Consecutive pairs within a round never share an item, so play is spread out.
  function circle(items) {
    const l = items.slice();
    if (l.length % 2) l.push(null);
    const n = l.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      let bye = null;
      for (let i = 0; i < n / 2; i++) {
        const x = l[i], y = l[n - 1 - i];
        if (x === null) bye = y;
        else if (y === null) bye = x;
        else pairs.push([x, y]);
      }
      rounds.push({ pairs, bye });
      l.splice(1, 0, l.pop());
    }
    return rounds;
  }

  // Game counts for a given number of players.
  function counts(n) {
    const singles = n * (n - 1) / 2;
    const draws = n % 2 ? n : n - 1;
    const teams = Math.floor(n / 2);
    const doubles = draws * teams * (teams - 1) / 2;
    return { singles, draws, teams, doubles, total: singles + doubles, singlesPerRound: Math.floor(n / 2) };
  }

  // Build the full schedule:
  //  - Singles: everyone plays everyone once.
  //  - Doubles: a series of "draws". Each draw splits players into teams of two (one sits out if odd),
  //    and those teams all play each other. Across the draws, every possible pair are teammates exactly once.
  //  - Order: each round = a few singles, then one doubles draw played out. Singles per round = floor(n/2),
  //    which divides the singles evenly across the draws (5 players -> 2 singles per round).
  function build(players) {
    const n = players.length;
    const singles = circle(shuffle(players)).flatMap(r => r.pairs);
    const draws = shuffle(circle(shuffle(players))).map(d => ({ teams: d.pairs.map(shuffle), bye: d.bye }));
    const per = counts(n).singlesPerRound;
    const matches = [];
    let si = 0;
    draws.forEach((d, round) => {
      for (let k = 0; k < per && si < singles.length; k++, si++) {
        matches.push({ type: 'S', round, a: [singles[si][0]], b: [singles[si][1]] });
      }
      circle(d.teams).forEach(r => r.pairs.forEach(([x, y]) => matches.push({ type: 'D', round, a: x, b: y })));
    });
    // Safety net: any singles left over go in a final round.
    while (si < singles.length) {
      matches.push({ type: 'S', round: draws.length, a: [singles[si][0]], b: [singles[si][1]] });
      si++;
    }
    // w = winning side ('a' or 'b'), null until the game is played
    matches.forEach((m, i) => { m.id = i; m.w = null; });
    return {
      id: Date.now(),
      started: new Date().toISOString(),
      finished: null,
      players: players.slice(),
      left: [],        // players who went home
      changed: false,  // true once anyone left or joined: game counts differ, so rank by win %
      draws,
      revealed: [],
      live: null,
      matches
    };
  }

  const key = (x, y) => [x, y].sort().join('|');

  // Every way to split players into teams of two (one sits out if the count is odd).
  function pairings(list) {
    if (!list.length) return [[]];
    const [first, ...rest] = list, out = [];
    rest.forEach((p, i) => {
      pairings(rest.filter((_, j) => j !== i)).forEach(ps => out.push([[first, p], ...ps]));
    });
    return out;
  }
  function matchings(players) {
    if (players.length % 2 === 0) return pairings(players).map(teams => ({ teams, bye: null }));
    return players.flatMap((bye, i) => pairings(players.filter((_, j) => j !== i)).map(teams => ({ teams, bye })));
  }

  // Order singles so nobody plays twice in a row where possible; `first` (a live game) goes first.
  function orderSingles(pairs, first) {
    const rest = pairs.slice(), out = [];
    const fi = first ? rest.findIndex(p => key(...p) === key(...first)) : -1;
    if (fi >= 0) out.push(rest.splice(fi, 1)[0]);
    while (rest.length) {
      const last = out[out.length - 1] || [];
      const i = Math.max(0, rest.findIndex(p => !p.some(x => last.includes(x))));
      out.push(rest.splice(i, 1)[0]);
    }
    return out;
  }

  // Rebuild the unplayed part of the schedule after someone leaves or joins.
  //  - Played games are kept as they are (no forfeits, no voided wins).
  //  - Remaining singles: every pairing of players still here that has not been played.
  //  - Remaining doubles: new draws chosen so players still here partner everyone they have not partnered yet.
  //  - The current doubles draw is kept if it is already drawn and everyone in it is still here.
  function replan(t) {
    t.left = t.left || [];
    const active = t.players.filter(p => !t.left.includes(p));
    const old = t.matches;
    const liveM = t.live != null ? old[t.live] : null;
    const played = old.filter(m => m.w != null).sort((x, y) => x.round - y.round || x.id - y.id);
    const next = old.find(m => m.w == null);
    let base = played.length ? Math.max(...played.map(m => m.round)) + 1 : 0;

    let kept = [];
    if (next && next.type === 'D' && t.revealed.includes(next.round) &&
        t.draws[next.round].teams.flat().every(p => active.includes(p))) {
      kept = old.filter(m => m.w == null && m.type === 'D' && m.round === next.round);
      base = Math.max(base, next.round + 1);
    }

    // Singles still to play
    const singlesDone = new Set(played.filter(m => m.type === 'S').map(m => key(m.a[0], m.b[0])));
    let singles = [];
    active.forEach((x, i) => active.slice(i + 1).forEach(y => { if (!singlesDone.has(key(x, y))) singles.push([x, y]); }));
    const liveSingles = liveM && liveM.w == null && liveM.type === 'S' && [...liveM.a, ...liveM.b].every(p => active.includes(p));
    singles = orderSingles(shuffle(singles), liveSingles ? [liveM.a[0], liveM.b[0]] : null);

    // Partnerships already done (played together, or together in the kept draw)
    const partnered = new Set();
    played.filter(m => m.type === 'D').forEach(m => [m.a, m.b].forEach(tm => partnered.add(key(...tm))));
    if (kept.length) t.draws[kept[0].round].teams.forEach(tm => partnered.add(key(...tm)));
    const byes = {};
    active.forEach(p => { byes[p] = 0; });
    t.draws.slice(0, base).forEach(d => { if (d && d.bye in byes) byes[d.bye]++; });

    // Greedy: each new draw covers as many new partnerships as possible, sitting out whoever sat out least.
    const draws = [];
    if (active.length >= 4) {
      const options = matchings(active);
      for (;;) {
        let best = null, bestScore = 0;
        shuffle(options).forEach(o => {
          const gain = o.teams.filter(tm => !partnered.has(key(...tm))).length;
          if (!gain) return;
          const score = gain * 100 - (o.bye ? byes[o.bye] * 10 : 0);
          if (score > bestScore) { best = o; bestScore = score; }
        });
        if (!best) break;
        best.teams.forEach(tm => partnered.add(key(...tm)));
        if (best.bye) byes[best.bye]++;
        draws.push({ teams: best.teams.map(shuffle), bye: best.bye });
      }
    }

    // Lay out new rounds: a share of the singles, then that round's doubles draw.
    const fresh = [];
    const per = draws.length ? Math.ceil(singles.length / draws.length) : singles.length;
    let si = 0;
    draws.forEach((d, i) => {
      const round = base + i;
      for (let k = 0; k < per && si < singles.length; k++, si++) fresh.push({ type: 'S', round, a: [singles[si][0]], b: [singles[si][1]], w: null });
      circle(d.teams).forEach(r => r.pairs.forEach(([x, y]) => fresh.push({ type: 'D', round, a: x, b: y, w: null })));
    });
    for (; si < singles.length; si++) fresh.push({ type: 'S', round: base + draws.length, a: [singles[si][0]], b: [singles[si][1]], w: null });

    t.draws = t.draws.slice(0, base);
    while (t.draws.length < base) t.draws.push(null);
    t.draws.push(...draws);
    t.revealed = t.revealed.filter(r => r < base);
    t.matches = [...played, ...kept, ...fresh];
    t.matches.forEach((m, i) => { m.id = i; });

    // Keep the game in progress if it survived the change
    const first = t.matches.find(m => m.w == null);
    t.live = liveM && first && (kept.includes(liveM) ? first === liveM :
      liveSingles && first.type === 'S' && key(first.a[0], first.b[0]) === key(liveM.a[0], liveM.b[0])) ? first.id : null;
    t.changed = true;
    return t;
  }

  function leave(t, name) {
    t.left = t.left || [];
    if (!t.left.includes(name)) t.left.push(name);
    return replan(t);
  }

  function join(t, name) {
    t.left = (t.left || []).filter(p => p !== name);
    if (!t.players.includes(name)) t.players.push(name);
    return replan(t);
  }

  const winPct = s => (s.p ? s.w / s.p : 0);

  // Per-player wins/losses from played matches. mode: 'all' | 'S' | 'D'
  // Ranked by wins, then fewer losses, then singles wins (overall table only).
  // Once someone has left or joined, game counts differ, so rank by win % first.
  // Players who left go to the bottom.
  function standings(t, mode) {
    const left = t.left || [];
    const st = {};
    t.players.forEach(p => { st[p] = { name: p, p: 0, w: 0, l: 0, sw: 0, left: left.includes(p) }; });
    t.matches.forEach(m => {
      if (m.w == null || (mode !== 'all' && m.type !== mode)) return;
      const apply = (side, won) => side.forEach(name => {
        const s = st[name];
        if (!s) return;
        s.p++;
        if (won) { s.w++; if (m.type === 'S') s.sw++; } else s.l++;
      });
      apply(m.a, m.w === 'a');
      apply(m.b, m.w === 'b');
    });
    return Object.values(st).sort((x, y) =>
      (x.left - y.left) ||
      (t.changed ? winPct(y) - winPct(x) : 0) ||
      y.w - x.w || x.l - y.l || (mode === 'all' ? y.sw - x.sw : 0) || x.name.localeCompare(y.name));
  }

  // Doubles results per team (pair of players), across one or more tournaments.
  // Ranked by win %, then wins, then fewer games.
  function teamStandings(tournaments) {
    const st = {};
    tournaments.forEach(t => t.matches.forEach(m => {
      if (m.w == null || m.type !== 'D') return;
      [[m.a, m.w === 'a'], [m.b, m.w === 'b']].forEach(([team, won]) => {
        const k = key(...team);
        const s = st[k] || (st[k] = { names: k.split('|'), p: 0, w: 0, l: 0 });
        s.p++; won ? s.w++ : s.l++;
      });
    }));
    return Object.values(st).sort((x, y) => winPct(y) - winPct(x) || y.w - x.w || x.p - y.p || x.names.join().localeCompare(y.names.join()));
  }

  const api = { shuffle, circle, counts, build, replan, leave, join, standings, teamStandings, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sched = api;
})(this);
