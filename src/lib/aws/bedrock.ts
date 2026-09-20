import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const MODEL_ID =
  process.env.app_BEDROCK_MODEL_ID ||
  process.env.BEDROCK_MODEL_ID ||
  "amazon.nova-lite-v1:0";

function hasExplicitCredentials() {
  return Boolean(
    (process.env.app_aWs_ACCESS_KEY_ID || process.env.aWs_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) &&
    (process.env.app_aWs_SECRET_ACCESS_KEY || process.env.aWs_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY),
  );
}

export function isBedrockConfigured() {
  return Boolean(
    (process.env.app_aWs_REGION || process.env.aWs_REGION || process.env.AWS_REGION) &&
    (process.env.app_BEDROCK_MODEL_ID || process.env.BEDROCK_MODEL_ID) &&
    (hasExplicitCredentials() ||
      process.env.app_aWs_EXECUTION_ENV ||
      process.env.aWs_EXECUTION_ENV ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.app_aWs_LAMBDA_FUNCTION_NAME ||
      process.env.aWs_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.app_aWs_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.aWs_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.app_aWs_CONTAINER_CREDENTIALS_FULL_URI ||
      process.env.aWs_CONTAINER_CREDENTIALS_FULL_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI),
  );
}

function getClient() {
  if (!isBedrockConfigured()) return null;

  const region =
    process.env.app_aWs_REGION ||
    process.env.aWs_REGION ||
    process.env.AWS_REGION;

  const accessKeyId =
    process.env.app_aWs_ACCESS_KEY_ID ||
    process.env.aWs_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID;

  const secretAccessKey =
    process.env.app_aWs_SECRET_ACCESS_KEY ||
    process.env.aWs_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY;

  return new BedrockRuntimeClient({
    region,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

export async function invokeBedrockText(
  systemPrompt: string,
  userPrompt: string,
  opts?: {
    temperature?: number;
    maxTokens?: number;
  },
): Promise<string> {
  const client = getClient();

  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[bedrock] AWS Bedrock is not configured. Required environment variables (app_aWs_REGION, app_BEDROCK_MODEL_ID, and AWS credentials) are missing in production.",
      );
    }
    console.warn(
      "[bedrock] AWS Bedrock is not configured. Falling back to local placeholder for prompt:",
      userPrompt.slice(0, 80),
    );
    return `[local] ${userPrompt.slice(0, 160)}`;
  }

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: systemPrompt }],
        messages: [
          {
            role: "user",
            content: [{ text: userPrompt }],
          },
        ],
        inferenceConfig: {
          temperature: opts?.temperature ?? 0.4,
          maxTokens: opts?.maxTokens ?? 700,
        },
      }),
    );

    return (
      response.output?.message?.content
        ?.map((part) => part.text ?? "")
        .join("") ?? ""
    );
  } catch (error) {
    console.error("[bedrock] invocation failed:", error);
    throw error;
  }
}
