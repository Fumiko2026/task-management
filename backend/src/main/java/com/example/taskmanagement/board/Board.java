package com.example.taskmanagement.board;

import java.util.List;

/** ボード(プロジェクト単位のカンバン全体)。 */
public record Board(Long id, String name, List<TaskList> lists) {
}
