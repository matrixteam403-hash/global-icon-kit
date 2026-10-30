# Global Icon Kit

English, red-themed sibling of [iran-logo-kit](https://github.com/matrixteam403-hash/iran-logo-kit) — the same layout and features, but containing **1,671 open-source icons** from [Iconoir](https://github.com/iconoir-icons/iconoir) (MIT) instead of brand logos.

**Live:** https://matrixteam403-hash.github.io/global-icon-kit/

## Design
- Dark theme (black/grey) with a **red accent**, LTR, English UI
- Same store-style layout as iran-logo-kit: sticky search header, gradient hero, category scroller, tabs, rounded cards, spec column
- **Two separate, complete icon packs** selectable via tabs: **Regular** (1,383) and **Solid** (288) — plus an "All" view
- Sticky header with live search and suggestions; `/` focuses search
- Categories mega-menu (46 categories) with counters, mobile drawer, back-to-top button
- Gallery: category filter with counters, pack tabs, sort, quick SVG/PNG download on every card
- Tile backgrounds: **Auto**, **Dark** (icons inverted to white) or **Light** (icons stay black)
- Icon page: cover, SVG/PNG downloads, spec table (file sizes, other-pack twin), in-browser conversion to PNG/WebP/JPG up to 4096px, preview on several backgrounds and at 16–64px, ready-made HTML/Markdown/CSS snippets with copy buttons, related icons
- Filters are stored in the URL (shareable) and "back" returns you to the same gallery spot
- Fully responsive (mobile → desktop), keyboard-friendly (`/` for search, ← → for previous/next icon)
- PWA: offline caching via `sw.js`, installable via `manifest.webmanifest`

## Structure
- `index.html` — page structure and icon sprite (SVG)
- `styles.css` — styles (dark + red, LTR)
- `app.js` — application logic (vanilla JS, no dependencies)
- `sw.js` / `manifest.webmanifest` — offline support / installability
- `data/icons.json` — gallery index (`id`, `name`, `slug`, `category`, `categoryEn`, `variant`, `svg`, `png`, `tags`, `svgSize`, `pngSize`)
- `icons/svg/` and `icons/png/` — the files (regular/ + solid/)
- `download/global-icon-kit-all-formats.zip` — full package (SVG + PNG 512px + list.csv + LICENSE)
- `fonts/` — Vazirmatn variable font and its license (SIL OFL 1.1)
- `tools/build_icons.py` — build script that generates everything above from an Iconoir checkout
- `og-image.png` — social share image
- `.nojekyll` — disables Jekyll on GitHub Pages

## Rebuild / add icons
1. Clone https://github.com/iconoir-icons/iconoir somewhere.
2. Run: `python3 tools/build_icons.py --source /path/to/iconoir` (requires `pip install cairosvg`).
   The script copies SVGs, renders transparent 512px PNGs, writes `data/icons.json` and packs the download ZIP.

## Publish on GitHub Pages
1. Create a new repository (e.g. `global-icon-kit`).
2. Push this folder.
3. Settings → Pages → Deploy from branch `main` / root.

## License
Site code: MIT. Icons: Iconoir project, MIT License — https://github.com/iconoir-icons/iconoir/blob/main/LICENSE
