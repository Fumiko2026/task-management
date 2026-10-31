package com.example.taskmanagement.board;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.stereotype.Repository;

/**
 * メモリ上のサンプルデータを返す。DB は使わない。
 * 期限は「いま」からの相対で作るので、いつ動かしても、
 * 超過・もうすぐ・通常・完了の4つの状態がそろって見える。
 */
@Repository
public class InMemoryBoardRepository implements BoardRepository {

	private final Clock clock;

	public InMemoryBoardRepository(Clock clock) {
		this.clock = clock;
	}

	@Override
	public Board findBoard() {
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
				new TaskList(3L, "レビュー", false, List.of()),
				new TaskList(4L, "完了", true, List.of(contract))));
	}

}
