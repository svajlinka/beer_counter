#!/usr/bin/env python3
"""
Build BEER_DB from Systembolaget-style assortment JSON and patch ../app.js.

Data source (default): public mirror maintained from Systembolaget’s API
https://github.com/AlexGustafsson/systembolaget-api-data (assortment.json, ~30MB).

Usage:
  python scripts/sync_beer_db.py              # Fast sortiment + staples (default)
  python scripts/sync_beer_db.py --assortment all   # all Öl (~1500+; many niche products)
  python scripts/sync_beer_db.py --refresh    # force re-download cache
  python scripts/sync_beer_db.py --input path/to/assortment.json
  python scripts/sync_beer_db.py --dry-run    # print counts only

Default uses Systembolaget "fast" shelf only (~100–150 beers) so the list stays usable.
Names like Mariestads / Melleruds are merged from scripts/beer_db_staples.json when missing
from the API export (branding in JSON often differs from what you type).

Also writes scripts/beer_db.txt when app.js is updated.

Requires Python 3.10+ (stdlib only).
"""

from __future__ import annotations

import argparse
import json
import locale
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_SOURCE_URL = (
    "https://raw.githubusercontent.com/AlexGustafsson/systembolaget-api-data/"
    "main/data/assortment.json"
)

MARKER_BEGIN = "// <sync-beer-db:begin>"
MARKER_END = "// <sync-beer-db:end>"

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
APP_JS = REPO_ROOT / "app.js"
CACHE_PATH = SCRIPT_DIR / ".cache" / "assortment.json"
EXPORT_TXT = SCRIPT_DIR / "beer_db.txt"
STAPLES_PATH = SCRIPT_DIR / "beer_db_staples.json"

_BEER_CATEGORY_CF = unicodedata.normalize("NFC", "Öl").casefold()
_FAST_SORTIMENT_CF = unicodedata.normalize("NFC", "Fast sortiment").casefold()


def _iter_products(raw: object) -> list[dict]:
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        for key in ("products", "items", "value", "data"):
            v = raw.get(key)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
    return []


def _norm_cf(s: str) -> str:
    return unicodedata.normalize("NFC", (s or "").strip()).casefold()


def _product_display_name(p: dict) -> str:
    bold = (p.get("productNameBold") or "").strip()
    thin = (p.get("productNameThin") or "").strip()
    if bold and thin:
        name = f"{bold} {thin}"
    else:
        name = bold or thin
    return re.sub(r"\s+", " ", name).strip()


def _category_is_beer(p: dict) -> bool:
    return _norm_cf(p.get("categoryLevel1") or "") == _BEER_CATEGORY_CF


def _is_fast_assortment(p: dict) -> bool:
    if p.get("isFsAssortment") is True:
        return True
    return _norm_cf(p.get("assortmentText") or "") == _FAST_SORTIMENT_CF


def _parse_abv(raw: object) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _set_sv_collate() -> None:
    for loc in (
        "sv_SE.UTF-8",
        "sv_SE.utf8",
        "Swedish_Sweden.1252",
        "sv_SE",
        "Swedish",
    ):
        try:
            locale.setlocale(locale.LC_COLLATE, loc)
            return
        except locale.Error:
            continue


def extract_beers(
    products: list[dict], *, assortment: str
) -> list[dict[str, float | str]]:
    seen: dict[str, dict[str, float | str]] = {}
    for p in products:
        if not _category_is_beer(p):
            continue
        if assortment == "fast" and not _is_fast_assortment(p):
            continue
        abv = _parse_abv(p.get("alcoholPercentage"))
        if abv is None:
            continue
        name = _product_display_name(p)
        if not name:
            continue
        key = name.casefold()
        if key not in seen:
            seen[key] = {"name": name, "abv": abv}
    return list(seen.values())


