import { NextResponse } from "next/server";
import { sendVerificationCode } from "@/lib/auth/email";
import { createVerificationCode, saveVerificationCode } from "@/lib/auth/store";
import { validateEmail } from "@/lib/auth/validation";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const rawEmail = body.email;

    const validation = await validateEmail(rawEmail ?? "");
    if (!validation.valid || !validation.normalizedEmail) {
      return NextResponse.json(
        { error: validation.error ?? "Please enter a valid email address with an active domain." },
        { status: 400 },
      );
    }

    const email = validation.normalizedEmail;
    const { code, record } = createVerificationCode(email);
    await saveVerificationCode(record);
    await sendVerificationCode(email, code);
    return NextResponse.json({ ok: true, expiresInSeconds: 600 });
  } catch (err: unknown) {
    console.error("[api/auth/request-code] Error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to process request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
