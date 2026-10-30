/* Global Icon Kit — application logic (vanilla JS, no dependencies) */
(() => {
  "use strict";

  /* ---------- constants ---------- */
  const REPO = "https://github.com/matrixteam403-hash/global-icon-kit";
  const ZIP = "download/global-icon-kit-all-formats.zip";
  const PAGE = 60;
  const FEATURED = [
    "regular-home", "regular-search", "regular-heart", "regular-star",
    "regular-globe", "regular-camera", "regular-settings"
  ];
  const DEFAULTS = { q: "", cat: "all", v: "regular", sort: "default" };
  const TILE_KEY = "gik.tiles";

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $("#app");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const n = v => Number(v).toLocaleString("en-US");
  const icon = (id, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const variantLabel = x => (x.variant === "solid" ? "Solid" : "Regular");
  const dlName = (x, ext) => `${x.slug}-${x.variant}.${ext}`;
  const fmtBytes = b => (b >= 1048576 ? `${n((b / 1048576).toFixed(1))} MB` : `${n(Math.max(0.1, b / 1024).toFixed(1))} KB`);
  const absUrl = p => new URL(p, location.href.split("#")[0]).href;

  /* plain-text normalisation for search */
  const norm = s => (s || "").toString().toLowerCase()
    .replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();

  /* consonant "skeleton", so that "settings" also matches "sttngs"-style typos */
  function skel(s) {
    return norm(s)
      .replace(/[^a-z0-9]/g, "")
      .replace(/ch/g, "C").replace(/sh/g, "s").replace(/kh/g, "k").replace(/gh/g, "j").replace(/zh/g, "z").replace(/ph/g, "f").replace(/ck/g, "k")
      .replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/C/g, "c")
      .replace(/q/g, "k").replace(/x/g, "ks")
      .replace(/[aeiouywvh]/g, "")
      .replace(/(.)\1+/g, "$1");
  }

  /* ---------- state ---------- */
  let data = [];
  let byId = new Map();
  let cats = [];            // [{ key, en, total, icons }] sorted by size
  let catOrder = new Map();
  let stats = {};
  const state = { ...DEFAULTS, shown: PAGE };
  let view = null;

  /* ---------- images: SVG first, PNG fallback, letter placeholder ---------- */
  function imgTag(x, cls = "", lazy = true) {
    return `<img class="${cls}" src="${esc(x.svg)}" data-png="${esc(x.png)}" data-letter="${esc(x.name.charAt(0))}" alt="${esc(x.name)}"${lazy ? ' loading="lazy"' : ""} decoding="async">`;
  }
  document.addEventListener("error", e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.png) return;
    if (img.dataset.fallback !== "1") { img.dataset.fallback = "1"; img.src = img.dataset.png; return; }
    img.closest(".ld")?.classList.remove("ld");
    const ph = document.createElement("div");
    ph.className = "ph"; ph.textContent = img.dataset.letter || "?";
    img.replaceWith(ph);
  }, true);
  document.addEventListener("load", e => {
    if (e.target instanceof HTMLImageElement) e.target.closest(".ld")?.classList.remove("ld");
  }, true);
  function settleImages(root = document) {
    $$(".ld img", root).forEach(img => { if (img.complete && img.naturalWidth) img.closest(".ld")?.classList.remove("ld"); });
  }
  function tileAttrs(x, extra = "") {
    return `class="${extra} ${x.variant}"`;
  }

  /* ---------- search ---------- */
  function matchScore(x, q, toks) {
    if (!q) return 1;
    let score = 0;
    if (x._n === q) score = 100;
    else if (x._n.startsWith(q)) score = 80;
    else if (x._n.includes(q) || x._slug.includes(q)) score = 60;
    else {
      const qs = skel(q);
      if (qs.length >= 2 && x._s === qs) score = 56;
      else if (qs.length >= 2 && x._s.startsWith(qs)) score = 50;
      else if (qs.length >= 2 && x._s.includes(qs)) score = 40;
    }
    if (score) return score;
    // every word must match the name, slug, tags or category
    for (const t of toks) {
      const ts = skel(t);
      const ok = x._n.includes(t) || x._slug.includes(t) || x._c.includes(t) || x._t.includes(t) || (ts.length >= 2 && x._s.includes(ts));
      if (!ok) return 0;
    }
    return 20;
  }
  function search(list, q) {
    q = norm(q);
    if (!q) return list.map(x => [x, 1]);
    const toks = q.split(" ").filter(Boolean);
    const out = [];
    for (const x of list) { const s = matchScore(x, q, toks); if (s) out.push([x, s]); }
    return out;
  }

  /* ---------- filtering ---------- */
  function sorter(kind, scored) {
    const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (kind === "az") return (a, b) => byName(a[0], b[0]) || (a[0].variant < b[0].variant ? -1 : 1);
    if (kind === "za") return (a, b) => byName(b[0], a[0]) || (a[0].variant < b[0].variant ? -1 : 1);
    return (a, b) =>
      (scored ? b[1] - a[1] : 0) ||
      catOrder.get(a[0].category) - catOrder.get(b[0].category) ||
      byName(a[0], b[0]) ||
      (a[0].variant < b[0].variant ? -1 : 1);
  }
  function compute() {
    const hits = search(data, state.q);
    const counts = { all: 0, regular: 0, solid: 0 };
    const perCat = new Map();
    const list = [];
    for (const h of hits) {
      const x = h[0];
      const inCat = state.cat === "all" || x.category === state.cat;
      if (inCat) { counts.all++; counts[x.variant]++; }
      if (state.v === "all" || x.variant === state.v) {
        perCat.set(x.category, (perCat.get(x.category) || 0) + 1);
        if (inCat) list.push(h);
      }
    }
    list.sort(sorter(state.sort, !!state.q));
    return { list: list.map(h => h[0]), counts, perCat };
  }

  /* ---------- url <-> state ---------- */
  function buildHash(s = state) {
    const p = new URLSearchParams();
    for (const k of ["q", "cat", "v", "sort"]) if (s[k] && s[k] !== DEFAULTS[k]) p.set(k, s[k]);
    const qs = p.toString();
    return qs ? `#/?${qs}` : "#/";
  }
  function applyParams(params) {
    state.q = params.get("q") || "";
    const c = params.get("cat");
    state.cat = c && catOrder.has(c) ? c : "all";
    const v = params.get("v");
    state.v = ["all", "regular", "solid"].includes(v) ? v : DEFAULTS.v;
    const so = params.get("sort");
    state.sort = ["default", "az", "za"].includes(so) ? so : "default";
  }
  function syncUrl() {
    const h = buildHash();
    if (location.hash !== h && !(h === "#/" && !location.hash)) history.replaceState(null, "", h);
  }

  /* ---------- home ---------- */
  function home() {
    view = "home";
    document.title = "Global Icon Kit — 1,671 open-source icons in SVG & PNG";
    const art = FEATURED.map(id => byId.get(id)).filter(Boolean)
      .map(x => `<div class="art">${imgTag(x, "", false)}</div>`).join("");

    app.innerHTML = `
      <div class="wrap">
        <section class="promo" aria-labelledby="hero-t">
          <div class="promo-bg"></div>
          <div class="promo-art" aria-hidden="true">${art}</div>
          <div class="promo-body">
            <div class="chips">
              <span class="score">Files <b>${n(stats.files)}</b></span>
              <span class="chip"><b>${n(stats.icons)}</b> icons</span>
              <span class="chip"><b>${n(stats.cats)}</b> categories</span>
              <span class="chip">SVG · PNG</span>
            </div>
            <h1 id="hero-t" tabindex="-1">All open-source icons, in one place!</h1>
            <p>A free, MIT-licensed collection: <strong>${n(stats.files)} files</strong> in <strong>two complete packs</strong> — Regular and Solid — across <strong>${n(stats.cats)} categories</strong>, each as vector SVG with a transparent PNG.</p>
            <div class="actions">
              <a class="btn btn-white" href="#logos" data-go="logos">${icon("grid")}Browse icons</a>
              <a class="btn btn-glass" href="${ZIP}" download>${icon("download")}Download all (ZIP)</a>
            </div>
          </div>
        </section>

        <section class="sec" id="logos" aria-labelledby="g-t">
          <div class="sec-head">
            <div>
              <h2 id="g-t">Icon gallery</h2>
              <p>Click any icon to open its page with SVG and PNG downloads.</p>
            </div>
            <a class="btn btn-ghost btn-sm" href="#/random" data-random>${icon("shuffle")}Random icon</a>
          </div>

          <div class="cats" id="cats" role="group" aria-label="Categories">
            <button class="cat" type="button" data-cat="all">All <em></em></button>
            ${cats.map(c => `<button class="cat" type="button" data-cat="${esc(c.key)}">${esc(c.en)} <em></em></button>`).join("")}
          </div>

          <div class="tabs" role="group" aria-label="Pack">
            <button class="tab" type="button" data-v="regular">${icon("vector")}Regular <span class="n" data-n="regular"></span></button>
            <button class="tab" type="button" data-v="solid">${icon("grid")}Solid <span class="n" data-n="solid"></span></button>
            <button class="tab" type="button" data-v="all">${icon("layers")}All <span class="n" data-n="all"></span></button>
            <div class="tabs-end">
              <div class="seg" role="group" aria-label="Tile background">
                <button type="button" data-tiles="auto" title="Automatic background for each icon">${icon("auto")}<span>Auto</span></button>
                <button type="button" data-tiles="dark" title="Dark background">${icon("moon")}<span>Dark</span></button>
                <button type="button" data-tiles="light" title="Light background">${icon("sun")}<span>Light</span></button>
              </div>
              <label class="sr-only" for="sort">Sort</label>
              <select class="select" id="sort">
                <option value="default">Sort: default</option>
                <option value="az">Name: A to Z</option>
                <option value="za">Name: Z to A</option>
              </select>
            </div>
          </div>

          <div class="resbar" id="resbar" aria-live="polite"></div>
          <div class="grid" id="grid"></div>
          <div class="empty hidden" id="empty">
            <b>No matches found</b>
            Try a different search term or clear the filters.
            <div><button class="btn btn-ghost" type="button" data-clear>Clear filters</button></div>
          </div>
          <div class="more" id="more" hidden>
            <button class="btn btn-ghost" type="button" data-more>Show more</button>
            <div class="progress"><i id="prog"></i></div>
            <small id="moreTxt"></small>
          </div>
        </section>

        <section class="sec" id="download" aria-labelledby="d-t">
          <div class="band">
            <div class="band-txt">
              <span class="band-ic">${icon("zip")}</span>
              <div>
                <h2 id="d-t">Get the whole collection at once</h2>
                <p>The ZIP includes SVG, PNG (512px, transparent background), a CSV index and the license.</p>
                <div class="chips"><span class="chip">SVG</span><span class="chip">PNG 512px</span><span class="chip">CSV</span><span class="chip">MIT</span></div>
              </div>
            </div>
            <a class="btn btn-white btn-lg" href="${ZIP}" download>${icon("download")}Download ZIP (about 16 MB)</a>
          </div>
        </section>
      </div>`;
    syncControls();
    renderGrid();
    const row = $("#cats");
    const edge = () => row.classList.toggle("at-end", Math.abs(row.scrollLeft) + row.clientWidth >= row.scrollWidth - 4);
    row.addEventListener("scroll", edge, { passive: true });
    edge();
  }

  function syncControls() {
    if (view !== "home") return;
    const mark = (b, on) => { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); };
    $$("#cats .cat").forEach(b => mark(b, b.dataset.cat === state.cat));
    $$(".tabs .tab[data-v]").forEach(b => mark(b, b.dataset.v === state.v));
    $$(".seg [data-tiles]").forEach(b => mark(b, b.dataset.tiles === document.body.dataset.tiles));
    const so = $("#sort"); if (so) so.value = state.sort;
    const hq = $("#hq"); if (hq && document.activeElement !== hq) hq.value = state.q;
  }

  function card(x, showVariant) {
    return `
      <article class="card">
        <a class="card-link" href="#/icon/${encodeURIComponent(x.id)}" aria-label="${esc(x.name)} — ${esc(x.categoryEn)}, ${variantLabel(x)} pack"></a>
        <div ${tileAttrs(x, "tile ld")}>${imgTag(x)}
          <div class="quick">
            <a href="${esc(x.svg)}" download="${esc(dlName(x, "svg"))}" aria-label="Download SVG ${esc(x.name)}">${icon("download")}SVG</a>
            <a href="${esc(x.png)}" download="${esc(dlName(x, "png"))}" aria-label="Download PNG ${esc(x.name)}">${icon("download")}PNG</a>
          </div>
        </div>
        <div class="card-meta">
          <div class="card-name">${esc(x.name)}</div>
          <div class="card-cat">${esc(x.categoryEn)}${showVariant ? ` · <span class="v">${variantLabel(x)}</span>` : ""}</div>
        </div>
      </article>`;
  }

  function renderGrid() {
    const { list, counts, perCat } = compute();
    const grid = $("#grid");
    if (!grid) return;
    const part = list.slice(0, state.shown);
    grid.innerHTML = part.map(x => card(x, state.v === "all")).join("");
    settleImages(grid);

    $$(".tabs [data-n]").forEach(el => { el.textContent = n(counts[el.dataset.n]); });
    let total = 0;
    $$("#cats .cat").forEach(b => {
      const k = b.dataset.cat;
      if (k === "all") return;
      const c = perCat.get(k) || 0; total += c;
      b.querySelector("em").textContent = n(c);
    });
    $('#cats .cat[data-cat="all"] em').textContent = n(total);

    const catName = state.cat !== "all" ? cats.find(c => c.key === state.cat)?.en : "";
    const chips = [];
    if (state.q) chips.push(`<span class="fchip">Search: “${esc(state.q)}” <button type="button" data-unset="q" aria-label="Remove search">${icon("close")}</button></span>`);
    if (catName) chips.push(`<span class="fchip">${esc(catName)} <button type="button" data-unset="cat" aria-label="Remove category filter">${icon("close")}</button></span>`);
    const packSuffix = state.v !== "all" ? ` · ${variantLabel({ variant: state.v })}` : "";
    $("#resbar").innerHTML = `<span><b>${n(list.length)}</b> icons${packSuffix}</span>${chips.join("")}${chips.length > 1 ? `<button class="linkish" type="button" data-clear>Clear all</button>` : ""}`;

    $("#empty").classList.toggle("hidden", list.length > 0);
    const more = $("#more");
    more.hidden = list.length <= state.shown;
    if (!more.hidden) {
      $("#moreTxt").textContent = `${n(part.length)} of ${n(list.length)} icons`;
      $("#prog").style.width = `${(part.length / list.length) * 100}%`;
      more.querySelector("button").textContent = `Show ${n(Math.min(PAGE, list.length - part.length))} more icons`;
    }
  }

  function setFilter(patch, { scroll = false } = {}) {
    Object.assign(state, patch, { shown: PAGE });
    syncControls();
    renderGrid();
    syncUrl();
    if (scroll) scrollToGallery();
  }
  function scrollToGallery(smooth = true) {
    const el = $("#logos");
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - $("#top").offsetHeight - 8;
    window.scrollTo({ top: y, behavior: smooth ? "smooth" : "auto" });
  }

  /* ---------- detail ---------- */
  function neighbors(x) {
    const list = data.filter(y => y.category === x.category && y.variant === x.variant)
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    const i = list.findIndex(y => y.id === x.id);
    return { prev: list[(i - 1 + list.length) % list.length], next: list[(i + 1) % list.length] };
  }
  function twin(x) {
    return data.find(y => y.category === x.category && y.slug === x.slug && y.variant !== x.variant);
  }

  function detail(x) {
    view = "detail";
    document.title = `Icon: ${x.name} | Global Icon Kit`;
    const v = variantLabel(x);
    const nb = neighbors(x);
    const other = twin(x);
    const related = data.filter(y => y.category === x.category && y.variant === x.variant && y.id !== x.id);
    const shownRelated = related.slice(0, 12);
    const svgUrl = absUrl(x.svg);
    const pngUrl = absUrl(x.png);
    const stageBg = "dark";
    const codes = [
      ["link", "SVG link", svgUrl],
      ["link", "PNG link", pngUrl],
      ["code", "HTML", `<img src="${svgUrl}" alt="${x.name}" width="96" height="96">`],
      ["code", "Markdown", `![${x.name}](${svgUrl})`],
      ["code", "CSS", `background-image: url("${svgUrl}");`]
    ];
    const packIcon = x.variant === "solid" ? "grid" : "vector";

    app.innerHTML = `
      <div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="#/">Home</a>${icon("chev")}
          <a href="#/?cat=${encodeURIComponent(x.category)}">${esc(x.categoryEn)}</a>${icon("chev")}
          <span aria-current="page">${esc(x.name)}</span>
          <span class="nav">
            <a class="icon-btn" href="#/icon/${encodeURIComponent(nb.prev.id)}" title="Previous icon (←)" aria-label="Previous icon: ${esc(nb.prev.name)}">${icon("chev")}</a>
            <a class="icon-btn" href="#/icon/${encodeURIComponent(nb.next.id)}" title="Next icon (→)" aria-label="Next icon: ${esc(nb.next.name)}">${icon("chev-r")}</a>
          </span>
        </nav>

        <div class="product">
          <aside class="side" aria-label="Downloads and specs">
            <div ${tileAttrs(x, "tile cover ld")}>
              ${imgTag(x, "", false)}
              <span class="ribbon">FREE</span>
            </div>
            <div class="side-actions">
              <a class="btn btn-block btn-lg" href="${esc(x.svg)}" download="${esc(dlName(x, "svg"))}">${icon("download")}Download SVG</a>
              <a class="btn btn-block btn-outline" href="${esc(x.png)}" download="${esc(dlName(x, "png"))}">${icon("image")}Download PNG 512px</a>
            </div>
            <dl class="specs">
              <div><dt>Pack</dt><dd>${icon(packIcon)}${v}</dd></div>
              <div><dt>Category</dt><dd>${icon("tag")}<a href="#/?cat=${encodeURIComponent(x.category)}">${esc(x.categoryEn)}</a></dd></div>
              <div><dt>Formats</dt><dd>${icon("file")}<span class="ltr">SVG · PNG</span></dd></div>
              <div><dt>PNG size</dt><dd>${icon("ruler")}<span class="ltr">512 × 512</span></dd></div>
              ${x.svgSize ? `<div><dt>SVG size</dt><dd>${icon("vector")}<span class="ltr">${fmtBytes(x.svgSize)}</span></dd></div>` : ""}
              ${x.pngSize ? `<div><dt>PNG size</dt><dd>${icon("image")}<span class="ltr">${fmtBytes(x.pngSize)}</span></dd></div>` : ""}
              ${other ? `<div><dt>${variantLabel(other)} version</dt><dd><a class="mini" href="#/icon/${encodeURIComponent(other.id)}" title="View the ${variantLabel(other)} version" aria-label="View the ${variantLabel(other)} version">${imgTag(other)}</a></dd></div>` : ""}
            </dl>
          </aside>

          <div class="main">
            <header class="p-head">
              <h1 class="p-title" tabindex="-1"><span>${esc(x.name)}</span></h1>
              <p class="p-sub">The ${esc(x.name)} icon from the ${esc(x.categoryEn)} category — ${v} pack, ready to download as scalable vector and transparent raster.</p>
              <div class="chips">
                <span class="score">Format <b>SVG</b></span>
                <span class="chip">PNG 512px</span>
                <span class="chip">${icon(packIcon)}${v}</span>
                <span class="chip">${icon("tag")}${esc(x.categoryEn)}</span>
              </div>
            </header>

            <section class="promo promo-sm" aria-labelledby="cv-t">
              <div class="promo-bg"></div>
              <div class="promo-art" aria-hidden="true">
                <div ${tileAttrs(x, "art-one tile")}>${imgTag(x, "", false)}</div>
              </div>
              <div class="promo-body">
                <h2 id="cv-t">Get the <span class="ltr">${esc(x.name)}</span> icon at any size!</h2>
                <p>Pick a format and size — the conversion runs right here in your browser, from the vector file.</p>
                <div class="conv">
                  <label class="sr-only" for="fmt">Format</label>
                  <select class="select" id="fmt">
                    <option value="png">Transparent PNG</option>
                    <option value="webp">Transparent WebP</option>
                    <option value="jpg">JPG with white background</option>
                  </select>
                  <label class="sr-only" for="fmtSize">Size</label>
                  <select class="select" id="fmtSize">
                    <option value="256">256 pixels</option>
                    <option value="512">512 pixels</option>
                    <option value="1024" selected>1024 pixels</option>
                    <option value="2048">2048 pixels</option>
                    <option value="4096">4096 pixels</option>
                  </select>
                  <button class="btn btn-white" id="convBtn" type="button">${icon("download")}Download</button>
                </div>
              </div>
            </section>

            <div class="detail-tabs">
              <div class="tabs" role="tablist" aria-label="Sections">
                <button class="tab on" type="button" role="tab" aria-selected="true" data-panel="preview">${icon("eye")}Preview</button>
                <button class="tab" type="button" role="tab" aria-selected="false" data-panel="code">${icon("code")}Code &amp; links</button>
                <button class="tab" type="button" role="tab" aria-selected="false" data-panel="related">${icon("grid")}Related icons <span class="n">${n(related.length)}</span></button>
              </div>

              <div class="panel" data-panel="preview" role="tabpanel">
                <div class="stage ${stageBg}" id="stage">${imgTag(x, "", false)}</div>
                <div class="stage-bar">
                  <div class="seg" role="group" aria-label="Preview background">
                    ${[["dark", "Dark"], ["light", "Light"], ["checker", "Transparent"], ["red", "Red"]].map(([k, t]) =>
                      `<button type="button" data-stage="${k}" class="${k === stageBg ? "on" : ""}"><i class="swatch ${k}"></i><span>${t}</span></button>`).join("")}
                  </div>
                  <div class="sizes" aria-label="Preview at small sizes">
                    ${[16, 24, 32, 48, 64].map(s => `<figure><div style="width:${s}px;height:${s}px">${imgTag(x, "")}</div><figcaption>${s}px</figcaption></figure>`).join("")}
                  </div>
                </div>
              </div>

              <div class="panel" data-panel="code" role="tabpanel" hidden>
                <div class="codes">
                  ${codes.map(([ic, label, val]) => `
                    <div class="code-row">
                      <span>${icon(ic)}${label}</span>
                      <code title="${esc(val)}">${esc(val)}</code>
                      <button class="icon-btn copy" type="button" data-copy="${esc(val)}" aria-label="Copy ${label}">${icon("copy")}</button>
                    </div>`).join("")}
                </div>
                <div class="code-actions">
                  <button class="btn btn-ghost" type="button" id="copySvg">${icon("copy")}Copy SVG code</button>
                  <a class="btn btn-ghost" href="${esc(x.svg)}" target="_blank" rel="noopener">${icon("link")}Open SVG file</a>
                </div>
                <p class="note">Icons come from the open-source Iconoir project (MIT). Check the license before commercial use.</p>
              </div>

              <div class="panel" data-panel="related" role="tabpanel" hidden>
                ${shownRelated.length ? `<div class="grid">${shownRelated.map(y => card(y, false)).join("")}</div>` : `<div class="empty">No other icons in this category.</div>`}
                ${related.length > shownRelated.length ? `<div class="more"><a class="btn btn-ghost" href="#/?cat=${encodeURIComponent(x.category)}${x.variant === "solid" ? "&v=solid" : ""}">See all ${n(related.length + 1)} icons in this category</a></div>` : ""}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    settleImages(app);

    $("#convBtn").addEventListener("click", () => convert(x, $("#fmt").value, +$("#fmtSize").value));
    $("#copySvg").addEventListener("click", async e => {
      try { copyText(await (await fetch(x.svg)).text(), e.currentTarget, "SVG code copied"); }
      catch { toast("Copy failed"); }
    });
  }

  function notFound() {
    view = "404";
    document.title = "Not found | Global Icon Kit";
    app.innerHTML = `
      <div class="wrap nf">
        <b>404</b>
        <h1 tabindex="-1">This icon was not found</h1>
        <p>The address may be wrong, or the icon may have moved.</p>
        <a class="btn" href="#/">${icon("grid")}Back to the gallery</a>
      </div>`;
  }

  /* ---------- convert (in-browser rasterising from the SVG) ---------- */
  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  async function convert(x, fmt, size) {
    const btn = $("#convBtn");
    if (btn) btn.disabled = true;
    try {
      const text = await (await fetch(x.svg)).text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const svg = doc.documentElement;
      let vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
      const w0 = parseFloat(svg.getAttribute("width")), h0 = parseFloat(svg.getAttribute("height"));
      if (vb.length !== 4 || vb.some(isNaN)) vb = [0, 0, w0 || 512, h0 || 512];
      if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", vb.join(" "));
      const ratio = vb[2] / vb[3] || 1;
      const W = ratio >= 1 ? size : Math.round(size * ratio);
      const H = ratio >= 1 ? Math.round(size / ratio) : size;
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      const img = await loadImage(url);
      const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
      const ctx = cv.getContext("2d");
      if (fmt === "jpg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size); }
      ctx.drawImage(img, (size - W) / 2, (size - H) / 2, W, H);
      URL.revokeObjectURL(url);
      const mime = fmt === "jpg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";
      const blob = await new Promise(r => cv.toBlob(r, mime, 0.95));
      if (!blob) throw new Error("toBlob");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `${x.slug}-${x.variant}-${size}.${fmt}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`${fmt.toUpperCase()} file at ${n(size)}px is ready`);
    } catch (e) {
      toast("Conversion failed — use the direct SVG/PNG download instead");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------- clipboard + toast ---------- */
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.innerHTML = `${icon("check")}<span>${esc(msg)}</span>`;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }
  async function copyText(text, btn, msg = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    toast(msg);
    if (btn && btn.classList.contains("copy")) {
      btn.classList.add("done"); btn.innerHTML = icon("check");
      setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = icon("copy"); }, 1500);
    }
  }

  /* ---------- header: search with suggestions ---------- */
  const hq = $("#hq");
  const sugg = $("#suggest");
  let sgItems = [];
  let sgActive = -1;
  let sgT;

  function suggestions(q) {
    const pool = data.filter(x => x.variant === "regular");
    return search(pool, q).sort(sorter("default", true)).slice(0, 7).map(h => h[0]);
  }
  function showSuggest() {
    const q = hq.value.trim();
    if (!q || !data.length) { hideSuggest(); return; }
    const total = search(data, q).length;
    sgItems = suggestions(q);
    sgActive = -1;
    sugg.innerHTML = sgItems.length
      ? sgItems.map((x, i) => `
          <div class="sg-item" role="option" id="sg-${i}" data-i="${i}">
            <span class="sg-thumb">${imgTag(x, "", false)}</span>
            <span><div class="sg-name">${esc(x.name)}</div><div class="sg-cat">${esc(x.categoryEn)}</div></span>
          </div>`).join("") +
        `<div class="sg-all" role="option" id="sg-all" data-i="all">${icon("search")}Show all ${n(total)} results for “${esc(q)}”</div>`
      : `<div class="sg-empty">No results for “${esc(q)}”.</div>`;
    sugg.hidden = false;
    hq.setAttribute("aria-expanded", "true");
  }
  function hideSuggest() {
    sugg.hidden = true; sgActive = -1;
    hq.setAttribute("aria-expanded", "false");
    hq.removeAttribute("aria-activedescendant");
  }
  function moveActive(d) {
    const opts = $$(".sg-item,.sg-all", sugg);
    if (!opts.length) return;
    sgActive = (sgActive + d + opts.length) % opts.length;
    opts.forEach((o, i) => o.classList.toggle("on", i === sgActive));
    hq.setAttribute("aria-activedescendant", opts[sgActive].id);
    opts[sgActive].scrollIntoView({ block: "nearest" });
  }
  function submitSearch(q) {
    hideSuggest(); hq.blur();
    q = q.trim();
    if (view === "home") setFilter({ q }, { scroll: true });
    else location.hash = buildHash({ ...state, q, cat: "all" });
  }
  function pickSuggestion(i) {
    if (i === "all" || i == null) return submitSearch(hq.value);
    const x = sgItems[+i];
    if (!x) return;
    hideSuggest(); hq.blur();
    location.hash = `#/icon/${encodeURIComponent(x.id)}`;
  }
  hq.addEventListener("input", () => { clearTimeout(sgT); sgT = setTimeout(showSuggest, 70); });
  hq.addEventListener("focus", () => { if (hq.value.trim()) showSuggest(); });
  hq.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (sugg.hidden) showSuggest(); else moveActive(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
    else if (e.key === "Escape") { hideSuggest(); hq.blur(); }
  });
  $("#hsForm").addEventListener("submit", e => {
    e.preventDefault();
    const active = $$(".sg-item,.sg-all", sugg)[sgActive];
    if (!sugg.hidden && active) pickSuggestion(active.dataset.i);
    else submitSearch(hq.value);
  });
  sugg.addEventListener("mousedown", e => e.preventDefault()); // keep focus in the input
  sugg.addEventListener("click", e => {
    const o = e.target.closest("[data-i]");
    if (o) pickSuggestion(o.dataset.i);
  });

  /* ---------- header: menus, drawer, scroll ---------- */
  function closeMenus() {
    $$(".dd.open").forEach(d => { d.classList.remove("open"); d.querySelector(".dd-btn").setAttribute("aria-expanded", "false"); });
  }
  function setDrawer(open) {
    $("#drawer").hidden = !open;
    $("#burger").setAttribute("aria-expanded", String(open));
    $("#burger").innerHTML = icon(open ? "close" : "menu");
  }

  document.addEventListener("click", e => {
    const t = e.target;
    const ddBtn = t.closest(".dd-btn");
    if (ddBtn) {
      const dd = ddBtn.parentElement;
      const open = !dd.classList.contains("open");
      closeMenus();
      if (open) { dd.classList.add("open"); ddBtn.setAttribute("aria-expanded", "true"); }
      return;
    }
    if (!t.closest(".dd-menu")) closeMenus();
    else if (t.closest("a")) { closeMenus(); t.closest("a").blur(); }
    if (!t.closest(".hd-search")) hideSuggest();
    if (t.closest("#burger")) { setDrawer($("#drawer").hidden); return; }
    if (t.closest("#drawer a")) setDrawer(false);

    // remember gallery position before opening an icon, so "back" returns to the same spot
    const link = t.closest('a[href^="#/icon/"]');
    if (link && view === "home") {
      try { history.replaceState({ y: window.scrollY, shown: state.shown }, "", location.hash || "#/"); } catch { /* ignore */ }
    }

    if (t.closest("[data-random]")) { e.preventDefault(); goRandom(); return; }
    const go = t.closest("[data-go]");
    if (go) { e.preventDefault(); scrollToGallery(); return; }

    // gallery controls
    const catBtn = t.closest("#cats .cat");
    if (catBtn) { setFilter({ cat: catBtn.dataset.cat }); catBtn.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); return; }
    const tab = t.closest(".tabs .tab[data-v]");
    if (tab) { setFilter({ v: tab.dataset.v }); return; }
    const tileBtn = t.closest("[data-tiles]");
    if (tileBtn && tileBtn.tagName === "BUTTON") { setTiles(tileBtn.dataset.tiles); return; }
    if (t.closest("[data-more]")) { state.shown += PAGE; renderGrid(); return; }
    const unset = t.closest("[data-unset]");
    if (unset) { setFilter({ [unset.dataset.unset]: DEFAULTS[unset.dataset.unset] }); return; }
    if (t.closest("[data-clear]")) { setFilter({ q: "", cat: "all" }); return; }

    // detail controls
    const ptab = t.closest(".tab[data-panel]");
    if (ptab) {
      $$(".tab[data-panel]").forEach(b => { const on = b === ptab; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
      $$(".panel[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== ptab.dataset.panel; });
      settleImages(app);
      return;
    }
    const st = t.closest("[data-stage]");
    if (st) {
      $("#stage").className = `stage ${st.dataset.stage}`;
      $$("[data-stage]").forEach(b => b.classList.toggle("on", b === st));
      return;
    }
    const cp = t.closest("[data-copy]");
    if (cp) { copyText(cp.dataset.copy, cp); return; }
  });

  document.addEventListener("change", e => {
    if (e.target.id === "sort") setFilter({ sort: e.target.value });
  });

  function setTiles(mode) {
    document.body.dataset.tiles = mode;
    try { localStorage.setItem(TILE_KEY, mode); } catch { /* ignore */ }
    $$(".seg [data-tiles]").forEach(b => { const on = b.dataset.tiles === mode; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  }
  try {
    const saved = localStorage.getItem(TILE_KEY);
    if (["auto", "dark", "light"].includes(saved)) document.body.dataset.tiles = saved;
  } catch { /* ignore */ }

  function goRandom() {
    if (!data.length) return;
    const x = data[Math.floor(Math.random() * data.length)];
    location.hash = `#/icon/${encodeURIComponent(x.id)}`;
  }

  const hd = $("#top");
  const fab = $("#toTop");
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      hd.classList.toggle("scrolled", window.scrollY > 4);
      fab.hidden = window.scrollY < 700;
      ticking = false;
    });
  }, { passive: true });
  fab.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  /* keyboard: "/" focuses search, arrows move between icons on an icon page */
  document.addEventListener("keydown", e => {
    if (e.target.matches("input,textarea,select")) return;
    if (e.key === "Escape") { closeMenus(); setDrawer(false); }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); hq.focus(); hq.select(); }
    if (view === "detail" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === "ArrowRight") goNeighbor(1);
      if (e.key === "ArrowLeft") goNeighbor(-1);
    }
  });
  function goNeighbor(dir) {
    const m = location.hash.match(/^#\/icon\/([^?]+)/); if (!m) return;
    const x = byId.get(decodeURIComponent(m[1])); if (!x) return;
    const nb = neighbors(x);
    location.hash = "#/icon/" + encodeURIComponent((dir < 0 ? nb.prev : nb.next).id);
  }

  /* ---------- router ---------- */
  function focusMain() {
    const h = app.querySelector("h1");
    if (h) h.focus({ preventScroll: true });
  }
  function route() {
    const h = location.hash || "#/";
    closeMenus(); hideSuggest(); setDrawer(false);

    const m = h.match(/^#\/icon\/([^?]+)/);
    if (m) {
      const x = byId.get(decodeURIComponent(m[1]));
      if (x) detail(x); else notFound();
      window.scrollTo({ top: 0 });
      focusMain();
      return;
    }
    if (h === "#/random") { location.replace(`#/icon/${encodeURIComponent(data[Math.floor(Math.random() * data.length)].id)}`); return; }
    if (!h.startsWith("#/")) {
      // in-page anchors: #about lives in the footer, #logos / #download on the home page
      const id = decodeURIComponent(h.slice(1));
      if (!view) home();
      const outside = document.getElementById(id);
      if (outside && !app.contains(outside)) { outside.scrollIntoView({ behavior: "smooth" }); return; }
      if (view !== "home") home();
      const el = document.getElementById(id);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 30);
      return;
    }

    // home, optionally with filters: #/?q=..&cat=..&v=..&sort=..
    const params = new URLSearchParams(h.split("?")[1] || "");
    const saved = history.state;
    applyParams(params);
    state.shown = saved && saved.shown ? Math.max(PAGE, saved.shown) : PAGE;
    if (view === "home") { syncControls(); renderGrid(); } else home();

    if (saved && typeof saved.y === "number") {
      window.scrollTo({ top: saved.y });
    } else if (params.has("cat") || params.has("q") || params.has("v")) {
      scrollToGallery(false);
    } else {
      window.scrollTo({ top: 0 });
      focusMain();
    }
  }
  window.addEventListener("hashchange", route);
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  /* ---------- data ---------- */
  function buildMenus() {
    const catLink = c => `<a href="#/?cat=${encodeURIComponent(c.key)}"><span>${esc(c.en)}</span><em>${n(c.icons)}</em></a>`;
    $("#catMenu").innerHTML = cats.map(catLink).join("");
    $("#drawerCats").innerHTML = cats.map(catLink).join("");
    $("#ftCats").innerHTML = cats.slice(0, 6).map(c => `<li><a href="#/?cat=${encodeURIComponent(c.key)}"> ${esc(c.en)} <em>(${n(c.icons)})</em></a></li>`).join("");
    const year = new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(new Date());
    $("#meta").textContent = `${n(stats.files)} files · ${n(stats.icons)} icons · ${year}`;
    $("#ghCount").textContent = n(stats.files);
  }

  fetch("data/icons.json")
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => {
      data = json;
      for (const x of data) {
        x._n = norm(x.name);
        x._slug = norm(x.slug);
        x._c = norm(x.categoryEn);
        x._t = norm(x.tags);
        x._s = skel(x.name);
      }
      byId = new Map(data.map(x => [x.id, x]));
      const m = new Map();
      for (const x of data) {
        if (!m.has(x.category)) m.set(x.category, { key: x.category, en: x.categoryEn, total: 0, icons: 0, _slugs: new Set() });
        const c = m.get(x.category);
        c.total++; c._slugs.add(x.slug);
      }
      cats = [...m.values()].map(c => ({ key: c.key, en: c.en, total: c.total, icons: c._slugs.size }));
      cats.sort((a, b) => b.icons - a.icons || a.en.localeCompare(b.en, "en"));
      catOrder = new Map(cats.map((c, i) => [c.key, i]));
      stats = {
        files: data.length,
        icons: new Set(data.map(x => x.slug)).size,
        cats: cats.length
      };
      buildMenus();
      route();
      if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      }
    })
    .catch(() => {
      app.innerHTML = `<div class="wrap nf" role="alert"><b>!</b><h1>Failed to load data</h1><p>Check your connection and try again.</p><button class="btn" id="retry" type="button">Retry</button></div>`;
      $("#retry").addEventListener("click", () => location.reload());
    });
})();
