# テーブル定義書(最小版)

| 項目 | 内容 |
|---|---|
| 状態 | 初版(版 0.1) |
| DB | PostgreSQL 17(Docker で起動) |
| 定義の場所 | [backend/src/main/resources/db/schema.sql](../backend/src/main/resources/db/schema.sql) |
| 元の設計 | [mvp-scope.md](mvp-scope.md) の ER 図 |
| 作り方 | アプリの起動時に、`schema.sql` を自動で実行する(`IF NOT EXISTS` のため、何度起動しても壊れない) |

## 1. テーブルの関係

```
users ─┬─< boards ──< lists ──< cards ──< checklist_items
       └─< assignees ───────────< (cards.assignee_id)
```
`A ──< B` は、「A が 1 つ、B が複数」を表す。

## 2. 各テーブル

### users(利用者)
| 列 | 型 | 必須 | 内容・規則 |
|---|---|---|---|
| id | BIGINT | ○ | 主キー。自動で採番 |
| email | VARCHAR(254) | ○ | メールアドレス。大文字・小文字を区別せず、重複不可 |
| password_hash | VARCHAR(255) | ○ | ハッシュ化した値。元のパスワードは保存しない |
| display_name | VARCHAR(30) | ○ | 表示名。空白だけは不可 |
| created_at | TIMESTAMPTZ | ○ | 登録日時(初期値は現在) |

### boards(ボード)
| 列 | 型 | 必須 | 内容・規則 |
|---|---|---|---|
| id | BIGINT | ○ | 主キー |
| user_id | BIGINT | ○ | 持ち主。users を指す。利用者を消すと、ボードも消える |
| name | VARCHAR(30) | ○ | ボード名。空白だけは不可 |
| created_at | TIMESTAMPTZ | ○ | 作成日時 |

### lists(リスト)
| 列 | 型 | 必須 | 内容・規則 |
|---|---|---|---|
| id | BIGINT | ○ | 主キー |
| board_id | BIGINT | ○ | boards を指す。ボードを消すと、リストも消える |
| name | VARCHAR(30) | ○ | リスト名(未着手 / 進行中 / レビュー / 完了) |
| position | INT | ○ | 並び順(1 から) |
| is_done_list | BOOLEAN | ○ | 真のリストへ移したカードは、完了として扱う。初期値は偽 |

### assignees(担当者)
| 列 | 型 | 必須 | 内容・規則 |
|---|---|---|---|
| id | BIGINT | ○ | 主キー |
| user_id | BIGINT | ○ | 登録した利用者。users を指す |
| name | VARCHAR(30) | ○ | 表示する名前。空白だけは不可 |
| is_self | BOOLEAN | ○ | 真なら本人、偽なら依頼先。初期値は偽 |

- 同じ利用者が、同じ名前の担当者を 2 回登録することはできない。
- 「本人」(`is_self` が真)は、利用者ごとに 1 人だけ。

### cards(カード)
| 列 | 型 | 必須 | 内容・規則 |
|---|---|---|---|
| id | BIGINT | ○ | 主キー |
| list_id | BIGINT | ○ | lists を指す。リストを消すと、カードも消える |
| assignee_id | BIGINT | | assignees を指す。担当者を消すと空になる(「担当者なし」) |
| title | VARCHAR(100) | ○ | タイトル。空白だけは不可 |
| description | TEXT | ○ | 説明。2000 文字まで。初期値は空 |
| position | INT | ○ | リスト内の並び順(1 から) |
| due_at | TIMESTAMPTZ | | 期限。未設定は空 |
| completed_at | TIMESTAMPTZ | | 完了日時。未完了は空 |
| created_at | TIMESTAMPTZ | ○ | 作成日時 |
| updated_at | TIMESTAMPTZ | ○ | 更新日時 |

### checklist_items(チェックリストの項目)
| 列 | 型 | 必須 | 内容・規則 |
|---|---|---|---|
| id | BIGINT | ○ | 主キー |
| card_id | BIGINT | ○ | cards を指す。カードを消すと、項目も消える |
| text | VARCHAR(100) | ○ | 手順の文言。空白だけは不可 |
| is_done | BOOLEAN | ○ | 完了か。初期値は偽 |
| position | INT | ○ | 並び順(1 から) |

## 3. 要件との対応
| 要件 | テーブル定義での対応 |
|---|---|
| NM-06 入力の長さ | タイトル 100、説明 2000、担当者名 30、チェック項目 100 文字までを、DB でも制限 |
| NM-07 自分のデータだけ | すべてのデータが `users` にたどり着く。取得するときは、ログインした利用者の ID で絞る |
| NM-10 日時は日本時間 | 日時は TIMESTAMPTZ。DB の時刻設定は Asia/Tokyo |
| S6-05 担当者を消したとき | `cards.assignee_id` が空になり、「担当者なし」になる |
| S-04 同じ名前は新しく作らない | `assignees` の (user_id, name) を重複不可にした |

## 4. 最小版では持たないもの
ER 図の全体設計([er-diagram.md](er-diagram.md))にあって、最小版のテーブルにないもの。後の段階で足す。

| 後で足すもの | 段階 |
|---|---|
| ラベル、メモ、履歴(card_events)、通知(card_reminders)、設定(user_settings)、雛形 | 第 2〜3 段階 |
| ごみ箱(削除したカードの復元)用の `deleted_at` | 第 3 段階。最小版は、削除すると本当に消える(削除前に確認を出す) |
| 期限内に完了したかの記録(`completed_on_time`) | 実績の画面を作る段階 |

## 5. 変更するときの注意
- `schema.sql` は、**テーブルが無いときに作る**だけで、すでにあるテーブルの列は変えない。列を足す・変えるときは、`ALTER TABLE` を別に流すか、DB を作り直す(`docker compose down -v`。**データは全部消える**)。
- 本格的に変更を管理するときは、Flyway などの道具の導入を検討する。
