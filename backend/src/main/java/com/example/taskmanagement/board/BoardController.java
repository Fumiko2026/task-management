package com.example.taskmanagement.board;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * ボード・カード・タスクの取得 API の入口。
 * ブラウザが文字コードを取り違えて文字化けしないよう、どの応答も UTF-8 であることを明示する。
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

	/** データが無いときは、500(アプリの故障)ではなく、404(見つからない)と理由を返す。 */
	@ExceptionHandler(NotFoundException.class)
	public ResponseEntity<Map<String, String>> handleNotFound(NotFoundException e) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND)
				.contentType(MediaType.parseMediaType(JSON_UTF8))
				.body(Map.of("message", e.getMessage()));
	}

}
