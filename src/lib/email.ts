/**
 * Outbound email integration boundary (Resend).
 * Without RESEND_API_KEY the send function reports skipped instead of
 * pretending an email was delivered. Transactional uses: password reset
 * (handled by the auth provider), application status change notifications,
 * and consultation confirmations.
 */

export interface EmailConfigStatus {
  configured: boolean;
}

export function configStatus(): EmailConfigStatus {
  return {
    configured: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_FROM),
  };
}

export interface EmailSendResult {
  sent: boolean;
  reason?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailSendResult> {
  if (!configStatus().configured) {
    return { sent: false, reason: "email_provider_not_configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.NOTIFY_EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) return { sent: false, reason: "email_provider_error" };
  return { sent: true };
}
