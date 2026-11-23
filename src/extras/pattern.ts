// Builds a search pattern for a literal session key.
import escapeStringRegexp from "escape-string-regexp";

export function keyPattern(key: string): string {
  return `^${escapeStringRegexp(key)}$`;
}
