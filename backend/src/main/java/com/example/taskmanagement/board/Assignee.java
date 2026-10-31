package com.example.taskmanagement.board;

/**
 * 担当者。カードの担当者は1名。
 * self が true なら本人、false なら依頼先(自分以外の人の名前)。
 */
public record Assignee(Long id, String name, boolean self) {
}
