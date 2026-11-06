package com.example.taskmanagement;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import com.example.taskmanagement.board.BadRequestException;
import com.example.taskmanagement.board.NotFoundException;

/**
 * API のエラーを、すべて同じ形({"message": "日本語の理由"}、UTF-8)で返す。
 * 500(アプリの故障)ではなく、404(見つからない)や 400(送った内容が正しくない)と、理由を返す。
 *
 * Spring が自分で見つけるエラー(405・415・存在しない URL・数字でない ID など)は、
 * 親の ResponseEntityExceptionHandler が受け、handleExceptionInternal で同じ形にそろえる。
 * 想定外の例外は、最後の受け皿(handleUnexpected)が 500 で受ける。内部の事情は、応答には出さず、ログにだけ残す。
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	private static final MediaType JSON_UTF8 = MediaType.parseMediaType("application/json;charset=UTF-8");

	/** データが無いとき(404)。 */
	@ExceptionHandler(NotFoundException.class)
	public ResponseEntity<Map<String, String>> handleNotFound(NotFoundException e) {
		return response(HttpStatus.NOT_FOUND, e.getMessage(), HttpHeaders.EMPTY);
	}

	/** 入力の確認に通らなかったとき(400)。 */
	@ExceptionHandler(BadRequestException.class)
	public ResponseEntity<Map<String, String>> handleBadRequest(BadRequestException e) {
		return response(HttpStatus.BAD_REQUEST, e.getMessage(), HttpHeaders.EMPTY);
	}

	/** 本文が無い、JSON として読めない、数字の欄に文字が入っている、など(400)。 */
	@Override
	protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException e,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		return body(HttpStatus.BAD_REQUEST,
				"送られた内容を読み取れません。JSON の形と、各項目の種類(数字か文字か)を確かめてください(例: {\"listId\": 3, \"title\": \"請求書を送る\"})",
				headers);
	}

	/** URL の中の ID が数字でないとき(例: /api/cards/abc)(400)。 */
	@ExceptionHandler(MethodArgumentTypeMismatchException.class)
	public ResponseEntity<Map<String, String>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
		return response(HttpStatus.BAD_REQUEST, "URL の中の「" + e.getName() + "」は、数字で指定してください", HttpHeaders.EMPTY);
	}

	/** 想定外の例外(500)。内容は応答に出さず、ログにだけ残す。 */
	@ExceptionHandler(Exception.class)
	public ResponseEntity<Map<String, String>> handleUnexpected(Exception e) {
		log.error("想定外のエラーが起きました", e);
		return response(HttpStatus.INTERNAL_SERVER_ERROR,
				"サーバーで問題が起きました。しばらくしてから、もう一度お試しください", HttpHeaders.EMPTY);
	}

	/** Spring が自分で見つけるエラー(405・415・404 など)を、同じ形にそろえる。 */
	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception e, Object ignoredBody, HttpHeaders headers,
			HttpStatusCode status, WebRequest request) {
		return body(status, messageFor(status), headers);
	}

	private static String messageFor(HttpStatusCode status) {
		return switch (status.value()) {
			case 400 -> "送られた内容が正しくありません。内容を確かめてください";
			case 404 -> "指定された場所(URL)が見つかりません";
			case 405 -> "この URL では、その操作(メソッド)は使えません";
			case 406 -> "この URL は、JSON(application/json)でしか返せません";
			case 415 -> "送られた形式に対応していません。JSON(application/json)で送ってください";
			default -> status.is5xxServerError()
					? "サーバーで問題が起きました。しばらくしてから、もう一度お試しください"
					: "リクエストを処理できませんでした";
		};
	}

	private ResponseEntity<Map<String, String>> response(HttpStatusCode status, String message, HttpHeaders headers) {
		return ResponseEntity.status(status).headers(headers).contentType(JSON_UTF8).body(Map.of("message", message));
	}

	@SuppressWarnings("unchecked")
	private ResponseEntity<Object> body(HttpStatusCode status, String message, HttpHeaders headers) {
		return (ResponseEntity<Object>) (ResponseEntity<?>) response(status, message, headers);
	}

}
