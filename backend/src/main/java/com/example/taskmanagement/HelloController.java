package com.example.taskmanagement;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 起動の確認用。API を作り込む段階で消してよい。 */
@RestController
public class HelloController {

	/** GET /api/hello : 動いていれば ok を返す。 */
	@GetMapping("/api/hello")
	public String hello() {
		return "ok";
	}

}
