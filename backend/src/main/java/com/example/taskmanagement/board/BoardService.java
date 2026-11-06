package com.example.taskmanagement.board;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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

	/** 更新できる項目の名前(いまは、期限だけ)。 */
	private static final String FIELD_DUE_AT = "dueAt";

	/** 期限として受け付ける年の範囲(とんでもない日付を、はじく)。 */
	private static final int DUE_MIN_YEAR = 2000;
	private static final int DUE_MAX_YEAR = 2100;

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
		int position = request.position() == null ? Integer.MAX_VALUE : request.position();
		return toCardView(relocate(location, target, position, now), now);
	}

	/**
	 * カードを、完了にする(completed = true)、または未完了に戻す(false)。更新後のカードを返す。
	 *   - 完了にする: 「完了」リストの、いちばん上(position を指定すれば、その位置)へ。完了日時 = いま。
	 *     完了前にいたリストを、覚える。
	 *   - 未完了に戻す: 完了前にいたリストの、最後(position を指定すれば、その位置)へ。完了日時と、完了前のリストの記録を消す。
	 *     完了前のリストが分からない・消えた・「完了」リスト・別のボードのときは、いちばん左の開いたリスト(いまは「未着手」)へ。
	 *   - すでに、その状態なら、何も変えずに、いまのカードを返す(二重のタップに強い)。
	 *   - completed が無い、position が 1 未満、「完了」リストや戻す先が無い → BadRequestException(400)。カードが無い → 404。
	 */
	@Transactional
	public BoardView.CardView completeCard(long cardId, CompleteCardRequest request) {
		if (request.completed() == null) {
			throw new BadRequestException("completed を、true か false で指定してください");
		}
		if (request.position() != null && request.position() < 1) {
			throw new BadRequestException("位置は1以上で指定してください");
		}

		CardLocation location = repository.findCardLocation(cardId)
				.orElseThrow(() -> new NotFoundException("カードが見つかりません(id=" + cardId + ")"));
		OffsetDateTime now = OffsetDateTime.now(clock);

		boolean alreadyDone = location.completedAt() != null;
		if (request.completed() == alreadyDone) {
			Card unchanged = repository.findCard(cardId)
					.orElseThrow(() -> new IllegalStateException("カードが見つかりません(id=" + cardId + ")"));
			return toCardView(unchanged, now);
		}

		if (request.completed()) {
			ListSummary doneList = repository.findDoneList(location.boardId())
					.orElseThrow(() -> new BadRequestException("完了のリストがありません"));
			int position = request.position() == null ? 1 : request.position(); // 完了は、いちばん上に入れる
			return toCardView(relocate(location, doneList, position, now), now);
		}

		ListSummary back = returnTarget(location);
		int position = request.position() == null ? Integer.MAX_VALUE : request.position(); // 戻すときは、最後
		return toCardView(relocate(location, back, position, now), now);
	}

	/** 完了を取り消すときの、戻す先。完了前のリスト。使えなければ、そのボードの、いちばん左の開いたリスト。 */
	private ListSummary returnTarget(CardLocation location) {
		Optional<ListSummary> remembered = Optional.ofNullable(location.completedFromListId())
				.flatMap(repository::findList)
				.filter(list -> !list.doneList() && list.boardId() == location.boardId());
		return remembered
				.or(() -> repository.findFirstOpenList(location.boardId()))
				.orElseThrow(() -> new BadRequestException("戻すリストがありません"));
	}

	/**
	 * カードを、target の position 番目へ動かして、動かしたあとのカードを返す(移動と完了の、共通の中身)。
	 * 「完了」へ入れるとき: 完了日時 = いま(すでに完了していれば、そのまま)。完了前のリスト = いまいたリスト(すでに完了していれば、そのまま)。
	 * 「完了」以外へ動かすとき: 完了日時と、完了前のリストの記録を消す。
	 */
	private Card relocate(CardLocation location, ListSummary target, int position, OffsetDateTime now) {
		OffsetDateTime completedAt = null;
		Long completedFromListId = null;
		if (target.doneList()) {
			boolean alreadyDone = location.completedAt() != null;
			completedAt = alreadyDone ? location.completedAt() : now;
			// 完了の中の並べ替えなら、いまの記録のまま。ほかのリストから入れるなら、いまいたリストを記録する
			boolean stayingInDoneList = target.id() == location.listId();
			if (alreadyDone || stayingInDoneList) {
				completedFromListId = location.completedFromListId(); // null のこともある
			} else {
				completedFromListId = location.listId();
			}
			// Long と long を、? : で混ぜると、null のときに自動変換でエラーになる。そのため、if で分けている
		}
		repository.moveCard(location.cardId(), target.id(), position, completedAt, completedFromListId);
		return repository.findCard(location.cardId())
				.orElseThrow(() -> new IllegalStateException("動かしたカードが見つかりません(id=" + location.cardId() + ")"));
	}

	/**
	 * カードを更新する。送られた項目だけを変える(部分更新)。いま更新できるのは、期限(dueAt)だけ。
	 * dueAt は、時差つきの日時の文字(例: 2026-11-10T18:00:00+09:00)で期限を設定し、null で期限を消す。
	 *   - 本文が空、更新できない項目、日時の形が正しくない、年が範囲外 → BadRequestException(400)
	 *   - カードが無い → NotFoundException(404)
	 * リスト・並び順・完了日時は、変えない(完了済みのカードの期限も、変えられる)。
	 * 更新したあとのカードを返す(期限の状態も、新しい値)。
	 */
	@Transactional
	public BoardView.CardView updateCard(long cardId, Map<String, Object> changes) {
		if (changes == null || changes.isEmpty()) {
			throw new BadRequestException("変更する項目を指定してください");
		}
		for (String field : changes.keySet()) {
			if (!FIELD_DUE_AT.equals(field)) {
				throw new BadRequestException("更新できない項目です: " + field + "(いまは " + FIELD_DUE_AT + " だけ)");
			}
		}
		OffsetDateTime dueAt = parseDueAt(changes.get(FIELD_DUE_AT)); // null は、「期限を消す」

		repository.findCard(cardId)
				.orElseThrow(() -> new NotFoundException("カードが見つかりません(id=" + cardId + ")"));
		repository.updateDueAt(cardId, dueAt);
		Card updated = repository.findCard(cardId)
				.orElseThrow(() -> new IllegalStateException("更新したカードが見つかりません(id=" + cardId + ")"));
		return toCardView(updated, OffsetDateTime.now(clock));
	}

	/**
	 * チェックリストの項目の完了を切り替える(done = true なら完了、false なら未完了)。更新後のカードを返す。
	 *   - すでに、その状態なら、何も変えずに、いまのカードを返す(二重のタップに強い)。
	 *   - 項目の文言・並び順・カードの期限と完了の状態は、変えない(全部の項目を終えても、カードは自動では完了にしない)。
	 *   - done が無い → BadRequestException(400)。項目が無い → NotFoundException(404)。
	 */
	@Transactional
	public BoardView.CardView setChecklistItemDone(long itemId, ChecklistItemRequest request) {
		if (request.done() == null) {
			throw new BadRequestException("done を、true か false で指定してください");
		}
		long cardId = repository.findChecklistItemCardId(itemId)
				.orElseThrow(() -> new NotFoundException("チェックリストの項目が見つかりません(id=" + itemId + ")"));

		repository.updateChecklistItemDone(itemId, request.done());
		Card updated = repository.findCard(cardId)
				.orElseThrow(() -> new IllegalStateException("更新したカードが見つかりません(id=" + cardId + ")"));
		return toCardView(updated, OffsetDateTime.now(clock));
	}

	/**
	 * カードを削除する(物理削除。DB から本当に消える。元に戻せない)。
	 * そのカードのチェックリストも、一緒に消える。同じリストに残ったカードの並び順は、1,2,3… に振り直す。
	 * カードが無ければ NotFoundException(404)。
	 */
	@Transactional
	public void deleteCard(long cardId) {
		repository.findCardLocation(cardId)
				.orElseThrow(() -> new NotFoundException("カードが見つかりません(id=" + cardId + ")"));
		repository.deleteCard(cardId);
	}

	/** 期限の値を読む。null はそのまま(期限を消す)。文字は、時差つきの日時として読む。 */
	private OffsetDateTime parseDueAt(Object value) {
		if (value == null) {
			return null;
		}
		if (!(value instanceof String text)) {
			throw new BadRequestException(FIELD_DUE_AT + " は、日時の文字、または null で指定してください");
		}
		OffsetDateTime parsed;
		try {
			parsed = OffsetDateTime.parse(text.strip());
		} catch (DateTimeParseException e) {
			throw new BadRequestException("期限の日時の形が正しくありません。時差つきで指定してください(例: 2026-11-10T18:00:00+09:00)");
		}
		int year = parsed.atZoneSameInstant(clock.getZone()).getYear();
		if (year < DUE_MIN_YEAR || year > DUE_MAX_YEAR) {
			throw new BadRequestException("期限の日付が範囲外です(" + DUE_MIN_YEAR + "〜" + DUE_MAX_YEAR + "年)");
		}
		return parsed;
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
