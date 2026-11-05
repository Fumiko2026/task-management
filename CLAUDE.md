# CLAUDE.md

このファイルは、Claude Code がこのプロジェクトで作業するときに、毎回読むルールです。

## プロジェクトの概要
- Trello 風のタスク管理アプリ(WEB スクールの課題)。個人利用。
- バックエンド: Spring Boot 4.1.2 / Java 21 / Maven(`backend/`)。DB: PostgreSQL 17(Docker)。
- フロントエンド: React 19 / TypeScript / Vite(`frontend/`)。テストは Vitest + Testing Library。開発中は、Vite が `/api` をバックエンド(8080)へ中継する(CORS の設定は不要)。
- 設計書は `docs/` と `requirements.md`。最小版の範囲は `docs/mvp-scope.md`。
- 利用者は初心者。**説明は日本語で、やさしく、一つずつ**行う。専門用語には一言の説明をつける。

## 進め方の基本
1. 作業は小さく分ける。一度に大きく変えない。
2. 変更の前に、何をするかを短く伝える。
3. 作ったら必ず確かめる(テスト、起動、API の確認)。結果は正直に報告する(失敗も隠さない)。
4. 決まっていないことは、決め打ちせずに、おすすめつきで質問する。

## Git のルール

### main ブランチには直接プッシュしない
- `main` は GitHub 側で保護されている(直接プッシュは拒否される)。
- 変更は、必ず**作業用ブランチ → プルリクエスト(PR)→ main へ統合**の順で行う。
- `git push --force` と、`main` の削除は行わない。

### ブランチの名前
`種類/イシュー番号-内容(英語の短い言葉)` とする。

| 種類 | 使う場面 | 例 |
|---|---|---|
| `feature/` | 機能の追加 | `feature/12-board-from-db` |
| `fix/` | 不具合の修正 | `fix/15-garbled-text` |
| `docs/` | 設計書・README の変更 | `docs/8-table-definition` |
| `chore/` | 設定・道具・掃除 | `chore/3-github-rules` |

### コミットメッセージ
- 日本語で、何をしたかを 1 行で書く(例: `テーブル定義(schema.sql)とDB接続テストを追加`)。
- 1 つのコミットは、1 つの目的にする。

### 作業の流れ
1. **イシューを作る**(やることを 1 件ずつ登録する。下の「イシューのルール」)。
2. `main` を最新にして、イシューに対応するブランチを作る。
   ```
   git switch main
   git pull
   git switch -c feature/12-board-from-db
   ```
3. 作業し、テストを通して、コミットする。
4. ブランチをプッシュして、PR を作る。PR の説明に `Closes #12` と書く(統合されると、イシューが自動で閉じる)。
5. 内容を確認して、`main` へ統合(マージ)する。統合したブランチは削除する(下の「PR の統合と片づけ」)。

### PR の統合と片づけ
利用者から統合を頼まれたときだけ、`gh` コマンドで統合する。**統合するときは、必ず `--delete-branch` を付ける**(GitHub 上と手元のブランチを、自動で削除するため)。
```
gh pr merge 12 --merge --delete-branch
git switch main            # --delete-branch で、すでに main に戻っていることが多い
git pull
git branch                 # 手元に作業ブランチが残っていないか確認(残っていれば git branch -d ブランチ名)
```
- 統合の前に、PR の `Closes #番号` を確かめる。無いと、イシューが自動で閉じない。
- 統合の後に、次の3つを確かめて報告する: PR が MERGED、イシューが CLOSED、ブランチが残っていない(`git branch -a`)。
- GitHub 側でも「統合したブランチを自動で削除する」設定を有効にしてある(`gh api repos/Fumiko2026/task-management --jq .delete_branch_on_merge` が `true`)。
- 利用者が GitHub の画面で統合した場合も、GitHub 側のブランチは自動で消える。手元のブランチだけ、`git branch -d` で消す。

## イシューのルール
- **やることは、作業の前にイシューに登録する。** 1 イシュー = 1 つの小さな作業(1〜数日で終わる大きさ)。
- 書式は `.github/ISSUE_TEMPLATE/` のひな形を使う(機能 / 不具合 / 調べもの)。
- タイトルは「〜を作る」「〜を直す」のように、やることがわかる形にする。
- 完了の条件(何ができたら終わりか)を、チェックリストで書く。
- 課題の進め方(ER 図 → プロトタイプ → Spring Boot → DB → API)に対応する大きな項目は、見出しのイシューにして、小さなイシューをぶら下げる。

## 書いてはいけないもの(GitHub に上げない)
- パスワード、トークン、`.env` の中身。DB のパスワードは環境変数 `DB_PASSWORD` で渡す。
- `.env` は `.gitignore` 済み。`git add .` を使うときは、`git status` で `.env` が入っていないことを確認する。

