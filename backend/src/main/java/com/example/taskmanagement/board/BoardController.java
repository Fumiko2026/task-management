package com.example.taskmanagement.board;

import java.net.URI;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * ボード・カード・タスクの API の入口。
 * ブラウザが文字コードを取り違えて文字化けしないよう、どの応答も UTF-8 であることを明示する。
 * エラー(404 / 400)の返し方は、ApiExceptionHandler にまとめてある。
 */
@RestController
@RequestMapping("/api")
public class BoardController {

	private static final String JSON_UTF8 = "application/json;charset=UTF-8";

	private final BoardService boardService;

	public BoardController(BoardService boardService) {
		this.boardService = boardService;
	}

	/** GET /api/board : ボード全体(リストと、その中のカード)を返す。 */
	@GetMapping(value = "/board", produces = JSON_UTF8)
	public BoardView getBoard() {
		return boardService.getBoard();
	}

	/** GET /api/cards/{id} : カード1枚の詳細(チェックリストつき)。無ければ 404。 */
	@GetMapping(value = "/cards/{id}", produces = JSON_UTF8)
	public BoardView.CardView getCard(@PathVariable long id) {
		return boardService.getCard(id);
	}

	/** GET /api/tasks : 自分のタスク。未完了のカードを、期限が近い順に。 */
	@GetMapping(value = "/tasks", produces = JSON_UTF8)
	public List<BoardView.CardView> getMyTasks() {
		return boardService.getMyTasks();
	}

	/**
	 * POST /api/cards : カードを新しく作る。本文は {"listId": 1, "title": "請求書を送る"}。
	 * 作れたら 201(Created)と、作ったカードを返す。Location に、そのカードの取得先を入れる。
	 * 入力が正しくなければ 400、リストが無ければ 404(どちらも理由つき)。
	 */
	@PostMapping(value = "/cards", produces = JSON_UTF8)
	public ResponseEntity<BoardView.CardView> createCard(@RequestBody CreateCardRequest request) {
		BoardView.CardView created = boardService.createCard(request);
		return ResponseEntity.created(URI.create("/api/cards/" + created.id())).body(created);
	}

	/**
	 * PATCH /api/cards/{id} : カードを更新する(部分更新。送った項目だけを変える)。
	 * いま更新できるのは、期限だけ。本文は {"dueAt": "2026-11-10T18:00:00+09:00"}(期限を設定)か、
	 * {"dueAt": null}(期限を消す)。項目が無いことと null(消す)ことを区別するため、Map で受ける。
	 * 更新できたら 200 と、更新後のカード(期限の状態も新しい値)を返す。
	 * 入力が正しくなければ 400、カードが無ければ 404(どちらも理由つき)。
	 */
	@PatchMapping(value = "/cards/{id}", produces = JSON_UTF8)
	public BoardView.CardView updateCard(@PathVariable long id, @RequestBody Map<String, Object> changes) {
		return boardService.updateCard(id, changes);
	}

	/**
	 * PATCH /api/cards/{id}/move : カードを動かす。本文は {"listId": 2, "position": 1}。
	 * position は、移し先で何番目に置くか(1 から。省略すると、最後)。
	 * 動かせたら 200 と、動かしたあとのカード(完了日時・期限の状態も新しい値)を返す。
	 * 「完了」のリストへ動かしたら完了になり、そこから出したら未完了に戻る。
	 */
	@PatchMapping(value = "/cards/{id}/move", produces = JSON_UTF8)
	public BoardView.CardView moveCard(@PathVariable long id, @RequestBody MoveCardRequest request) {
		return boardService.moveCard(id, request);
	}

}
