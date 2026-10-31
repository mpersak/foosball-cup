// Share links: tournament results packed into the link itself (after #s=), so no server is needed.
// Anyone with the link can open it and see the results read-only.
//   pack/unpack: tournaments <-> compact arrays (player indexes instead of names)
//   encode/decode: compact arrays <-> deflate-compressed base64url text
(function (root) {
  const VERSION = 1;

  // Per tournament: [id, started, finished, players, leftIdx, changed, games]
  // Per game: [winner (0 = a, 1 = b), round, flags (1 doubles, 2 added), aIdx, bIdx, playedAt]
  // Only played games are included.
  function pack(tournaments) {
    return [VERSION, tournaments.map(t => {
      const ix = p => t.players.indexOf(p);
      const games = t.matches.filter(m => m.w != null)
        .map(m => [m.w === 'a' ? 0 : 1, m.round, (m.type === 'D' ? 1 : 0) | (m.extra ? 2 : 0), m.a.map(ix), m.b.map(ix), m.at || 0]);
      return [t.id, t.started, t.finished, t.players, (t.left || []).map(ix), t.changed ? 1 : 0, games];
    })];
  }

  function unpack(data) {
    if (!Array.isArray(data) || data[0] !== VERSION || !Array.isArray(data[1])) throw new Error('Unsupported link');
    return data[1].map(([id, started, finished, players, left, changed, games]) => {
      if (!Array.isArray(players) || !Array.isArray(games)) throw new Error('Bad link');
      const name = i => { if (typeof players[i] !== 'string') throw new Error('Bad link'); return players[i]; };
      return {
        id, started, finished, players: players.map(String), left: left.map(name), changed: !!changed,
        draws: [], revealed: [], live: null, shared: true,
        matches: games.map(([w, round, flags, a, b, at], i) => ({
          id: i, w: w ? 'b' : 'a', round, type: flags & 1 ? 'D' : 'S', extra: !!(flags & 2),
          a: a.map(name), b: b.map(name), at
        }))
      };
    });
  }

  const toB64url = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromB64url = text => {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  };
  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  // 'z' prefix = deflate-compressed; 'j' = plain (browsers without CompressionStream)
  async function encode(tournaments) {
    const bytes = new TextEncoder().encode(JSON.stringify(pack(tournaments)));
    if (typeof CompressionStream === 'undefined') return 'j' + toB64url(bytes);
    return 'z' + toB64url(await pipe(bytes, new CompressionStream('deflate-raw')));
  }

  async function decode(text) {
    const kind = text[0], bytes = fromB64url(text.slice(1));
    const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return unpack(JSON.parse(new TextDecoder().decode(raw)));
  }

  const api = { pack, unpack, encode, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Share = api;
})(this);
