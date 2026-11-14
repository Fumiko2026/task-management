#!/bin/bash
# Kokuban を、EC2(Terraform で作ったもの)にデプロイする。手元の Mac で実行する。
#
#   使い方:   cd <プロジェクトの直下> && export AWS_PROFILE=kokuban && ./deploy/deploy.sh [--seed]
#   --seed    確認用のテストデータ(デモ利用者)を DB に入れる(最初の 1 回だけ)
#
# 前提: aws login ずみ。infra/ で terraform apply ずみ(EC2 と RDS がある)。Java 21、Node が入っている。
# やること: jar と画面をビルド → 一時的な S3 バケット(CLI で作り、終わったら消す)に置く
#           → 署名つき URL(1 時間だけ有効)を EC2 に渡して、SSM で remote-install.sh を実行する。
# SSH も、サーバーを外へ公開する操作もしない。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-ap-northeast-1}"
SEED=no
[ "${1:-}" = "--seed" ] && SEED=yes

command -v aws >/dev/null || { echo "aws が見つかりません"; exit 1; }
[ -n "${AWS_PROFILE:-}" ] || { echo "AWS_PROFILE を設定してください(例: export AWS_PROFILE=kokuban)"; exit 1; }
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" \
  || { echo "AWS にログインしていません。aws login --profile $AWS_PROFILE を実行してください。"; exit 1; }

echo "== 1. Terraform の出力から、接続先を読む"
cd "$ROOT/infra"
INSTANCE_ID="$(terraform output -raw instance_id)"
DB_HOST="$(terraform output -raw db_address)"
DB_SECRET_ARN="$(terraform output -raw db_secret_arn)"
PUBLIC_IP="$(terraform output -raw public_ip)"
echo "instance=$INSTANCE_ID / db=<RDS> / public_ip=$PUBLIC_IP"

echo "== 2. ビルド(バックエンドの jar と、画面)"
cd "$ROOT/backend" && ./mvnw -q -DskipTests package
JAR="$(ls "$ROOT"/backend/target/*.jar | grep -v original | head -n 1)"
cd "$ROOT/frontend"
[ -d node_modules ] || npm ci
npm run build >/dev/null
WORK="$(mktemp -d)"
# macOS の拡張属性(xattr)を、tar に入れない(EC2 側で警告が出るため)
COPYFILE_DISABLE=1 tar -czf "$WORK/dist.tgz" -C "$ROOT/frontend/dist" .
cp "$JAR" "$WORK/app.jar"
cp "$ROOT/deploy/remote-install.sh" "$WORK/remote-install.sh"
cp "$ROOT/backend/src/main/resources/db/seed.sql" "$WORK/seed.sql"
echo "jar: $(du -h "$WORK/app.jar" | cut -f1) / 画面: $(du -h "$WORK/dist.tgz" | cut -f1)"

BUCKET="kokuban-deploy-${ACCOUNT_ID}-$(date +%Y%m%d%H%M%S)"
cleanup() {
  echo "== 後片づけ: 一時的な S3 バケットを消す"
  aws s3 rb "s3://$BUCKET" --force --region "$REGION" >/dev/null 2>&1 && echo "バケットを消しました" || echo "バケットを消せませんでした(手で消してください: $BUCKET)"
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "== 3. 一時的な S3 バケット(非公開)に置く"
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
for f in app.jar dist.tgz remote-install.sh seed.sql; do
  aws s3 cp "$WORK/$f" "s3://$BUCKET/$f" --region "$REGION" --only-show-errors
done
presign() { aws s3 presign "s3://$BUCKET/$1" --region "$REGION" --expires-in 3600; }

echo "== 4. EC2 が SSM に登録されているか確認"
STATUS="$(aws ssm describe-instance-information --region "$REGION" \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)"
[ "$STATUS" = "Online" ] || { echo "EC2 が SSM に登録されていません(状態: ${STATUS:-なし})。起動から数分待って、もう一度実行してください。"; exit 1; }

echo "== 5. EC2 で remote-install.sh を実行(SSM)"
CMD="export JAR_URL='$(presign app.jar)' DIST_URL='$(presign dist.tgz)' DB_HOST='$DB_HOST' DB_SECRET_ARN='$DB_SECRET_ARN'"
[ "$SEED" = yes ] && CMD="$CMD SEED_URL='$(presign seed.sql)'"
CMD="$CMD; curl -fsSL '$(presign remote-install.sh)' -o /tmp/remote-install.sh && bash /tmp/remote-install.sh"
PARAMS="$(jq -n --arg c "$CMD" '{commands:[$c]}')"
CID="$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript \
  --parameters "$PARAMS" --timeout-seconds 1200 --query Command.CommandId --output text)"
echo "SSM コマンド ID: $CID"
STATE=""
for _ in $(seq 1 240); do
  STATE="$(aws ssm get-command-invocation --region "$REGION" --command-id "$CID" --instance-id "$INSTANCE_ID" --query Status --output text 2>/dev/null || true)"
  case "$STATE" in Success|Failed|TimedOut|Cancelled) break ;; esac
  sleep 5
done
echo "--- EC2 の出力 ---"
aws ssm get-command-invocation --region "$REGION" --command-id "$CID" --instance-id "$INSTANCE_ID" \
  --query '{o:StandardOutputContent,e:StandardErrorContent}' --output json \
  | jq -r '.o, (if .e != "" then "--- エラー出力 ---\n" + .e else empty end)' | sed -E 's#https://[^ ]*#<署名つきURL>#g'
echo "--- 結果: $STATE ---"
[ "$STATE" = "Success" ] || exit 1
echo
echo "ブラウザで開く: http://${PUBLIC_IP}/   (許可した IP の PC からだけ開けます)"
