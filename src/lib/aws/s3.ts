import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { Article, Mindmap } from "@/types/content";

const BUCKET =
  process.env.app_aWs_S3_BUCKET ||
  process.env.aWs_S3_BUCKET ||
  process.env.AWS_S3_BUCKET ||
  "";

const REGION =
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

const client = REGION
  ? new S3Client({
      region: REGION,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    })
  : null;

async function s3Get<T>(key: string): Promise<T | null> {
  if (!client || !BUCKET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `[s3] S3 client or AWS_S3_BUCKET is not configured. Cannot get key: ${key}`,
      );
    }
    return null;
  }
  try {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const res = await client.send(cmd);
    const body = await res.Body?.transformToString();
    return body ? (JSON.parse(body) as T) : null;
  } catch (error: unknown) {
    const s3Error = error as { name?: string };
    if (s3Error?.name === "NoSuchKey" || s3Error?.name === "NotFound") {
      return null;
    }
    console.error(`[s3] Error getting key ${key}:`, error);
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
    return null;
  }
}

async function s3Put(key: string, data: unknown): Promise<void> {
  if (!client || !BUCKET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `[s3] S3 client or AWS_S3_BUCKET is not configured. Cannot put key: ${key}`,
      );
    }
    return;
  }
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: JSON.stringify(data),
        ContentType: "application/json",
      }),
    );
  } catch (error) {
    console.error(`[s3] Error putting key ${key}:`, error);
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
  }
}

// ── Articles ──────────────────────────────────────────────────────────────────

export async function getArticle(
  topicSlug: string,
  language: "en" | "hi",
): Promise<Article | null> {
  return s3Get<Article>(`articles/${topicSlug}/${language}.json`);
}

export async function putArticle(article: Article): Promise<void> {
  await s3Put(
    `articles/${article.topicSlug}/${article.language}.json`,
    article,
  );
}

// ── Mindmaps ──────────────────────────────────────────────────────────────────

export async function getMindmap(topicSlug: string): Promise<Mindmap | null> {
  return s3Get<Mindmap>(`mindmaps/${topicSlug}.json`);
}

export async function putMindmap(mindmap: Mindmap): Promise<void> {
  await s3Put(`mindmaps/${mindmap.topicSlug}.json`, mindmap);
}
