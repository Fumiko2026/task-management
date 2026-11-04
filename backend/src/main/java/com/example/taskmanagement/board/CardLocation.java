package com.example.taskmanagement.board;

import java.time.OffsetDateTime;

/** カードが、いま、どのリスト(どのボード)にあるか。completedAt は、未完了のとき null。 */
public record CardLocation(long cardId, long listId, long boardId, OffsetDateTime completedAt) {
}
