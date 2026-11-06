package com.example.taskmanagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.example.taskmanagement.board.BoardService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * API のエラーが、どんな原因でも、同じ形({"message": "日本語の理由"}、UTF-8)で返ることの確認。
 * 想定外の例外(500)では、例外の内容(クラス名や内部の文)を返さないことも確かめる。
 */
@SpringBootTest
class ApiErrorShapeTest {

	@Autowired
	private WebApplicationContext context;

	@MockitoBean
	private BoardService boardService;

	private final ObjectMapper objectMapper = new ObjectMapper();

	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
	}

	/** 状態コードと、{"message": …}(UTF-8)の形を確かめ、message の文を返す。 */
	private String assertErrorShape(MockHttpServletResponse response, int expectedStatus) throws Exception {
		assertThat(response.getStatus()).isEqualTo(expectedStatus);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		JsonNode body = objectMapper.readTree(response.getContentAsString(StandardCharsets.UTF_8));
		assertThat(body.propertyNames()).containsExactly("message");
		assertThat(body.get("message").asString()).isNotBlank();
		return body.get("message").asString();
	}

	@Test
	void IDが数字でないときは_400で理由を返す() throws Exception {
		MockHttpServletResponse response = mockMvc.perform(get("/api/cards/abc")).andReturn().getResponse();

		assertThat(assertErrorShape(response, 400)).contains("数字");
	}

	@Test
	void 存在しないURLは_404で理由を返す() throws Exception {
		MockHttpServletResponse response = mockMvc.perform(get("/api/nothing-here")).andReturn().getResponse();

		assertThat(assertErrorShape(response, 404)).contains("見つかりません");
	}

	@Test
	void 許されないメソッドは_405で理由を返す() throws Exception {
		MockHttpServletResponse response = mockMvc.perform(delete("/api/board")).andReturn().getResponse();

		assertThat(assertErrorShape(response, 405)).contains("使えません");
		assertThat(response.getHeader("Allow")).contains("GET"); // どの操作なら使えるか、の手がかりは残す
	}

	@Test
	void 対応しない形式で送ると_415で理由を返す() throws Exception {
		MockHttpServletResponse response = mockMvc
				.perform(post("/api/cards").contentType(MediaType.TEXT_PLAIN).content("title=a"))
				.andReturn().getResponse();

		assertThat(assertErrorShape(response, 415)).contains("JSON");
	}

	@Test
	void 想定外の例外は_500で短い文だけを返し_例外の内容は見せない() throws Exception {
		when(boardService.getBoard()).thenThrow(new IllegalStateException("内部の秘密の事情 jdbc:postgresql://db"));

		MockHttpServletResponse response = mockMvc.perform(get("/api/board")).andReturn().getResponse();

		String message = assertErrorShape(response, 500);
		assertThat(message).doesNotContain("内部の秘密", "IllegalStateException", "jdbc");
	}

}
