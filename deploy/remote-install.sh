#!/bin/bash
# EC2 の中で動かすスクリプト(root)。deploy.sh が、SSM 経由で実行する。
# Java 21(Amazon Corretto)を入れ、Spring Boot の jar を systemd で動かし、nginx で画面と /api を配る。
#
# 受け取る環境変数(deploy.sh が渡す):
#   JAR_URL       バックエンドの jar(署名つき URL)
#   DIST_URL      画面(frontend/dist を tar.gz にしたもの)(署名つき URL)
#   DB_HOST       RDS のホスト名
#   DB_SECRET_ARN RDS のパスワードが入っている Secrets Manager のシークレット
#   SEED_URL      (省略可)テストデータ seed.sql(署名つき URL)。あるときだけ、DB に入れる
set -euo pipefail

: "${JAR_URL:?}" "${DIST_URL:?}" "${DB_HOST:?}" "${DB_SECRET_ARN:?}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-northeast-1}"

echo "== 1. 初期設定(user_data)の完了を待つ"
timeout 300 cloud-init status --wait >/dev/null 2>&1 || true

echo "== 2. Java 21(Amazon Corretto)と psql を入れる"
dnf install -y java-21-amazon-corretto-headless postgresql17 >/dev/null
java -version 2>&1 | head -1
psql --version

echo "== 3. アプリ用のユーザーと置き場所"
id kokuban >/dev/null 2>&1 || useradd --system --home-dir /opt/kokuban --shell /sbin/nologin kokuban
mkdir -p /opt/kokuban /etc/kokuban
chown kokuban:kokuban /opt/kokuban

echo "== 4. jar と画面をダウンロード"
curl -fsSL "$JAR_URL" -o /opt/kokuban/app.jar.new
mv /opt/kokuban/app.jar.new /opt/kokuban/app.jar
chown kokuban:kokuban /opt/kokuban/app.jar
chmod 640 /opt/kokuban/app.jar
rm -rf /tmp/kokuban-dist && mkdir -p /tmp/kokuban-dist
curl -fsSL "$DIST_URL" -o /tmp/kokuban-dist.tgz
tar -xzf /tmp/kokuban-dist.tgz -C /tmp/kokuban-dist
ls /tmp/kokuban-dist | head -5

echo "== 5. DB のパスワードを取り出して、root だけが読めるファイルに書く(値は画面に出さない)"
PW="$(aws secretsmanager get-secret-value --secret-id "$DB_SECRET_ARN" --query SecretString --output text \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["password"])')"
[ -n "$PW" ]
umask 077
cat > /etc/kokuban/kokuban.env <<EOF
DB_URL=jdbc:postgresql://${DB_HOST}:5432/kokuban?sslmode=require
DB_USER=kokuban
DB_PASSWORD=${PW}
TZ=Asia/Tokyo
EOF
chmod 600 /etc/kokuban/kokuban.env
chown root:root /etc/kokuban/kokuban.env
umask 022

echo "== 6. systemd のサービス(kokuban)"
cat > /etc/systemd/system/kokuban.service <<'EOF'
[Unit]
Description=Kokuban backend (Spring Boot)
After=network-online.target
Wants=network-online.target

[Service]
User=kokuban
Group=kokuban
EnvironmentFile=/etc/kokuban/kokuban.env
WorkingDirectory=/opt/kokuban
# t4g.small(メモリ 2GB)に合わせて、Java のメモリを 512MB までにする
ExecStart=/usr/bin/java -Xmx512m -jar /opt/kokuban/app.jar
Restart=on-failure
RestartSec=5
# 余計な権限を持たせない
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable kokuban >/dev/null 2>&1
systemctl restart kokuban

echo "== 7. バックエンドの起動を待つ(最大 3 分)"
UP=no
for i in $(seq 1 36); do
  if curl -fsS -m 3 http://127.0.0.1:8080/actuator/health 2>/dev/null | grep -q '"status":"UP"'; then UP=yes; break; fi
  sleep 5
done
echo "health(/actuator/health): $(curl -s -m 3 http://127.0.0.1:8080/actuator/health || echo 応答なし)"
if [ "$UP" != yes ]; then
  echo "!! 起動に失敗しました。ログの最後:"; journalctl -u kokuban --no-pager -n 40 | sed -E 's/(password|PASSWORD)=[^ ]*/\1=***/g'
  exit 1
fi

if [ -n "${SEED_URL:-}" ]; then
  echo "== 8. テストデータ(seed.sql)を DB に入れる(デモ利用者のデータだけを作り直す)"
  curl -fsSL "$SEED_URL" -o /tmp/seed.sql
  PGPASSWORD="$PW" PGSSLMODE=require psql -h "$DB_HOST" -U kokuban -d kokuban -v ON_ERROR_STOP=1 -q -f /tmp/seed.sql
  rm -f /tmp/seed.sql
fi

echo "== 9. nginx: 画面を配り、/api をバックエンドへ中継する"
grep -q "default.d" /etc/nginx/nginx.conf || { echo "!! nginx.conf に default.d の取り込みがありません"; exit 1; }
cat > /etc/nginx/conf.d/kokuban-global.conf <<'EOF'
server_tokens off;
EOF
cat > /etc/nginx/default.d/kokuban.conf <<'EOF'
# /api は、同じサーバーの Spring Boot(127.0.0.1:8080)へ中継する。
# /actuator は、外へは出さない(サーバーの中からだけ見る)。
location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 30s;
}
location /actuator/ {
    return 404;
}
EOF
rm -rf /usr/share/nginx/html/*
cp -r /tmp/kokuban-dist/. /usr/share/nginx/html/
chmod -R a+rX /usr/share/nginx/html
nginx -t 2>&1 | tail -2
systemctl reload nginx

echo "== 10. サーバーの中から、画面と API を確認"
# nginx の設定の読み込みは、少し遅れることがある。API が 200 になるまで、最大 30 秒待つ。
API=000
for i in $(seq 1 15); do
  API="$(curl -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1/api/board || true)"
  [ "$API" = 200 ] && break
  sleep 2
done
echo -n "画面(/): "; curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
echo "API(/api/board): $API"
echo -n "外向きの /actuator/health(404 が正しい): "; curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1/actuator/health
echo -n "サービスの状態: "; systemctl is-active kokuban
echo "== 完了"
