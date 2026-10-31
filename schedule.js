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
  //  - Which singles go in which round, and the game order, are chosen so nobody sits out for long (see layout).
  function build(players) {
    const singles = [];
    players.forEach((x, i) => players.slice(i + 1).forEach(y => singles.push([x, y])));
    const draws = circle(shuffle(players)).map(d => ({ teams: d.pairs.map(shuffle), bye: d.bye }));
    const plan = layout(singles, draws, 0, players, {});
    // w = winning side ('a' or 'b'), null until the game is played
    plan.matches.forEach((m, i) => { m.id = i; });
    return {
      id: Date.now(),
      started: new Date().toISOString(),
      finished: null,
      players: players.slice(),
      left: [],        // players who went home
      changed: false,  // true once anyone left or joined
      draws: plan.draws,
      revealed: [],
      live: null,
      matches: plan.matches
    };
  }

  // Sit-out gaps of a game order: for each player, the runs of games they watch (before their first game,
  // between games and after their last). Score = longest run first, then how uneven the runs are,
  // then how often someone plays two games back to back.
  function gapScore(matches, players, lastPlayed) {
    let worst = 0, sq = 0, b2b = 0;
    players.forEach(p => {
      let last = lastPlayed[p] ?? -1;
      matches.forEach((m, i) => {
        if (!m.a.includes(p) && !m.b.includes(p)) return;
        const gap = i - last - 1;
        worst = Math.max(worst, gap); sq += gap * gap;
        if (gap === 0 && i > 0) b2b++;
        last = i;
      });
      const end = matches.length - last - 1;
      worst = Math.max(worst, end); sq += end * end;
    });
    return worst * 100000 + sq * 10 + b2b;
  }

  // Lay out singles and doubles draws into rounds and order the games so waits are short and even.
  // Greedy with random tie-breaks, repeated, keeping the best order found.
  //  lastPlayed: { player: index of their last game relative to the first new game (-1 = played just before) }
  function layout(singles, draws, base, players, lastPlayed, tries = 150) {
    let best = null, bestScore = Infinity;
    for (let t = 0; t < tries; t++) {
      const order = shuffle(draws);
      const pool = shuffle(singles);
      const last = { ...lastPlayed };
      const out = [];
      const wait = p => out.length - (last[p] ?? -1) - 1;   // games watched since they last played
      // Prefer games whose players have waited longest; avoid anyone who just played
      const score = (ps, bonus) => ps.reduce((s, p) => s + wait(p) * 10 - (wait(p) === 0 ? 40 : 0) + (bonus.includes(p) ? 25 : 0), 0) + Math.random();
      const play = (m) => { [...m.a, ...m.b].forEach(p => { last[p] = out.length; }); out.push(m); };
      const pick = (list, ps, bonus) => {
        let bi = 0, bs = -Infinity;
        list.forEach((x, i) => { const s = score(ps(x), bonus); if (s > bs) { bs = s; bi = i; } });
        return list.splice(bi, 1)[0];
      };
      order.forEach((d, i) => {
        const round = base + i;
        // Spread the singles evenly over the remaining rounds; the player sitting out this draw plays singles first
        const k = Math.ceil(pool.length / (order.length - i));
        const bonus = d.bye ? [d.bye] : [];
        for (let j = 0; j < k && pool.length; j++) {
          const [x, y] = pick(pool, s => s, bonus);
          play({ type: 'S', round, a: [x], b: [y], w: null });
        }
        const games = [];
        circle(d.teams).forEach(r => r.pairs.forEach(([x, y]) => games.push({ type: 'D', round, a: x, b: y, w: null })));
        while (games.length) play(pick(games, g => [...g.a, ...g.b], []));
      });
      while (pool.length) {
        const [x, y] = pick(pool, s => s, []);
        play({ type: 'S', round: base + order.length, a: [x], b: [y], w: null });
      }
      const s = gapScore(out, players, lastPlayed);
      if (s < bestScore) { bestScore = s; best = { matches: out, draws: order }; }
    }
    return best;
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

  // Rebuild the unplayed part of the schedule after someone leaves or joins.
  //  - Played games are kept as they are (no forfeits, no voided wins).
  //  - A game in progress is always kept, even if one of its players is leaving: they finish it first.
  //  - The current doubles draw is kept if it is already drawn and everyone in it is still here.
  //  - Remaining singles: every pairing of players still here that has not been played.
  //  - Remaining doubles: new draws chosen so players still here partner everyone they have not partnered yet.
  //  - New games are ordered with layout(), so waits stay short.
  function replan(t) {
    t.left = t.left || [];
    const active = t.players.filter(p => !t.left.includes(p));
    const old = t.matches;
    const liveM = t.live != null && old[t.live] && old[t.live].w == null ? old[t.live] : null;
    const played = old.filter(m => m.w != null).sort((x, y) => x.round - y.round || x.id - y.id);
    const next = old.find(m => m.w == null);
    let base = played.length ? Math.max(...played.filter(m => !m.extra).map(m => m.round), -1) + 1 : 0;

    let kept = [];
    if (next && next.type === 'D' && t.revealed.includes(next.round) &&
        t.draws[next.round].teams.flat().every(p => active.includes(p))) {
      kept = old.filter(m => m.w == null && m.type === 'D' && m.round === next.round);
      base = Math.max(base, next.round + 1);
    }
    // A game in progress outside the kept draw becomes a round of its own
    const extraDraws = [];
    if (liveM && !kept.includes(liveM)) {
      liveM.round = base;
      extraDraws.push(liveM.type === 'D' ? { teams: [liveM.a, liveM.b], bye: null } : null);
      kept = [liveM];
      base++;
    }

    // Singles still to play (the game in progress counts as done)
    const singlesDone = new Set([...played, ...kept].filter(m => m.type === 'S').map(m => key(...m.a, ...m.b)));
    const singles = [];
    active.forEach((x, i) => active.slice(i + 1).forEach(y => { if (!singlesDone.has(key(x, y))) singles.push([x, y]); }));

    // Partnerships already done (played together, or together in a kept game or draw)
    const partnered = new Set();
    [...played, ...kept].filter(m => m.type === 'D').forEach(m => [m.a, m.b].forEach(tm => { if (tm.length === 2) partnered.add(key(...tm)); }));
    if (kept.length && kept[0] !== liveM) t.draws[kept[0].round].teams.forEach(tm => partnered.add(key(...tm)));
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

    // When each player last played, counted back from the first new game
    const before = [...played.slice().sort((x, y) => (x.at || 0) - (y.at || 0) || x.id - y.id), ...kept];
    const lastPlayed = {};
    before.forEach((m, i) => [...m.a, ...m.b].forEach(p => { lastPlayed[p] = i - before.length; }));
    const plan = layout(singles, draws, base, active, lastPlayed);

    t.draws = t.draws.slice(0, base - extraDraws.length);
    while (t.draws.length < base - extraDraws.length) t.draws.push(null);
    t.draws.push(...extraDraws, ...plan.draws);
    t.revealed = t.revealed.filter(r => r < base - extraDraws.length);
    if (liveM && liveM.type === 'D' && extraDraws.length) t.revealed.push(liveM.round);
    t.matches = [...played, ...kept, ...plan.matches];
    t.matches.forEach((m, i) => { m.id = i; });
    t.live = liveM ? liveM.id : null;
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
  // Ranked by win %, so playing more games is not an advantage; ties go to more wins, fewer losses,
  // then singles wins (overall table). With everyone on the same number of games this is the same as most wins.
  // `ranked` is false for players who left, and for anyone with under half the games of the busiest player
  // (they are listed below the ranked players, so a 1-0 record can't top the table).
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
    const rows = Object.values(st);
    const most = Math.max(0, ...rows.filter(s => !s.left).map(s => s.p));
    rows.forEach(s => { s.ranked = !s.left && s.p > 0 && s.p * 2 >= most; });
    return rows.sort((x, y) =>
      (y.ranked - x.ranked) || (x.left - y.left) ||
      winPct(y) - winPct(x) ||
      y.w - x.w || x.l - y.l || (mode === 'all' ? y.sw - x.sw : 0) || x.name.localeCompare(y.name));
  }

  // Tournament winner: best ranked player overall (null if nobody has played)
  function champion(t) {
    return standings(t, 'all').find(s => s.ranked) || null;
  }

  // Doubles results per team (pair of players), across one or more tournaments.
  // Ranked by win %, then wins, then fewer games.
  function teamStandings(tournaments) {
    const st = {};
    tournaments.forEach(t => t.matches.forEach(m => {
      if (m.w == null || m.type !== 'D') return;
      [[m.a, m.w === 'a'], [m.b, m.w === 'b']].forEach(([team, won]) => {
        if (team.length !== 2) return;   // an added 2-v-1 game has no team on the single side
        const k = key(...team);
        const s = st[k] || (st[k] = { names: k.split('|'), p: 0, w: 0, l: 0 });
        s.p++; won ? s.w++ : s.l++;
      });
    }));
    return Object.values(st).sort((x, y) => winPct(y) - winPct(x) || y.w - x.w || x.p - y.p || x.names.join().localeCompare(y.names.join()));
  }

  // Add a game that was missed (any 1 or 2 players a side, winner known). Stored as played, marked extra.
  function addGame(t, a, b, w) {
    const real = t.matches.filter(m => !m.extra).map(m => m.round);
    const m = { type: a.length === 1 && b.length === 1 ? 'S' : 'D', round: real.length ? Math.max(...real) : 0,
      a: a.slice(), b: b.slice(), w, extra: true, at: Date.now(), id: t.matches.length };
    t.matches.push(m);
    return m;
  }

  function removeGame(t, id) {
    t.matches.splice(id, 1);
    t.matches.forEach((m, i) => { m.id = i; });
    if (t.live != null && t.live > id) t.live--;
  }

  // Games that can be played instead of the next one (someone isn't ready): unplayed, already scheduled,
  // with known players (doubles only from a draw that has been drawn). Games without the next game's
  // players come first, then in schedule order.
  function swapOptions(t) {
    const next = t.matches.find(m => m.w == null);
    if (!next) return [];
    const busy = [...next.a, ...next.b];
    return t.matches
      .filter(m => m.w == null && m !== next && (m.type === 'S' || t.revealed.includes(m.round)))
      .map(m => ({ m, clash: [...m.a, ...m.b].filter(p => busy.includes(p)).length }))
      .sort((x, y) => x.clash - y.clash || x.m.id - y.m.id)
      .map(x => x.m);
  }

  // Swap two games' places in the schedule (each keeps its round). Calling it again undoes it.
  function swapGames(t, i, j) {
    [t.matches[i], t.matches[j]] = [t.matches[j], t.matches[i]];
    t.matches.forEach((m, k) => { m.id = k; });
  }

  const api = { shuffle, circle, counts, build, layout, gapScore, replan, leave, join, standings, champion, teamStandings, addGame, removeGame, swapOptions, swapGames, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sched = api;
})(this);
