package com.example.taskmanagement.board;

/** リストの基本情報(カードを入れる前の確認に使う)。 */
public record ListSummary(long id, String name, boolean doneList) {
}
