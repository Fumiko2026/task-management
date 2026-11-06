package com.example.taskmanagement.board;

/**
 * POST /api/cards/{id}/checklist-items で受け取る内容。
 * text は、手順の文(前後の空白は取り除く。1〜100 文字)。
 * 送られてこなかった項目は null になる(検査は BoardService で行う)。
 */
public record AddChecklistItemRequest(String text) {
}
