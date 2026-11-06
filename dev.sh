#!/usr/bin/env bash
# 開発用の起動スクリプト。.env からパスワードを自動で読むので、export は不要。
#
#   ./dev.sh run         バックエンドを起動(テストデータは入れない)
#   ./dev.sh seed        テストデータ(backend/src/main/resources/db/seed.sql)を入れて、バックエンドを起動
#   ./dev.sh test        バックエンドの自動テストを実行
#   ./dev.sh front       フロントエンド(React)を起動。ブラウザで http://localhost:5173
#   ./dev.sh front-test  フロントエンドの自動テストを実行
#   ./dev.sh front-phone iPhone など、同じ Wi-Fi の端末から画面を見られる状態で、フロントエンドを起動(試すときだけ)
#   ./dev.sh free-port 8080   そのポートを使っているプロセスを止める(8080 と 5173 だけ)
#
# どのフォルダから実行しても動く。止めるときは、ターミナルで control + c。
# バックエンド(8080)とフロントエンド(5173)は、ポートが他のプロセスに使われていたら、
# そのプロセスを止めてから、標準のポートで起動する(別のポートへは逃げない)。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/.env"

fail() {
	echo "エラー: $1" >&2
	exit 1
}

# ポートの競合を解消する。そのポートを使っているプロセスを止めて、標準のポートで動けるようにする。
# 別のポートへ逃げることはしない。止める対象は、8080(バックエンド)と 5173(フロントエンド)だけ。
free_port() {
	"$ROOT/scripts/free-port.sh" "$1"
}

# フロントエンド(React)の操作。DB やパスワードは要らないので、先に処理する。
front_setup() {
	command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 \
		|| fail "Node.js が入っていません。  brew install node  を実行してから、もう一度実行してください。"
	cd "$ROOT/frontend"
	[ -d node_modules ] || npm install
}
case "${1:-}" in
	front)
		front_setup
		free_port 5173
		echo "ブラウザで http://localhost:5173 を開いてください(止めるときは control + c)。"
		echo "先に、別のターミナルで  ./dev.sh seed  を実行して、バックエンドを動かしておいてください。"
		exec npm run dev
		;;
	front-test)
		front_setup
		exec npm test
		;;
	front-phone)
		# iPhone など、同じ Wi-Fi の別の端末から、画面を見るための起動。試すときだけ使う。
		front_setup
		# パソコンの Wi-Fi の住所(IP アドレス)を調べる。つながっているネットワークの入り口を、先に調べる
		IFACE="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' || true)"
		IP="$(ipconfig getifaddr "${IFACE:-en0}" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
		[ -n "$IP" ] || fail "パソコンの Wi-Fi の住所が見つかりません。Wi-Fi につながっているか、確かめてください。"
		free_port 5173
		echo "=========================================================="
		echo " iPhone など、同じ Wi-Fi の端末から、画面を見られる状態で起動します。"
		echo ""
		echo "   iPhone の Safari で、次の住所を開いてください:"
		echo "     http://$IP:5173"
		echo ""
		echo " 【注意】このアプリには、まだ、ログインがありません。"
		echo "   同じ Wi-Fi につながっている人は、だれでも、中身を見たり変えたりできます。"
		echo "   自宅の Wi-Fi で、試す間だけ使ってください。"
		echo "   お店や学校など、みんなが使う Wi-Fi では、使わないでください。"
		echo "   終わったら control + c で止めて、ふだんの  ./dev.sh front  に戻してください。"
		echo "=========================================================="
		# バックエンドが動いているか(動いていなくても、起動は続ける。画面にだけ、読み込めませんと出る)
		if ! curl -s -m 2 http://127.0.0.1:8080/api/hello 2>/dev/null | grep -q '^ok$'; then
			echo "※ バックエンドが動いていません。別のターミナルで  ./dev.sh seed  を実行してください。"
		fi
		exec npm run dev -- --host
		;;
	free-port)
		free_port "${2:-}"
		exit 0
		;;
esac

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
		free_port 8080
		exec ./mvnw spring-boot:run
		;;
	seed)
		free_port 8080
		exec ./mvnw spring-boot:run -Dspring-boot.run.profiles=seed
		;;
	test)
		# テストは、開発用の DB とは別の、テスト専用の DB につなぐ(開発のデータを消さないため)。
		# テスト用の DB が無ければ、ここで作る(同じ Docker の PostgreSQL の中)。
		TEST_DB="$(read_env POSTGRES_DB)"
		TEST_DB="${TEST_DB:-taskmanagement}_test"
		DB_ADMIN="${DB_USER:-taskuser}"
		if ! docker exec task-management-db psql -U "$DB_ADMIN" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TEST_DB'" | grep -q 1; then
			echo "テスト用の DB($TEST_DB)を作ります。"
			docker exec task-management-db psql -U "$DB_ADMIN" -d postgres -c "CREATE DATABASE \"$TEST_DB\"" >/dev/null \
				|| fail "テスト用の DB を作れませんでした。"
		fi
		exec ./mvnw test "-Dtest.db.url=jdbc:postgresql://localhost:5432/$TEST_DB"
		;;
	*)
		echo "使い方:  ./dev.sh run | seed | test | front | front-phone | front-test | free-port <ポート>"
		echo "  run         バックエンドを起動(テストデータは入れない)。8080 が使われていれば、止めてから起動"
		echo "  seed        テストデータを入れて、バックエンドを起動。8080 が使われていれば、止めてから起動"
		echo "  test        バックエンドの自動テストを実行"
		echo "  front       フロントエンド(React)を起動。http://localhost:5173。5173 が使われていれば、止めてから起動"
		echo "  front-phone iPhone など、同じ Wi-Fi の端末から画面を見る(試すときだけ。ログインが無いので注意)"
		echo "  front-test  フロントエンドの自動テストを実行"
		echo "  free-port   ポート(8080 か 5173)を使っているプロセスを止める"
		exit 1
		;;
esac
