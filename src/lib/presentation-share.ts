/**
 * Rich-clipboard sharing for presentation links.
 *
 * Pasting a bare URL into Outlook gives you a bare URL — Outlook does not
 * unfurl links into preview cards the way iMessage/Slack do. The trick
 * (already proven by the dashboard's project-link copy) is to put an
 * HTML flavor on the clipboard alongside the plain text: Outlook pastes
 * the HTML and renders a real thumbnail + title card, while anything
 * expecting plain text still gets the URL.
 *
 * The thumbnail points at the same 1200x630 OG card endpoint that drives
 * link unfurls elsewhere, so the email preview and the Slack/iMessage
 * preview stay visually identical.
 */

/** Escape text that gets interpolated into the clipboard HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PresentationCardOptions {
  /** Absolute URL of the presentation. */
  url: string;
  /** Absolute URL of the 1200x630 card image, or null for a text-only
   *  card. The OG endpoint 404s for password-protected decks and decks
   *  with no usable cover, and a broken <img> in an email looks worse
   *  than no image at all — so callers pass null when unsure. */
  thumbUrl: string | null;
  title: string;
  subtitle: string;
}

/**
 * Build the Outlook-friendly HTML card. Table-based with inline styles —
 * the only layout Outlook's Word-based renderer handles reliably.
 */
export function buildPresentationCardHtml({
  url,
  thumbUrl,
  title,
  subtitle,
}: PresentationCardOptions): string {
  const safeTitle = esc(title);
  const safeSubtitle = esc(subtitle);
  const safeUrl = esc(url);

  const thumbCell = thumbUrl
    ? `<td width="132" style="width:132px;padding:0;vertical-align:middle;"><a href="${safeUrl}" style="text-decoration:none;"><div style="width:132px;height:69px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;background:linear-gradient(135deg,#1e3a5f,#2d6a9f);"><img src="${esc(thumbUrl)}" width="132" height="69" alt="${safeTitle}" style="display:block;width:132px;height:69px;object-fit:cover;border:0;" /></div></a></td>`
    : `<td width="132" style="width:132px;padding:0;vertical-align:middle;"><div style="width:132px;height:69px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;background:linear-gradient(135deg,#1e3a5f,#2d6a9f);text-align:center;line-height:69px;color:#fff;font-weight:600;font-size:20px;font-family:Arial,sans-serif;">${esc(
        (title.trim().charAt(0) || "R").toUpperCase()
      )}</div></td>`;

  return (
    `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:'Century Gothic',CenturyGothic,AppleGothic,sans-serif;">` +
    `<tr>${thumbCell}` +
    `<td style="padding:0 0 0 12px;vertical-align:middle;">` +
    `<a href="${safeUrl}" style="color:#2563eb;text-decoration:underline;font-weight:500;font-size:14px;">${safeTitle}</a>` +
    `<br/><span style="font-size:10px;color:#9ca3af;">${safeSubtitle}</span>` +
    `</td></tr></table>`
  );
}

/**
 * Copy the presentation as a rich card (HTML) + plain URL fallback.
 *
 * Resolves true when the rich flavor made it onto the clipboard, false
 * when we had to fall back to plain text (older browsers without
 * ClipboardItem, or a rejected write).
 */
export async function copyPresentationCard(
  opts: PresentationCardOptions
): Promise<boolean> {
  const html = buildPresentationCardHtml(opts);

  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([opts.url], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    // Fall through to the plain-text path below.
  }

  await navigator.clipboard.writeText(opts.url);
  return false;
}

/** Absolute URL of the OG card image for a presentation token. */
export function presentationCardImageUrl(
  origin: string,
  token: string
): string {
  return `${origin}/api/og/presentation/${token}`;
}
