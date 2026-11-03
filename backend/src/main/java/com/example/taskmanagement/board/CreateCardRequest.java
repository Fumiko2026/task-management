package com.example.taskmanagement.board;

/**
 * POST /api/cards で受け取る内容。
 * listId はカードを入れるリストの id、title はカードのタイトル。
 * 送られてこなかった項目は null になる(検査は BoardService で行う)。
 */
public record CreateCardRequest(Long listId, String title) {
}
