package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** GET /api/board の応答の確認。特に、日本語が文字化けしない設定になっていることを確かめる。 */
@SpringBootTest
class BoardControllerTest {

	@Autowired
	private WebApplicationContext context;

	@Test
	void ボードの応答はUTF_8と明示され_日本語がそのまま入っている() throws Exception {
		MockMvc mockMvc = MockMvcBuilders.webAppContextSetup(context).build();

		MockHttpServletResponse response = mockMvc.perform(get("/api/board")
				// ブラウザが送るのと同じ Accept
				.header(HttpHeaders.ACCEPT, "text/html,application/xhtml+xml,*/*;q=0.8"))
				.andReturn().getResponse();

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		assertThat(response.getContentAsString(StandardCharsets.UTF_8))
				.contains("はじめてのボード", "未着手", "見積書を作る");
	}

}
