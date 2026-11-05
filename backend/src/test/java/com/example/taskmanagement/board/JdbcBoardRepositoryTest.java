package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * DB から取り出す部分(JdbcBoardRepository)の確認。実際の DB につないで確かめる。
 * テストの前に DB を起動し、環境変数 DB_PASSWORD を設定しておくこと(README を参照)。
 * テスト後は元に戻る(@Transactional)ので、DB にデータは残らない。
 */
@SpringBootTest
@Transactional
class JdbcBoardRepositoryTest {

	@Autowired
	private JdbcBoardRepository repository;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void ボードが1つも無いときは_空を返す() {
		jdbc.update("DELETE FROM users");

		assertThat(repository.findBoard()).isEmpty();
	}

	@Test
	void ボードをリストとカードごと_並び順どおりに取り出せる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		Board board = repository.findBoard().orElseThrow();

		assertThat(board.id()).isEqualTo(ids.boardId());
		assertThat(board.name()).isEqualTo("テストボード");
		assertThat(board.lists()).extracting(TaskList::name).containsExactly("未着手", "完了");
		assertThat(board.lists()).extracting(TaskList::doneList).containsExactly(false, true);
		assertThat(board.lists().get(0).cards()).extracting(Card::title)
				.containsExactly("見積書を作る", "資料をまとめる", "資料を送る");
		assertThat(board.lists().get(1).cards()).extracting(Card::title).containsExactly("契約書の確認");
	}

	@Test
	void カードの担当者と期限と完了が_そのまま取れる() {
		BoardTestData.insert(jdbc);

		List<Card> todo = repository.findBoard().orElseThrow().lists().get(0).cards();
		Card estimate = todo.get(0);
		Card noDue = todo.get(1);

		assertThat(estimate.assignee()).isNotNull();
		assertThat(estimate.assignee().name()).isEqualTo("田中さん");
		assertThat(estimate.assignee().self()).isFalse();
		assertThat(estimate.dueAt()).isNotNull();
		assertThat(estimate.completedAt()).isNull();
		assertThat(noDue.assignee()).isNull();
		assertThat(noDue.dueAt()).isNull();
	}

	@Test
	void 日時は日本時間で取れる() {
		BoardTestData.insert(jdbc);

		Card estimate = repository.findBoard().orElseThrow().lists().get(0).cards().get(0);

		assertThat(estimate.dueAt().getOffset()).isEqualTo(ZoneOffset.ofHours(9));
	}

	@Test
	void カード1枚を_チェックリストの並び順どおりに取り出せる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		Card card = repository.findCard(ids.estimateCardId()).orElseThrow();

		assertThat(card.title()).isEqualTo("見積書を作る");
		assertThat(card.description()).isEqualTo("A社向け");
		assertThat(card.checklist()).extracting(ChecklistItem::text).containsExactly("金額を計算する", "上司に確認する");
		assertThat(card.checklist()).extracting(ChecklistItem::done).containsExactly(true, false);
	}

	@Test
	void 存在しないカードは_空を返す() {
		BoardTestData.insert(jdbc);

		assertThat(repository.findCard(-1)).isEmpty();
	}

	@Test
	void 自分のタスクは_未完了だけを期限が近い順に_期限なしは最後() {
		BoardTestData.insert(jdbc);

		List<Card> tasks = repository.findOpenCardsOrderByDue();

		// 完了の「契約書の確認」は入らない
		assertThat(tasks).extracting(Card::title).containsExactly("見積書を作る", "資料を送る", "資料をまとめる");
	}

	// ---- カードの新規作成 ----

	@Test
	void リストの基本情報を取り出せる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		assertThat(repository.findList(ids.todoListId())).contains(new ListSummary(ids.todoListId(), "未着手", false, ids.boardId()));
		assertThat(repository.findList(ids.doneListId()).orElseThrow().doneList()).isTrue();
		assertThat(repository.findList(-1)).isEmpty();
	}

	@Test
	void カードを作ると_リストの最後に入り_説明は空_期限と完了は無し() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		Card created = repository.createCard(ids.todoListId(), "請求書を送る");

		assertThat(created.title()).isEqualTo("請求書を送る");
		assertThat(created.description()).isEmpty();
		assertThat(created.dueAt()).isNull();
		assertThat(created.completedAt()).isNull();
		assertThat(created.checklist()).isEmpty();
		// 未着手には3枚(position 1〜3)あるので、4番目になる
		assertThat(jdbc.queryForObject("SELECT position FROM cards WHERE id = ?", Integer.class, created.id()))
				.isEqualTo(4);
		assertThat(repository.findBoard().orElseThrow().lists().get(0).cards()).extracting(Card::title)
				.containsExactly("見積書を作る", "資料をまとめる", "資料を送る", "請求書を送る");
	}

	@Test
	void 空のリストに作ると_並び順は1() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		long emptyListId = jdbc.queryForObject(
				"INSERT INTO lists (board_id, name, position) VALUES (?, '進行中', 3) RETURNING id",
				Long.class, ids.boardId());

		Card created = repository.createCard(emptyListId, "最初のカード");

		assertThat(jdbc.queryForObject("SELECT position FROM cards WHERE id = ?", Integer.class, created.id()))
				.isEqualTo(1);
	}

	@Test
	void 持ち主に_自分_の担当者がいれば_担当者は自分になる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		BoardTestData.insertSelfAssignee(jdbc, ids.userId());

		Card created = repository.createCard(ids.todoListId(), "請求書を送る");

		assertThat(created.assignee()).isNotNull();
		assertThat(created.assignee().name()).isEqualTo("自分");
		assertThat(created.assignee().self()).isTrue();
	}

	@Test
	void 持ち主に_自分_の担当者がいなければ_担当者なし() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc); // 田中さん(依頼先)だけで、「自分」はいない

		Card created = repository.createCard(ids.todoListId(), "請求書を送る");

		assertThat(created.assignee()).isNull();
	}

	@Test
	void 日本語と絵文字のタイトルが_そのまま保存される() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		Card created = repository.createCard(ids.todoListId(), "部長に報告します😀");

		assertThat(repository.findCard(created.id()).orElseThrow().title()).isEqualTo("部長に報告します😀");
	}

	// ---- カードの移動 ----

	private List<String> titles(long listId) {
		return jdbc.queryForList("SELECT title FROM cards WHERE list_id = ? ORDER BY position", String.class, listId);
	}

	private List<Integer> positions(long listId) {
		return jdbc.queryForList("SELECT position FROM cards WHERE list_id = ? ORDER BY position", Integer.class, listId);
	}

	@Test
	void カードの場所を取り出せる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		CardLocation todo = repository.findCardLocation(ids.estimateCardId()).orElseThrow();
		CardLocation done = repository.findCardLocation(ids.doneCardId()).orElseThrow();

		assertThat(todo.listId()).isEqualTo(ids.todoListId());
		assertThat(todo.boardId()).isEqualTo(ids.boardId());
		assertThat(todo.completedAt()).isNull();
		assertThat(done.listId()).isEqualTo(ids.doneListId());
		assertThat(done.completedAt()).isNotNull();
		assertThat(repository.findCardLocation(-1)).isEmpty();
	}

	@Test
	void 同じリストの中で_先頭へ動かせる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		repository.moveCard(ids.laterCardId(), ids.todoListId(), 1, null, null);

		assertThat(titles(ids.todoListId())).containsExactly("資料を送る", "見積書を作る", "資料をまとめる");
		assertThat(positions(ids.todoListId())).containsExactly(1, 2, 3);
	}

	@Test
	void 同じリストの中で_真ん中と最後へ動かせる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		repository.moveCard(ids.estimateCardId(), ids.todoListId(), 2, null, null);
		assertThat(titles(ids.todoListId())).containsExactly("資料をまとめる", "見積書を作る", "資料を送る");

		repository.moveCard(ids.estimateCardId(), ids.todoListId(), 3, null, null);
		assertThat(titles(ids.todoListId())).containsExactly("資料をまとめる", "資料を送る", "見積書を作る");
		assertThat(positions(ids.todoListId())).containsExactly(1, 2, 3);
	}

	@Test
	void 位置が大きすぎれば最後に_1より小さければ最初に丸める() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		repository.moveCard(ids.estimateCardId(), ids.todoListId(), 99, null, null);
		assertThat(titles(ids.todoListId())).containsExactly("資料をまとめる", "資料を送る", "見積書を作る");

		repository.moveCard(ids.estimateCardId(), ids.todoListId(), 0, null, null);
		assertThat(titles(ids.todoListId())).containsExactly("見積書を作る", "資料をまとめる", "資料を送る");
		assertThat(positions(ids.todoListId())).containsExactly(1, 2, 3);
	}

	@Test
	void 別のリストへ動かすと_両方のリストの並び順が連番になる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		OffsetDateTime completedAt = OffsetDateTime.now();

		// 未着手の2番目を、完了の先頭へ
		repository.moveCard(ids.noDueCardId(), ids.doneListId(), 1, completedAt, ids.todoListId());

		assertThat(titles(ids.doneListId())).containsExactly("資料をまとめる", "契約書の確認");
		assertThat(positions(ids.doneListId())).containsExactly(1, 2);
		assertThat(titles(ids.todoListId())).containsExactly("見積書を作る", "資料を送る");
		assertThat(positions(ids.todoListId())).containsExactly(1, 2); // 欠番(2)ができない
		assertThat(repository.findCard(ids.noDueCardId()).orElseThrow().completedAt()).isNotNull();
	}

	@Test
	void 空のリストにも動かせる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		long emptyListId = jdbc.queryForObject(
				"INSERT INTO lists (board_id, name, position) VALUES (?, '進行中', 3) RETURNING id",
				Long.class, ids.boardId());

		repository.moveCard(ids.laterCardId(), emptyListId, 1, null, null);

		assertThat(titles(emptyListId)).containsExactly("資料を送る");
		assertThat(positions(emptyListId)).containsExactly(1);
		assertThat(positions(ids.todoListId())).containsExactly(1, 2);
	}

	@Test
	void 完了から出すと_完了日時が消えて未完了に戻る() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		repository.moveCard(ids.doneCardId(), ids.todoListId(), 2, null, null);

		assertThat(titles(ids.todoListId())).containsExactly("見積書を作る", "契約書の確認", "資料をまとめる", "資料を送る");
		assertThat(positions(ids.todoListId())).containsExactly(1, 2, 3, 4);
		assertThat(titles(ids.doneListId())).isEmpty();
		assertThat(repository.findCard(ids.doneCardId()).orElseThrow().completedAt()).isNull();
	}

	// ---- カードの期限の更新 ----

	@Test
	void 期限を設定でき_消せる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		OffsetDateTime due = OffsetDateTime.now().plusDays(5).truncatedTo(ChronoUnit.MILLIS);

		repository.updateDueAt(ids.noDueCardId(), due); // 期限なしのカードに、設定する
		repository.updateDueAt(ids.estimateCardId(), null); // 期限のあるカードを、消す

		assertThat(repository.findCard(ids.noDueCardId()).orElseThrow().dueAt().toInstant()).isEqualTo(due.toInstant());
		assertThat(repository.findCard(ids.estimateCardId()).orElseThrow().dueAt()).isNull();
	}

	@Test
	void 期限を変えても_リスト_並び順_完了日時_ほかのカードは変わらない() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		OffsetDateTime laterDue = repository.findCard(ids.laterCardId()).orElseThrow().dueAt();
		OffsetDateTime completedAt = repository.findCard(ids.doneCardId()).orElseThrow().completedAt();

		repository.updateDueAt(ids.doneCardId(), OffsetDateTime.now().plusDays(9)); // 完了済みのカードの期限を変える

		assertThat(titles(ids.todoListId())).containsExactly("見積書を作る", "資料をまとめる", "資料を送る");
		assertThat(titles(ids.doneListId())).containsExactly("契約書の確認");
		assertThat(repository.findCard(ids.doneCardId()).orElseThrow().completedAt()).isEqualTo(completedAt);
		assertThat(repository.findCard(ids.laterCardId()).orElseThrow().dueAt()).isEqualTo(laterDue);
	}

	// ---- カードの削除 ----

	@Test
	void カードを消すと_行もチェックリストも消え_残ったカードの並び順が連番になる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		// 見積書を作る(未着手の1番目)には、チェックリストが2つある
		assertThat(jdbc.queryForObject("SELECT count(*) FROM checklist_items WHERE card_id = ?", Integer.class,
				ids.estimateCardId())).isEqualTo(2);

		repository.deleteCard(ids.estimateCardId());

		assertThat(jdbc.queryForObject("SELECT count(*) FROM cards WHERE id = ?", Integer.class, ids.estimateCardId()))
				.isZero();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM checklist_items WHERE card_id = ?", Integer.class,
				ids.estimateCardId())).isZero(); // チェックリストも消えた
		assertThat(titles(ids.todoListId())).containsExactly("資料をまとめる", "資料を送る");
		assertThat(positions(ids.todoListId())).containsExactly(1, 2); // 欠番(1)ができない
	}

	@Test
	void 真ん中のカードを消しても_順番は保たれ連番になる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		repository.deleteCard(ids.noDueCardId());

		assertThat(titles(ids.todoListId())).containsExactly("見積書を作る", "資料を送る");
		assertThat(positions(ids.todoListId())).containsExactly(1, 2);
	}

	@Test
	void 消したのは1枚だけで_ほかのリストやカードは変わらない() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		int cardsBefore = jdbc.queryForObject("SELECT count(*) FROM cards", Integer.class);

		repository.deleteCard(ids.laterCardId());

		assertThat(jdbc.queryForObject("SELECT count(*) FROM cards", Integer.class)).isEqualTo(cardsBefore - 1);
		assertThat(titles(ids.doneListId())).containsExactly("契約書の確認");
		assertThat(positions(ids.doneListId())).containsExactly(1);
		assertThat(repository.findCard(ids.estimateCardId())).isPresent();
	}

	@Test
	void リストに1枚だけのカードを消すと_リストは空になる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		repository.deleteCard(ids.doneCardId());

		assertThat(titles(ids.doneListId())).isEmpty();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM lists WHERE id = ?", Integer.class, ids.doneListId()))
				.isEqualTo(1); // リストは残る
	}

	@Test
	void 無いカードを消そうとしても_何も起きない() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		repository.deleteCard(-1);

		assertThat(titles(ids.todoListId())).hasSize(3);
	}

	// ---- 完了前のリスト(completed_from_list_id)と、完了・開いたリストの検索 ----

	private Long completedFrom(long cardId) {
		return jdbc.queryForObject("SELECT completed_from_list_id FROM cards WHERE id = ?", Long.class, cardId);
	}

	@Test
	void 完了前のリストを保存でき_完了から出すときに消せる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		repository.moveCard(ids.noDueCardId(), ids.doneListId(), 1, OffsetDateTime.now(), ids.todoListId());
		assertThat(completedFrom(ids.noDueCardId())).isEqualTo(ids.todoListId());
		assertThat(repository.findCardLocation(ids.noDueCardId()).orElseThrow().completedFromListId())
				.isEqualTo(ids.todoListId());

		repository.moveCard(ids.noDueCardId(), ids.todoListId(), 1, null, null);
		assertThat(completedFrom(ids.noDueCardId())).isNull();
	}

	@Test
	void 完了前のリストを消すと_カードは残り_記録だけがNULLになる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		long otherListId = jdbc.queryForObject(
				"INSERT INTO lists (board_id, name, position) VALUES (?, '進行中', 3) RETURNING id", Long.class, ids.boardId());
		repository.moveCard(ids.laterCardId(), ids.doneListId(), 1, OffsetDateTime.now(), otherListId);
		assertThat(completedFrom(ids.laterCardId())).isEqualTo(otherListId);

		jdbc.update("DELETE FROM lists WHERE id = ?", otherListId);

		assertThat(repository.findCard(ids.laterCardId())).isPresent(); // カードは、完了リストにいるので、残る
		assertThat(completedFrom(ids.laterCardId())).isNull();
	}

	@Test
	void 完了リストと_いちばん左の開いたリストを探せる() {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		assertThat(repository.findDoneList(ids.boardId()).orElseThrow().id()).isEqualTo(ids.doneListId());
		assertThat(repository.findFirstOpenList(ids.boardId()).orElseThrow().id()).isEqualTo(ids.todoListId());
		assertThat(repository.findDoneList(-1)).isEmpty();
		assertThat(repository.findFirstOpenList(-1)).isEmpty();
	}

}
