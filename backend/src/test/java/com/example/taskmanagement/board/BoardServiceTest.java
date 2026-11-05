package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
	void ボードは3つのリストを持ち_完了は最後() {
		BoardView board = service.getBoard();

		assertThat(board.lists()).extracting(BoardView.ListView::name)
				.containsExactly("未着手", "進行中", "完了");
		assertThat(board.lists()).extracting(BoardView.ListView::position)
				.containsExactly(1, 2, 3);
		assertThat(board.lists().get(2).doneList()).isTrue();
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

	// ---- カードの新規作成の、入力の確認(DB には届かない前に断る) ----
	// サンプルのリスト: 1=未着手 2=進行中 3=完了(完了リスト)

	@Test
	void 新規作成_リストの指定が無いと_400() {
		assertThatThrownBy(() -> service.createCard(new CreateCardRequest(null, "請求書を送る")))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("リストを指定してください");
	}

	@Test
	void 新規作成_タイトルが_null_空_空白だけ_全角空白だけ_だと400() {
		for (String title : new String[] { null, "", "   ", "\u3000\u3000" }) {
			assertThatThrownBy(() -> service.createCard(new CreateCardRequest(1L, title)))
					.as("title=%s", title)
					.isInstanceOf(BadRequestException.class)
					.hasMessage("タイトルを入力してください");
		}
	}

	@Test
	void 新規作成_タイトルが101文字だと400_絵文字は1文字と数える() {
		assertThatThrownBy(() -> service.createCard(new CreateCardRequest(1L, "あ".repeat(101))))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("タイトルは100文字までです");

		// 絵文字は Java の String では2つ分だが、DB と同じく1文字と数える。101個の絵文字は、断られる
		assertThatThrownBy(() -> service.createCard(new CreateCardRequest(1L, "😀".repeat(101))))
				.isInstanceOf(BadRequestException.class);
	}

	@Test
	void 新規作成_リストが無いと404() {
		assertThatThrownBy(() -> service.createCard(new CreateCardRequest(999L, "請求書を送る")))
				.isInstanceOf(NotFoundException.class)
				.hasMessageContaining("リストが見つかりません");
	}

	@Test
	void 新規作成_完了のリストには追加できない() {
		assertThatThrownBy(() -> service.createCard(new CreateCardRequest(3L, "請求書を送る")))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("完了のリストには、カードを追加できません");
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

	// ---- カードの移動の、入力の確認(DB には届かない前に断る) ----

	@Test
	void 移動_移し先のリストの指定が無いと_400() {
		assertThatThrownBy(() -> service.moveCard(1L, new MoveCardRequest(null, 1)))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("移し先のリストを指定してください");
	}

	@Test
	void 移動_位置が1未満だと_400() {
		for (int position : new int[] { 0, -1 }) {
			assertThatThrownBy(() -> service.moveCard(1L, new MoveCardRequest(2L, position)))
					.as("position=%d", position)
					.isInstanceOf(BadRequestException.class)
					.hasMessage("位置は1以上で指定してください");
		}
	}

	// ---- カードの更新の、入力の確認(DB には届かない前に断る) ----

	@Test
	void 更新_本文が空だと_400() {
		assertThatThrownBy(() -> service.updateCard(1L, java.util.Map.of()))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("変更する項目を指定してください");
	}

	@Test
	void 更新_更新できない項目は_400() {
		assertThatThrownBy(() -> service.updateCard(1L, java.util.Map.of("title", "新しいタイトル")))
				.isInstanceOf(BadRequestException.class)
				.hasMessageContaining("更新できない項目です: title");
	}

	@Test
	void 更新_期限が_文字でもnullでもないと_400() {
		assertThatThrownBy(() -> service.updateCard(1L, java.util.Map.of("dueAt", 123)))
				.isInstanceOf(BadRequestException.class)
				.hasMessageContaining("日時の文字、または null");
	}

	@Test
	void 更新_期限の形が正しくない_時差が無い_範囲外は_400() {
		for (String bad : new String[] { "あした", "2026-11-10", "2026-11-10T18:00", "2026-13-40T18:00:00+09:00" }) {
			assertThatThrownBy(() -> service.updateCard(1L, java.util.Map.of("dueAt", bad)))
					.as("dueAt=%s", bad)
					.isInstanceOf(BadRequestException.class)
					.hasMessageContaining("期限の日時の形が正しくありません");
		}
		for (String outOfRange : new String[] { "1999-12-31T23:59:59+09:00", "2101-01-01T00:00:00+09:00" }) {
			assertThatThrownBy(() -> service.updateCard(1L, java.util.Map.of("dueAt", outOfRange)))
					.as("dueAt=%s", outOfRange)
					.isInstanceOf(BadRequestException.class)
					.hasMessageContaining("範囲外");
		}
	}

	@Test
	void 更新_カードが無いと_404() {
		assertThatThrownBy(() -> service.updateCard(999L, java.util.Map.of("dueAt", "2026-11-10T18:00:00+09:00")))
				.isInstanceOf(NotFoundException.class)
				.hasMessageContaining("カードが見つかりません");
	}

	// ---- カードの削除 ----

	@Test
	void 削除_カードが無いと_404() {
		assertThatThrownBy(() -> service.deleteCard(999L))
				.isInstanceOf(NotFoundException.class)
				.hasMessageContaining("カードが見つかりません");
	}

	// ---- 完了・未完了の、入力の確認(DB には届かない前に断る) ----

	@Test
	void 完了_completedが無いと_400() {
		assertThatThrownBy(() -> service.completeCard(1L, new CompleteCardRequest(null, null)))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("completed を、true か false で指定してください");
	}

	@Test
	void 完了_位置が1未満だと_400() {
		for (int position : new int[] { 0, -1 }) {
			assertThatThrownBy(() -> service.completeCard(1L, new CompleteCardRequest(true, position)))
					.as("position=%d", position)
					.isInstanceOf(BadRequestException.class)
					.hasMessage("位置は1以上で指定してください");
		}
	}

	@Test
	void 完了_カードが無いと_404() {
		assertThatThrownBy(() -> service.completeCard(999L, new CompleteCardRequest(true, null)))
				.isInstanceOf(NotFoundException.class)
				.hasMessageContaining("カードが見つかりません");
	}

}
