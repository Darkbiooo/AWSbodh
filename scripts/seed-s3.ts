/**
 * scripts/seed-s3.ts
 *
 * Uploads all seed content (articles + mindmaps) to the configured S3 bucket.
 *
 * Usage:
 *   npx tsx scripts/seed-s3.ts
 *
 * Required env vars (set in .env.local or shell):
 *   AWS_REGION              – e.g. ap-southeast-2
 *   AWS_S3_BUCKET           – e.g. regional-dsa-learning
 *
 * Optional:
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  (falls back to instance role / SSO)
 *   SEED_DRY_RUN=true       – print what would be uploaded without touching S3
 */

import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type {
  Article,
  Mindmap,
  MindmapNode,
  MindmapEdge,
} from "../src/types/content";

async function loadEnvFile(filePath: string) {
  try {
    await access(filePath);
  } catch {
    return;
  }

  const content = await readFile(filePath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, valuePart] = match;
    const value = valuePart.trim();
    if (!value || value === '""' || value === "''") continue;

    const cleaned = value
      .replace(/\s+#.*$/, "")
      .replace(/^['"]|['"]$/g, "")
      .trim();

    if (!cleaned) continue;
    if ((process.env[key] ?? "") === "") {
      process.env[key] = cleaned;
    }
  }
}

async function loadProjectEnv() {
  await loadEnvFile(join(process.cwd(), ".env"));
  await loadEnvFile(join(process.cwd(), ".env.local"));
}

// ── Config ────────────────────────────────────────────────────────────────────

let REGION = "";
let BUCKET = "";
let DRY_RUN = false;

async function initializeConfig() {
  await loadProjectEnv();
  REGION =
    process.env.AWS_REGION?.trim() ||
    process.env.app_aWs_REGION?.trim() ||
    process.env.aWs_REGION?.trim() ||
    "";
  BUCKET =
    process.env.AWS_S3_BUCKET?.trim() ||
    process.env.app_aWs_S3_BUCKET?.trim() ||
    process.env.aWs_S3_BUCKET?.trim() ||
    "";
  DRY_RUN = process.env.SEED_DRY_RUN?.trim() === "true";

  if (!REGION || !BUCKET) {
    console.error(
      "❌  AWS_REGION and AWS_S3_BUCKET must be set.\n" +
        "    Example:\n" +
        "      AWS_REGION=ap-southeast-2 AWS_S3_BUCKET=regional-dsa-learning npx tsx scripts/seed-s3.ts",
    );
    process.exit(1);
  }
}

// Client is created lazily so SEED_DRY_RUN=true never validates the region
let _client: S3Client | null = null;
function getClient(): S3Client {
  if (!_client) {
    const accessKeyId =
      process.env.AWS_ACCESS_KEY_ID?.trim() ||
      process.env.app_aWs_ACCESS_KEY_ID?.trim();
    const secretAccessKey =
      process.env.AWS_SECRET_ACCESS_KEY?.trim() ||
      process.env.app_aWs_SECRET_ACCESS_KEY?.trim();

    _client = new S3Client({
      region: REGION,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }
  return _client;
}
const SEED_ROOT = join(process.cwd(), "content", "seed");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function s3Put(key: string, body: unknown): Promise<void> {
  const json = JSON.stringify(body, null, 2);
  if (DRY_RUN) {
    console.log(
      `  [dry-run] PUT s3://${BUCKET}/${key}  (${json.length} bytes)`,
    );
    return;
  }
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: json,
      ContentType: "application/json",
    }),
  );
}

async function s3Exists(key: string): Promise<boolean> {
  if (DRY_RUN) return false; // always re-upload in dry-run so output is visible
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ── Mindmap builder ───────────────────────────────────────────────────────────
// Generates a static mindmap from the article seed so the script works
// without a Bedrock call. The live app will overwrite this with an AI-generated
// version the first time a user visits the mindmap page.

function buildMindmap(article: Article): Mindmap {
  const rootId = "root";
  const nodes: MindmapNode[] = [{ id: rootId, label: article.title, level: 0 }];
  const edges: MindmapEdge[] = [];

  article.sections.forEach((section, i) => {
    const branchId = `branch-${i}`;
    nodes.push({ id: branchId, label: section.heading, level: 1 });
    edges.push({ from: rootId, to: branchId });

    // Extract two meaningful phrases from the section body as leaf nodes
    const sentences = section.body
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10)
      .slice(0, 2);

    sentences.forEach((phrase, j) => {
      const leafId = `leaf-${i}-${j}`;
      const label =
        phrase.length > 40 ? phrase.slice(0, 37).trimEnd() + "…" : phrase;
      nodes.push({ id: leafId, label, level: 2 });
      edges.push({ from: branchId, to: leafId });
    });
  });

  // Add "Try This" as a branch
  nodes.push({ id: "try", label: "Try This", level: 1 });
  edges.push({ from: rootId, to: "try" });

  return { topicSlug: article.topicSlug, nodes, edges };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializeConfig();

  console.log(`\n📦  Bodh S3 Seeder${DRY_RUN ? "  [DRY RUN]" : ""}`);
  console.log(`    Bucket : s3://${BUCKET}`);
  console.log(`    Region : ${REGION}`);
  console.log(`    Source : ${SEED_ROOT}\n`);

  // Enumerate topic folders
  const topicEntries = await readdir(SEED_ROOT, { withFileTypes: true });
  const topicFolders = topicEntries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (topicFolders.length === 0) {
    console.warn("⚠️  No topic folders found in content/seed — nothing to do.");
    return;
  }

  let totalUploads = 0;
  let totalSkips = 0;
  const errors: string[] = [];

  for (const topic of topicFolders) {
    console.log(`── ${topic}`);
    const topicDir = join(SEED_ROOT, topic);
    const files = await readdir(topicDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    // Track whether we've already built + uploaded a mindmap for this topic
    let mindmapDone = false;

    for (const file of jsonFiles) {
      const language = file.replace(".json", "") as "en" | "hi";
      const articleKey = `articles/${topic}/${language}.json`;

      try {
        // ── Article ──────────────────────────────────────────────────────────
        const raw = await readFile(join(topicDir, file), "utf-8");
        const article = JSON.parse(raw) as Article;

        const articleExists = await s3Exists(articleKey);
        if (articleExists) {
          console.log(`  ⏭  ${articleKey}  (already exists)`);
          totalSkips++;
        } else {
          await s3Put(articleKey, article);
          console.log(`  ✅  ${articleKey}`);
          totalUploads++;
        }

        // ── Mindmap (English article only, language-agnostic mindmap) ────────
        if (language === "en" && !mindmapDone) {
          const mindmapKey = `mindmaps/${topic}.json`;
          const mindmapExists = await s3Exists(mindmapKey);
          if (mindmapExists) {
            console.log(`  ⏭  ${mindmapKey}  (already exists)`);
            totalSkips++;
          } else {
            const mindmap = buildMindmap(article);
            await s3Put(mindmapKey, mindmap);
            console.log(`  ✅  ${mindmapKey}`);
            totalUploads++;
          }
          mindmapDone = true;
        }
      } catch (err) {
        const msg = `  ❌  ${articleKey}: ${String(err)}`;
        console.error(msg);
        errors.push(msg);
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n────────────────────────────────────────");
  console.log(`  Topics  : ${topicFolders.length}`);
  console.log(`  Uploaded: ${totalUploads}`);
  console.log(`  Skipped : ${totalSkips}`);
  if (errors.length) {
    console.error(`  Errors  : ${errors.length}`);
    errors.forEach((e) => console.error(e));
    process.exitCode = 1;
  } else {
    console.log("\n🎉  Done!");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exitCode = 1;
});
