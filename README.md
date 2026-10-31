# Foosball Cup

Phone app for running a 4-8 player foosball tournament with singles and doubles. Static site, hosted on GitHub Pages, all data stored on the phone.

## Format

- Everyone plays everyone once in singles.
- Doubles are played in random "draws": players are split into teams of two (one sits out if the count is odd) and those teams all play each other.
- Across all draws every pair of players is on the same team exactly once, and with an odd count everyone sits out exactly once.
- The tournament runs in rounds: a few singles (2 for 5 players), then one doubles draw played out, then the next round.
- Games are ordered so nobody sits out for long: at most 2 games in a row with 4-6 players, 4 with 7-8.
- No scores are kept: tap Play when a game starts, then tap the winning side when it ends.
- Someone not ready? Swap game brings another already-scheduled game forward.

| Players | Singles | Doubles | Total | Games each |
|---|---|---|---|---|
| 4 | 6 | 3 | 9 | 6 |
| 5 | 10 | 5 | 15 | 8 |
| 6 | 15 | 15 | 30 | 15 |
| 7 | 21 | 21 | 42 | 18 |
| 8 | 28 | 42 | 70 | 28 |

## Ranking and stats

- Tournament table: ranked by win %, so playing more games is no advantage; ties go to more wins. Players with under half the games of the busiest player are listed but not ranked, and players who left can't win.
- Table > Singles / Doubles / Teams: the same split by game type, and each doubles pairing's record.
- History: all-time rating (Elo, starting at 1000: beating stronger players gains more), cups, and all-time team records. Tap a player for their profile: rating trend, singles and doubles record, record with each partner and against each opponent, best winning run.
- Finished tournaments keep their full tables and game list. A missed game can be added afterwards (any 1-2 players a side).

## Leaving early / arriving late

Header > Players. When someone leaves, a game in progress is still finished, their other unplayed games are dropped (no forfeits), games already played stay, and the remaining doubles are redrawn so the players still there partner everyone they haven't partnered yet. A late arrival gets singles against everyone still there and is added to the doubles draws. Both can be undone straight after.

## Sharing

Share results (one tournament) or Share all-time stats creates a link with the results packed into it, so no server or account is needed. Anyone with the link sees the results read-only and can save a copy to their own phone. The link is a snapshot: share again after new games.

## Storage

Everything is saved in the browser's localStorage on the phone that runs the tournament (player list, current tournament, history). Use History > Export backup to save a JSON file, and Import to restore or move to another phone. Add the page to the home screen: it then works offline, and on iPhone home-screen apps are not subject to Safari's 7-day storage cleanup.

## Files

- `index.html` - the app (UI, storage)
- `schedule.js` - scheduling, game order, leave/join, standings
- `stats.js` - ratings, all-time table, player profiles
- `share.js` - share link encoding
- `sw.js`, `manifest.webmanifest`, `icon*` - offline support and home-screen install
- `test/` - run `node test/schedule.test.js`, `node test/changes.test.js` and `node test/stats.test.js`

## Deploy

Push to a GitHub repo, then Settings > Pages > Deploy from branch > `main` / root. When you change files, bump `CACHE` in `sw.js` so phones pick up the update.
