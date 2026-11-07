---
name: quality-review
description: このプロジェクトの全体の品質チェック(レビュー)をするときに使う。バックエンド・フロントエンドを、要件定義書・設計書と見比べ、デファクト(事実上の標準)・React・Spring Boot の標準から外れている点、セキュリティ、テスト、運用の抜けを調べて、重大/中/軽に分けて報告する。「品質チェック」「レビューして」「標準から外れていないか」「設計書とずれていないか」と言われたときに使う。
argument-hint: "[backend | frontend | docs | all]"
---

# 品質チェック(レビュー)

**調べるだけで、勝手に直さない。** 結果は日本語で、やさしく、**重大 → 中 → 軽** の順に報告する。各項目に「場所・なぜ困るか・直し方・手間」を添える。最後に、おすすめの順番と「文書にする / イシューにする」の提案を出す。
**食い違いを見つけたときの原則: 実装を正とし、設計書を実装に合わせて直す。**(コードを直すのは、不具合のとき、または利用者が頼んだときだけ。)

## 進め方
1. 要件(`requirements.md` §6.1 の NM-01〜14、`docs/mvp-scope.md` §2)と、実装を見比べる。
2. 下の観点を順に確かめる。確かめられなかったもの(例: バックエンドが止まっていて、API を呼べない)は、**確かめていないと正直に書く**。
3. 報告する。直すときは、`CLAUDE.md` の流れ(イシュー → ブランチ → PR)に従う。

## A. セキュリティ・公開の範囲(重大になりやすい)
- [ ] `docker-compose.yml` の DB のポートが `127.0.0.1:5432:5432` か(`"5432:5432"` は Wi-Fi 全体に公開される)
- [ ] `server.address=127.0.0.1` のままか。`vite.config.ts` に `host` を常時書いていないか
- [ ] `.env` が Git の履歴に無いか(`git log --all -- .env`)。パスワードがコードや文書に無いか
- [ ] ログインが無い間の注意(NM-07)。他人のデータを見せない絞り込み(user_id)の `TODO` が残っていないか
- [ ] 開発用の入口(自作の確認用 API など)が、公開用に残っていないか。確認は Actuator の `/actuator/health` だけを公開しているか(`management.endpoints.web.exposure.include=health`)
- [ ] 依存の脆弱性: `cd frontend && npm audit`

## B. Spring Boot の標準
- [ ] 入力の検査: `@Valid` + Bean Validation か、手書きか。更新 API が `Map<String, Object>` でなく専用の型か
- [ ] エラー: すべての例外が `{"message": …}`(UTF-8)で返るか。想定外の例外が 500 の標準画面にならないか(`ProblemDetail` / 全例外の受け皿)。数字でない ID・405・404・415 の応答の形を、実際に呼んで確かめる
- [ ] 層の分け方(Controller / Service / Repository)。Service の肥大(300 行超は分け方を検討)
- [ ] テスト用の代役が `src/main` に入っていないか(`InMemoryBoardRepository` など)
- [ ] テストが、開発用 DB を使っていないか。`DELETE FROM users` のような全消しが無いか
- [ ] 同時操作: `(list_id, position)` の一意制約・ロックの有無
- [ ] スキーマ変更の管理(`schema.sql` + `ADD COLUMN IF NOT EXISTS`。大きくなったら Flyway)
- [ ] ヘルスチェック(Actuator)、`spring.jackson` / 日時(Asia/Tokyo)の設定
- [ ] 日時は TIMESTAMPTZ、JSON は UTF-8(`CLAUDE.md` のコードの決まり)

## C. React / TypeScript の標準
- [ ] `tsconfig.app.json` に `"strict": true` があるか
- [ ] `npm test`、`npm run lint`、`npm run build` がすべて通るか
- [ ] 通信にタイムアウト(`AbortController`)があるか。失敗の表示(読み込み失敗・保存失敗)があるか
- [ ] データ取得の自作フックの規模(大きくなったら TanStack Query)
- [ ] 大きいファイル(コンポーネント 200 行超、CSS 600 行超)は分けられないか
- [ ] 押せる部品が 44px 以上か。色だけで状態を伝えていないか。まだ動かない部品を出していないか
- [ ] カードの中の押せる部品で、`stopPropagation` をしているか(ドラッグ・ダイアログとの衝突)
- [ ] API の型 `frontend/src/api/types.ts` が、バックエンドの `BoardView.java` などと合っているか
- [ ] 実機(iPhone)でしか分からない操作(長押し・日付の選択部品)は、利用者に確認をお願いしたか

## D. 要件・設計書との一致(実装が正)
- [ ] MVP の機能(`docs/mvp-scope.md` §2)のうち、まだ無いものの一覧(ログイン、タイトル・説明・担当者の編集、チェックリスト、自分のタスクの画面)
- [ ] API の一覧(`docs/mvp-scope.md` §5、`README.md`)が、実際の `BoardController` と合っているか(「実装済み」の印、本文の形、状態コード、エラー文)
- [ ] テーブル定義: `schema.sql` ⇔ `docs/table-definition.md` ⇔ `docs/er-diagram.md` ⇔ `docs/mvp-scope.md` §4 の ER 図(列の増減が、4 か所に反映されているか)
- [ ] 画面の文言・動作(`docs/screen-*.md`)が、実際の画面と合っているか(知らせの文、確認の文、初期フォーカス、時間)
- [ ] 設計書にあって、実装では別の形にした決定(例: 優先度は項目でなく位置、履歴は `card_events` でなく `completed_from_list_id`、「もうすぐ」は固定 24 時間)が、**「いま」と「将来」を分けて**書かれているか
- [ ] `CLAUDE.md` のコマンド・ルールが、現状と合っているか。メモリの進捗(テスト件数など)が古くないか

## E. 運用
- [ ] CI(`.github/workflows`)でテストを自動実行しているか
- [ ] イシュー・ブランチ・PR の運用(`Closes #番号`、統合後のブランチ削除)が守られているか
- [ ] `TODO` / `FIXME` の残り: `grep -rn "TODO\|FIXME" backend/src frontend/src`
- [ ] テストの量(本体とテストの行数の比)と、DB にデータが残らないこと

## 報告の形
```
## 重大
1. 〇〇(場所)— なぜ困るか / 直し方 / 手間
## 中
## 軽い・良い点
## 確かめられなかったこと
## おすすめの順番
```
