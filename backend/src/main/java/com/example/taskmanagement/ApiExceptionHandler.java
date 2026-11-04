package com.example.taskmanagement;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.example.taskmanagement.board.BadRequestException;
import com.example.taskmanagement.board.NotFoundException;

/**
 * API のエラーを、すべて同じ形({"message": "日本語の理由"}、UTF-8)で返す。
 * 500(アプリの故障)ではなく、404(見つからない)や 400(送った内容が正しくない)と、理由を返す。
 */
@RestControllerAdvice
public class ApiExceptionHandler {

	private static final MediaType JSON_UTF8 = MediaType.parseMediaType("application/json;charset=UTF-8");

	/** データが無いとき(404)。 */
	@ExceptionHandler(NotFoundException.class)
	public ResponseEntity<Map<String, String>> handleNotFound(NotFoundException e) {
		return response(HttpStatus.NOT_FOUND, e.getMessage());
	}

	/** 入力の確認に通らなかったとき(400)。 */
	@ExceptionHandler(BadRequestException.class)
	public ResponseEntity<Map<String, String>> handleBadRequest(BadRequestException e) {
		return response(HttpStatus.BAD_REQUEST, e.getMessage());
	}

	/** 本文が無い、JSON として読めない、数字の欄に文字が入っている、など(400)。 */
	@ExceptionHandler(HttpMessageNotReadableException.class)
	public ResponseEntity<Map<String, String>> handleUnreadable(HttpMessageNotReadableException e) {
		return response(HttpStatus.BAD_REQUEST,
				"送られた内容を読み取れません。JSON の形と、各項目の種類(数字か文字か)を確かめてください(例: {\"listId\": 3, \"title\": \"請求書を送る\"})");
	}

	private ResponseEntity<Map<String, String>> response(HttpStatus status, String message) {
		return ResponseEntity.status(status).contentType(JSON_UTF8).body(Map.of("message", message));
	}

}
