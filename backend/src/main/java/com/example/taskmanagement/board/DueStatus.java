package com.example.taskmanagement.board;

/**
 * カードの期限の状態。
 * 画面では、色だけに頼らず、アイコンと文字でも状態を示す(要件 N-11)。
 */
public enum DueStatus {

	NONE("", ""),
	NORMAL("🕒", "通常"),
	DUE_SOON("⏰", "もうすぐ"),
	OVERDUE("❗", "超過"),
	COMPLETED("✔", "完了");

	private final String icon;
	private final String label;

	DueStatus(String icon, String label) {
		this.icon = icon;
		this.label = label;
	}

	public String getIcon() {
		return icon;
	}

	public String getLabel() {
		return label;
	}

}
