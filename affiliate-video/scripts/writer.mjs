// Product + recipe + brief -> storyboards (one per variant), checked by the guard, with one repair round.
import { Storyboard } from "../src/schema.js";
import { checkStoryboard } from "./guard.mjs";
import { claudeJson, ledger, log } from "./lib.mjs";

const PLATFORM_CTA = {
  tiktok: "Cek keranjang kuning",
  shopee_video: "Klik produknya di bawah",
  reels: "Link ada di bio",
};

function productBlock(product) {
  return `PRODUCT: ${product.name}
CATEGORY: ${product.category ?? "unknown"}
VERIFIED CLAIMS (the only facts you may state; cite their ids):
${product.claims.map((c) => `- ${c.id}: ${c.text}   [page: "${c.quote}"]`).join("\n")}
ASSETS (real seller media; the only visuals available):
${product.assets.map((a) => `- ${a.id} (${a.type}${a.durationSec ? `, ${a.durationSec.toFixed(1)}s` : ""}, ${a.origin}): ${a.note ?? "no description"}`).join("\n")}`;
}

function rules(recipe, request) {
  return `VOICE & HONESTY RULES
- Bahasa Indonesia, casual spoken Jakarta register (aku/kamu, "jujur", "sih", "banget"), like a creator talking to camera. Short sentences. No ad-speak.
- The video is labeled as AI-made affiliate content. So: speak about how the product fits into daily moments ("pas pagi buru-buru, enaknya..."), never invent a personal purchase, an ownership duration, a result you measured, or a customer review.
- Every factual statement must come from a VERIFIED CLAIM and list its id in claimIds. No numbers unless that number is in a claim. No prices, promos, discounts, "terbaik", "dijamin", "100%".
- Each scene: one idea, narration 6-18 words (about 2-4.5 s spoken). Hook narration <= 10 words.
- Pick the asset whose description best matches the moment. Do not use the same asset in two consecutive scenes. Prefer close-up assets for detail beats.
- onScreen: only on the hook scene (max 60 chars), optional on others. label: short chip like "07.00 · Pagi" or "#2".
- motion one of: handheld, push_in, pull_out, pan_left, pan_right, tilt_up, macro_zoom, static. layout "card" for white-background product photos, "full" for lifestyle shots or 9:16 videos.
- Last scene role "cta", narration a soft pointer to the link (platform: ${request.platform}).

RECIPE ${recipe.id}: ${recipe.name}
Mechanism: ${recipe.mechanism}
Hook pattern (<= ${recipe.hook.maxSec}s): ${recipe.hook.pattern}. Examples: ${recipe.hook.examples.join(" | ")}
Beats in order:
${recipe.beats.map((b, i) => `${i + 1}. role=${b.role}: ${b.guidance}${b.motion ? ` (motion: ${b.motion.join("/")})` : ""}`).join("\n")}
Target length ~${recipe.pacing.targetSec}s.`;
}

const SHAPE = `{"title": "...", "caption": "post caption in Bahasa, 1-2 lines + 4-6 hashtags, no prices",
 "scenes": [{"id":"s1","role":"hook","assetId":"img_1","motion":"push_in","layout":"card","narration":"...","onScreen":"...","label":"","claimIds":[]}, ...]}`;

/**
 * Hook experiment: one body, N hooks (only scene 1 changes) so the result says which hook works.
 * Recipe experiment: one storyboard per recipe.
 */
