// Content guard: every storyboard must pass this before voiceover/render. Returns a list of violations.
// The point is product fidelity and honest UGC: real seller media only, facts only from verified claims,
// no invented ownership stories or results, no prices that will go stale.

const BANNED = [
  [/\bterbaik\b|\bpaling (murah|bagus|canggih)\b|\bnomor ?1\b|\b#1 di\b/i, "superlative not backed by a claim"],
  [/\b100 ?%|\bdijamin\b|\bpasti\b/i, "guarantee language"],
  [/\brp\.? ?\d|\b\d+ ?(rb|ribu|jt|juta)\b/i, "price in script (prices change; point to the link instead)"],
  [/\b(aku|saya|gue|gw) (udah|sudah) (pakai|pake) .{0,20}(minggu|bulan|tahun)\b/i, "invented ownership duration"],
  [/\b(aku|saya|gue|gw) (beli|order|checkout)\b/i, "invented purchase story"],
  [/\btestimoni|\breview jujur dari pembeli\b/i, "presents itself as a customer testimonial"],
  [/\bgratis\b|\bpromo\b|\bdiskon\b|\bflash sale\b/i, "promotion claim (time-limited; not verifiable at post time)"],
];

const LIST_WORDS = /^(hal|alasan|fitur|poin|detail|momen)\b/i;

function numbersIn(text) {
  const out = [];
  const re = /(\d+(?:[.,]\d+)?)(\s*\S*)/g;
  let m;
  while ((m = re.exec(text))) out.push({ n: m[1].replace(",", "."), after: m[2].trim() });
  return out;
}

export function checkStoryboard(sb, product) {
  const v = [];
  const assetIds = new Set(product.assets.map((a) => a.id));
  const claimIds = new Set(product.claims.map((c) => c.id));
  const factText = product.claims.map((c) => `${c.text} ${c.quote}`).join(" ").toLowerCase();
  const factNumbers = new Set(numbersIn(factText).map((x) => x.n));
  if (product.name) numbersIn(product.name).forEach((x) => factNumbers.add(x.n));

  if (sb.scenes[0]?.role !== "hook") v.push("first scene must be the hook");
  if (sb.scenes.at(-1)?.role !== "cta") v.push("last scene must be the cta");

  for (const sc of sb.scenes) {
    if (!assetIds.has(sc.assetId)) v.push(`${sc.id}: unknown assetId ${sc.assetId}`);
    for (const c of sc.claimIds || []) if (!claimIds.has(c)) v.push(`${sc.id}: unknown claim ${c}`);
    const fields = { narration: sc.narration, onScreen: sc.onScreen || "", label: sc.label || "" };
    for (const [field, text] of Object.entries(fields)) {
      for (const [re, why] of BANNED) if (re.test(text)) v.push(`${sc.id}.${field}: ${why}: "${text}"`);
      for (const { n, after } of numbersIn(text)) {
        if (field === "label") continue; // time-of-day chips and "#1" list markers
        if (Number(n) <= 5 && LIST_WORDS.test(after)) continue; // "3 hal yang ..."
        if (!factNumbers.has(n)) v.push(`${sc.id}.${field}: number "${n}" not found in verified claims`);
      }
    }
    if ((sc.narration || "").split(/\s+/).length > 26) v.push(`${sc.id}: narration too long for one scene`);
    if ((sc.onScreen || "").length > 70) v.push(`${sc.id}: on-screen text too long`);
    if (["moment", "demo", "detail"].includes(sc.role) && !(sc.claimIds || []).length)
      v.push(`${sc.id}: ${sc.role} scene must cite at least one claimId`);
  }
  const used = sb.scenes.map((s) => s.assetId);
  const dupes = used.filter((a, i) => used.indexOf(a) !== i && a === used[i - 1]);
  if (dupes.length) v.push(`same asset in back-to-back scenes: ${[...new Set(dupes)].join(", ")}`);
  for (const [re, why] of BANNED) if (re.test(sb.cta.text + " " + (sb.cta.sub || ""))) v.push(`cta: ${why}`);
  return v;
}
