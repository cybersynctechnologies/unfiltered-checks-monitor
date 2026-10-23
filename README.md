# Unfiltered Checks monitor

Tracks the public growth of the YouTube Shorts channel [@UnfilteredChecks](https://www.youtube.com/@UnfilteredChecks) against the 23 Oct 2026 forecast (2,000 to 3,000 subscribers by 23 Dec 2026).

**Live dashboard:** https://cybersynctechnologies.github.io/unfiltered-checks-monitor/

Free to run: it reads public YouTube pages only, with no API key or paid service.

## How it works

- `collect.mjs` takes one snapshot (subscribers, total views, video count, and views/likes for the latest 15 uploads) and appends it to `data/snapshots.json`.
- The GitHub Actions workflow `.github/workflows/collect.yml` runs it every hour, commits the new snapshot and republishes the dashboard to GitHub Pages. It also runs on every push to `main`, and can be run by hand from the Actions tab ("Run workflow") for an immediate check.
- `index.html`, `style.css` and `app.js` are the dashboard. "Refresh" reloads the latest check.

## Working on it locally

```sh
git pull                 # the workflow commits a snapshot every hour, so pull before editing
node collect.mjs         # take a snapshot
node server.mjs          # dashboard on http://localhost:4777; here "Refresh" takes a new snapshot
```

## Limits

- YouTube rounds subscriber counts above 1,000 (e.g. "1.2K"), so the dashboard marks those as approximate.
- The public feed only covers the latest 15 uploads.
- GitHub runs scheduled jobs on a best-effort basis; an hourly run can be a few minutes late or occasionally skipped.
