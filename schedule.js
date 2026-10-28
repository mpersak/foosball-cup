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
      draws,
      revealed: [],
      live: null,
      matches
    };
  }

  // Per-player wins/losses from played matches. mode: 'all' | 'S' | 'D'
  // Ranked by wins, then fewer losses, then singles wins (overall table only), then name.
  function standings(t, mode) {
    const st = {};
    t.players.forEach(p => { st[p] = { name: p, p: 0, w: 0, l: 0, sw: 0 }; });
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
    return Object.values(st)
      .sort((x, y) => y.w - x.w || x.l - y.l || (mode === 'all' ? y.sw - x.sw : 0) || x.name.localeCompare(y.name));
  }

  const api = { shuffle, circle, counts, build, standings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sched = api;
})(this);
