package com.example.taskmanagement.board;

/**
 * PATCH /api/cards/{id}/move で受け取る内容。
 * listId は移し先のリストの id、position は移し先で何番目に置くか(1 から。省略すると、最後)。
 * 送られてこなかった項目は null になる(検査は BoardService で行う)。
 */
public record MoveCardRequest(Long listId, Integer position) {
}
