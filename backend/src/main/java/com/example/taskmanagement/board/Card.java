package com.example.taskmanagement.board;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * カード(1つのタスク)。
 * assignee、dueAt、completedAt は、未設定のとき null。
 */
public record Card(
		Long id,
		String title,
		String description,
		Assignee assignee,
		OffsetDateTime dueAt,
		OffsetDateTime completedAt,
		List<ChecklistItem> checklist) {
}
