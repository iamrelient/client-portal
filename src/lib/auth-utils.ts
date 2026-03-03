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
