export function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || "untitled"
  );
}

export async function uniqueSlug(
  baseSlug: string,
  fetchSimilar: (prefix: string) => Promise<string[]>,
): Promise<string> {
  const existing = new Set(await fetchSimilar(baseSlug));

  if (!existing.has(baseSlug)) return baseSlug;

  for (let i = 1; i <= 999; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
}
