package com.example.taskmanagement.board;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.stream.IntStream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** ボードを画面向けの形にして返す。期限の状態の判定もここで行う。 */
@Service
public class BoardService {

	/** 期限まで、この時間以内になったら「もうすぐ」と表示する。 */
	private static final long DUE_SOON_HOURS = 24;

	/** カードのタイトルの長さの上限(要件 NM-06。DB の定義と同じ)。 */
	static final int TITLE_MAX_LENGTH = 100;

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

	/**
	 * カードを新しく作る。入力の確認(NM-06)をしてから登録し、作ったカードを返す。
	 *   - リストの指定が無い、タイトルが空(空白だけを含む)、タイトルが100文字を超える → BadRequestException(400)
	 *   - 指定のリストが無い → NotFoundException(404)
	 *   - 「完了」のリスト → BadRequestException(400)(完了のリストにあるカードは、完了日時が記録されたカードのため)
	 */
	public BoardView.CardView createCard(CreateCardRequest request) {
		if (request.listId() == null) {
			throw new BadRequestException("リストを指定してください");
		}
		String title = request.title() == null ? "" : request.title().strip();
		if (title.isEmpty()) {
			throw new BadRequestException("タイトルを入力してください");
		}
		// 文字数は、DB(char_length)と同じ数え方にする(絵文字などの2つ分の文字も、1文字と数える)
		if (title.codePointCount(0, title.length()) > TITLE_MAX_LENGTH) {
			throw new BadRequestException("タイトルは" + TITLE_MAX_LENGTH + "文字までです");
		}

		ListSummary list = repository.findList(request.listId())
				.orElseThrow(() -> new NotFoundException("リストが見つかりません(id=" + request.listId() + ")"));
		if (list.doneList()) {
			throw new BadRequestException("完了のリストには、カードを追加できません");
		}

		Card created = repository.createCard(list.id(), title);
		return toCardView(created, OffsetDateTime.now(clock));
	}

	/**
	 * カードを、別のリスト(または同じリストの別の位置)へ動かす。動かしたあとのカードを返す。
	 *   - 移し先のリストの指定が無い、位置が 1 未満 → BadRequestException(400)
	 *   - カードやリストが無い → NotFoundException(404)
	 *   - 別のボードのリスト → BadRequestException(400)
	 * 「完了」のリストへ動かしたら、完了日時を記録する(すでに完了していれば、そのまま)。
	 * 「完了」から別のリストへ動かしたら、完了日時を消して、未完了に戻す。
	 */
	@Transactional
	public BoardView.CardView moveCard(long cardId, MoveCardRequest request) {
		if (request.listId() == null) {
			throw new BadRequestException("移し先のリストを指定してください");
		}
		if (request.position() != null && request.position() < 1) {
			throw new BadRequestException("位置は1以上で指定してください");
		}

		CardLocation location = repository.findCardLocation(cardId)
				.orElseThrow(() -> new NotFoundException("カードが見つかりません(id=" + cardId + ")"));
		ListSummary target = repository.findList(request.listId())
				.orElseThrow(() -> new NotFoundException("リストが見つかりません(id=" + request.listId() + ")"));
		if (target.boardId() != location.boardId()) {
			throw new BadRequestException("別のボードのリストには、動かせません");
		}

		OffsetDateTime now = OffsetDateTime.now(clock);
		OffsetDateTime completedAt = target.doneList()
				? (location.completedAt() != null ? location.completedAt() : now)
				: null;
		int position = request.position() == null ? Integer.MAX_VALUE : request.position();

		repository.moveCard(cardId, target.id(), position, completedAt);
		Card moved = repository.findCard(cardId)
				.orElseThrow(() -> new IllegalStateException("動かしたカードが見つかりません(id=" + cardId + ")"));
		return toCardView(moved, now);
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
