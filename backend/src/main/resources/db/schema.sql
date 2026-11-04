-- テーブル定義(最小版)。設計は docs/mvp-scope.md の ER 図、docs/table-definition.md を参照。
-- アプリの起動時に自動で実行される。何度実行しても壊れないよう、IF NOT EXISTS を使っている。
-- 日時は TIMESTAMPTZ(タイムゾーンつき)。DB の時刻設定は日本時間(Asia/Tokyo)。

-- 利用者
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,  -- ハッシュ化した値。元のパスワードは保存しない
    display_name  VARCHAR(30)  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_display_name CHECK (char_length(btrim(display_name)) >= 1)
);
-- メールアドレスは、大文字と小文字を区別せずに重複不可
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_lower ON users (lower(email));

-- ボード
CREATE TABLE IF NOT EXISTS boards (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_boards_name CHECK (char_length(btrim(name)) >= 1)
);
CREATE INDEX IF NOT EXISTS ix_boards_user_id ON boards (user_id);

-- リスト(未着手 / 進行中 / 完了。完了は、いつも最後)
CREATE TABLE IF NOT EXISTS lists (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id     BIGINT      NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    name         VARCHAR(30) NOT NULL,
    position     INT         NOT NULL,                -- 並び順(1 から)
    is_done_list BOOLEAN     NOT NULL DEFAULT FALSE,  -- 真のリストへ移したカードは完了扱い
    CONSTRAINT ck_lists_name CHECK (char_length(btrim(name)) >= 1)
);
CREATE INDEX IF NOT EXISTS ix_lists_board_position ON lists (board_id, position);

-- 担当者(自分、または依頼先の名前)
CREATE TABLE IF NOT EXISTS assignees (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name    VARCHAR(30) NOT NULL,
    is_self BOOLEAN     NOT NULL DEFAULT FALSE,       -- 真なら本人
    CONSTRAINT ck_assignees_name CHECK (char_length(btrim(name)) >= 1),
    -- 同じ名前の人を2回登録させない(カード詳細では、既存の人を選ぶ)
    CONSTRAINT ux_assignees_user_name UNIQUE (user_id, name)
);
-- 「自分」は、利用者ごとに1人だけ
CREATE UNIQUE INDEX IF NOT EXISTS ux_assignees_one_self_per_user ON assignees (user_id) WHERE is_self;

-- カード(タスク)
CREATE TABLE IF NOT EXISTS cards (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    list_id      BIGINT       NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
    -- 担当者を消したら、そのカードは「担当者なし」になる
    assignee_id  BIGINT       REFERENCES assignees (id) ON DELETE SET NULL,
    title        VARCHAR(100) NOT NULL,
    description  TEXT         NOT NULL DEFAULT '',
    position     INT          NOT NULL,               -- リスト内の並び順(1 から)
    due_at       TIMESTAMPTZ,                         -- 期限。未設定は NULL
    completed_at TIMESTAMPTZ,                         -- 完了日時。未完了は NULL
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_cards_title CHECK (char_length(btrim(title)) >= 1),
    CONSTRAINT ck_cards_description CHECK (char_length(description) <= 2000)
);
CREATE INDEX IF NOT EXISTS ix_cards_list_position ON cards (list_id, position);
CREATE INDEX IF NOT EXISTS ix_cards_assignee_id ON cards (assignee_id);
CREATE INDEX IF NOT EXISTS ix_cards_due_at ON cards (due_at);

-- チェックリストの項目(準備の手順)
CREATE TABLE IF NOT EXISTS checklist_items (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    card_id  BIGINT       NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    text     VARCHAR(100) NOT NULL,
    is_done  BOOLEAN      NOT NULL DEFAULT FALSE,
    position INT          NOT NULL,
    CONSTRAINT ck_checklist_items_text CHECK (char_length(btrim(text)) >= 1)
);
CREATE INDEX IF NOT EXISTS ix_checklist_items_card_position ON checklist_items (card_id, position);
