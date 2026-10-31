package com.example.taskmanagement.board;

/**
 * ボードのデータの取り出し口。
 * いまはメモリ上のサンプルを返す(InMemoryBoardRepository)。
 * DB をつなぐ段階で、DB から取り出す実装に差し替える。
 */
public interface BoardRepository {

	Board findBoard();

}
