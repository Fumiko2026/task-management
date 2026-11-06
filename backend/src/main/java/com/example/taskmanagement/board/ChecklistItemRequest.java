package com.example.taskmanagement.board;

/**
 * PATCH /api/checklist-items/{id} で受け取る内容。
 * done は、true なら完了にする、false なら未完了に戻す。
 * 送られてこなかった項目は null になる(検査は BoardService で行う)。
 */
public record ChecklistItemRequest(Boolean done) {
}
