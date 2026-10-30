# Foosball Cup

Phone app for running a 4-8 player foosball tournament with singles and doubles. Static site, hosted on GitHub Pages, all data stored on the phone.

## Format

- Everyone plays everyone once in singles.
- Doubles are played in random "draws": players are split into teams of two (one sits out if the count is odd) and those teams all play each other.
- Across all draws every pair of players is on the same team exactly once, and with an odd count everyone sits out exactly once.
- The tournament runs in rounds: a few singles (2 for 5 players), then one doubles draw played out, then the next round.
- No scores are kept: tap Play when a game starts, then tap the winning side when it ends.
- Everyone plays the same number of games. Ranking: wins, then fewest losses, then singles wins.
- Table > Teams shows each doubles pairing's record; History shows all-time player and team records.

## Leaving early / arriving late

Header > Players. When someone leaves, their unplayed games are dropped (no forfeits), games already played stay, and the remaining doubles are redrawn so the players still there partner everyone they haven't partnered yet. A late arrival gets singles against everyone still there and is added to the doubles draws. After either change the ranking switches to win % (then wins), since game counts are no longer equal; players who left are shown greyed out at the bottom and can't win. Both can be undone straight after.

| Players | Singles | Doubles | Total | Games each |
|---|---|---|---|---|
| 4 | 6 | 3 | 9 | 6 |
| 5 | 10 | 5 | 15 | 8 |
| 6 | 15 | 15 | 30 | 15 |
| 7 | 21 | 21 | 42 | 18 |
| 8 | 28 | 42 | 70 | 28 |

## Storage

Everything is saved in the browser's localStorage on the phone that runs the tournament (player list, current tournament, history). Use History > Export backup to save a JSON file, and Import to restore or move to another phone. Add the page to the home screen: it then works offline, and on iPhone home-screen apps are not subject to Safari's 7-day storage cleanup.

## Files

- `index.html` - the app (UI, storage)
- `schedule.js` - scheduling and standings logic
- `sw.js`, `manifest.webmanifest`, `icon*` - offline support and home-screen install
- `test/` - run `node test/schedule.test.js` and `node test/changes.test.js` to check the schedule, leave/join and team stats

## Deploy

Push to a GitHub repo, then Settings > Pages > Deploy from branch > `main` / root. When you change files, bump `CACHE` in `sw.js` so phones pick up the update.
