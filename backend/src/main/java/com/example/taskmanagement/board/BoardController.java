package com.example.taskmanagement.board;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** ボードの取得 API の入口。 */
@RestController
@RequestMapping("/api")
public class BoardController {

	private final BoardService boardService;

	public BoardController(BoardService boardService) {
		this.boardService = boardService;
	}

	/**
	 * GET /api/board : ボード全体(リストと、その中のカード)を返す。
	 * ブラウザが文字コードを取り違えて文字化けしないよう、UTF-8 であることを明示する。
	 */
	@GetMapping(value = "/board", produces = "application/json;charset=UTF-8")
	public BoardView getBoard() {
		return boardService.getBoard();
	}

}
