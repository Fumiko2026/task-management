package com.example.taskmanagement.board;

/**
 * PATCH /api/cards/{id}/complete で受け取る内容。
 * completed は、true なら完了にする、false なら未完了に戻す。position は、入れる位置(1 から。省略できる)。
 * 送られてこなかった項目は null になる(検査は BoardService で行う)。
 */
public record CompleteCardRequest(Boolean completed, Integer position) {
}
