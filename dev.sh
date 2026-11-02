#!/usr/bin/env bash
# 開発用の起動スクリプト。.env からパスワードを自動で読むので、export は不要。
#
#   ./dev.sh run    アプリを起動(テストデータは入れない)
#   ./dev.sh seed   テストデータ(backend/src/main/resources/db/seed.sql)を入れて、アプリを起動
#   ./dev.sh test   自動テストを実行
#
# どのフォルダから実行しても動く。止めるときは、ターミナルで control + c。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/.env"

fail() {
	echo "エラー: $1" >&2
	exit 1
}

[ -f "$ENV_FILE" ] || fail ".env がありません。プロジェクトの直下で  cp .env.example .env  を実行してください。"

# .env から値を読む(source は使わない。パスワードに記号があっても壊れないようにするため)
read_env() {
	grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}

DB_PASSWORD="$(read_env POSTGRES_PASSWORD)"
[ -n "$DB_PASSWORD" ] || fail ".env に POSTGRES_PASSWORD がありません。"
export DB_PASSWORD

# アプリの DB のユーザー名と DB 名は、.env に書いてあれば、それを使う(無ければアプリの初期値)
if [ -n "$(read_env POSTGRES_USER)" ]; then export DB_USER="$(read_env POSTGRES_USER)"; fi
if [ -n "$(read_env POSTGRES_DB)" ]; then
	export DB_URL="jdbc:postgresql://localhost:5432/$(read_env POSTGRES_DB)"
fi

# DB が動いているか確かめる(動いていなければ、やり方を案内して終わる)
command -v docker >/dev/null 2>&1 || fail "docker が見つかりません。Docker Desktop を入れてください。"
docker info >/dev/null 2>&1 || fail "Docker が動いていません。Docker Desktop を起動して、準備ができるまで待ってから、もう一度実行してください。"
STATUS="$(docker inspect -f '{{.State.Health.Status}}' task-management-db 2>/dev/null || true)"
if [ "$STATUS" != "healthy" ]; then
	fail "DB が起動していません(状態: ${STATUS:-なし})。  cd $ROOT && docker compose up -d  を実行し、docker compose ps で healthy と出てから、もう一度実行してください。"
fi

cd "$ROOT/backend"

case "${1:-}" in
	run)
		exec ./mvnw spring-boot:run
		;;
	seed)
		exec ./mvnw spring-boot:run -Dspring-boot.run.profiles=seed
		;;
	test)
		exec ./mvnw test
		;;
	*)
		echo "使い方:  ./dev.sh run | seed | test"
		echo "  run   アプリを起動(テストデータは入れない)"
		echo "  seed  テストデータを入れて、アプリを起動"
		echo "  test  自動テストを実行"
		exit 1
		;;
esac