## コマンド
```
docker compose up -d     # DB を起動(プロジェクト直下)
./dev.sh run             # アプリを起動(.env からパスワードを自動で読む)
./dev.sh seed            # テストデータ(db/seed.sql)を入れて起動
./dev.sh test            # バックエンドのテスト(DB の起動が必要)
./dev.sh front           # フロントエンドを起動(http://localhost:5173。先に ./dev.sh seed でバックエンドを動かす)
./dev.sh front-phone     # iPhone など、同じ Wi-Fi の端末から画面を見る(試すときだけ。ログインが無いので、終わったら止める)
./dev.sh front-test      # フロントエンドのテスト
```
フロントエンドの確認は、`frontend/` で `npm test`、`npm run lint`、`npm run build`(型の検査を含む)が、すべて通ること。

## 公開の範囲(必ず守る)
- バックエンド(8080)は、**パソコンの中(127.0.0.1)だけ**で待ち受ける(`application.properties` の `server.address`)。ネットワーク全体(`0.0.0.0`)に向けて開かない。ログインが無い間は、同じ Wi-Fi の端末から、API を直接呼べてしまうため。
- 画面のサーバー(5173)を、同じ Wi-Fi に公開するのは、`./dev.sh front-phone` のときだけ。試す間だけ使い、終わったら止める。`vite.config.ts` に `host` を書いて、いつも公開する形にはしない。公開するときは、ログインが無いことの注意を、利用者に伝える。

## ポートの競合(必ず守る)
サーバーは、**標準のポートで動かす**。バックエンドは **8080**、フロントエンドは **5173**。

- 起動しようとしたポートが、他のプロセスに使われていたら(`Port 8080 was already in use`、`Port 5173 is already in use`、`EADDRINUSE` など)、**そのポートを使っているプロセスを必ず停止してから、標準のポートで起動する**。
- **別のポートへ逃げない。** `--server.port` や `--port` の指定、設定ファイルのポートの書き換えは行わない(画面の確認先、バックエンドへの中継先、README の案内が、この番号に決まっているため)。Vite も、`strictPort` で、5173 が使えないときは別のポートへ移らず、エラーで止まる。
- 停止は、`./dev.sh free-port 8080` / `./dev.sh free-port 5173`(中身は `scripts/free-port.sh`)で行う。`./dev.sh run` / `seed` / `front` は、起動の前に、自動でこの停止を行う。
- 止めてよいのは、**8080 と 5173 で待ち受けているプロセスだけ**。DB(5432)など、他のポートは止めずに、利用者に状況を伝えて相談する。`pkill java` のように、名前で広く止めない。
- 何を止めたかを、利用者に報告する(「ポート 8080 を、○○が使っていたので止めました」)。
- 手順の詳細は、スキル `free-port`(`.claude/skills/free-port/SKILL.md`)を使う。
`dev.sh` を使わないときは、`cd backend` して `export DB_PASSWORD=...`(`.env` と同じ値)のうえ `./mvnw spring-boot:run` / `./mvnw test`。

## コードの決まり
- 構成は Controller / Service / Repository に分ける。
- 日時は日本時間(Asia/Tokyo)。DB の日時は TIMESTAMPTZ。
- JSON の応答は UTF-8 を明示する(文字化け防止)。
- 他の人のデータは見せない(取得は、ログインした利用者の ID で絞る)。
- フロントエンドの API の型は `frontend/src/api/types.ts` に置く。バックエンドの `BoardView.java` などを変えたら、ここも直す。
- カードのドラッグ操作は `@dnd-kit`。カードとリストの目印は `card-3` / `list-3` の形(`frontend/src/lib/dndIds.ts`)。ボードの中でカードを動かす計算は、画面に頼らない関数として `frontend/src/lib/boardMove.ts` に置く(テストしやすくするため)。
- カードの並び順(`position`)は、どのリストでも 1,2,3… の連番にする(欠番を作らない)。カードを動かしたときも、消したときも、残ったカードを振り直す。「完了」リストへ入れたら完了日時と、完了前のリスト(`completed_from_list_id`)を記録し、出したら両方を消す(移動 API も完了 API も、`BoardService.relocate` を使う)。
- カードの削除は物理削除(DB から本当に消える)。元に戻せないので、画面から消すときは、必ず、削除の前に確認を出す(要件 NM-08)。
- 画面は、色だけで状態を伝えない(アイコンと文字も出す)。押せる部品は 44px 以上。まだ動かない部品は、画面に出さない。
- テーブルの変更は `backend/src/main/resources/db/schema.sql`。変更するときは `docs/table-definition.md` も更新する。既存のテーブルに列を足すときは、`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` を使う(何度実行しても壊れず、データも消えない)。
