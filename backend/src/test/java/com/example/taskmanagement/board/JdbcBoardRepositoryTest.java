package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;

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

}
