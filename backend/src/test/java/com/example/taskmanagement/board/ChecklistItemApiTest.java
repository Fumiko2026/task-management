package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

/**
 * チェックリストの項目の完了の切り替え API(PATCH /api/checklist-items/{id})の確認。
 * テストデータ「見積書を作る」には、項目が2つある(金額を計算する=完了、上司に確認する=未完了)。
 * テスト後は元に戻る(@Transactional)ので、DB にデータは残らない。
 */
@SpringBootTest
@Transactional
class ChecklistItemApiTest {

	@Autowired
	private WebApplicationContext context;

	@Autowired
	private JdbcTemplate jdbc;

	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
	}

	private long itemId(String text) {
		return jdbc.queryForObject("SELECT id FROM checklist_items WHERE text = ?", Long.class, text);
	}

	private boolean isDone(long itemId) {
		return jdbc.queryForObject("SELECT is_done FROM checklist_items WHERE id = ?", Boolean.class, itemId);
	}

	private MockHttpServletResponse patchItem(long itemId, String json) throws Exception {
		return mockMvc.perform(patch("/api/checklist-items/" + itemId)
				.contentType(MediaType.APPLICATION_JSON)
				.content(json))
				.andReturn().getResponse();
	}

	@Test
	void 未完了の項目を完了にすると_200と更新後のカードを返し_DBにも入る() throws Exception {
		BoardTestData.insert(jdbc);
		long item = itemId("上司に確認する");

		MockHttpServletResponse response = patchItem(item, "{\"done\": true}");

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		String body = response.getContentAsString(StandardCharsets.UTF_8);
		assertThat(body).contains("\"title\":\"見積書を作る\"", "\"checklistDone\":2", "\"checklistTotal\":2");
		assertThat(isDone(item)).isTrue();
	}

	@Test
	void 完了の項目を未完了に戻せる() throws Exception {
		BoardTestData.insert(jdbc);
		long item = itemId("金額を計算する");

		MockHttpServletResponse response = patchItem(item, "{\"done\": false}");

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("\"checklistDone\":0", "\"checklistTotal\":2");
		assertThat(isDone(item)).isFalse();
	}

	@Test
	void すでにその状態なら_変えずに200() throws Exception {
		BoardTestData.insert(jdbc);
		long item = itemId("金額を計算する"); // もう完了

		MockHttpServletResponse response = patchItem(item, "{\"done\": true}");

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("\"checklistDone\":1");
		assertThat(isDone(item)).isTrue();
	}

	@Test
	void ボードの応答にも_切り替えた結果が出る_項目の順番は変わらない() throws Exception {
		BoardTestData.insert(jdbc);

		patchItem(itemId("上司に確認する"), "{\"done\": true}");

		mockMvc.perform(get("/api/board"))
				.andExpect(jsonPath("$.lists[0].cards[0].checklistDone").value(2))
				.andExpect(jsonPath("$.lists[0].cards[0].checklist[0].text").value("金額を計算する"))
				.andExpect(jsonPath("$.lists[0].cards[0].checklist[1].text").value("上司に確認する"))
				.andExpect(jsonPath("$.lists[0].cards[0].checklist[1].done").value(true));
	}

	@Test
	void 切り替えても_カードの期限と完了の状態は変わらない() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		Object before = jdbc.queryForObject("SELECT due_at FROM cards WHERE id = ?", Object.class, ids.estimateCardId());

		patchItem(itemId("上司に確認する"), "{\"done\": true}");

		assertThat(jdbc.queryForObject("SELECT due_at FROM cards WHERE id = ?", Object.class, ids.estimateCardId()))
				.isEqualTo(before);
		assertThat(jdbc.queryForObject("SELECT completed_at FROM cards WHERE id = ?", Object.class, ids.estimateCardId()))
				.isNull();
	}

	@Test
	void 本文が正しくないときは_400で理由を返し_何も変えない() throws Exception {
		BoardTestData.insert(jdbc);
		long item = itemId("上司に確認する");

		// {本文, 期待する理由}
		String[][] cases = {
				{ "{}", "done を、true か false で指定してください" },
				{ "{\"done\": null}", "done を、true か false で指定してください" },
				{ "{\"done\": \"はい\"}", "読み取れません" },
				{ "これはJSONではありません", "読み取れません" },
				{ "", "読み取れません" },
		};
		for (String[] c : cases) {
			MockHttpServletResponse response = patchItem(item, c[0]);
			assertThat(response.getStatus()).as(c[0]).isEqualTo(400);
			assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
			assertThat(response.getContentAsString(StandardCharsets.UTF_8)).as(c[0]).contains(c[1]);
		}
		assertThat(isDone(item)).isFalse();
	}

	@Test
	void 項目が無いときは_404() throws Exception {
		BoardTestData.insert(jdbc);

		MockHttpServletResponse response = patchItem(999999999L, "{\"done\": true}");

		assertThat(response.getStatus()).isEqualTo(404);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("チェックリストの項目が見つかりません");
	}

	@Test
	void IDが数字でないときは_400() throws Exception {
		MockHttpServletResponse response = mockMvc.perform(patch("/api/checklist-items/abc")
				.contentType(MediaType.APPLICATION_JSON).content("{\"done\": true}")).andReturn().getResponse();

		assertThat(response.getStatus()).isEqualTo(400);
	}

}
