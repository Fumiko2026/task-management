package com.example.taskmanagement.board;

import java.time.OffsetDateTime;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * テスト用のデータを DB に入れる部品。
 * 先に全利用者を消してから入れるので、DB にシード等のデータが入っていても影響されない。
 * テストは @Transactional で動かすため、入れたデータも消した分も、テスト後に元に戻る。
 */
final class BoardTestData {

	/** 入れたデータの id。 */
	record Ids(long boardId, long todoListId, long doneListId,
			long estimateCardId, long noDueCardId, long laterCardId, long doneCardId) {
	}

	private BoardTestData() {
	}

	/**
	 * ボード「テストボード」を作る。
	 *   未着手: 見積書を作る(田中さん・昨日が期限・チェック2つのうち1つ完了) / 資料をまとめる(担当者なし・期限なし) / 資料を送る(3日後)
	 *   完了  : 契約書の確認(完了)
	 */
	static Ids insert(JdbcTemplate jdbc) {
		jdbc.update("DELETE FROM users");

		long userId = jdbc.queryForObject(
				"INSERT INTO users (email, password_hash, display_name) VALUES ('test@example.com', 'dummy', 'テスト太郎') RETURNING id",
				Long.class);
		long boardId = jdbc.queryForObject(
				"INSERT INTO boards (user_id, name) VALUES (?, 'テストボード') RETURNING id", Long.class, userId);
		long todoListId = jdbc.queryForObject(
				"INSERT INTO lists (board_id, name, position, is_done_list) VALUES (?, '未着手', 1, FALSE) RETURNING id",
				Long.class, boardId);
		long doneListId = jdbc.queryForObject(
				"INSERT INTO lists (board_id, name, position, is_done_list) VALUES (?, '完了', 2, TRUE) RETURNING id",
				Long.class, boardId);
		long tanakaId = jdbc.queryForObject(
				"INSERT INTO assignees (user_id, name, is_self) VALUES (?, '田中さん', FALSE) RETURNING id",
				Long.class, userId);

		OffsetDateTime now = OffsetDateTime.now();
		// 並び順(position)は、わざと期限の順と違う並びにしてある
		long estimate = card(jdbc, todoListId, tanakaId, "見積書を作る", "A社向け", 1, now.minusDays(1), null);
		long noDue = card(jdbc, todoListId, null, "資料をまとめる", "", 2, null, null);
		long later = card(jdbc, todoListId, null, "資料を送る", "", 3, now.plusDays(3), null);
		long done = card(jdbc, doneListId, tanakaId, "契約書の確認", "", 1, now.minusDays(1), now.minusDays(1));

		// チェックリストは、わざと逆順に入れる(position の順に取れることの確認)
		jdbc.update("INSERT INTO checklist_items (card_id, text, is_done, position) VALUES (?, '上司に確認する', FALSE, 2)", estimate);
		jdbc.update("INSERT INTO checklist_items (card_id, text, is_done, position) VALUES (?, '金額を計算する', TRUE, 1)", estimate);

		return new Ids(boardId, todoListId, doneListId, estimate, noDue, later, done);
	}

	private static long card(JdbcTemplate jdbc, long listId, Long assigneeId, String title, String description,
			int position, OffsetDateTime dueAt, OffsetDateTime completedAt) {
		return jdbc.queryForObject(
				"INSERT INTO cards (list_id, assignee_id, title, description, position, due_at, completed_at) "
						+ "VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
				Long.class, listId, assigneeId, title, description, position, dueAt, completedAt);
	}

}
