// Deterministic avatar URLs per user. Uses Dicebear's hosted SVG endpoint,
// so the same username always renders the same illustrated avatar without
// requiring uploads or storage.
const STYLE = "notionists";
const ENDPOINT = `https://api.dicebear.com/9.x/${STYLE}/svg`;

export function getAvatarUrl(seed: string | null | undefined): string {
  const safe = (seed ?? "").trim() || "anon";
  return `${ENDPOINT}?seed=${encodeURIComponent(safe)}`;
}
