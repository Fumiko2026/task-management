package com.example.taskmanagement.board;

/** チェックリストの項目(準備の手順の1つ)。 */
public record ChecklistItem(Long id, String text, boolean done) {
}
