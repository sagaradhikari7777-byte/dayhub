# DayHub validation record

Validated 28 September 2026. This record distinguishes local checks from deployment and physical-device checks.

## Automated

- TypeScript: `npm run typecheck` passes.
- Production compilation: `npm run build` passes and generates the PWA precache asset list.
- Fifteen integration/unit tests pass: the original nine SQLite/domain tests plus six Upstash tests covering all entry collections, concurrent writes, conflicts, account isolation, namespace isolation from Together, idempotency, price history/alerts, recurring successors, backup restore, failure retention and session-key derivation.
- The Upstash Lua commit script was also executed locally with fakeredis/Lua: successful commit, stale-revision rejection, owner index, reset tombstone and Together key preservation passed. This is not a live Upstash service test.
- Dependency audit performed during implementation: no high/critical production dependency findings at that time. Repeat before release.

## Browser checks

| Flow                              | Result                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Onboarding and skip               | Steps rendered; skip enters the app with editable samples                                   |
| Task add, edit, complete          | Passed; edited title persists after reload                                                  |
| Task deletion                     | Passed through repository integration test, not browser confirmation                        |
| Event add/edit                    | Passed; native time input issue fixed, 10:30–11:00 persisted                                |
| Bill add/mark paid                | Passed; status and activity reflect payment                                                 |
| Expense add                       | Passed; spending totals update from stored data                                             |
| Note add/pin                      | Passed; note appears on Home                                                                |
| Delivery add                      | Passed; courier and expected date display                                                   |
| Product add and target edit       | Passed                                                                                      |
| Price change/history/notification | 100 → 79 produced two points, target alert, low/high/average values                         |
| Purchase/savings                  | Purchase at 70 from original tracked 100 showed 30 saved                                    |
| Search                            | Results across the seven personal-data modules                                              |
| Product filters                   | Target Reached filter verified                                                              |
| Theme                             | Light and dark rendered; preference survives reload                                         |
| Persistence                       | Refresh and a later browser session retained server-backed records                          |
| Offline write                     | Server stopped; new task appeared locally with one queued write and a friendly sync message |
| Reconnection                      | Queue returned to All changes saved after server restart                                    |
| Layout                            | 390×844 and 430×932 iframe viewports inspected in Chromium; no horizontal overflow          |
| Navigation                        | Main tabs, collection/detail views and visible detail back controls exercised               |

The browser preview was HTTP Chromium. It is not equivalent to physical iPhone Safari validation. Weather showed its unavailable/retry state under the environment's network restrictions. Deliberately stopping the server produced expected failed-request logs. No claim is made that every possible control or recurrence combination was manually exercised.

## Release checks still required

1. Deploy to HTTPS Vercel with PostgreSQL and stable secrets. Verify server persistence across redeployments and database backups.
2. Install on a physical iPhone, close/reopen the app, restart the phone, then verify saved items and safe-area behavior. Test Safari and the installed PWA separately.
3. In the production build, visit online, wait for service-worker installation, close the app, switch to airplane mode and reopen. Create/edit a task; reconnect and confirm exactly one server record.
4. Enable optional push with VAPID keys, grant permission, trigger a price alert, and verify delivery while the Home Screen app is closed. Do not expect precise background task reminders from the daily price cron.
5. Verify city weather lookup and a representative permitted retailer URL from the deployed network. Confirm blocked stores still allow manual entry.
6. Confirm cron authorization and actual Vercel scheduling; inspect its checked/failed/limited result.
7. Test backup export/restore on a second device before relying on anonymous-session recovery.

No live Vercel deployment, hosted PostgreSQL transaction, physical iPhone installation, background push delivery or successful external retailer/weather request was verified in this environment.

## Deployment follow-up

The user deployed the original ZIP with Vercel Drop at `https://dayhub-wine.vercel.app`. Its `/api/data` returned HTTP 503 before storage was connected. Earlier Together configuration was identified as Upstash Redis `together-db`; this update adds compatibility with that provider. The Vercel connector returns HTTP 403 for team `together20`, so no live credentials, database connection or deployment changes were made by the assistant. The updated ZIP must be deployed and connected before Upstash end-to-end persistence can be marked verified.
