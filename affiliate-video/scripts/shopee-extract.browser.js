// Run INSIDE a signed-in shopee.co.id product tab (browser pane / Chrome devtools / Claude browser tool).
// Returns a plain object; save it as JSON and pass it to `npm run ingest -- --from <file>`.
// Tries the page's own PDP API first (same-origin, uses the session), falls back to reading the DOM.
(async () => {
  const m = location.pathname.match(/i\.(\d+)\.(\d+)/) || location.pathname.match(/product\/(\d+)\/(\d+)/);
  const shopId = m && m[1];
  const itemId = m && m[2];
  const img = (h) => (h && !/^https?:/.test(h) ? `https://down-id.img.susercontent.com/file/${h}` : h);
  const out = { url: location.href.split("?")[0], shopId, itemId, via: null, title: "", description: "", attributes: [], variations: [], price: null, images: [], videos: [] };

  try {
    const r = await fetch(`/api/v4/pdp/get_pc?item_id=${itemId}&shop_id=${shopId}&tz_offset_minutes=420&detail_level=0`, { credentials: "include" });
    const j = await r.json();
    const d = j.data || {};
    const it = d.item || {};
    if (it.title) {
      out.via = "api";
      out.title = it.title;
      out.description = it.description || (d.product_attributes && d.product_attributes.description) || "";
      out.price = (it.price_min ?? it.price) ? (it.price_min ?? it.price) / 100000 : null;
      out.priceMax = it.price_max ? it.price_max / 100000 : null;
      out.category = (it.categories || d.categories || []).map((c) => c.display_name).filter(Boolean).join(" > ");
      out.attributes = ((d.product_attributes && d.product_attributes.attrs) || it.attributes || []).map((a) => ({ name: a.name, value: a.value }));
      out.variations = (it.tier_variations || []).map((t) => ({ name: t.name, options: t.options, images: (t.images || []).map(img) }));
      out.models = (it.models || []).map((x) => ({ name: x.name, price: x.price ? x.price / 100000 : null, stock: x.stock }));
      // gallery + video live under data.product_images on current PDP responses; item.* kept as fallback
      const pi = d.product_images || {};
      out.images = (pi.images || it.images || []).map(img);
      const vids = [pi.video, ...(it.video_info_list || [])].filter(Boolean);
      out.videos = vids
        .map((v) => {
          const best = [...(v.formats || [])].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
          return { url: (best && best.url) || (v.default_format && v.default_format.url), width: best && best.width, height: best && best.height, duration: v.duration };
        })
        .filter((v, i, arr) => v.url && arr.findIndex((x) => x.url === v.url) === i);
      out.rating = it.item_rating && it.item_rating.rating_star;
      out.sold = it.historical_sold || it.sold;
    }
  } catch (e) {
    out.apiError = String(e);
  }

  if (!out.via) {
    out.via = "dom";
    out.title = document.querySelector("h1, [class*='product-title'], ._44qnta")?.innerText?.trim() || document.title;
    const desc = [...document.querySelectorAll("section, div")].find((el) => /Deskripsi Produk|Product Description/i.test(el.firstElementChild?.innerText || ""));
    out.description = desc ? desc.innerText : "";
    const spec = [...document.querySelectorAll("section, div")].find((el) => /Spesifikasi Produk|Product Specifications/i.test(el.firstElementChild?.innerText || ""));
    if (spec) out.attributes = spec.innerText.split("\n").slice(1).reduce((acc, line, i, arr) => (i % 2 === 0 && arr[i + 1] ? [...acc, { name: line, value: arr[i + 1] }] : acc), []);
    const seen = new Set();
    document.querySelectorAll("img[src*='susercontent.com/file/'], picture source[srcset*='susercontent']").forEach((el) => {
      const s = (el.getAttribute("src") || el.getAttribute("srcset") || "").split(" ")[0];
      const h = s.match(/file\/([^@_?\s]+)/);
      if (h && !seen.has(h[1])) { seen.add(h[1]); out.images.push(img(h[1])); }
    });
    document.querySelectorAll("video").forEach((v) => { const s = v.currentSrc || v.src; if (s && !s.startsWith("blob:")) out.videos.push({ url: s }); });
    const priceText = document.querySelector("[class*='price'], .pqTWkA")?.innerText || "";
    const n = priceText.replace(/[^\d]/g, "");
    out.price = n ? Number(n) : null;
  }
  return out;
})();
