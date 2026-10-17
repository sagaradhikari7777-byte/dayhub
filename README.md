# Clan Cup

A Clash of Clans knockout tournament app that works on iPhone, Android and desktop.

- **Register:** players search for their clan by name or #tag and tap Register next to their name. They can also register with their own player tag. Names and Town Hall levels come straight from the game.
- **Players:** shows who's registered, a Town Hall chart and a clan breakdown.
- **Bracket:** the full knockout tree. 30 players gives 15 → 8 → 4 → 2 → 1 matches. When a round has an odd number of players, one gets a bye, and never in two rounds in a row. Tap any match to see each game's stars, destruction % and time, the series score, and how much the winner led by.
- **Admin:** organisers sign in with a password. They can set best of 1/3/5, open or close registration, draw the bracket (random or registration order), and enter results per game or as a walkover.

A game is won on stars, then destruction %, then the faster attack time. A match is won by the first player to take the majority of games, for example 2 in a best of 3. If an admin edits an earlier result and a different player advances, any later result that player is no longer part of is flagged "Re-enter result". It is never silently kept.

## Run locally

Use Node.js 22.

```sh
npm ci
cp .env.example .env.local   # optional locally
npm run dev
```

Open http://localhost:3000. Locally, with no `ADMINS` set, the admin password is `admin`. Data is saved to `.data/clancup.json`.

```sh
npm test
npm run typecheck
npm run build
```

## Deploy on Vercel

1. Import this repository into Vercel as a Next.js project.
2. **Storage:** connect an Upstash Redis database to the project. The existing `together-db` integration works, because Clan Cup only uses the `clancup:v1:tournament` key. Vercel supplies `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_URL`/`KV_REST_API_TOKEN`.
3. **Admins:** set `ADMINS` to `Name:password` pairs, separated by commas, for example `Sagar:something-long,Friend:another-long-one`. The name is shown on each result the admin enters. Optionally set `SESSION_SECRET` (`openssl rand -hex 32`).
4. **Clash of Clans API (free):**
   1. Sign in at https://developer.clashofclans.com with your Supercell ID.
   2. Create a key with the allowed IP address `45.79.218.79`. Vercel has no fixed IP address, so requests go through RoyaleAPI's free proxy (`cocproxy.royaleapi.dev`), which uses that IP.
   3. Set the token as `COC_API_TOKEN`.

   Without a token, the app still works: players type their name, tag and Town Hall level by hand.

5. Redeploy after changing environment variables.
6. On iPhone, open the site in Safari, then choose Share → Add to Home Screen to use it like an app.

This app is not affiliated with, endorsed or sponsored by Supercell.
