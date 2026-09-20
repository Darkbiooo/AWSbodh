/**
 * Environment configuration validator.
 * Validates required configuration when running in production to ensure
 * issues are caught immediately at startup rather than during user requests.
 */

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  // Do not fail during next build if CI builds before runtime secrets are injected
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const missing: string[] = [];

  const requiredVars = [
    { name: "AWS_REGION", keys: ["app_aWs_REGION", "aWs_REGION", "AWS_REGION"] },
    { name: "AWS_S3_BUCKET", keys: ["app_aWs_S3_BUCKET", "aWs_S3_BUCKET", "AWS_S3_BUCKET"] },
    { name: "AWS_DYNAMODB_TABLE", keys: ["app_aWs_DYNAMODB_TABLE", "aWs_DYNAMODB_TABLE", "AWS_DYNAMODB_TABLE"] },
    { name: "AWS_AUTH_TABLE", keys: ["app_aWs_AUTH_TABLE", "aWs_AUTH_TABLE", "AWS_AUTH_TABLE"] },
    { name: "AWS_STUDENT_RECORD_TABLE", keys: ["app_aWs_STUDENT_RECORD_TABLE", "aWs_STUDENT_RECORD_TABLE", "AWS_STUDENT_RECORD_TABLE"] },
    { name: "BEDROCK_MODEL_ID", keys: ["app_BEDROCK_MODEL_ID", "BEDROCK_MODEL_ID"] },
    { name: "RESEND_API_KEY", keys: ["app_RESEND_API_KEY", "RESEND_API_KEY"] },
  ];

  for (const item of requiredVars) {
    const isSet = item.keys.some((k) => Boolean(process.env[k]));
    if (!isSet) {
      missing.push(`${item.name} (or ${item.keys[0]})`);
    }
  }

  if (
    !process.env.app_AUTH_SECRET &&
    !process.env.app_JWT_SECRET &&
    !process.env.AUTH_SECRET &&
    !process.env.JWT_SECRET
  ) {
    missing.push("AUTH_SECRET or JWT_SECRET (or app_AUTH_SECRET)");
  }

  if (missing.length > 0) {
    const message = [
      "============================================================",
      "⚠️ WARNING: Missing recommended environment variables",
      "============================================================",
      ...missing.map((key) => `  - ${key}`),
      "============================================================",
      "Please set these in the AWS Amplify Console under App settings > Environment variables.",
      "============================================================",
    ].join("\n");

    console.warn(message);
  }
}
