#!/usr/bin/env python3
"""
Build script for Global Icon Kit.

Reads the Iconoir collection (https://github.com/iconoir-icons/iconoir, MIT),
then for every icon of the two packs — regular and solid — it:

  1. copies the SVG into  icons/svg/<pack>/<slug>.svg
  2. rasterises a transparent 512px PNG into  icons/png/<pack>/<slug>.png
  3. writes the gallery index  data/icons.json
     (id, name, slug, category, categoryEn, variant, svg, png, tags,
      svgSize, pngSize — same shape as iran-logo-kit's data/logos.json)
  4. packs svg + png + list.csv + LICENSE into
     download/global-icon-kit-all-formats.zip

Usage:
    python3 tools/build_icons.py --source /path/to/iconoir

Requires:  pip install cairosvg
"""
import argparse
import csv
import json
import os
import re
import shutil
import sys
import zipfile
from multiprocessing import Pool

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = ("regular", "solid")
PNG_SIZE = 512
ZIP_NAME = "global-icon-kit-all-formats.zip"

# slugs that should not be plain title-cased
ACRONYMS = {
    "3d": "3D", "4k": "4K", "2x2": "2X2", "3x3": "3X3",
    "css3": "CSS3", "html5": "HTML5", "ios": "iOS", "qr": "QR",
    "gps": "GPS", "usb": "USB", "tv": "TV", "pc": "PC", "ip": "IP",
    "id": "ID", "dna": "DNA", "rss": "RSS", "ev": "EV", "ai": "AI",
    "ui": "UI", "ux": "UX", "ar": "AR", "vr": "VR", "mac": "Mac",
    "imac": "iMac", "xbox": "Xbox", "js": "JS", "npm": "npm",
    "gif": "GIF", "png": "PNG", "svg": "SVG", "webp": "WebP",
    "jpeg": "JPEG", "jpg": "JPG", "mpeg": "MPEG", "avi": "AVI",
    "hdr": "HDR", "hd": "HD", "iso": "ISO", "npc": "NPC",
    "xray": "X-Ray", "xray": "Xray", "okrs": "OKRs", "yens": "Yens",
}


def title_case(slug: str) -> str:
    return " ".join(ACRONYMS.get(t, t[:1].upper() + t[1:]) for t in slug.split("-") if t)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def render(job):
    src, dst = job
    import cairosvg
    cairosvg.svg2png(url=src, write_to=dst,
                     output_width=PNG_SIZE, output_height=PNG_SIZE)
    return dst


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", required=True,
                    help="path to a checkout of iconoir-icons/iconoir")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    icons_dir = os.path.join(args.source, "icons")
    csv_path = os.path.join(args.source, "iconoir.com", "icons.csv")
    if not os.path.isdir(icons_dir) or not os.path.isfile(csv_path):
        sys.exit(f"error: {args.source} does not look like an iconoir checkout")

    # category + tags per icon (csv covers the regular pack; solid ⊂ regular)
    meta = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            meta[row["filename"]] = (row["category"], row.get("tags", ""))

    jobs, entries = [], []
    cat_counts = {}

    for pack in PACKS:
        src_dir = os.path.join(icons_dir, pack)
        dst_svg = os.path.join(ROOT, "icons", "svg", pack)
        dst_png = os.path.join(ROOT, "icons", "png", pack)
        os.makedirs(dst_svg, exist_ok=True)
        os.makedirs(dst_png, exist_ok=True)

        for fn in sorted(os.listdir(src_dir)):
            if not fn.endswith(".svg"):
                continue
            slug = fn[:-4]
            category, tags = meta.get(slug, ("Other", ""))
            cat_key = slugify(category)

            shutil.copy2(os.path.join(src_dir, fn),
                         os.path.join(dst_svg, fn))

            svg_rel = f"icons/svg/{pack}/{fn}"
            png_rel = f"icons/png/{pack}/{slug}.png"
            jobs.append((os.path.join(ROOT, svg_rel),
                         os.path.join(ROOT, png_rel)))
            cat_counts[cat_key] = cat_counts.get(cat_key, 0) + 1
            entries.append({
                "id": f"{pack}-{slug}",
                "name": title_case(slug),
                "slug": slug,
                "category": cat_key,
                "categoryEn": category,
                "variant": pack,
                "svg": svg_rel,
                "png": png_rel,
                "tags": tags,
                "categoryCount": 0,   # filled below (unique icons per category)
            })

    # rasterise PNGs in parallel
    with Pool(args.workers) as pool:
        for i, _ in enumerate(pool.imap_unordered(render, jobs), 1):
            if i % 200 == 0 or i == len(jobs):
                print(f"  png {i}/{len(jobs)}", flush=True)

    # unique icons per category (for the footer / mega-menu counts)
    uniq = {}
    for e in entries:
        if e["variant"] == "regular":
            uniq[e["category"]] = uniq.get(e["category"], 0) + 1
    for e in entries:
        e["categoryCount"] = uniq.get(e["category"], 0)

    # fill file sizes, drop helper field from JSON
    for e in entries:
        e["svgSize"] = os.path.getsize(os.path.join(ROOT, e["svg"]))
        e["pngSize"] = os.path.getsize(os.path.join(ROOT, e["png"]))

    order = {k: i for i, k in enumerate(
        sorted(uniq, key=lambda k: (-uniq[k], k)))}
    entries.sort(key=lambda e: (order.get(e["category"], 999),
                                e["slug"], e["variant"]))

    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "icons.json"), "w",
              encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))
    print(f"data/icons.json: {len(entries)} entries")

    # ---- download zip -------------------------------------------------
    os.makedirs(os.path.join(ROOT, "download"), exist_ok=True)
    zip_path = os.path.join(ROOT, "download", ZIP_NAME)
    list_csv = ["name,slug,category,pack,svg,png"]
    for e in sorted(entries, key=lambda e: (e["category"], e["slug"],
                                            e["variant"])):
        list_csv.append(f'"{e["name"]}","{e["slug"]}",'
                        f'"{e["categoryEn"]}","{e["variant"]}",'
                        f'"{e["svg"]}","{e["png"]}"')

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED,
                         compresslevel=9) as z:
        for e in entries:
            z.write(os.path.join(ROOT, e["svg"]), e["svg"])
            # PNGs are already compressed — store them raw
            zi = zipfile.ZipInfo(e["png"])
            zi.compress_type = zipfile.ZIP_STORED
            with open(os.path.join(ROOT, e["png"]), "rb") as f:
                z.writestr(zi, f.read())
        z.writestr("list.csv", "\n".join(list_csv) + "\n")
        z.write(os.path.join(ROOT, "LICENSE"), "LICENSE")

    mb = os.path.getsize(zip_path) / 1048576
    print(f"download/{ZIP_NAME}: {mb:.1f} MB")


if __name__ == "__main__":
    main()