export async function writeStoryboards({ product, recipes, request }) {
  const variants = [];
  const letters = "ABCDEF";
  if (request.experiment === "hook" || request.experiment === "voice") {
    const recipe = recipes[0];
    const hooksWanted = request.experiment === "hook" ? request.variants : 1;
    const prompt = `${productBlock(product)}

${rules(recipe, request)}

BRIEF FROM THE OWNER: ${request.brief || "(none)"}

Write ONE storyboard following the recipe, plus ${hooksWanted - 1} alternative hook scenes that could replace scene s1 while everything after stays identical. Each alternative hook must use a different curiosity mechanism (e.g. POV confession / relatable question / bold observation / numbered promise) and a different on-screen line.
Return ONLY JSON: {"storyboard": ${SHAPE}, "altHooks": [{"mechanism":"...","assetId":"...","motion":"...","layout":"card","narration":"...","onScreen":"..."}]}`;
    const { json, cost } = await claudeJson(prompt);
    ledger("costs", { step: "write", productId: product.id, recipe: recipe.id, usd: cost });
    const base = json.storyboard;
    const hooks = [{ ...base.scenes[0], mechanism: "base" }, ...(json.altHooks || []).slice(0, hooksWanted - 1)];
    const voices = request.experiment === "voice" ? ["id-ID-GadisNeural", "id-ID-ArdiNeural"] : [request.voice];
    for (const [hi, h] of hooks.entries()) {
      for (const voice of voices) {
        const scenes = [{ ...base.scenes[0], ...h, id: "s1", role: "hook", claimIds: h.claimIds ?? [] }, ...base.scenes.slice(1)];
        variants.push({
          base,
          recipe,
          sb: {
            title: base.title,
            caption: base.caption,
            scenes,
            voice,
            experiment:
              request.experiment === "hook"
                ? { variable: "hook", value: h.mechanism || `hook_${hi + 1}` }
                : { variable: "voice", value: voice },
          },
        });
      }
    }
  } else {
    for (const recipe of recipes.slice(0, request.variants)) {
      const prompt = `${productBlock(product)}\n\n${rules(recipe, request)}\n\nBRIEF FROM THE OWNER: ${request.brief || "(none)"}\n\nReturn ONLY JSON: ${SHAPE}`;
      const { json, cost } = await claudeJson(prompt);
      ledger("costs", { step: "write", productId: product.id, recipe: recipe.id, usd: cost });
      variants.push({ recipe, sb: { ...json, voice: request.voice, experiment: { variable: "recipe", value: recipe.id } } });
    }
  }

  const out = [];
  for (const [i, v] of variants.entries()) {
    let sb = finalize(v.sb, { product, recipe: v.recipe, request, variant: letters[i] });
    let problems = checkStoryboard(sb, product);
    if (problems.length) {
      log(`variant ${letters[i]}: ${problems.length} guard issues, asking for a fix`);
      const fix = `${productBlock(product)}\n\n${rules(v.recipe, request)}\n\nThis storyboard broke the rules:\n${problems.map((p) => "- " + p).join("\n")}\n\nSTORYBOARD:\n${JSON.stringify({ title: sb.title, caption: sb.caption, scenes: sb.scenes }, null, 1)}\n\nFix ONLY what is needed (keep scene s1 as close as possible). Return ONLY JSON: ${SHAPE}`;
      const { json, cost } = await claudeJson(fix);
      ledger("costs", { step: "repair", productId: product.id, usd: cost });
      sb = finalize({ ...v.sb, ...json }, { product, recipe: v.recipe, request, variant: letters[i] });
      problems = checkStoryboard(sb, product);
    }
    out.push({ storyboard: sb, problems });
  }
  return out;
}

export function finalize(raw, { product, recipe, request, variant }) {
  const assets = Object.fromEntries(product.assets.map((a) => [a.id, a]));
  return Storyboard.parse({
    id: `${product.id}_${recipe.id}_${variant}`,
    productId: product.id,
    recipeId: recipe.id,
    variant,
    experiment: raw.experiment,
    title: raw.title || product.name,
    voice: raw.voice || request.voice,
    cta: { text: PLATFORM_CTA[request.platform], sub: "Cek varian & harga terbaru di sana" },
    caption: raw.caption,
    scenes: raw.scenes.map((s, i) => ({
      ...s,
      id: s.id || `s${i + 1}`,
      layout: s.layout || (assets[s.assetId]?.height > (assets[s.assetId]?.width ?? 0) * 1.3 ? "full" : "card"),
      label: s.label || undefined,
      onScreen: s.onScreen || undefined,
      assetPath: assets[s.assetId]?.path,
      assetType: assets[s.assetId]?.type,
    })),
  });
}
