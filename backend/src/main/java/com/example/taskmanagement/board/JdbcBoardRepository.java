package com.example.taskmanagement.board;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * PostgreSQL からボードのデータを取り出す。
 * カードとチェックリストは、1件ずつ取りに行かず、まとめて取ってからメモリで振り分ける
 * (カードが増えても、DB への問い合わせの回数が増えないようにするため)。
 */
@Repository
public class JdbcBoardRepository implements BoardRepository {

	private final JdbcTemplate jdbc;
	private final Clock clock;

	public JdbcBoardRepository(JdbcTemplate jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Override
	public Optional<Board> findBoard() {
		// TODO: ログインを作る段階で、user_id で絞る。いまは id が最小のボード。
		List<Map<String, Object>> boards = jdbc.queryForList("SELECT id, name FROM boards ORDER BY id LIMIT 1");
		if (boards.isEmpty()) {
			return Optional.empty();
		}
		long boardId = ((Number) boards.get(0).get("id")).longValue();
		String boardName = (String) boards.get(0).get("name");

		// リストを並び順に。カードは入れ物(空のリスト)を作ってから、後で振り分ける。
		Map<Long, ListHeader> headers = new LinkedHashMap<>();
		jdbc.query("SELECT id, name, is_done_list FROM lists WHERE board_id = ? ORDER BY position",
				(ResultSet rs) -> {
					headers.put(rs.getLong("id"), new ListHeader(rs.getString("name"), rs.getBoolean("is_done_list")));
				}, boardId);

		List<CardRow> cardRows = queryCards("l.board_id = ?", "c.list_id, c.position", boardId);
		Map<Long, List<Card>> cardsByList = new LinkedHashMap<>();
		for (CardRow row : cardRows) {
			cardsByList.computeIfAbsent(row.listId(), id -> new ArrayList<>()).add(row.card());
		}

		List<TaskList> lists = new ArrayList<>();
		headers.forEach((listId, header) -> lists.add(
				new TaskList(listId, header.name(), header.doneList(), cardsByList.getOrDefault(listId, List.of()))));

		return Optional.of(new Board(boardId, boardName, lists));
	}

	@Override
	public Optional<Card> findCard(long id) {
		return queryCards("c.id = ?", "c.id", id).stream().map(CardRow::card).findFirst();
	}

	@Override
	public List<Card> findOpenCardsOrderByDue() {
		// 期限が近い順。期限なし(NULL)は最後。同じ期限なら id の順。
		return queryCards("c.completed_at IS NULL", "c.due_at ASC NULLS LAST, c.id").stream()
				.map(CardRow::card)
				.toList();
	}

	@Override
	public Optional<ListSummary> findList(long id) {
		return jdbc.query("SELECT id, name, is_done_list, board_id FROM lists WHERE id = ?",
				(rs, rowNum) -> new ListSummary(rs.getLong("id"), rs.getString("name"), rs.getBoolean("is_done_list"),
						rs.getLong("board_id")),
				id).stream().findFirst();
	}

	@Override
	public Card createCard(long listId, String title) {
		// 1 回の INSERT で、担当者(持ち主の「自分」)と、並び順(そのリストの最後)も決める。
		// 「自分」がいなければ、assignee_id は NULL(担当者なし)になる。
		long id = jdbc.queryForObject("""
				INSERT INTO cards (list_id, assignee_id, title, description, position)
				VALUES (
				    ?,
				    (SELECT a.id
				       FROM lists l
				       JOIN boards b ON b.id = l.board_id
				       JOIN assignees a ON a.user_id = b.user_id AND a.is_self
				      WHERE l.id = ?),
				    ?,
				    '',
				    (SELECT COALESCE(MAX(position), 0) + 1 FROM cards WHERE list_id = ?))
				RETURNING id
				""", Long.class, listId, listId, title, listId);
		return findCard(id).orElseThrow();
	}

	@Override
	public Optional<CardLocation> findCardLocation(long cardId) {
		return jdbc.query("""
				SELECT c.id, c.list_id, l.board_id, c.completed_at
				  FROM cards c
				  JOIN lists l ON l.id = c.list_id
				 WHERE c.id = ?
				""",
				(rs, rowNum) -> new CardLocation(rs.getLong("id"), rs.getLong("list_id"), rs.getLong("board_id"),
						toJst(rs.getObject("completed_at", OffsetDateTime.class))),
				cardId).stream().findFirst();
	}

	@Override
	public void moveCard(long cardId, long targetListId, int position, OffsetDateTime completedAt) {
		long sourceListId = jdbc.queryForObject("SELECT list_id FROM cards WHERE id = ?", Long.class, cardId);

		// 1. カード自身を、移し先のリストに移す(完了日時もここで更新する)
		jdbc.update("UPDATE cards SET list_id = ?, completed_at = ?, updated_at = now() WHERE id = ?",
				targetListId, completedAt, cardId);

		// 2. 移し先のカードの並び(動かすカードを除く)に、指定の位置で差し込んで、1,2,3… と振り直す
		List<Long> target = new ArrayList<>(jdbc.queryForList(
				"SELECT id FROM cards WHERE list_id = ? AND id <> ? ORDER BY position, id", Long.class,
				targetListId, cardId));
		int index = Math.min(Math.max(position, 1), target.size() + 1) - 1;
		target.add(index, cardId);
		renumber(target);

		// 3. 元のリストが変わったときは、残ったカードも振り直す(欠番を作らない)
		if (sourceListId != targetListId) {
			renumber(jdbc.queryForList("SELECT id FROM cards WHERE list_id = ? ORDER BY position, id", Long.class,
					sourceListId));
		}
	}

	@Override
	public void updateDueAt(long cardId, OffsetDateTime dueAt) {
		jdbc.update("UPDATE cards SET due_at = ?, updated_at = now() WHERE id = ?", dueAt, cardId);
	}

	@Override
	public void deleteCard(long cardId) {
		List<Long> lists = jdbc.queryForList("SELECT list_id FROM cards WHERE id = ?", Long.class, cardId);
		if (lists.isEmpty()) {
			return; // もう無い
		}
		long listId = lists.get(0);

		// チェックリストの項目は、cards への参照が ON DELETE CASCADE なので、一緒に消える
		jdbc.update("DELETE FROM cards WHERE id = ?", cardId);

		// 残ったカードを、1,2,3… と振り直す(欠番を作らない)
		renumber(jdbc.queryForList("SELECT id FROM cards WHERE list_id = ? ORDER BY position, id", Long.class, listId));
	}

	/** カードの id の並びどおりに、position を 1,2,3… と振り直す。 */
	private void renumber(List<Long> cardIdsInOrder) {
		jdbc.batchUpdate("UPDATE cards SET position = ? WHERE id = ?", cardIdsInOrder, cardIdsInOrder.size(),
				(ps, cardId) -> {
					ps.setInt(1, cardIdsInOrder.indexOf(cardId) + 1);
					ps.setLong(2, cardId);
				});
	}

	// ---- 内部 ----

	private record ListHeader(String name, boolean doneList) {
	}

	/** カードと、それが入っているリストの id。 */
	private record CardRow(long listId, Card card) {
	}

	/** チェックリストを付ける前のカード。 */
	private record RawCard(long id, long listId, String title, String description, Assignee assignee,
			OffsetDateTime dueAt, OffsetDateTime completedAt) {
	}

	/**
	 * 条件(where)と並び順(orderBy)に合うカードを、担当者・チェックリストつきで取る。
	 * where と orderBy は、このクラスの中で決めた固定の文字だけを渡す(利用者の入力は入れない)。
	 * 利用者の入力は、必ず args(? に入る値)で渡す。
	 */
	private List<CardRow> queryCards(String where, String orderBy, Object... args) {
		String sql = """
				SELECT c.id, c.list_id, c.title, c.description, c.due_at, c.completed_at,
				       a.id AS assignee_id, a.name AS assignee_name, a.is_self
				FROM cards c
				JOIN lists l ON l.id = c.list_id
				LEFT JOIN assignees a ON a.id = c.assignee_id
				WHERE %s
				ORDER BY %s
				""".formatted(where, orderBy);
		List<RawCard> raws = jdbc.query(sql, (rs, rowNum) -> toRawCard(rs), args);
		if (raws.isEmpty()) {
			return List.of();
		}

		Map<Long, List<ChecklistItem>> checklists = queryChecklists(raws.stream().map(RawCard::id).toList());
		return raws.stream()
				.map(raw -> new CardRow(raw.listId(), new Card(
						raw.id(), raw.title(), raw.description(), raw.assignee(),
						raw.dueAt(), raw.completedAt(), checklists.getOrDefault(raw.id(), List.of()))))
				.toList();
	}

	private RawCard toRawCard(ResultSet rs) throws SQLException {
		long assigneeId = rs.getLong("assignee_id");
		Assignee assignee = rs.wasNull() ? null
				: new Assignee(assigneeId, rs.getString("assignee_name"), rs.getBoolean("is_self"));
		return new RawCard(rs.getLong("id"), rs.getLong("list_id"), rs.getString("title"),
				rs.getString("description"), assignee,
				toJst(rs.getObject("due_at", OffsetDateTime.class)),
				toJst(rs.getObject("completed_at", OffsetDateTime.class)));
	}

	/** 指定したカードのチェックリストを、カードごとにまとめて取る。 */
	private Map<Long, List<ChecklistItem>> queryChecklists(List<Long> cardIds) {
		Map<Long, List<ChecklistItem>> result = new LinkedHashMap<>();
		jdbc.query(con -> {
			var ps = con.prepareStatement(
					"SELECT id, card_id, text, is_done FROM checklist_items WHERE card_id = ANY (?) ORDER BY card_id, position");
			ps.setArray(1, con.createArrayOf("bigint", cardIds.toArray()));
			return ps;
		}, (ResultSet rs) -> {
			result.computeIfAbsent(rs.getLong("card_id"), id -> new ArrayList<>())
					.add(new ChecklistItem(rs.getLong("id"), rs.getString("text"), rs.getBoolean("is_done")));
		});
		return result;
	}

	/** DB からは UTC で戻ってくるので、日本時間(アプリの時計の時刻帯)にそろえる(要件 NM-10)。 */
	private OffsetDateTime toJst(OffsetDateTime value) {
		return value == null ? null : value.atZoneSameInstant(clock.getZone()).toOffsetDateTime();
	}

}
