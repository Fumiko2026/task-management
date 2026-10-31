package com.example.taskmanagement.board;

import java.util.List;

/**
 * リスト(ボードの中の列。例: 未着手、進行中)。
 * doneList が true のリストへ移したカードは、完了として扱う。
 */
public record TaskList(Long id, String name, boolean doneList, List<Card> cards) {
}