def load_staples() -> list[dict[str, float | str]]:
    if not STAPLES_PATH.is_file():
        return []
    raw = load_json(STAPLES_PATH)
    if not isinstance(raw, list):
        return []
    out: list[dict[str, float | str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = (item.get("name") or "").strip()
        abv = _parse_abv(item.get("abv"))
        if not name or abv is None:
            continue
        out.append({"name": name, "abv": abv})
    return out


def merge_staples(
    api_beers: list[dict[str, float | str]],
    staples: list[dict[str, float | str]],
) -> list[dict[str, float | str]]:
    by_key: dict[str, dict[str, float | str]] = {}
    for b in api_beers:
        by_key[str(b["name"]).casefold()] = dict(b)
    for s in staples:
        k = str(s["name"]).casefold()
        if k not in by_key:
            by_key[k] = dict(s)
    merged = list(by_key.values())
    _set_sv_collate()
    try:
        merged.sort(key=lambda b: locale.strxfrm(str(b["name"])))
    except Exception:
        merged.sort(key=lambda b: str(b["name"]).casefold())
    return merged


def format_beer_db_js(beers: list[dict[str, float | str]]) -> str:
    lines = [MARKER_BEGIN, "const BEER_DB = ["]
    n = len(beers)
    for i, b in enumerate(beers):
        name_js = json.dumps(b["name"], ensure_ascii=False)
        abv = float(b["abv"])
        if abv == int(abv):
            abv_js = f"{int(abv)}.0"
        else:
            abv_js = json.dumps(abv)
        comma = "," if i < n - 1 else ""
        lines.append(f"  {{ name: {name_js}, abv: {abv_js} }}{comma}")
    lines.append("];")
    lines.append(MARKER_END)
    return "\n".join(lines) + "\n"


def patch_app_js(beers: list[dict[str, float | str]]) -> None:
    text = APP_JS.read_text(encoding="utf-8")
    block = format_beer_db_js(beers)
    pattern = re.compile(
        re.escape(MARKER_BEGIN) + r"[\s\S]*?" + re.escape(MARKER_END) + r"\n?",
        re.MULTILINE,
    )
    if not pattern.search(text):
        print(
            f"Could not find {MARKER_BEGIN} … {MARKER_END} in {APP_JS}",
            file=sys.stderr,
        )
        sys.exit(1)
    new_text = pattern.sub(block, text, count=1)
    APP_JS.write_text(new_text, encoding="utf-8", newline="\n")
    print(f"Updated {APP_JS} with {len(beers)} beers.")


def write_beer_db_txt(beers: list[dict[str, float | str]]) -> None:
    lines = [
        f"# beer_db.txt — {len(beers)} beers (same list as BEER_DB in app.js)",
        f"# Generated by sync_beer_db.py at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
    ]
    for b in beers:
        abv = float(b["abv"])
        abv_s = f"{abv:.1f}".replace(".", ",")
        lines.append(f"{b['name']} · {abv_s}%")
    EXPORT_TXT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"Wrote {EXPORT_TXT}")


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url} …")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "beer_counter_sync/1.0 (+local script)"},
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        dest.write_bytes(resp.read())
    mib = dest.stat().st_size / (1024 * 1024)
    print(f"Saved {dest} ({mib:.1f} MiB).")


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Sync BEER_DB in app.js from assortment JSON.")
    parser.add_argument(
        "--input",
        type=Path,
        help="Local assortment.json (skips download)",
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_SOURCE_URL,
        help="Download URL when not using --input",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Re-download even if cache exists",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write app.js; print beer count",
    )
    parser.add_argument(
        "--assortment",
        choices=("fast", "all"),
        default="fast",
        help='Which Systembolaget beers to include (default: fast = "Fast sortiment" only)',
    )
    parser.add_argument(
        "--no-staples",
        action="store_true",
        help=f"Do not merge entries from {STAPLES_PATH.name}",
    )
    args = parser.parse_args()

    if args.input:
        data_path = args.input.expanduser().resolve()
        if not data_path.is_file():
            print(f"Not a file: {data_path}", file=sys.stderr)
            sys.exit(1)
    else:
        data_path = CACHE_PATH
        if args.refresh or not data_path.is_file():
            download(args.url, data_path)
        else:
            print(f"Using cache {data_path} (use --refresh to re-download)")

    raw = load_json(data_path)
    products = _iter_products(raw)
    if not products:
        print("No product list found in JSON root.", file=sys.stderr)
        sys.exit(1)

    beers = extract_beers(products, assortment=args.assortment)
    print(
        f"From API: {len(beers)} unique beers "
        f"(assortment={args.assortment!r}, category Öl)."
    )
    if not args.no_staples:
        staples = load_staples()
        if staples:
            before = len(beers)
            beers = merge_staples(beers, staples)
            added = len(beers) - before
            print(
                f"Merged {len(staples)} staples from {STAPLES_PATH.name} "
                f"({added} new names not already in API list). Total: {len(beers)}."
            )
        else:
            beers = merge_staples(beers, [])
            if STAPLES_PATH.is_file():
                print(f"{STAPLES_PATH.name} has no entries; sorted {len(beers)} beers.")
            else:
                print(f"No {STAPLES_PATH.name}; sorted {len(beers)} beers.")
    else:
        beers = merge_staples(beers, [])
        print(f"--no-staples: sorted {len(beers)} beers.")

    if args.dry_run:
        return

    if not APP_JS.is_file():
        print(f"Missing {APP_JS}", file=sys.stderr)
        sys.exit(1)

    patch_app_js(beers)
    write_beer_db_txt(beers)


if __name__ == "__main__":
    main()
