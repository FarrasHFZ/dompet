# Dompet Saya (personal-lab)

Phone-first personal expense tracker. Data lives in a Google Sheet.

- `web/` — the PWA (plain HTML/CSS/JS, no build step). Hosted on Cloudflare Pages.
- `apps-script/` — JSON API on Google Apps Script, bound to the Sheet. First `init` call claims the access code.

## Deploy the API
Uses the `personal` clasp profile:

    cd apps-script
    clasp push --user personal
    clasp create-version "note" --user personal
    clasp update-deployment <deploymentId> --versionNumber <n> --user personal

The deployment ID is the long part of `web/config.js`'s URL.

## Deploy the web app
Cloudflare Pages, build command empty, output directory `web`.
