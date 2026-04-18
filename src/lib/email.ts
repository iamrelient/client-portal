import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || "");
  }
  return _resend;
}

const NOTIFICATION_EMAIL =
  process.env.NOTIFICATION_EMAIL || "caleb@rayrenders.com";

interface InspirationNotificationParams {
  projectName: string;
  fileName: string;
  uploaderName: string;
  uploaderRole: "ADMIN" | "STAFF" | "USER";
  notes?: string | null;
  projectId: string;
}

export async function sendInspirationNotification({
  projectName,
  fileName,
  uploaderName,
  uploaderRole,
  notes,
  projectId,
}: InspirationNotificationParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email notification");
    return;
  }

  const isStudio = uploaderRole === "ADMIN" || uploaderRole === "STAFF";
  const roleBadge = isStudio ? "Studio" : "Client";
  const portalUrl = process.env.NEXTAUTH_URL || "https://portal.rayrenders.com";

  try {
    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Portal <onboarding@resend.dev>",
      to: [NOTIFICATION_EMAIL],
      subject: `New Inspiration added to ${projectName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a2e; margin-bottom: 4px;">New Design Inspiration</h2>
          <p style="color: #64748b; margin-top: 0; font-size: 14px;">Someone just added inspiration to your project.</p>

          <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;">Project</p>
            <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #1a1a2e;">${projectName}</p>

            <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;">File</p>
            <p style="margin: 0 0 16px; font-size: 16px; font-weight: 500; color: #1a1a2e;">${fileName}</p>

            <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;">Uploaded by</p>
            <p style="margin: 0 0 ${notes ? "16px" : "0"}; font-size: 16px; color: #1a1a2e;">
              ${uploaderName}
              <span style="display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; ${
                isStudio
                  ? "background: #fce7f3; color: #be185d;"
                  : "background: #dbeafe; color: #1d4ed8;"
              }">${roleBadge}</span>
            </p>

            ${
              notes
                ? `
            <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;">Note</p>
            <p style="margin: 0; font-size: 14px; color: #334155; font-style: italic; background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">&ldquo;${notes}&rdquo;</p>
            `
                : ""
            }
          </div>

          <a href="${portalUrl}/admin/projects/${projectId}"
             style="display: inline-block; background: #4a6199; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
            View in Portal
          </a>
        </div>
      `,
    });
  } catch (error) {
    console.error("Failed to send inspiration notification:", error);
  }
}

export async function sendPasswordResetEmail({
  email,
  resetUrl,
}: {
  email: string;
  resetUrl: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping password reset email");
    return;
  }

  try {
    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Portal <onboarding@resend.dev>",
      to: [email],
      subject: "Reset your password",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a2e; margin-bottom: 4px;">Password Reset</h2>
          <p style="color: #64748b; margin-top: 0; font-size: 14px;">We received a request to reset your password.</p>

          <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 16px; font-size: 14px; color: #334155;">
              Click the button below to set a new password. This link expires in 1 hour.
            </p>
            <a href="${resetUrl}"
               style="display: inline-block; background: #4a6199; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
              Reset Password
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
            If you didn&rsquo;t request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Failed to send password reset email:", error);
  }
}
