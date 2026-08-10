import type { Env } from "../env";

export class InvitationDeliveryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function sendBattalionInviteEmail(
  env: Env,
  input: { invitationId: string; email: string; battalionName: string; invitedBy: string; message: string; inviteCode?: string },
): Promise<string> {
  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL || !env.AUTH_BASE_URL) {
    if (env.ENVIRONMENT === "development") return "development-delivery";
    throw new InvitationDeliveryError("EMAIL_NOT_CONFIGURED", "Battalion invitation email is not configured.");
  }
  const url = `${env.AUTH_BASE_URL.replace(/\/$/, "")}/${input.inviteCode ? `?invite=${encodeURIComponent(input.inviteCode)}` : ""}`;
  const note = input.message ? `\n\nMessage from command: ${input.message}` : "";
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `battalion-invite/${input.invitationId}`,
        "user-agent": "CorinthsPlight/0.1",
      },
      body: JSON.stringify({
        from: env.AUTH_FROM_EMAIL,
        to: [input.email],
        subject: `Invitation to ${input.battalionName}`,
        text: `${input.invitedBy} has invited you to join ${input.battalionName} in Corinth's Plight.${note}\n\nSign in or enlist here: ${url}\n\nThis invitation expires in seven days.`,
        html: `<div style="background:#071013;color:#dce8e8;padding:32px;font-family:Arial,sans-serif"><h1 style="font-size:22px">Battalion invitation</h1><p><strong>${escapeHtml(input.invitedBy)}</strong> has invited you to join <strong>${escapeHtml(input.battalionName)}</strong>.</p>${input.message ? `<p style="color:#b9cbcb">${escapeHtml(input.message)}</p>` : ""}<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;background:#76e3d2;color:#071013;text-decoration:none;font-weight:700">OPEN BATTALION ASSIGNMENT</a></p><p style="color:#93a7a8;font-size:13px">Sign in with the invited email. This invitation expires in seven days.</p></div>`,
        tags: [{ name: "category", value: "battalion-invitation" }],
      }),
    });
  } catch {
    throw new InvitationDeliveryError("PROVIDER_UNAVAILABLE", "Invitation delivery provider is unavailable.");
  }
  const body = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok || !body.id) {
    throw new InvitationDeliveryError("PROVIDER_REJECTED", "Invitation delivery provider rejected the request.");
  }
  return body.id;
}
