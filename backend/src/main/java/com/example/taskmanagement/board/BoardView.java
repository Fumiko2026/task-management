package com.example.taskmanagement.board;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 画面に返すボードの形。
 * 元のデータに、期限の状態やチェックリストの進み具合など、画面で使う値を足してある。
 */
public record BoardView(Long id, String name, List<ListView> lists) {

	public record ListView(
			Long id,
			String name,
			int position,
			boolean doneList,
			int cardCount,
			List<CardView> cards) {
	}

	public record CardView(
			Long id,
			String title,
			String description,
			Assignee assignee,
			boolean assigneeMissing,
			OffsetDateTime dueAt,
			DueStatus dueStatus,
			String dueIcon,
			String dueLabel,
			OffsetDateTime completedAt,
			int checklistDone,
			int checklistTotal,
			List<ChecklistItem> checklist) {
	}

}
