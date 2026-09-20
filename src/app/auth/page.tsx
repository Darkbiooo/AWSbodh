"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { validateEmailFormat } from "@/lib/auth/email-format";

type Step = "email" | "otp" | "signup";

function AuthForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const nextPath     = searchParams.get("next") ?? "/dashboard";

  const [step, setStep]       = useState<Step>("email");
  const [email, setEmail]     = useState("");
  const [code, setCode]       = useState("");
  const [name, setName]       = useState("");
  const [language, setLang]   = useState<"en" | "hi">("en");
  const [error, setError]     = useState("");
  const [info, setInfo]       = useState("");
  const [loading, setLoading] = useState(false);

  // ── Step 1: request OTP ────────────────────────────────────────────────────
  async function handleRequestCode(e: FormEvent) {
    e.preventDefault();
    setError(""); setInfo("");

    const formatCheck = validateEmailFormat(email);
    if (!formatCheck.valid) {
      setError(formatCheck.error ?? "Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: formatCheck.normalizedEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? `Server error (${res.status}). Please check environment setup.`); return; }
      setInfo("Check your inbox — a 6-digit code is on its way.");
      setStep("otp");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────
  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res  = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; isNewUser?: boolean; error?: string };
      if (!res.ok) { setError(data.error ?? "Invalid or expired code."); return; }

      if (data.isNewUser) {
        // New user — collect their name/language then finalize
        setStep("signup");
        return;
      }

      // Returning user — session cookie is already set, go to destination
      window.location.href = nextPath;
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: finish signup (name + language already known) ─────────────────
  async function handleFinishSignup(e: FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      // Update the profile with name + language (session is already live)
      if (name.trim()) {
        await fetch("/api/student", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), language }),
        }).catch((err) => console.warn("Student profile save error:", err));
      }
      window.location.href = "/onboarding";
    } catch (err) {
      console.warn("Signup navigation fallback:", err);
      window.location.href = "/onboarding";
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    if (step === "email")  return handleRequestCode(e);
    if (step === "otp")    return handleVerify(e);
    if (step === "signup") return handleFinishSignup(e);
  }

  const stepLabel: Record<Step, string> = {
    email:  "Send my code →",
    otp:    "Continue →",
    signup: "Create my account →",
  };

  return (
    <main className="auth-page">
      <Link className="brand" href="/">
        bodh<span>.</span>
      </Link>

      <div className="auth-panel">
        <span className="eyebrow">
          {step === "email"  && "Your learning space"}
          {step === "otp"    && "One-time code"}
          {step === "signup" && "Almost there"}
        </span>

        <h1>
          {step === "email"  && <>Come as<br />you are.</>}
          {step === "otp"    && <>Enter your<br />code.</>}
          {step === "signup" && <>Nice to<br />meet you.</>}
        </h1>

        <p>
          {step === "email"  && "Sign in or create an account — same flow, same email."}
          {step === "otp"    && `We sent a 6-digit code to ${email}.`}
          {step === "signup" && "Tell us a bit about yourself so we can personalise your path."}
        </p>

        <form onSubmit={onSubmit} className="auth-form">
          {/* ── Email ── */}
          {step === "email" && (
            <label>
              Email address
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                placeholder="you@example.com"
                disabled={loading}
              />
            </label>
          )}

          {/* ── OTP ── */}
          {step === "otp" && (
            <label>
              Verification code
              <input
                id="auth-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                disabled={loading}
                autoFocus
              />
            </label>
          )}

          {/* ── Signup extras ── */}
          {step === "signup" && (
            <>
              <label>
                Your name
                <input
                  id="auth-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Arjun"
                  disabled={loading}
                  autoFocus
                />
              </label>

              <label>
                Preferred language
                <div className="auth-lang-toggle">
                  <button
                    type="button"
                    id="auth-lang-en"
                    className={`auth-lang-btn${language === "en" ? " active" : ""}`}
                    onClick={() => setLang("en")}
                    disabled={loading}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    id="auth-lang-hi"
                    className={`auth-lang-btn${language === "hi" ? " active" : ""}`}
                    onClick={() => setLang("hi")}
                    disabled={loading}
                  >
                    हिंदी
                  </button>
                </div>
              </label>
            </>
          )}

          {error && <p className="auth-error">{error}</p>}
          {info  && <p className="auth-message">{info}</p>}

          <button
            id="auth-submit"
            className="button button-primary full-button"
            disabled={loading}
          >
            {loading ? "Please wait…" : stepLabel[step]}
          </button>
        </form>

        {/* Back links */}
        {step !== "email" && (
          <button
            className="auth-back"
            onClick={() => { setStep("email"); setCode(""); setError(""); setInfo(""); }}
          >
            ← Use a different email
          </button>
        )}

        {step === "email" && (
          <p style={{ marginTop: "20px", fontSize: "0.85rem", opacity: 0.6, textAlign: "center" }}>
            No password needed. We email you a code each time.
          </p>
        )}
      </div>
    </main>
  );
}

// Wrap in Suspense because useSearchParams() requires it in Next.js 15
export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
