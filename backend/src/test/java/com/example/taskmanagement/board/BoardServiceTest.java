package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.example.taskmanagement.board.BoardView.CardView;

/** BoardService の確認。Spring は起動せず、時計を固定して確かめる。 */
class BoardServiceTest {

	private static final ZoneId JST = ZoneId.of("Asia/Tokyo");

	// 2026-10-31 10:00(日本時間)に固定
	private final Clock clock = Clock.fixed(Instant.parse("2026-10-31T01:00:00Z"), JST);
	private final OffsetDateTime now = OffsetDateTime.now(clock);
	private final BoardService service = new BoardService(new InMemoryBoardRepository(clock), clock);

	@Test
	void ボードは4つのリストを持つ() {
		BoardView board = service.getBoard();

		assertThat(board.lists()).extracting(BoardView.ListView::name)
				.containsExactly("未着手", "進行中", "レビュー", "完了");
		assertThat(board.lists()).extracting(BoardView.ListView::position)
				.containsExactly(1, 2, 3, 4);
		assertThat(board.lists().get(3).doneList()).isTrue();
	}

	@Test
	void サンプルのカードは4つの期限の状態がそろう() {
		BoardView board = service.getBoard();

		assertThat(card(board, "見積書を作る").dueStatus()).isEqualTo(DueStatus.OVERDUE);
		assertThat(card(board, "部長に報告").dueStatus()).isEqualTo(DueStatus.DUE_SOON);
		assertThat(card(board, "資料を送る").dueStatus()).isEqualTo(DueStatus.NORMAL);
		assertThat(card(board, "契約書の確認").dueStatus()).isEqualTo(DueStatus.COMPLETED);
		assertThat(card(board, "資料をまとめる").dueStatus()).isEqualTo(DueStatus.NONE);
	}

	@Test
	void 期限の状態はアイコンと文字でも返す() {
		CardView overdue = card(service.getBoard(), "見積書を作る");

		assertThat(overdue.dueIcon()).isEqualTo("❗");
		assertThat(overdue.dueLabel()).isEqualTo("超過");
	}

	@Test
	void チェックリストの進み具合を数える() {
		CardView card = card(service.getBoard(), "見積書を作る");

		assertThat(card.checklistDone()).isEqualTo(3);
		assertThat(card.checklistTotal()).isEqualTo(5);
	}

	@Test
	void 担当者がないカードは警告用の印が付く() {
		BoardView board = service.getBoard();

		assertThat(card(board, "資料をまとめる").assigneeMissing()).isTrue();
		assertThat(card(board, "見積書を作る").assigneeMissing()).isFalse();
	}

	@Test
	void 期限ちょうど24時間後は_もうすぐ() {
		assertThat(service.dueStatusOf(cardDue(now.plusHours(24), null), now))
				.isEqualTo(DueStatus.DUE_SOON);
	}

	@Test
	void 期限が24時間と1分後は_通常() {
		assertThat(service.dueStatusOf(cardDue(now.plusHours(24).plusMinutes(1), null), now))
				.isEqualTo(DueStatus.NORMAL);
	}

	@Test
	void 期限ちょうどの時刻は_もうすぐ_で_1分過ぎると_超過() {
		assertThat(service.dueStatusOf(cardDue(now, null), now)).isEqualTo(DueStatus.DUE_SOON);
		assertThat(service.dueStatusOf(cardDue(now.minusMinutes(1), null), now)).isEqualTo(DueStatus.OVERDUE);
	}

	@Test
	void 完了済みなら期限を過ぎていても_完了() {
		assertThat(service.dueStatusOf(cardDue(now.minusDays(3), now.minusDays(1)), now))
				.isEqualTo(DueStatus.COMPLETED);
	}

	private CardView card(BoardView board, String title) {
		return board.lists().stream()
				.flatMap(list -> list.cards().stream())
				.filter(card -> card.title().equals(title))
				.findFirst()
				.orElseThrow(() -> new AssertionError("カードが見つかりません: " + title));
	}

	private Card cardDue(OffsetDateTime dueAt, OffsetDateTime completedAt) {
		return new Card(99L, "テスト用", "", null, dueAt, completedAt, List.of());
	}

}
