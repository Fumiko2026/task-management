-- テストデータ(確認用)。プロファイル seed で起動したときだけ入る(application-seed.properties を参照)。
-- 起動のたびに、デモ利用者を作り直す。何度実行しても同じ結果になる。
-- 期限は「いま」からの相対にしてあるので、いつ動かしても、超過・もうすぐ・通常・完了の状態がそろって見える。

-- 前回のデモデータを消す(ボード・リスト・カード・担当者・チェックリストも、まとめて消える)
DELETE FROM users WHERE email = 'demo@example.com';

-- 利用者。password_hash は仮の値(ログインは未実装。本物のパスワードは入れない)
INSERT INTO users (email, password_hash, display_name)
VALUES ('demo@example.com', 'dummy-hash-not-for-login', 'デモ太郎');

-- ボード
INSERT INTO boards (user_id, name)
SELECT id, 'はじめてのボード' FROM users WHERE email = 'demo@example.com';

-- リスト3つ(未着手 / 進行中 / 完了。完了は、いつも最後(いちばん右)で、is_done_list が真)
INSERT INTO lists (board_id, name, position, is_done_list)
SELECT b.id, v.name, v.position, v.is_done_list
FROM boards b
JOIN users u ON u.id = b.user_id
CROSS JOIN (VALUES
    ('未着手',   1, FALSE),
    ('進行中',   2, FALSE),
    ('完了',     3, TRUE)
) AS v (name, position, is_done_list)
WHERE u.email = 'demo@example.com';

-- 担当者(自分と、依頼先の田中さん)
INSERT INTO assignees (user_id, name, is_self)
SELECT u.id, v.name, v.is_self
FROM users u
CROSS JOIN (VALUES
    ('自分',     TRUE),
    ('田中さん', FALSE)
) AS v (name, is_self)
WHERE u.email = 'demo@example.com';

-- カード5枚
--   見積書を作る   : 超過(昨日が期限)
--   資料をまとめる : 担当者なし・期限なし
--   部長に報告     : もうすぐ(5時間後が期限)
--   資料を送る     : 通常(3日後が期限)。依頼先の田中さん
--   契約書の確認   : 完了(昨日が期限で、その2時間前に完了)
INSERT INTO cards (list_id, assignee_id, title, description, position, due_at, completed_at)
SELECT l.id, a.id, v.title, v.description, v.position, v.due_at, v.completed_at
FROM (VALUES
    ('未着手', '自分',     '見積書を作る',   'A社向け。先月の条件で作る。', 1, now() - interval '1 day',   NULL::timestamptz),
    ('未着手', NULL,       '資料をまとめる', '',                            2, NULL::timestamptz,          NULL::timestamptz),
    ('進行中', '自分',     '部長に報告',     '',                            1, now() + interval '5 hours', NULL::timestamptz),
    ('進行中', '田中さん', '資料を送る',     '',                            2, now() + interval '3 days',  NULL::timestamptz),
    ('完了',   '田中さん', '契約書の確認',   '',                            1, now() - interval '1 day',   now() - interval '1 day 2 hours')
) AS v (list_name, assignee_name, title, description, position, due_at, completed_at)
JOIN lists l
  ON l.name = v.list_name
 AND l.board_id = (SELECT b.id FROM boards b JOIN users u ON u.id = b.user_id WHERE u.email = 'demo@example.com')
LEFT JOIN assignees a
  ON a.name = v.assignee_name
 AND a.user_id = (SELECT id FROM users WHERE email = 'demo@example.com');

-- 「見積書を作る」の準備の手順(5つのうち3つが完了)
INSERT INTO checklist_items (card_id, text, is_done, position)
SELECT c.id, v.text, v.is_done, v.position
FROM cards c
JOIN lists l ON l.id = c.list_id
JOIN boards b ON b.id = l.board_id
JOIN users u ON u.id = b.user_id
CROSS JOIN (VALUES
    ('取引先の情報を集める', TRUE,  1),
    ('過去の見積書を探す',   TRUE,  2),
    ('金額を計算する',       TRUE,  3),
    ('上司に確認する',       FALSE, 4),
    ('見積書を送る',         FALSE, 5)
) AS v (text, is_done, position)
WHERE u.email = 'demo@example.com' AND c.title = '見積書を作る';
