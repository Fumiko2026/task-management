package com.example.taskmanagement;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** DB 接続の確認用。DB を使う API ができたら消してよい。 */
@RestController
public class DbCheckController {

	private final JdbcTemplate jdbc;

	public DbCheckController(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** GET /api/db-check : DB に SELECT 1 を投げ、つながっていれば ok を返す。 */
	@GetMapping("/api/db-check")
	public String dbCheck() {
		jdbc.queryForObject("SELECT 1", Integer.class);
		return "ok";
	}

}
