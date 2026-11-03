package com.example.taskmanagement.board;

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

}
