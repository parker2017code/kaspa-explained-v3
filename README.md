# Kaspa Explained v3: the receipt

A fan-made, unofficial explainer for Kaspa, laid out as one long thermal till receipt that prints live at about ten slips (blocks) a second.

- Static: HTML, CSS and JS with no build step. Published on GitHub Pages.
- Live numbers come from the public `api.kaspa.org`. If it can't be reached, the page says **SIMULATED** and leaves the numbers blank.
- Every numbered claim links to a source in **Receipts**. No price talk.
- `noindex` and `robots.txt` are on. This is a preview.

## Refresh the "Overheard at the counter" posts

```
python3 scripts/refresh-x.py   # rewrites data/x-feed.json from scripts/x-sources.json
```

Design notes and review rounds are kept outside the repo.
