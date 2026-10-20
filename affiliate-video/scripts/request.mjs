// Drop a request into the queue.
//   npm run request -- --url <shopee link> [--brief "..."] [--variants 3] [--experiment hook|recipe|voice] [--recipes a,b] [--platform tiktok] [--extract file.json] [--affiliate <link>]
//   npm run request -- --product <productId> ...
import path from "node:path";
import { Request } from "../src/schema.js";
import { REQUESTS, arg, log, slug, stamp, writeJson } from "./lib.mjs";

const url = arg("url");
const productId = arg("product");
if (!url && !productId) throw new Error("need --url or --product");
const req = Request.parse({
  id: `${stamp()}_${slug(productId || url.match(/i\.\d+\.(\d+)/)?.[1] || "req")}`,
  productUrl: url,
  productId,
  extractFile: arg("extract") && path.resolve(arg("extract")),
  affiliateUrl: arg("affiliate"),
  storyboardsFile: arg("storyboards") && path.resolve(arg("storyboards")),
  brief: arg("brief", ""),
  variants: Number(arg("variants", 3)),
  experiment: arg("experiment", "hook"),
  recipes: arg("recipes") ? arg("recipes").split(",") : [],
  voice: arg("voice", "id-ID-GadisNeural"),
  platform: arg("platform", "tiktok"),
  createdAt: new Date().toISOString(),
});
const file = path.join(REQUESTS, "inbox", `${req.id}.json`);
writeJson(file, req);
log(`queued ${file}`);
