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
    { name: "AWS_REGION", keys: ["AWS_REGION", "app_aWs_REGION", "aWs_REGION"] },
    { name: "AWS_S3_BUCKET", keys: ["AWS_S3_BUCKET", "app_aWs_S3_BUCKET", "aWs_S3_BUCKET"] },
    { name: "AWS_DYNAMODB_TABLE", keys: ["AWS_DYNAMODB_TABLE", "app_aWs_DYNAMODB_TABLE", "aWs_DYNAMODB_TABLE"] },
    { name: "AWS_AUTH_TABLE", keys: ["AWS_AUTH_TABLE", "app_aWs_AUTH_TABLE", "aWs_AUTH_TABLE"] },
    { name: "AWS_STUDENT_RECORD_TABLE", keys: ["AWS_STUDENT_RECORD_TABLE", "app_aWs_STUDENT_RECORD_TABLE", "aWs_STUDENT_RECORD_TABLE"] },
    { name: "BEDROCK_MODEL_ID", keys: ["BEDROCK_MODEL_ID", "app_BEDROCK_MODEL_ID"] },
    { name: "RESEND_API_KEY", keys: ["RESEND_API_KEY", "app_RESEND_API_KEY"] },
  ];

  for (const item of requiredVars) {
    const isSet = item.keys.some((k) => Boolean(process.env[k]));
    if (!isSet) {
      missing.push(item.name);
    }
  }

  if (
    !process.env.AUTH_SECRET &&
    !process.env.JWT_SECRET &&
    !process.env.app_AUTH_SECRET &&
    !process.env.app_JWT_SECRET
  ) {
    missing.push("AUTH_SECRET (or JWT_SECRET)");
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
