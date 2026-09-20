#!/usr/bin/env bash
# =============================================================================
# scripts/setup-aws.sh
#
# Provisions all AWS infrastructure required by the Bodh app:
#   • S3 bucket         (article + mindmap cache)
#   • DynamoDB table    (student profiles, roadmaps)
#   • DynamoDB table    (auth codes with TTL)
#   • Bedrock model access  (informational — must be enabled in console)
#
# Usage:
#   chmod +x scripts/setup-aws.sh
#   ./scripts/setup-aws.sh
#
# Environment variables (override defaults):
#   AWS_REGION            default: ap-south-1
#   S3_BUCKET             default: bodh-content-prod
#   DYNAMO_STUDENT_TABLE  default: bodh-students
#   DYNAMO_AUTH_TABLE     default: bodh-auth
# =============================================================================

set -euo pipefail

# ── Defaults (override with env vars) ─────────────────────────────────────────

REGION="${AWS_REGION:-${app_aWs_REGION:-ap-southeast-2}}"
S3_BUCKET="${AWS_S3_BUCKET:-${app_aWs_S3_BUCKET:-regional-dsa-learning}}"
DYNAMO_STUDENT_TABLE="${AWS_DYNAMODB_TABLE:-${app_aWs_DYNAMODB_TABLE:-bodh-students}}"
DYNAMO_AUTH_TABLE="${AWS_AUTH_TABLE:-${app_aWs_AUTH_TABLE:-bodh-auth}}"

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { echo -e "\033[1;34m▶  $*\033[0m"; }
ok()   { echo -e "\033[1;32m✅  $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠️   $*\033[0m"; }
err()  { echo -e "\033[1;31m❌  $*\033[0m"; }

require_cmd() {
  command -v "$1" &>/dev/null || { err "Command not found: $1. Install it first."; exit 1; }
}

# ── Pre-flight checks ─────────────────────────────────────────────────────────

require_cmd aws

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║         Bodh — AWS Infrastructure Setup          ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Region         : ${REGION}"                     ║ 
echo "║  S3 Bucket      : ${S3_BUCKET}"                  ║
echo "║  Student Table  : ${DYNAMO_STUDENT_TABLE}"       ║
echo "║  Auth Table     : ${DYNAMO_AUTH_TABLE}"          ║
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Verify AWS credentials
if ! aws sts get-caller-identity --region "$REGION" &>/dev/null; then
  err "AWS credentials are not configured. Run 'aws configure' or set AWS_PROFILE."
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
ok "Authenticated as account: ${ACCOUNT_ID}"
echo ""

# =============================================================================
# 1. S3 Bucket
# =============================================================================

log "Creating S3 bucket: ${S3_BUCKET}  (${REGION})"

BUCKET_EXISTS=$(aws s3api head-bucket --bucket "$S3_BUCKET" --region "$REGION" 2>&1 || true)

if echo "$BUCKET_EXISTS" | grep -q "200\|NoSuchBucket" || [ -z "$BUCKET_EXISTS" ]; then
  # Bucket does not exist — create it
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket \
      --bucket "$S3_BUCKET" \
      --region "$REGION"
  else
    aws s3api create-bucket \
      --bucket "$S3_BUCKET" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  ok "Bucket created: s3://${S3_BUCKET}"
else
  ok "Bucket already exists: s3://${S3_BUCKET}"
fi

# Block all public access
log "Blocking public access on bucket..."
aws s3api put-public-access-block \
  --bucket "$S3_BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --region "$REGION"
ok "Public access blocked."

# Enable versioning (optional but recommended)
log "Enabling versioning..."
aws s3api put-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --versioning-configuration Status=Enabled \
  --region "$REGION"
ok "Versioning enabled."

# CORS configuration (Next.js API routes call S3 server-side, so CORS is
# optional — included for flexibility if you ever do direct browser uploads)
log "Setting CORS policy..."
aws s3api put-bucket-cors \
  --bucket "$S3_BUCKET" \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }]
  }' \
  --region "$REGION"
ok "CORS configured."

