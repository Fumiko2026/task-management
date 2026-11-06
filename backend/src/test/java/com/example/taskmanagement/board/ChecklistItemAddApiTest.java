package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import java.nio.charset.StandardCharsets;
import java.util.List;

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
 * チェックリストの項目を足す API(POST /api/cards/{id}/checklist-items)の確認。
 * テストデータ「見積書を作る」には、項目が2つある(金額を計算する=完了、上司に確認する=未完了)。「資料をまとめる」には無い。
 * テスト後は元に戻る(@Transactional)ので、DB にデータは残らない。
 */
@SpringBootTest
@Transactional
class ChecklistItemAddApiTest {

	@Autowired
	private WebApplicationContext context;

	@Autowired
	private JdbcTemplate jdbc;

	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
	}

	private MockHttpServletResponse addItem(long cardId, String json) throws Exception {
		return mockMvc.perform(post("/api/cards/" + cardId + "/checklist-items")
				.contentType(MediaType.APPLICATION_JSON)
				.content(json))
				.andReturn().getResponse();
	}

	private String text(String value) {
		return "{\"text\": \"" + value + "\"}";
	}

	/** そのカードの項目を、並び順(position)で、「文言:position:完了」の形にして返す。 */
	private List<String> itemsOf(long cardId) {
		return jdbc.query("SELECT text, position, is_done FROM checklist_items WHERE card_id = ? ORDER BY position",
				(rs, n) -> rs.getString("text") + ":" + rs.getInt("position") + ":" + rs.getBoolean("is_done"), cardId);
	}

	@Test
	void 項目を足すと_201と更新後のカードを返し_いちばん最後の未完了として入る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		MockHttpServletResponse response = addItem(ids.estimateCardId(), text("見積書を送る"));

		assertThat(response.getStatus()).isEqualTo(201);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		assertThat(response.getContentAsString(StandardCharsets.UTF_8))
				.contains("\"title\":\"見積書を作る\"", "\"checklistDone\":1", "\"checklistTotal\":3", "見積書を送る");
		assertThat(itemsOf(ids.estimateCardId()))
				.containsExactly("金額を計算する:1:true", "上司に確認する:2:false", "見積書を送る:3:false");
	}

	@Test
	void 項目が無いカードに足すと_1番目になる() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		MockHttpServletResponse response = addItem(ids.noDueCardId(), text("まず資料を集める"));

		assertThat(response.getStatus()).isEqualTo(201);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("\"checklistDone\":0", "\"checklistTotal\":1");
		assertThat(itemsOf(ids.noDueCardId())).containsExactly("まず資料を集める:1:false");
	}

	@Test
	void 前後の空白は全角も取り除いて保存する_中の空白は残す() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		addItem(ids.noDueCardId(), "{\"text\": \"　  上司に　確認する 　\"}");

		assertThat(itemsOf(ids.noDueCardId())).containsExactly("上司に　確認する:1:false");
	}

	@Test
	void 上限の100文字までは足せる_絵文字も1文字と数える() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		assertThat(addItem(ids.noDueCardId(), text("あ".repeat(100))).getStatus()).isEqualTo(201);
		assertThat(addItem(ids.noDueCardId(), text("😀".repeat(100))).getStatus()).isEqualTo(201);
		assertThat(itemsOf(ids.noDueCardId())).hasSize(2);
	}

	@Test
	void ボードの応答にも_足した項目が_順番どおりに出る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		addItem(ids.estimateCardId(), text("見積書を送る"));

		mockMvc.perform(get("/api/board"))
				.andExpect(jsonPath("$.lists[0].cards[0].checklistTotal").value(3))
				.andExpect(jsonPath("$.lists[0].cards[0].checklist[2].text").value("見積書を送る"))
				.andExpect(jsonPath("$.lists[0].cards[0].checklist[2].done").value(false));
	}

	@Test
	void 足しても_カードの期限と完了の状態は変わらない() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		Object before = jdbc.queryForObject("SELECT due_at FROM cards WHERE id = ?", Object.class, ids.doneCardId());

		addItem(ids.doneCardId(), text("あとから足した手順"));

		assertThat(jdbc.queryForObject("SELECT due_at FROM cards WHERE id = ?", Object.class, ids.doneCardId()))
				.isEqualTo(before);
		assertThat(jdbc.queryForObject("SELECT completed_at FROM cards WHERE id = ?", Object.class, ids.doneCardId()))
				.isNotNull(); // 完了のまま
	}

	@Test
	void 入力が正しくないときは_400で理由を返し_何も足さない() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		// {本文, 期待する理由}
		String[][] cases = {
				{ "{}", "項目を入力してください" },
				{ "{\"text\": null}", "項目を入力してください" },
				{ text(""), "項目を入力してください" },
				{ "{\"text\": \"  　 \"}", "項目を入力してください" },
				{ text("あ".repeat(101)), "項目は100文字までです" },
				{ text("😀".repeat(101)), "項目は100文字までです" },
				{ "{\"text\": [1]}", "読み取れません" },
				{ "これはJSONではありません", "読み取れません" },
				{ "", "読み取れません" },
		};
		for (String[] c : cases) {
			MockHttpServletResponse response = addItem(ids.estimateCardId(), c[0]);
			assertThat(response.getStatus()).as(c[0]).isEqualTo(400);
			assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
			assertThat(response.getContentAsString(StandardCharsets.UTF_8)).as(c[0]).contains(c[1]);
		}
		assertThat(itemsOf(ids.estimateCardId())).hasSize(2);
	}

	@Test
	void カードが無いときは_404() throws Exception {
		BoardTestData.insert(jdbc);

		MockHttpServletResponse response = addItem(999999999L, text("見積書を送る"));

		assertThat(response.getStatus()).isEqualTo(404);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("カードが見つかりません");
	}

}
