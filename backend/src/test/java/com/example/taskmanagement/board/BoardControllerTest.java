package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

/**
 * 取得 API(/api/board, /api/cards/{id}, /api/tasks)の確認。
 * DB に入れたテストデータが、API の応答として返ってくることを確かめる。
 * 特に、日本語が文字化けしない設定になっていることも確かめる。
 * テスト後は元に戻る(@Transactional)ので、DB にデータは残らない。
 */
@SpringBootTest
@Transactional
class BoardControllerTest {

	@Autowired
	private WebApplicationContext context;

	@Autowired
	private JdbcTemplate jdbc;

	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
	}

	@Test
	void ボードの応答はUTF_8と明示され_DBの日本語がそのまま入っている() throws Exception {
		BoardTestData.insert(jdbc);

		MockHttpServletResponse response = mockMvc.perform(get("/api/board")
				// ブラウザが送るのと同じ Accept
				.header(HttpHeaders.ACCEPT, "text/html,application/xhtml+xml,*/*;q=0.8"))
				.andReturn().getResponse();

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		assertThat(response.getContentAsString(StandardCharsets.UTF_8))
				.contains("テストボード", "未着手", "見積書を作る");
	}

	@Test
	void ボードは_リストとカードと期限の状態つきで返る() throws Exception {
		BoardTestData.insert(jdbc);

		mockMvc.perform(get("/api/board"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.lists.length()").value(2))
				.andExpect(jsonPath("$.lists[0].cardCount").value(3))
				.andExpect(jsonPath("$.lists[0].cards[0].title").value("見積書を作る"))
				.andExpect(jsonPath("$.lists[0].cards[0].dueStatus").value("OVERDUE"))
				.andExpect(jsonPath("$.lists[0].cards[0].assignee.name").value("田中さん"))
				.andExpect(jsonPath("$.lists[0].cards[0].checklistDone").value(1))
				.andExpect(jsonPath("$.lists[0].cards[0].checklistTotal").value(2))
				.andExpect(jsonPath("$.lists[0].cards[1].assigneeMissing").value(true))
				.andExpect(jsonPath("$.lists[0].cards[1].dueStatus").value("NONE"))
				.andExpect(jsonPath("$.lists[1].doneList").value(true))
				.andExpect(jsonPath("$.lists[1].cards[0].dueStatus").value("COMPLETED"));
	}

	@Test
	void ボードが無いときは_500ではなく404と理由を返す() throws Exception {
		jdbc.update("DELETE FROM users");

		MockHttpServletResponse response = mockMvc.perform(get("/api/board")).andReturn().getResponse();

		assertThat(response.getStatus()).isEqualTo(404);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("ボードがありません");
	}

	@Test
	void カード1枚の詳細が_チェックリストつきで返る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		mockMvc.perform(get("/api/cards/" + ids.estimateCardId()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.title").value("見積書を作る"))
				.andExpect(jsonPath("$.description").value("A社向け"))
				.andExpect(jsonPath("$.checklist.length()").value(2))
				.andExpect(jsonPath("$.checklist[0].text").value("金額を計算する"))
				.andExpect(jsonPath("$.checklistDone").value(1))
				.andExpect(jsonPath("$.checklistTotal").value(2));
	}

	@Test
	void 存在しないカードは404と理由を返す() throws Exception {
		BoardTestData.insert(jdbc);

		MockHttpServletResponse response = mockMvc.perform(get("/api/cards/999999999")).andReturn().getResponse();

		assertThat(response.getStatus()).isEqualTo(404);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("カードが見つかりません");
	}

	@Test
	void 自分のタスクは_未完了を期限が近い順に_期限なしは最後() throws Exception {
		BoardTestData.insert(jdbc);

		mockMvc.perform(get("/api/tasks"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0].title").value("見積書を作る"))
				.andExpect(jsonPath("$[1].title").value("資料を送る"))
				.andExpect(jsonPath("$[2].title").value("資料をまとめる"));
	}

}
