#!/usr/bin/env python3
"""Refresh data/x-feed.json from public X posts.

No API keys live here. An agent (or person) fetches posts with the X connector's
public search, saves the raw JSON, then:

  python3 scripts/refresh-x.py query                      # print the search to run
  python3 scripts/refresh-x.py ingest RAW.json            # filter -> data/x-candidates.json
  (edit data/x-candidates.json: write "plain", optionally "tag"/"caveat"; delete any you don't want)
  python3 scripts/refresh-x.py publish --push             # validate, merge, commit, push

RAW.json can be an X API v2 style object ({"data":[...], "includes":{"users":[...]}})
or a plain list of {id, handle|username, date|created_at, text}.
"""
import json, re, subprocess, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FEED, CAND, SRC = ROOT / "data/x-feed.json", ROOT / "data/x-candidates.json", ROOT / "scripts/x-sources.json"
KEEP = 16
TAGS = {"dev news", "milestone", "testnet", "testnet target", "proposed", "announced", "explainer", "community count", "test, unaudited"}

def load(p, default=None):
    return json.loads(p.read_text()) if p.exists() else default

def clean(text):
    text = re.sub(r"https://t\.co/\S+", "", text)
    text = re.sub(r"^(?:@\w+\s+)+", "", text.strip())
    return text.strip()

def records(raw):
    if isinstance(raw, dict) and "data" in raw:
        users = {u["id"]: u for u in raw.get("includes", {}).get("users", [])}
        for p in raw["data"]:
            u = users.get(p.get("author_id"), {})
            yield {"id": p["id"], "handle": u.get("username") or p.get("username", ""), "date": p.get("created_at", ""),
                   "text": (p.get("note_tweet") or {}).get("text") or p.get("text", "")}
    else:
        for p in raw if isinstance(raw, list) else raw.get("items", []):
            yield {"id": str(p["id"]), "handle": p.get("handle") or p.get("username", ""), "date": p.get("date") or p.get("created_at", ""), "text": p.get("text", "")}

def ingest(path):
    src, feed = load(SRC), load(FEED, {"items": []})
    allow = {h.lower() for h in src["handles"]}; block = [w.lower() for w in src["block_words"]]
    have = {i["id"] for i in feed["items"]}
    out = []
    for r in records(load(pathlib.Path(path))):
        t = clean(r["text"]); low = t.lower()
        if r["id"] in have or r["handle"].lower() not in allow or len(t) < 40: continue
        if any(w in low for w in block): continue
        out.append({**r, "text": t, "url": f"https://x.com/{r['handle']}/status/{r['id']}", "plain": "", "tag": "dev news", "caveat": None})
    CAND.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(out)} candidates -> {CAND.relative_to(ROOT)}. Fill in 'plain' for the ones to keep (leave empty to skip), then run publish.")

def publish(push):
    feed, cand = load(FEED), load(CAND, [])
    new = []
    for c in cand:
        if not (c.get("plain") or "").strip(): continue
        assert re.fullmatch(r"https://x\.com/\w+/status/\d+", c["url"]), c["url"]
        assert c["url"].endswith(c["id"]), c["id"]
        assert c.get("tag") in TAGS, f"tag {c.get('tag')!r} not in {sorted(TAGS)}"
        datetime.datetime.fromisoformat(c["date"].replace("Z", "+00:00"))
        new.append({k: c.get(k) for k in ["id", "handle", "date", "url", "text", "plain", "tag", "caveat"]})
    ids = {i["id"] for i in new}
    items = sorted(new + [i for i in feed["items"] if i["id"] not in ids], key=lambda i: i["date"], reverse=True)[:KEEP]
    feed["items"] = items
    feed["updated"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    FEED.write_text(json.dumps(feed, indent=1, ensure_ascii=False) + "\n")
    if CAND.exists(): CAND.unlink()
    print(f"feed: {len(new)} new, {len(items)} total, updated {feed['updated']}")
    if push:
        g = lambda *a: subprocess.run(["git", "-C", str(ROOT), *a], check=True)
        g("add", "data/x-feed.json")
        if subprocess.run(["git", "-C", str(ROOT), "diff", "--cached", "--quiet"]).returncode:
            g("commit", "-m", f"Refresh X feed ({len(new)} new)"); g("push", "origin", "main")
        else: print("nothing to commit")

if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] not in {"query", "ingest", "publish"}: print(__doc__); sys.exit(1)
    if a[0] == "query": s = load(SRC); print(s["query"] + " (" + " OR ".join("from:" + h for h in s["handles"]) + ")")
    elif a[0] == "ingest": ingest(a[1])
    else: publish("--push" in a)
