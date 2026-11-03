#!/usr/bin/env bash
# ポートの競合を解消する。指定したポートを使っているプロセスを停止して、ポートを空ける。
#
#   scripts/free-port.sh 8080     バックエンド(Spring Boot)の標準のポート
#   scripts/free-port.sh 5173     フロントエンド(Vite)の標準のポート
#
# - 止めるのは、そのポートで待ち受けている(LISTEN)プロセスだけ。
# - 止める前に、何を止めるかを表示する。
# - まず通常の停止(SIGTERM)を試し、10 秒たっても止まらなければ、強制終了(SIGKILL)する。
# - 対象は、このアプリの標準のポートだけ。DB(5432)など、他のポートは止めない。
#   (テストのときだけ、環境変数 FREE_PORT_ALLOWED で、対象のポートを入れ替えられる)

set -euo pipefail

ALLOWED="${FREE_PORT_ALLOWED:-8080 5173}"
PORT="${1:-}"

usage() {
	echo "使い方:  scripts/free-port.sh <ポート番号>   (対象: $ALLOWED)" >&2
	exit 2
}

[[ "$PORT" =~ ^[0-9]+$ ]] || usage
case " $ALLOWED " in
	*" $PORT "*) ;;
	*)
		echo "エラー: ポート $PORT は、止める対象ではありません(対象: $ALLOWED)。" >&2
		echo "  DB(5432)など、他のポートのプロセスは、自動では止めません。" >&2
		exit 2
		;;
esac

command -v lsof >/dev/null 2>&1 || { echo "エラー: lsof が見つかりません。" >&2; exit 1; }

# そのポートで待ち受けているプロセスの番号(IPv4 も IPv6 も)
listening_pids() {
	lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | sort -u || true
}

PIDS="$(listening_pids)"
if [ -z "$PIDS" ]; then
	echo "ポート $PORT は空いています。"
	exit 0
fi

echo "ポート $PORT を使っているプロセスを停止します:"
for pid in $PIDS; do
	ps -o pid=,user=,command= -p "$pid" 2>/dev/null | cut -c1-110 | sed 's/^/  /' || true
done

# 1. 通常の停止(SIGTERM)。最大 10 秒、止まるのを待つ
# shellcheck disable=SC2086
kill $PIDS 2>/dev/null || true
for _ in $(seq 1 20); do
	[ -z "$(listening_pids)" ] && break
	sleep 0.5
done

# 2. まだ使われていれば、強制終了(SIGKILL)
REMAIN="$(listening_pids)"
if [ -n "$REMAIN" ]; then
	echo "止まらないため、強制終了します。"
	# shellcheck disable=SC2086
	kill -9 $REMAIN 2>/dev/null || true
	for _ in $(seq 1 10); do
		[ -z "$(listening_pids)" ] && break
		sleep 0.5
	done
fi

if [ -n "$(listening_pids)" ]; then
	echo "エラー: ポート $PORT を空けられませんでした。別のユーザーのプロセスかもしれません。" >&2
	echo "  確認:  lsof -nP -iTCP:$PORT -sTCP:LISTEN" >&2
	exit 1
fi

echo "ポート $PORT を空けました。"
