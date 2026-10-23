# Unfiltered Checks monitor

Tracks the public growth of the YouTube Shorts channel [@UnfilteredChecks](https://www.youtube.com/@UnfilteredChecks) against the 23 Oct 2026 forecast (2,000 to 3,000 subscribers by 23 Dec 2026).

**Live dashboard:** https://cybersynctechnologies.github.io/unfiltered-checks-monitor/

Free to run: it reads public YouTube pages only, with no API key or paid service.

## How it works

- `collect.mjs` takes one snapshot (subscribers, total views, video count, and views/likes for the latest 15 uploads) and appends it to `data/snapshots.json`.
- The GitHub Actions workflow `.github/workflows/collect.yml` runs it every hour, commits the new snapshot and republishes the dashboard to GitHub Pages. It also runs on every push to `main`, and can be run by hand from the Actions tab ("Run workflow") for an immediate check.
- `research.mjs` runs once a day from the same workflow. It searches YouTube for Shorts uploaded this month in the same niche (space, what-if, aliens, escape challenges, human body), ranks them by views per day and saves the top 18 to `data/research.json` as video ideas. Edit `QUERIES` in that file to change the niche.
- `index.html`, `style.css` and `app.js` are the dashboard. "Refresh" reloads the latest check. Besides growth against the forecast, it shows:
  - **What's working:** average views per topic, grouped by keywords in the titles (`TOPICS` in `app.js`).
  - **Pace badges:** each Short against his usual performance. "Breaking out" means a Short under three days old is running at 2× his usual pace or more, and is also shown as a banner at the top. The benchmark is his typical first-day views once enough Shorts have been tracked from launch, and his typical total views until then.
  - **Video ideas:** the daily research picks.

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
