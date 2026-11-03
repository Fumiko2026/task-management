package com.example.taskmanagement.board;

/** 送られた内容が正しくないとき(入力の確認に通らないとき)。API では 400 で返す。 */
public class BadRequestException extends RuntimeException {

	public BadRequestException(String message) {
		super(message);
	}

}
