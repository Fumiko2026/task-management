package com.example.taskmanagement.board;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * メモリ上のサンプルデータを返す。DB は使わない。
 * 期限は「いま」からの相対で作るので、いつ動かしても、
 * 超過・もうすぐ・通常・完了の4つの状態がそろって見える。
 * アプリの本番では使わない(Spring の部品として登録していない)。DB なしの確認と、テストで使う。
 */
public class InMemoryBoardRepository implements BoardRepository {

	private final Clock clock;

	public InMemoryBoardRepository(Clock clock) {
		this.clock = clock;
	}

	@Override
	public Optional<Board> findBoard() {
		return Optional.of(sampleBoard());
	}

	@Override
	public Optional<Card> findCard(long id) {
		return allCards().filter(card -> card.id() == id).findFirst();
	}

	@Override
	public List<Card> findOpenCardsOrderByDue() {
		return allCards()
				.filter(card -> card.completedAt() == null)
				.sorted(Comparator.comparing(Card::dueAt, Comparator.nullsLast(Comparator.naturalOrder())))
				.toList();
	}

	@Override
	public Optional<ListSummary> findList(long id) {
		return sampleBoard().lists().stream()
				.filter(list -> list.id() == id)
				.map(list -> new ListSummary(list.id(), list.name(), list.doneList(), 1L))
				.findFirst();
	}

	@Override
	public Card createCard(long listId, String title) {
		throw new UnsupportedOperationException("メモリ上のサンプルは、カードの作成に対応していません");
	}

	@Override
	public Optional<CardLocation> findCardLocation(long cardId) {
		throw new UnsupportedOperationException("メモリ上のサンプルは、カードの移動に対応していません");
	}

	@Override
	public void moveCard(long cardId, long targetListId, int position, OffsetDateTime completedAt) {
		throw new UnsupportedOperationException("メモリ上のサンプルは、カードの移動に対応していません");
	}

	@Override
	public void updateDueAt(long cardId, OffsetDateTime dueAt) {
		throw new UnsupportedOperationException("メモリ上のサンプルは、カードの更新に対応していません");
	}

	private Stream<Card> allCards() {
		return sampleBoard().lists().stream().flatMap(list -> list.cards().stream());
	}

	private Board sampleBoard() {
		OffsetDateTime now = OffsetDateTime.now(clock);

		Assignee me = new Assignee(1L, "自分", true);
		Assignee tanaka = new Assignee(2L, "田中さん", false);

		// 超過: 昨日が期限で、手順は5つのうち3つが完了
		Card estimate = new Card(1L, "見積書を作る", "A社向け。先月の条件で作る。", me,
				now.minusDays(1), null,
				List.of(
						new ChecklistItem(1L, "取引先の情報を集める", true),
						new ChecklistItem(2L, "過去の見積書を探す", true),
						new ChecklistItem(3L, "金額を計算する", true),
						new ChecklistItem(4L, "上司に確認する", false),
						new ChecklistItem(5L, "見積書を送る", false)));

		// 担当者なし・期限なし
		Card summary = new Card(2L, "資料をまとめる", "", null, null, null, List.of());

		// もうすぐ: 5時間後が期限
		Card report = new Card(3L, "部長に報告", "", me, now.plusHours(5), null, List.of());

		// 通常: 3日後が期限。依頼先に頼んでいる
		Card send = new Card(4L, "資料を送る", "", tanaka, now.plusDays(3), null, List.of());

		// 完了: 昨日が期限で、その2時間前に完了
		Card contract = new Card(5L, "契約書の確認", "", tanaka,
				now.minusDays(1), now.minusDays(1).minusHours(2), List.of());

		return new Board(1L, "はじめてのボード", List.of(
				new TaskList(1L, "未着手", false, List.of(estimate, summary)),
				new TaskList(2L, "進行中", false, List.of(report, send)),
				new TaskList(3L, "完了", true, List.of(contract))));
	}

}
