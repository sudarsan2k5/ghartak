export const recentSearchKey = "ghartak.recent-searches.v1";
export const maxRecentSearches = 8;

/** Puts a term at the front, drops case-insensitive duplicates, and caps the list. Blank terms are ignored. */
export function addRecentSearch(current: readonly string[], term: string): string[] {
  const trimmed = term.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > 80) {
    return [...current];
  }
  const rest = current.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
  return [trimmed, ...rest].slice(0, maxRecentSearches);
}

/** Reads a stored list defensively. Anything that is not a list of short strings becomes an empty list. */
export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0 && entry.length <= 80)
      .slice(0, maxRecentSearches);
  } catch {
    return [];
  }
}
