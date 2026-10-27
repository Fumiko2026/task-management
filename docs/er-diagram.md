# ER図(データの設計)

関連要件: [requirements.md](../requirements.md) の F-10〜F-83。個人利用のため、「ユーザー」を中心に全データが1人に属する。

## 1. 全体図

```mermaid
erDiagram
    users ||--o{ boards : "持つ"
    users ||--o{ assignees : "登録する"
    users ||--|| user_settings : "持つ"
    users ||--o{ push_subscriptions : "持つ"
    users ||--o{ labels : "作る"
    users ||--o{ checklist_templates : "作る"

    boards ||--o{ lists : "含む"
    lists ||--o{ cards : "含む"
    assignees ||--o{ cards : "担当する"

    cards ||--o{ checklist_items : "持つ"
    cards ||--o{ card_labels : "持つ"
    labels ||--o{ card_labels : "付く"
    cards ||--o{ card_reminders : "持つ"
    cards ||--o{ card_comments : "持つ"
    cards ||--o{ card_events : "記録する"

    checklist_templates ||--o{ template_items : "含む"

    users {
        bigint id PK
        string email "ログイン用・重複不可"
        string password_hash "暗号化して保存"
        string display_name
        datetime created_at
    }
    user_settings {
        bigint user_id PK, FK
        int font_scale "文字の拡大率"
        boolean effects_enabled "演出のオン・オフ"
        boolean notify_due_enabled "期限前の通知・初期オン"
        boolean notify_overdue_enabled "超過の通知・初期オン"
        boolean notify_digest_enabled "朝のまとめ通知・初期オフ"
        boolean quiet_enabled "通知しない時間帯を使うか・初期オン"
        int due_soon_hours "もうすぐの基準・初期24"
        string board_sort "ボードの並び順・recent または manual"
        time default_due_time "期限の初期時刻・初期18:00"
        time morning_notify_time "朝の通知時刻・初期9:00"
        time quiet_start "通知を止める開始・初期21:00"
        time quiet_end "通知を止める終了・初期7:00"
    }
    push_subscriptions {
        bigint id PK
        bigint user_id FK
        string endpoint "通知の宛先"
        string keys "暗号化用の鍵"
        datetime created_at
    }
    boards {
        bigint id PK
        bigint user_id FK
        string name
        boolean archived
        int position "手で並べた順"
        datetime last_opened_at "最後に開いた日時・最近開いた順に使う"
        datetime created_at
    }
    lists {
        bigint id PK
        bigint board_id FK
        string name
        int position "並び順"
        boolean is_done_list "完了を表すリストか"
        boolean archived
    }
    assignees {
        bigint id PK
        bigint user_id FK
        string name "表示する名前"
        boolean is_self "本人か依頼先か"
    }
    cards {
        bigint id PK
        bigint list_id FK
        bigint assignee_id FK "null可・未設定は警告"
        string title "必須"
        text description
        int position "リスト内の並び順"
        datetime due_at "null可"
        datetime completed_at "null可・完了日時"
        boolean completed_on_time "期限内に完了したか"
        boolean archived
        datetime deleted_at "null可・30日間は復元可"
        datetime created_at
        datetime updated_at
    }
    checklist_items {
        bigint id PK
        bigint card_id FK
        string text
        boolean is_done
        int position
        datetime due_at "null可・推奨"
    }
    labels {
        bigint id PK
        bigint user_id FK
        string name
        string color
    }
    card_labels {
        bigint card_id PK, FK
        bigint label_id PK, FK
    }
    card_reminders {
        bigint id PK
        bigint card_id FK
        int offset_minutes "期限の何分前か"
        datetime notify_at "通知する時刻"
        datetime sent_at "null可・送信済みなら入る"
    }
    card_comments {
        bigint id PK
        bigint card_id FK
        text body
        datetime created_at
    }
    card_events {
        bigint id PK
        bigint card_id FK
        string event_type "作成/リスト移動/期限変更/担当者変更/完了/完了取消"
        string from_value
        string to_value
        datetime created_at
    }
    checklist_templates {
        bigint id PK
        bigint user_id FK
        string name
    }
    template_items {
        bigint id PK
        bigint template_id FK
        string text
        int position
    }
```

## 2. テーブルの説明

| テーブル | 役割 | 主な関連要件 |
|---|---|---|
| users | 利用者のログイン情報 | F-01, N-07 |
| user_settings | 文字サイズ、演出のオン・オフ、通知しない時間帯 | F-61, F-71, N-13 |
| push_subscriptions | 通知を送る先(スマホごとに1件) | F-22 |
| boards | ボード | F-10 |
| lists | リスト。`is_done_list` が真のリストへ移すと完了扱い | F-11 |
| cards | タスク本体 | F-12, F-20 |
| assignees | 担当者の候補。`is_self` が真の行は登録時に自動作成。依頼先は入力するたびに追加 | F-30, F-31 |
| checklist_items | 準備の手順 | F-40, F-42 |
| labels / card_labels | ラベルとカードの対応(多対多) | F-14 |
| card_reminders | カードごとの通知タイミング | F-22 |
| card_comments | メモ | F-15 |
| card_events | 期限変更・リスト移動・完了の履歴 | F-25, F-43, F-74 |
| checklist_templates / template_items | よく使う手順の雛形 | F-44 |

## 3. 設計の考え方

1. **担当者は1名**: `cards.assignee_id` に1件だけ入れる。複数にはしない。
2. **依頼先は別テーブル**: 担当者を文字列でカードに直接入れると、同じ人の名前の表記がばらつく。`assignees` に分けておけば、候補表示(F-31)と絞り込み(F-34)ができる。
3. **依頼先の名前を変えても過去のカードは正しく表示される**: カードは名前そのものではなく `assignee_id` で参照するため。
4. **実績の元データ**: 期限内完了率(F-72)は `completed_at` と `due_at` から計算する。完了時点の判定を `completed_on_time` に保存しておけば、あとで期限を変えても過去の実績は変わらない。
5. **履歴は `card_events` に追記だけする**: 消さない。期限・リスト移動・完了を同じ形で残せる。
6. **誤削除の復元**: 削除は `deleted_at` に日時を入れるだけにして、30日後に本当に消す(N-09)。
7. **他人のデータを見せない**: すべてのデータをたどると `users` にたどり着く。取得時は必ず「自分のユーザーID」で絞る(N-07)。

## 4. 画面とのつながり

| 画面 | 主に使うテーブル |
|---|---|
| ボード(S-03) | boards, lists, cards, checklist_items, assignees, labels |
| カード詳細(S-04) | cards, checklist_items, card_reminders, card_comments, card_events |
| 自分のタスク(S-05) | cards(`due_at` 順), assignees |
| 実績(S-07) | cards(`completed_at`, `completed_on_time`), card_events |
| 設定(S-06) | user_settings, push_subscriptions |

## 5. 未決事項

| No. | 内容 |
|---|---|
| ER-01 | データを置く場所(端末のみ / サーバー)。ログインと通知を使うため、サーバーに置く前提で設計している |
| ER-02 | 使うデータベースの種類(技術選定の段階で決める) |
| ER-03 | 依頼先の名前の重複(同姓の別人)を許すか |
