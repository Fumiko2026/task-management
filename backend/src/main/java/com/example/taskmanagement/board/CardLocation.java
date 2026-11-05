package com.example.taskmanagement.board;

import java.time.OffsetDateTime;

/**
 * カードが、いま、どのリスト(どのボード)にあるか。
 * completedAt は、未完了のとき null。completedFromListId は、完了する前にいたリスト(完了していないときと、不明なときは null)。
 */
public record CardLocation(long cardId, long listId, long boardId, OffsetDateTime completedAt, Long completedFromListId) {
}
