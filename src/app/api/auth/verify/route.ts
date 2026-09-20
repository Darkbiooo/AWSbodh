import { NextResponse } from "next/server";
import { createSession, sessionCookie } from "@/lib/auth/session";
import { consumeVerificationCode } from "@/lib/auth/store";
import {
  getStudentRecord,
  putStudentRecord,
  getStudentProfile,
  putStudentProfile,
  recordLogin,
} from "@/lib/aws/dynamodb";
import type { Student } from "@/types/student";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      code?: string;
      name?: string;
      language?: "en" | "hi";
    };

    const email = body.email?.trim().toLowerCase();
    const code = body.code?.trim();

    // ── Validate OTP ────────────────────────────────────────────────────────────
    if (
      !email ||
      !code ||
      !/^\d{6}$/.test(code) ||
      !(await consumeVerificationCode(email, code))
    ) {
      return NextResponse.json(
        { error: "That code is invalid or expired." },
        { status: 401 },
      );
    }

    // ── Determine: new user or returning? ───────────────────────────────────────
    const studentId = email; // studentId === email for this app
    const existingRecord  = await getStudentRecord(studentId);
    const existingProfile = await getStudentProfile(email);
    const isNewUser = !existingRecord && !existingProfile;

    const name     = body.name?.trim() || email.split("@")[0];
    const language = body.language ?? existingRecord?.language ?? existingProfile?.language ?? "en";

    if (isNewUser) {
      // ── Signup: create Student profile ──────────────────────────────────────
      const newProfile: Student = {
        id: email,
        name,
        email,
        language,
        preferredStyle: "simple",
        createdAt: new Date().toISOString(),
      };
      await putStudentProfile(newProfile);

      // Create the base StudentRecord (recordLogin below will upsert on top)
      await putStudentRecord({
        studentId,
        language,
        topics: {},
        weakTopics: [],
      });
    }

    // ── Always write login event to DynamoDB (new + returning) ──────────────────
    // This upserts: lastLoginAt, loginCount, updatedAt — and initialises the
    // row for new users if aWs_STUDENT_RECORD_TABLE is set.
    await recordLogin({ studentId, language });

    // ── Issue session JWT ────────────────────────────────────────────────────────
    const token = await createSession({ email, name });
    const response = NextResponse.json({ ok: true, isNewUser });
    response.cookies.set(sessionCookie, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });
    return response;
  } catch (err: unknown) {
    console.error("[api/auth/verify] Error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to verify code.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

