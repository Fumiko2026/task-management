#!/bin/bash
# Terraform の state を置く S3 バケットを作る。
# terraform destroy では消えないように、Terraform の外で作る。
set -euo pipefail

PROFILE="${AWS_PROFILE:-kokuban}"
REGION="ap-northeast-1"

ACCOUNT_ID="$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)"
BUCKET="kokuban-tfstate-${ACCOUNT_ID}"

echo "profile=${PROFILE} account=${ACCOUNT_ID} bucket=${BUCKET}"

if aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" 2>/dev/null; then
  echo "バケットは、すでにあります。"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --profile "$PROFILE" \
    --create-bucket-configuration LocationConstraint="$REGION"
  echo "バケットを作りました。"
fi

aws s3api put-bucket-versioning --bucket "$BUCKET" --profile "$PROFILE" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" --profile "$PROFILE" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$BUCKET" --profile "$PROFILE" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "準備ができました。次: cd infra && terraform init"
