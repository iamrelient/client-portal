/**
 * Detect gibberish/spam email local parts.
 * Tuned to pass real names with stacked initials (e.g. "dbmscray" = "DB McCray")
 * while still catching digit-heavy and all-consonant gibberish.
 */
export function isSpamEmail(email: string): boolean {
  const local = email.split("@")[0].toLowerCase().replace(/[._-]/g, "");

  if (local.length <= 4) return false;

  const vowels = (local.match(/[aeiou]/g) || []).length;
  const consonants = (local.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
  const digits = (local.match(/[0-9]/g) || []).length;
  const letters = vowels + consonants;

  const runs = (local.match(/[bcdfghjklmnpqrstvwxyz]+/gi) || [""]).map(
    (m) => m.length
  );
  const maxRun = Math.max(...runs);

  // Strong digit signals — real people don't register "a8k3j2m9"-style locals.
  if (letters > 0 && digits > 0 && digits / local.length > 0.5) return true;
  if (/([a-z]\d){3,}/i.test(local) || /(\d[a-z]){3,}/i.test(local)) return true;

  // 7+ consecutive consonants — no real Latin-alphabet name reaches this.
  if (maxRun >= 7) return true;

  // Combo signal: a long consonant run (5+) AND a very low vowel ratio (<10%).
  // Real names with initials like "dbmscray" (12.5% vowels) stay above the
  // 10% threshold, so they pass. True gibberish like "xkjdfgh" (0% vowels)
  // still trips both conditions.
  if (maxRun >= 5 && letters > 4 && vowels / letters < 0.1) return true;

  return false;
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
