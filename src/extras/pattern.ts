// Builds a search pattern for a literal session key.
import escapeStringRegexp from "escape-string-regexp";

export function keyPattern(key: string): string {
  // escape-string-regexp >= 4 escapes "-" as "\x2d"; the index stores keys with "\-".
  const escaped = key
    .split("-")
    .map((part) => escapeStringRegexp(part))
    .join("\\-");
  return `^${escaped}$`;
}
