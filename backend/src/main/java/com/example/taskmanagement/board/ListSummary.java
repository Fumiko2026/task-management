package com.example.taskmanagement.board;

/** リストの基本情報(カードを入れる・動かす前の確認に使う)。boardId は、リストが入っているボード。 */
public record ListSummary(long id, String name, boolean doneList, long boardId) {
}
