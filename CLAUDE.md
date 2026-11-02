# CLAUDE.md

このファイルは、Claude Code がこのプロジェクトで作業するときに、毎回読むルールです。

## プロジェクトの概要
- Trello 風のタスク管理アプリ(WEB スクールの課題)。個人利用。
- バックエンド: Spring Boot 4.1.2 / Java 21 / Maven(`backend/`)。DB: PostgreSQL 17(Docker)。
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
./dev.sh test            # テスト(DB の起動が必要)
```
`dev.sh` を使わないときは、`cd backend` して `export DB_PASSWORD=...`(`.env` と同じ値)のうえ `./mvnw spring-boot:run` / `./mvnw test`。

## コードの決まり
- 構成は Controller / Service / Repository に分ける。
- 日時は日本時間(Asia/Tokyo)。DB の日時は TIMESTAMPTZ。
- JSON の応答は UTF-8 を明示する(文字化け防止)。
- 他の人のデータは見せない(取得は、ログインした利用者の ID で絞る)。
- テーブルの変更は `backend/src/main/resources/db/schema.sql`。変更するときは `docs/table-definition.md` も更新する。
