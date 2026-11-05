package com.example.taskmanagement.board;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * ボードのデータの取り出し口。
 * 本番は DB から取り出す(JdbcBoardRepository)。メモリ上のサンプル(InMemoryBoardRepository)は、
 * DB なしで動かす確認用に残してある。
 */
public interface BoardRepository {

	/**
	 * ボード全体(リスト・カード・チェックリスト)。
	 * TODO: ログインを作る段階で、ログインした利用者の user_id で絞る。いまは id が最小のボードを返す。
	 */
	Optional<Board> findBoard();

	/** カード1枚(チェックリストつき)。無ければ空。 */
	Optional<Card> findCard(long id);

	/** 未完了のカードを、期限が近い順に。期限なしは最後。 */
	List<Card> findOpenCardsOrderByDue();

	/** リストの基本情報。無ければ空。 */
	Optional<ListSummary> findList(long id);

	/**
	 * カードを1枚作って、作ったカードを返す。
	 * 担当者は「自分」(持ち主の本人の担当者。いなければ担当者なし)、期限なし、説明は空、
	 * 並び順はそのリストの最後。リストの存在とタイトルの検査は、呼ぶ側(BoardService)で済ませておく。
	 */
	Card createCard(long listId, String title);

	/** カードが、いま、どのリスト・ボードにあるか。無ければ空。 */
	Optional<CardLocation> findCardLocation(long cardId);

	/**
	 * カードを、移し先のリストの position 番目(1 から)に置く。
	 * 移し先のリストと、元のリスト(変わるとき)の並び順は、1,2,3… と振り直す(欠番を作らない)。
	 * position が大きすぎるときは「最後」、1 より小さいときは「最初」に丸める。
	 * completedAt には、移したあとの完了日時を渡す(未完了なら null)。
	 * リストやカードの存在、同じボードかどうかの検査は、呼ぶ側(BoardService)で済ませておく。
	 */
	void moveCard(long cardId, long targetListId, int position, OffsetDateTime completedAt);

	/**
	 * カードの期限を変える。dueAt が null なら、期限を消す。更新日時(updated_at)も更新する。
	 * リスト・並び順・完了日時は、変えない。カードの存在の確認は、呼ぶ側(BoardService)で済ませておく。
	 */
	void updateDueAt(long cardId, OffsetDateTime dueAt);

}
