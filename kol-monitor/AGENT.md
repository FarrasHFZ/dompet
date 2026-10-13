# KOL trend monitor: agent runbook

Goal: for each managed KOL in `kols.json`, say whether they are **trending now**, have **potential to trend**, are steady, or cooling, from daily TikTok + Instagram snapshots.

## Daily run
1. For every KOL/platform with `verified: true`, open the profile in the built-in browser pane and run the snippet from `tools/collect-snippets.md`.
2. Apply the impostor check in that file. If a handle fails, set it `verified:false` and flag it in the summary. Never record data from an unverified handle.
3. Save each result: `node tools/kol.mjs add "<KOL name>" '<json>'` (writes `data/history.json`, one row per KOL/platform/day).
4. `node tools/kol.mjs report` writes `reports/<date>.md`.
5. Reply with a short brief: who is TRENDING / POTENTIAL / COOLING and why, in plain language, plus handles that need the owner's attention. Add a `web` look (news, viral clips) for any KOL flagged TRENDING or POTENTIAL, to explain the cause.
6. Commit `data/` and `reports/`.

## Limits (be honest in every brief)
- Logged-out access only: no per-post likes/views on Instagram; TikTok gives totals (followers, likes, video count), not per-video stats.
- So signals are follower velocity/acceleration, TikTok likes per new video, and posting cadence. The status is a screen, not proof; the first 7 days are collection only.
- Instagram may rate-limit; one profile per navigation, no loops faster than a few seconds.