# Lifecycle rule: delete old non-current versions after 30 days
log "Adding lifecycle rule (expire old versions after 30 days)..."
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET" \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-old-versions",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "NoncurrentVersionExpiration": {"NoncurrentDays": 30}
    }]
  }' \
  --region "$REGION"
ok "Lifecycle rule set."
echo ""

# =============================================================================
# 2. DynamoDB — Student Table (student profiles + roadmaps)
# =============================================================================

log "Creating DynamoDB table: ${DYNAMO_STUDENT_TABLE}"

if aws dynamodb describe-table --table-name "$DYNAMO_STUDENT_TABLE" --region "$REGION" &>/dev/null; then
  ok "Table already exists: ${DYNAMO_STUDENT_TABLE}"
else
  aws dynamodb create-table \
    --table-name "$DYNAMO_STUDENT_TABLE" \
    --attribute-definitions AttributeName=pk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"

  log "Waiting for table to become active..."
  aws dynamodb wait table-exists --table-name "$DYNAMO_STUDENT_TABLE" --region "$REGION"
  ok "Table created: ${DYNAMO_STUDENT_TABLE}"
fi
echo ""

# =============================================================================
# 3. DynamoDB — Auth Table (magic-link codes with TTL)
# =============================================================================

log "Creating DynamoDB table: ${DYNAMO_AUTH_TABLE}"

if aws dynamodb describe-table --table-name "$DYNAMO_AUTH_TABLE" --region "$REGION" &>/dev/null; then
  ok "Table already exists: ${DYNAMO_AUTH_TABLE}"
else
  aws dynamodb create-table \
    --table-name "$DYNAMO_AUTH_TABLE" \
    --attribute-definitions AttributeName=pk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"

  log "Waiting for table to become active..."
  aws dynamodb wait table-exists --table-name "$DYNAMO_AUTH_TABLE" --region "$REGION"

  log "Enabling TTL on attribute 'ttl'..."
  aws dynamodb update-time-to-live \
    --table-name "$DYNAMO_AUTH_TABLE" \
    --time-to-live-specification "Enabled=true,AttributeName=ttl" \
    --region "$REGION"
  ok "Table created with TTL: ${DYNAMO_AUTH_TABLE}"
fi
echo ""

# =============================================================================
# 4. Bedrock Model Access (informational)
# =============================================================================

log "Checking Bedrock model access for amazon.nova-lite-v1:0..."

BEDROCK_STATUS=$(aws bedrock get-foundation-model \
  --model-identifier "amazon.nova-lite-v1:0" \
  --region "$REGION" \
  --query 'modelDetails.modelLifecycle.status' \
  --output text 2>/dev/null || echo "UNKNOWN")

if [ "$BEDROCK_STATUS" = "ACTIVE" ]; then
  ok "Bedrock model amazon.nova-lite-v1:0 is ACTIVE in ${REGION}."
else
  warn "Bedrock model status: ${BEDROCK_STATUS}"
  warn "Enable model access at:"
  warn "  https://console.aws.amazon.com/bedrock/home?region=${REGION}#/modelaccess"
fi
echo ""

# =============================================================================
# 5. Print .env.local template
# =============================================================================

echo "╔══════════════════════════════════════════════════╗"
echo "║        Add these to your .env.local file         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║"                                                 ║
echo "║  AWS_REGION=${REGION}"                           ║
echo "║  AWS_S3_BUCKET=${S3_BUCKET}"                     ║
echo "║  AWS_DYNAMODB_TABLE=${DYNAMO_STUDENT_TABLE}"     ║
echo "║  AWS_AUTH_TABLE=${DYNAMO_AUTH_TABLE}"            ║
echo "║  BEDROCK_MODEL_ID=amazon.nova-lite-v1:0"         ║
echo "║"                                                 ║
echo "║  # Auth secret — generate with:"                 ║
echo "║  #   openssl rand -base64 32"                    ║
echo "║  AUTH_SECRET=<your-secret-here>"                 ║
echo "║"                                                 ║
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Next step — upload seed content to S3:"
echo "  npx tsx scripts/seed-s3.ts"
echo ""
