// Shopee extraction JSON -> public/products/<id>/ (downloaded media + product.json with verified claims).
//   npm run ingest -- --from extracted.json [--affiliate <link>] [--id <productId>]
// Claims are proposed by Claude but only kept when their quote really appears in the page text.
import fs from "node:fs";
import path from "node:path";
import { Product } from "../src/schema.js";
import { PRODUCTS, arg, claudeJson, durationSec, ledger, log, probe, readJson, rel, slug, writeJson } from "./lib.mjs";

const MAX_IMAGES = 14;
const MAX_VIDEOS = 3;

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function download(url, dest) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", referer: "https://shopee.co.id/" } });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

export async function ingest(ex, { affiliateUrl, id } = {}) {
  const productId = id || slug(`${ex.title}`.split(/[|,(]/)[0]) + (ex.itemId ? `-${ex.itemId}` : "");
  const dir = path.join(PRODUCTS, productId);
  const adir = path.join(dir, "assets");
  fs.mkdirSync(adir, { recursive: true });
  log(`ingest ${productId} (${ex.images?.length ?? 0} images, ${ex.videos?.length ?? 0} videos, via ${ex.via})`);

  // variation images are often the clearest colour shots; keep them after the main gallery
  const imageUrls = [...new Set([...(ex.images || []), ...(ex.variations || []).flatMap((v) => v.images || [])])].slice(0, MAX_IMAGES);
  const assets = [];
  for (const [i, url] of imageUrls.entries()) {
    const file = path.join(adir, `img_${String(i + 1).padStart(2, "0")}.jpg`);
    try {
      if (!fs.existsSync(file)) await download(url, file);
      const st = (await probe(file)).streams?.[0] ?? {};
      assets.push({ id: `img_${i + 1}`, type: "image", path: rel(file), origin: "seller", width: st.width, height: st.height, url });
    } catch (e) {
      log(`skip image ${url}: ${e.message}`);
    }
  }
  for (const [i, v] of (ex.videos || []).slice(0, MAX_VIDEOS).entries()) {
    const file = path.join(adir, `vid_${i + 1}.mp4`);
    try {
      if (!fs.existsSync(file)) await download(v.url, file);
      const j = await probe(file);
      const vs = j.streams.find((s) => s.codec_type === "video") ?? {};
      assets.push({ id: `vid_${i + 1}`, type: "video", path: rel(file), origin: "seller", width: vs.width, height: vs.height, durationSec: await durationSec(file), url: v.url });
    } catch (e) {
      log(`skip video ${v.url}: ${e.message}`);
    }
  }
  if (!assets.length) throw new Error("no assets downloaded");

  // own footage dropped into assets/own/ is picked up too (real daily-life shots beat any generated b-roll)
  const own = path.join(adir, "own");
  if (fs.existsSync(own)) {
    for (const f of fs.readdirSync(own)) {
      const file = path.join(own, f);
      const isVid = /\.(mp4|mov|webm)$/i.test(f);
      if (!isVid && !/\.(jpe?g|png|webp)$/i.test(f)) continue;
      assets.push({ id: `own_${slug(f)}`, type: isVid ? "video" : "image", path: rel(file), origin: "own_footage", durationSec: isVid ? await durationSec(file) : undefined });
    }
  }

  const sourceText = {
    shopee_title: ex.title || "",
    shopee_description: ex.description || "",
    shopee_attributes: (ex.attributes || []).map((a) => `${a.name}: ${a.value}`).join("\n"),
    shopee_variation: (ex.variations || []).map((v) => `${v.name}: ${(v.options || []).join(", ")}`).join("\n"),
  };

  const prompt = `You are preparing a product fact sheet for short UGC-style affiliate videos in Bahasa Indonesia.

PRODUCT PAGE TEXT (the ONLY allowed source of facts):
<title>${sourceText.shopee_title}</title>
<description>${sourceText.shopee_description.slice(0, 12000)}</description>
<attributes>${sourceText.shopee_attributes}</attributes>
<variations>${sourceText.shopee_variation}</variations>

PRODUCT MEDIA FILES (read each with the Read tool and look at it):
${assets.map((a) => `${a.id} (${a.type}): ${path.join(PRODUCTS, "..", a.path)}`).filter((_, i) => assets[i].type === "image").join("\n")}

Return ONLY JSON:
{
  "category": "short lowercase category, e.g. phone, gadget, beauty, home, kitchen, fashion_accessory",
  "claims": [ { "id": "c1", "text": "short casual Bahasa phrasing for a video, max 9 words", "quote": "EXACT substring copied from the page text above that proves it", "source": "shopee_title|shopee_description|shopee_attributes|shopee_variation" } ],
  "assets": [ { "id": "img_1", "note": "what is visible: angle, colour, close-up of what, any text/packaging, is it a lifestyle or white-background shot", "usable": true } ]
}
Rules: 8-16 claims, one fact each, most useful-in-daily-life facts first (camera, battery, durability, size, colour, what's in the box...). Never infer facts not in the text. The quote must be copied character-for-character. Mark an asset unusable if it is mostly a text banner, a size chart, a certificate, or a near-duplicate.`;

  const imagePaths = assets.filter((a) => a.type === "image");
  const { json, cost } = await claudeJson(prompt, { tools: imagePaths.length ? ["Read"] : [] });
  ledger("costs", { step: "ingest", productId, usd: cost });

  const claims = [];
  for (const c of json.claims || []) {
    const hay = norm(sourceText[c.source] ?? Object.values(sourceText).join("\n"));
    if (c.quote && hay.includes(norm(c.quote))) claims.push({ id: c.id, text: c.text, quote: c.quote, source: c.source });
    else log(`dropped unverifiable claim: ${c.text} (quote not found)`);
  }
  const notes = Object.fromEntries((json.assets || []).map((a) => [a.id, a]));
  const kept = assets
    .filter((a) => notes[a.id]?.usable !== false)
    .map(({ url, ...a }) => ({ ...a, note: notes[a.id]?.note ?? a.note }));

  const product = Product.parse({
    id: productId,
    name: ex.title,
    url: ex.url,
    affiliateUrl,
    shopId: ex.shopId,
    itemId: ex.itemId,
    price: ex.price ?? undefined,
    priceCheckedAt: new Date().toISOString(),
    category: json.category || ex.category,
    claims,
    assets: kept,
    raw: ex,
  });
  writeJson(path.join(dir, "product.json"), product);
  log(`product.json: ${claims.length} verified claims, ${kept.length}/${assets.length} usable assets`);
  return product;
}

if (process.argv[1] && process.argv[1].endsWith("ingest.mjs")) {
  const from = arg("from");
  if (!from) throw new Error("usage: npm run ingest -- --from extracted.json [--affiliate <link>] [--id <productId>]");
  await ingest(readJson(from), { affiliateUrl: arg("affiliate"), id: arg("id") });
}
