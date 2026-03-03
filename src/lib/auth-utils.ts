/**
 * Detect gibberish/spam email local parts.
 * Uses a scoring system so a single real-name quirk (e.g. McCray, Schwartz)
 * won't cause a false positive — you need multiple spam signals.
 */
export function isSpamEmail(email: string): boolean {
  const local = email.split("@")[0].toLowerCase().replace(/[._-]/g, "");

  if (local.length <= 4) return false;

  const vowels = (local.match(/[aeiou]/g) || []).length;
  const consonants = (local.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
  const digits = (local.match(/[0-9]/g) || []).length;
  const letters = vowels + consonants;

  let score = 0;

  // 5+ consecutive consonants (e.g. "xkjdfgh", "mcclellan" has 6 but is real)
  const runs = (local.match(/[bcdfghjklmnpqrstvwxyz]+/gi) || [""]).map(
    (m) => m.length
  );
  if (Math.max(...runs) >= 5) score += 1;

  // Very few vowels relative to letters (< 15% — "schwartz" is 12.5% but real)
  if (letters > 4 && vowels / letters < 0.15) score += 1;

  // More than half the string is digits mixed with letters (e.g. "a8k3j2m9")
  if (letters > 0 && digits > 0 && digits / local.length > 0.5) score += 2;

  // Alternating letter-digit pattern repeated 3+ times (e.g. "a1b2c3")
  if (/([a-z]\d){3,}/i.test(local) || /(\d[a-z]){3,}/i.test(local))
    score += 2;

  // Need 2+ points: a single name quirk alone won't trigger, but gibberish
  // hits multiple signals and digit-heavy patterns are strong signals on their own
  return score >= 2;
}

/**
 * Check if an email is authorized by the project's authorized emails list.
 * Supports both exact email matches and domain patterns (@company.com).
 */
export function isEmailAuthorized(
  email: string,
  authorizedEmails: string[]
): boolean {
  const lower = email.trim().toLowerCase();
  return authorizedEmails.some((raw) => {
    const pattern = raw.trim().toLowerCase();
    if (pattern.startsWith("@")) {
      return lower.endsWith(pattern);
    }
    return lower === pattern;
  });
}
