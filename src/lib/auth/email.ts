import { Resend } from "resend";

export async function sendVerificationCode(email: string, code: string) {
  const resendApiKey =
    process.env.app_RESEND_API_KEY || process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.info(`[bodh] RESEND_API_KEY not configured. Verification code for ${email}: ${code}`);
    return;
  }

  try {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from:
        process.env.app_RESEND_FROM_EMAIL ||
        process.env.RESEND_FROM_EMAIL ||
        "bodh <onboarding@resend.dev>",
      to: email,
      subject: "Your bodh. verification code",
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    });
    if (error) {
      console.error("[resend] Error sending email:", error);
      console.info(`[bodh] Fallback code for ${email}: ${code}`);
    }
  } catch (err) {
    console.error("[resend] Exception sending email:", err);
    console.info(`[bodh] Fallback code for ${email}: ${code}`);
  }
}
