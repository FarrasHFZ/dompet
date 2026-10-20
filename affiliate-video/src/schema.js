// Shared data contracts. Imported by the Remotion composition and by the Node pipeline scripts,
// so it stays plain ESM JavaScript (no TS) and depends only on zod.
import { z } from "zod";

export const MOTIONS = ["handheld", "push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "macro_zoom", "static"];
export const LAYOUTS = ["card", "full"]; // card = product photo floating over its own blurred fill; full = cover the frame

// ---------- product (what we are allowed to show and say) ----------
export const Claim = z.object({
  id: z.string(),
  text: z.string(), // short Bahasa phrasing usable on screen
  quote: z.string(), // exact text from the product page this claim rests on (checked by ingest)
  source: z.enum(["shopee_title", "shopee_description", "shopee_attributes", "shopee_variation", "manual"]),
});

export const Asset = z.object({
  id: z.string(),
  type: z.enum(["image", "video"]),
  path: z.string(), // relative to public/, e.g. products/<id>/assets/img_01.jpg
  origin: z.enum(["seller", "own_footage", "generated"]),
  note: z.string().optional(), // what is visible, filled by the vision pass
  width: z.number().optional(),
  height: z.number().optional(),
  durationSec: z.number().optional(),
});

export const Product = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  affiliateUrl: z.string().optional(),
  shopId: z.string().optional(),
  itemId: z.string().optional(),
  price: z.number().optional(), // IDR, display price at ingest time
  priceCheckedAt: z.string().optional(),
  category: z.string().optional(),
  claims: z.array(Claim),
  assets: z.array(Asset),
  raw: z.record(z.string(), z.any()).optional(), // untouched extraction, for audit
});

// ---------- recipe (reusable creative mechanism, product-agnostic) ----------
export const Recipe = z.object({
  id: z.string(),
  name: z.string(),
  style: z.enum(["ugc", "motion_graphics", "reveal", "lifestyle"]),
  mechanism: z.string(), // selling mechanism in one line
  hook: z.object({ maxSec: z.number(), pattern: z.string(), examples: z.array(z.string()) }),
  beats: z.array(z.object({ role: z.string(), guidance: z.string(), motion: z.array(z.enum(MOTIONS)).optional() })),
  pacing: z.object({ targetSec: z.number(), minSceneSec: z.number(), maxSceneSec: z.number() }),
  captionStyle: z.enum(["karaoke", "chunk", "none"]),
  cta: z.string(),
  fits: z.array(z.string()), // product categories
  source: z.string().optional(), // seed | inspiration:<file>
  version: z.number(),
});

// ---------- storyboard (one concrete video; what the composition renders) ----------
export const SETS = ["bedroom", "commute", "cafe", "night", "desk", "street"];
export const POSES = ["idle", "hold", "show", "ear", "selfie", "point"];
export const SCREENS = ["lock", "food", "chat", "camera", "calendar", "charging", "map", "videocall", "music"];

// Illustrated characters (drawn by the composition, no generated pixels). voice = Edge neural voice.
export const Character = z.object({
  name: z.string(),
  voice: z.string(),
  skin: z.string(),
  hair: z.enum(["short", "long", "hijab", "bun"]),
  hairColor: z.string(),
  shirt: z.string(),
  accent: z.string().optional(),
});

export const Line = z.object({
  speaker: z.string(),
  text: z.string(),
  claimIds: z.array(z.string()).default([]),
  // filled by voice.mjs
  audio: z.string().optional(),
  startSec: z.number().optional(),
  durationSec: z.number().optional(),
  env: z.array(z.number()).optional(),
});

export const Scene = z.object({
  id: z.string(),
  role: z.string(), // hook | moment | demo | detail | cta ...
  kind: z.enum(["product", "cartoon"]).default("product"),
  // cartoon scenes: people in a drawn set, talking; product scenes: real seller media
  set: z.enum(SETS).optional(),
  cast: z.array(z.object({ who: z.string(), pose: z.enum(POSES), screen: z.enum(SCREENS).optional() })).optional(),
  lines: z.array(Line).optional(),
  assetId: z.string().optional(),
  motion: z.enum(MOTIONS).default("handheld"),
  layout: z.enum(LAYOUTS).default("card"),
  startSec: z.number().optional(), // where to cut into a video asset
  bgPath: z.string().optional(), // pre-blurred background, made by render.mjs
  narration: z.string().default(""), // spoken line for product scenes (cartoon scenes use lines)
  onScreen: z.string().optional(), // big overlay text (hook / callout); captions come from narration
  label: z.string().optional(), // small chip, e.g. "07.00 · Pagi"
  claimIds: z.array(z.string()).default([]),
  // filled by the pipeline, not the writer:
  audio: z.string().optional(),
  durationSec: z.number().optional(),
  assetPath: z.string().optional(),
  assetType: z.enum(["image", "video"]).optional(),
});

export const Storyboard = z.object({
  id: z.string(),
  productId: z.string(),
  recipeId: z.string(),
  variant: z.string(), // A / B / C
  experiment: z.object({ variable: z.string(), value: z.string() }).optional(),
  title: z.string(),
  voice: z.string().default("id-ID-GadisNeural"),
  characters: z.record(z.string(), Character).optional(),
  phoneColor: z.string().optional(), // body colour of the drawn phone (product variant)
  disclosure: z.string().default("Konten dibuat dengan AI · Link afiliasi"),
  cta: z.object({ text: z.string(), sub: z.string().optional() }),
  scenes: z.array(Scene).min(3).max(12),
  caption: z.string().optional(), // post caption + hashtags
  music: z.string().optional(),
});

// ---------- request (what a user or automation asks for) ----------
export const Request = z.object({
  id: z.string(),
  productUrl: z.string().optional(),
  productId: z.string().optional(),
  extractFile: z.string().optional(), // Shopee extraction JSON, ingested on first run
  storyboardsFile: z.string().optional(), // pre-written storyboards (agent mode) instead of the headless writer
  affiliateUrl: z.string().optional(),
  brief:z.string().default(""),
  recipes: z.array(z.string()).default([]), // empty = let the matcher pick
  variants: z.number().int().min(1).max(6).default(3),
  experiment: z.enum(["hook", "recipe", "voice", "none"]).default("hook"),
  voice: z.string().default("id-ID-GadisNeural"),
  platform: z.enum(["tiktok", "shopee_video", "reels"]).default("tiktok"),
  createdAt: z.string().optional(),
});

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TRANSITION_FRAMES = 6;

export const totalFrames = (sb) =>
  Math.max(1, sb.scenes.reduce((s, sc) => s + Math.round((sc.durationSec ?? 2) * FPS), 0));
