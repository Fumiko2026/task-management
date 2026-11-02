package com.example.taskmanagement.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * テーブル定義(db/schema.sql)の確認。実際の DB につないで確かめる。
 * テストの前に DB を起動し、環境変数 DB_PASSWORD を設定しておくこと(README を参照)。
 * 各テストは終わると元に戻る(@Transactional)ので、DB にデータは残らない。
 */
@SpringBootTest
@Transactional
class SchemaTest {

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void 最小版の6つのテーブルがそろっている() {
		List<String> tables = jdbc.queryForList(
				"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
				String.class);

		assertThat(tables).contains("users", "boards", "lists", "assignees", "cards", "checklist_items");
	}

	@Test
	void 利用者からチェック項目までを登録して_取り出せる() {
		long cardId = insertCard("見積書を作る", "A社向け");
		jdbc.update("INSERT INTO checklist_items (card_id, text, position) VALUES (?, ?, 1)", cardId, "金額を計算する");

		Integer items = jdbc.queryForObject(
				"SELECT count(*) FROM checklist_items WHERE card_id = ?", Integer.class, cardId);
		Boolean done = jdbc.queryForObject(
				"SELECT is_done FROM checklist_items WHERE card_id = ?", Boolean.class, cardId);

		assertThat(items).isEqualTo(1);
		assertThat(done).isFalse(); // 初期値は未完了
	}

	@Test
	void 日本語がそのまま保存され_読み出せる() {
		long cardId = insertCard("部長に報告します", "資料は明日までに");

		String title = jdbc.queryForObject("SELECT title FROM cards WHERE id = ?", String.class, cardId);

		assertThat(title).isEqualTo("部長に報告します");
	}

	@Test
	void ボードを消すと_リストとカードとチェック項目も消える() {
		long cardId = insertCard("消えるカード", "");
		jdbc.update("INSERT INTO checklist_items (card_id, text, position) VALUES (?, '手順', 1)", cardId);
		long boardId = jdbc.queryForObject("SELECT id FROM boards ORDER BY id DESC LIMIT 1", Long.class);

		jdbc.update("DELETE FROM boards WHERE id = ?", boardId);

		assertThat(count("cards", cardId)).isZero();
		assertThat(jdbc.queryForObject(
				"SELECT count(*) FROM checklist_items WHERE card_id = ?", Integer.class, cardId)).isZero();
	}

	@Test
	void 担当者を消すと_カードは担当者なしになり_カード自体は残る() {
		long userId = insertUser("assignee-test@example.com");
		long assigneeId = jdbc.queryForObject(
				"INSERT INTO assignees (user_id, name, is_self) VALUES (?, '田中さん', FALSE) RETURNING id",
				Long.class, userId);
		long cardId = insertCard("資料を送る", "");
		jdbc.update("UPDATE cards SET assignee_id = ? WHERE id = ?", assigneeId, cardId);

		jdbc.update("DELETE FROM assignees WHERE id = ?", assigneeId);

		assertThat(count("cards", cardId)).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT assignee_id FROM cards WHERE id = ?", Long.class, cardId)).isNull();
	}

	@Test
	void タイトルが空白だけのカードは登録できない() {
		assertThatThrownBy(() -> insertCard("   ", "")).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void 説明が2000文字を超えるカードは登録できない() {
		// 先に「通る」登録をする。PostgreSQL は、エラーが起きるとその後の処理を受け付けないため、エラーになる登録は最後に置く。
		assertThat(insertCard("ちょうど2000文字", "あ".repeat(2000))).isPositive();

		assertThatThrownBy(() -> insertCard("長い説明", "あ".repeat(2001)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void タイトルが100文字を超えるカードは登録できない() {
		assertThatThrownBy(() -> insertCard("あ".repeat(101), "")).isInstanceOf(Exception.class);
	}

	@Test
	void 同じメールアドレスは_大文字小文字が違っても登録できない() {
		insertUser("Same@Example.com");

		assertThatThrownBy(() -> insertUser("same@example.com"))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void 同じ利用者に同じ名前の担当者は登録できない() {
		long userId = insertUser("dup-assignee@example.com");
		jdbc.update("INSERT INTO assignees (user_id, name) VALUES (?, '田中さん')", userId);

		assertThatThrownBy(() -> jdbc.update("INSERT INTO assignees (user_id, name) VALUES (?, '田中さん')", userId))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void 本人の担当者は_利用者ごとに1人だけ() {
		long userId = insertUser("self-test@example.com");
		jdbc.update("INSERT INTO assignees (user_id, name, is_self) VALUES (?, '自分', TRUE)", userId);

		assertThatThrownBy(
				() -> jdbc.update("INSERT INTO assignees (user_id, name, is_self) VALUES (?, '私', TRUE)", userId))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void 存在しないボードを指すリストは登録できない() {
		assertThatThrownBy(() -> jdbc.update(
				"INSERT INTO lists (board_id, name, position) VALUES (-1, '未着手', 1)"))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	// ---- 補助 ----

	private long insertUser(String email) {
		return jdbc.queryForObject(
				"INSERT INTO users (email, password_hash, display_name) VALUES (?, 'dummy-hash', 'テスト太郎') RETURNING id",
				Long.class, email);
	}

	/** 利用者・ボード・リストを作り、そのリストにカードを1枚作って、カードの id を返す。 */
	private long insertCard(String title, String description) {
		long userId = insertUser("user-" + System.nanoTime() + "@example.com");
		long boardId = jdbc.queryForObject(
				"INSERT INTO boards (user_id, name) VALUES (?, 'はじめてのボード') RETURNING id", Long.class, userId);
		long listId = jdbc.queryForObject(
				"INSERT INTO lists (board_id, name, position) VALUES (?, '未着手', 1) RETURNING id",
				Long.class, boardId);
		return jdbc.queryForObject(
				"INSERT INTO cards (list_id, title, description, position) VALUES (?, ?, ?, 1) RETURNING id",
				Long.class, listId, title, description);
	}

	private int count(String table, long id) {
		return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE id = ?", Integer.class, id);
	}

}
