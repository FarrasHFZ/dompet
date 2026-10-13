# KOL trend monitor: agent runbook

Goal: for every managed KOL (383 in `kols.json`, from the owner's link list), say who is **trending now**, who has **potential to trend**, who is steady or cooling, and which are worth investing in.

Two layers:
1. **Numbers (everyone):** daily follower snapshots on Instagram, TikTok and YouTube.
2. **Events (scanned creators only):** news, viral clips and who they are linked with, from `tools/trend-scan.md`. Only creators listed in `data/scans.json` get an Invest score.

## Files
- `data/roster.json`: parsed owner links (`node tools/import-links.mjs "<links.txt>"`).
- `data/overrides.json`: names/notes/tier for creators the owner named.
- `kols.json` + `data/history.json`: built by `node tools/build-kols.mjs` from roster + `data/inbox.jsonl` (raw readings).
- `data/signals.json` (events), `data/scans.json` (who has been event-scanned), `data/audience/` (measured demographics, owner-supplied).
- `web/index.html` (dashboard), `web/artifact.html` (private claude.ai copy).

## Collection (browser pane, normal visitor, no login)
Instagram and TikTok need the browser pane; YouTube does not.
1. `node tools/collector.mjs` (local receiver on 127.0.0.1:8799; leave running).
2. In a tab on instagram.com, store the reader in localStorage (`localStorage.k`, see `tools/collect-snippets.md`), then `browser_batch` of `navigate` + `javascript_tool "eval(localStorage.k)()"` pairs (max 25 actions per batch, about 12 profiles). Readings accumulate in `localStorage.kolres`.
3. Hand over: `location.href='http://127.0.0.1:8799/ingest?d='+encodeURIComponent(localStorage.kolres)`. They land in `data/inbox.jsonl`.
4. Same for TikTok on tiktok.com (reader reads `__UNIVERSAL_DATA_FOR_REHYDRATION__`).
5. YouTube: `node tools/collect-youtube.mjs` (plain throttled requests).
6. Do not impersonate search crawlers or log in to get past walls. If a profile is private or missing, record it and flag it.

Cadence: **daily = tier A** (the owner's named creators + top 40 by reach, `tier:"A"` in kols.json, about 45 creators). **Weekly (Monday) = everyone.** A full pass is about 60 batch calls, so do not run it daily.
Only collect handles that exist in `kols.json`. Retry once if TikTok redirects to its home page (a known glitch).

## After collecting
1. `node tools/build-kols.mjs <YYYY-MM-DD>` merges the day's inbox into history and flags handles that are missing, private, or under 1,000 followers.
2. Event scan for tier A: follow `tools/trend-scan.md`, append to `data/signals.json`, update `data/scans.json`. Extend scans to the weekly top movers (biggest 7-day follower gain) and anyone the owner asks about.
3. `node tools/build.mjs` scores everyone and rebuilds the dashboard.
4. Republish the private page: Artifact tool, file_path `kol-monitor/web/artifact.html`, url `https://claude.ai/artifact/RkzS3Rsu8Jk6sZdaJXh1SC`.
5. **Public site is paused.** `tools/publish-site.mjs` pushes to https://farrashfz.github.io/kol-radar/ (public, indexable). The owner approved that for the 8-creator version; the 383-creator roster is a bigger exposure, so do not run it until the owner confirms.
6. Brief: lead with what happened (event layer), then the numbers; name handles that need the owner's input. State data limits.
7. Commit `data/`, `reports/` and `web/` (do not push).

## Limits (say so in every brief)
- Logged-out access: Instagram gives follower count only (no likes/views); TikTok gives followers, total likes and video count; YouTube gives subscribers. TikTok and YouTube round to three digits.
- Audience demographics are not public. Measured demographics come only from the creator's own Insights exports in `data/audience/<name>.json`. Never invent them.
- Statuses need 7 days of snapshots. Invest scores are heuristic and unscored creators have no verdict.
