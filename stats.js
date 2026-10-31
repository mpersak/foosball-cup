// All-time statistics across tournaments. Pure functions, no DOM - shared by the app and tests.
// Needs schedule.js (Sched) for standings/champion.
(function (root) {
  const Sched = root.Sched || (typeof require !== 'undefined' ? require('./schedule.js') : null);

  const START = 1000, K = 24;
  const winPct = s => (s.p ? s.w / s.p : 0);

  // Tournaments oldest first, and each tournament's played games in the order they were played.
  function chronological(tournaments) {
    return tournaments.slice().sort((x, y) => String(x.started).localeCompare(String(y.started)));
  }
  function playedGames(t) {
    return t.matches.filter(m => m.w != null).sort((x, y) => (x.at || 0) - (y.at || 0) || x.id - y.id);
  }

  // Elo rating: everyone starts at 1000. Beating a stronger side gains more than beating a weaker one,
  // so it reflects who you beat rather than how many games you played. A doubles side's strength is the
  // average of its two players; each player on the side gets the side's change.
  function ratings(tournaments) {
    const r = {}, games = {};
    const get = p => (r[p] ?? START);
    chronological(tournaments).forEach(t => playedGames(t).forEach(m => {
      const ra = m.a.reduce((s, p) => s + get(p), 0) / m.a.length;
      const rb = m.b.reduce((s, p) => s + get(p), 0) / m.b.length;
      const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
      const da = K * ((m.w === 'a' ? 1 : 0) - ea);
      m.a.forEach(p => { r[p] = get(p) + da; games[p] = (games[p] || 0) + 1; });
      m.b.forEach(p => { r[p] = get(p) - da; games[p] = (games[p] || 0) + 1; });
    }));
    return { rating: r, games };
  }

  // All-time player table: rating, cups (tournament wins), games, wins, losses.
  function allTime(tournaments) {
    const { rating } = ratings(tournaments);
    const rows = {};
    const row = p => rows[p] || (rows[p] = { name: p, rating: Math.round(rating[p] ?? START), cups: 0, t: 0, p: 0, w: 0, l: 0 });
    tournaments.forEach(t => {
      const champ = Sched.champion(t);
      Sched.standings(t, 'all').forEach(s => {
        if (!s.p) return;
        const a = row(s.name);
        a.t++; a.p += s.p; a.w += s.w; a.l += s.l;
      });
      if (champ && t.finished) row(champ.name).cups++;
    });
    return Object.values(rows).sort((x, y) => y.rating - x.rating || y.cups - x.cups || winPct(y) - winPct(x));
  }

  // One player's record: singles and doubles split, head-to-head in singles, results with each partner,
  // longest winning run, and rating after each game (for a trend line).
  function profile(tournaments, name) {
    const out = {
      name, singles: { p: 0, w: 0 }, doubles: { p: 0, w: 0 },
      rivals: {}, partners: {}, bestRun: 0, cups: 0, tournaments: 0, trend: []
    };
    let run = 0;
    const r = {};
    const get = p => (r[p] ?? START);
    chronological(tournaments).forEach(t => {
      let inIt = false;
      playedGames(t).forEach(m => {
        // keep ratings in step for the trend
        const ra = m.a.reduce((s, p) => s + get(p), 0) / m.a.length;
        const rb = m.b.reduce((s, p) => s + get(p), 0) / m.b.length;
        const da = K * ((m.w === 'a' ? 1 : 0) - 1 / (1 + Math.pow(10, (rb - ra) / 400)));
        m.a.forEach(p => { r[p] = get(p) + da; });
        m.b.forEach(p => { r[p] = get(p) - da; });

        const side = m.a.includes(name) ? 'a' : m.b.includes(name) ? 'b' : null;
        if (!side) return;
        inIt = true;
        const won = m.w === side;
        const mine = side === 'a' ? m.a : m.b, theirs = side === 'a' ? m.b : m.a;
        const rec = m.type === 'S' ? out.singles : out.doubles;
        rec.p++; if (won) rec.w++;
        run = won ? run + 1 : 0;
        out.bestRun = Math.max(out.bestRun, run);
        if (m.type === 'S') {
          const o = out.rivals[theirs[0]] || (out.rivals[theirs[0]] = { name: theirs[0], p: 0, w: 0 });
          o.p++; if (won) o.w++;
        } else {
          mine.filter(p => p !== name).forEach(pt => {
            const o = out.partners[pt] || (out.partners[pt] = { name: pt, p: 0, w: 0 });
            o.p++; if (won) o.w++;
          });
        }
        out.trend.push(Math.round(get(name)));
      });
      if (inIt) out.tournaments++;
      const champ = Sched.champion(t);
      if (t.finished && champ && champ.name === name) out.cups++;
    });
    const sortRec = list => Object.values(list).sort((x, y) => winPct(y) - winPct(x) || y.p - x.p);
    out.rivals = sortRec(out.rivals);
    out.partners = sortRec(out.partners);
    out.rating = Math.round(get(name));
    return out;
  }

  const api = { ratings, allTime, profile, START };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Stats = api;
})(this);
