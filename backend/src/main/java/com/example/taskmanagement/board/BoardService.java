package com.example.taskmanagement.board;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.stream.IntStream;

import org.springframework.stereotype.Service;

/** ボードを画面向けの形にして返す。期限の状態の判定もここで行う。 */
@Service
public class BoardService {

	/** 期限まで、この時間以内になったら「もうすぐ」と表示する。 */
	private static final long DUE_SOON_HOURS = 24;

	private final BoardRepository repository;
	private final Clock clock;

	public BoardService(BoardRepository repository, Clock clock) {
		this.repository = repository;
		this.clock = clock;
	}

	public BoardView getBoard() {
		Board board = repository.findBoard()
				.orElseThrow(() -> new NotFoundException("ボードがありません"));
		OffsetDateTime now = OffsetDateTime.now(clock);

		List<BoardView.ListView> lists = IntStream.range(0, board.lists().size())
				.mapToObj(i -> toListView(board.lists().get(i), i + 1, now))
				.toList();

		return new BoardView(board.id(), board.name(), lists);
	}

	/** カード1枚の詳細。無ければ NotFoundException。 */
	public BoardView.CardView getCard(long id) {
		Card card = repository.findCard(id)
				.orElseThrow(() -> new NotFoundException("カードが見つかりません(id=" + id + ")"));
		return toCardView(card, OffsetDateTime.now(clock));
	}

	/** 自分のタスク。未完了のカードを、期限が近い順に。 */
	public List<BoardView.CardView> getMyTasks() {
		OffsetDateTime now = OffsetDateTime.now(clock);
		return repository.findOpenCardsOrderByDue().stream()
				.map(card -> toCardView(card, now))
				.toList();
	}

	private BoardView.ListView toListView(TaskList list, int position, OffsetDateTime now) {
		List<BoardView.CardView> cards = list.cards().stream()
				.map(card -> toCardView(card, now))
				.toList();
		return new BoardView.ListView(list.id(), list.name(), position, list.doneList(), cards.size(), cards);
	}

	private BoardView.CardView toCardView(Card card, OffsetDateTime now) {
		DueStatus status = dueStatusOf(card, now);
		int done = (int) card.checklist().stream().filter(ChecklistItem::done).count();
		return new BoardView.CardView(
				card.id(),
				card.title(),
				card.description(),
				card.assignee(),
				card.assignee() == null,
				card.dueAt(),
				status,
				status.getIcon(),
				status.getLabel(),
				card.completedAt(),
				done,
				card.checklist().size(),
				card.checklist());
	}

	/**
	 * 期限の状態を決める。上から順に当てはまるものを選ぶ。
	 * 1. 完了済み → 完了
	 * 2. 期限なし → なし
	 * 3. 期限を過ぎた → 超過
	 * 4. 期限まで24時間以内 → もうすぐ
	 * 5. それ以外 → 通常
	 */
	DueStatus dueStatusOf(Card card, OffsetDateTime now) {
		if (card.completedAt() != null) {
			return DueStatus.COMPLETED;
		}
		if (card.dueAt() == null) {
			return DueStatus.NONE;
		}
		if (card.dueAt().isBefore(now)) {
			return DueStatus.OVERDUE;
		}
		if (!card.dueAt().isAfter(now.plusHours(DUE_SOON_HOURS))) {
			return DueStatus.DUE_SOON;
		}
		return DueStatus.NORMAL;
	}

}
