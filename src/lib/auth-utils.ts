/**
 * Check if an email is authorized by the project's authorized emails list.
 * Supports both exact email matches and domain patterns (@company.com).
 */
export function isEmailAuthorized(
  email: string,
  authorizedEmails: string[]
): boolean {
  const lower = email.toLowerCase();
  return authorizedEmails.some((pattern) => {
    if (pattern.startsWith("@")) {
      return lower.endsWith(pattern);
    }
    return lower === pattern;
  });
}
