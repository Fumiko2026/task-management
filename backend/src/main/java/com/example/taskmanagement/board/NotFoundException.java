package com.example.taskmanagement.board;

/** 探したデータが無かったとき。API では 404 で返す。 */
public class NotFoundException extends RuntimeException {

	public NotFoundException(String message) {
		super(message);
	}

}
