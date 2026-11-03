package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

/**
 * 取得 API(/api/board, /api/cards/{id}, /api/tasks)と、カード作成 API(POST /api/cards)の確認。
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

	// ---- POST /api/cards : カードの新規作成 ----

	@Test
	void カードを作ると_201と作ったカードを返し_Locationに取得先が入る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		MockHttpServletResponse response = postCard("{\"listId\": " + ids.todoListId() + ", \"title\": \"請求書を送る\"}");

		assertThat(response.getStatus()).isEqualTo(201);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		assertThat(response.getHeader("Location")).matches("/api/cards/\\d+");
		mockMvc.perform(get(response.getHeader("Location")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.title").value("請求書を送る"));
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("請求書を送る");
	}

	@Test
	void 作ったカードは_説明が空_期限なし_未完了_チェックリストなし() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		mockMvc.perform(postRequest("{\"listId\": " + ids.todoListId() + ", \"title\": \"請求書を送る\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNumber())
				.andExpect(jsonPath("$.description").value(""))
				.andExpect(jsonPath("$.dueAt").doesNotExist())
				.andExpect(jsonPath("$.dueStatus").value("NONE"))
				.andExpect(jsonPath("$.completedAt").doesNotExist())
				.andExpect(jsonPath("$.checklistTotal").value(0));
	}

	@Test
	void 担当者は_持ち主の_自分_になる() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		BoardTestData.insertSelfAssignee(jdbc, ids.userId());

		mockMvc.perform(postRequest("{\"listId\": " + ids.todoListId() + ", \"title\": \"請求書を送る\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.assignee.name").value("自分"))
				.andExpect(jsonPath("$.assignee.self").value(true))
				.andExpect(jsonPath("$.assigneeMissing").value(false));
	}

	@Test
	void 作ったカードは_ボードのそのリストの最後に増え_件数も増える() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		postCard("{\"listId\": " + ids.todoListId() + ", \"title\": \"請求書を送る\"}");

		mockMvc.perform(get("/api/board"))
				.andExpect(jsonPath("$.lists[0].cardCount").value(4))
				.andExpect(jsonPath("$.lists[0].cards[3].title").value("請求書を送る"))
				.andExpect(jsonPath("$.lists[1].cardCount").value(1));
	}

	@Test
	void 続けて作ると_作った順に並ぶ() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		postCard("{\"listId\": " + ids.todoListId() + ", \"title\": \"1つ目\"}");
		postCard("{\"listId\": " + ids.todoListId() + ", \"title\": \"2つ目\"}");

		mockMvc.perform(get("/api/board"))
				.andExpect(jsonPath("$.lists[0].cards[3].title").value("1つ目"))
				.andExpect(jsonPath("$.lists[0].cards[4].title").value("2つ目"));
	}

	@Test
	void タイトルの前後の空白は_全角も含めて取り除いて保存する() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		mockMvc.perform(postRequest("{\"listId\": " + ids.todoListId() + ", \"title\": \"  \\u3000請求書を送る\\u3000 \"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.title").value("請求書を送る"));
	}

	@Test
	void タイトルは100文字ちょうどなら作れる_絵文字100個も作れる() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		assertThat(postCard("{\"listId\": " + ids.todoListId() + ", \"title\": \"" + "あ".repeat(100) + "\"}").getStatus())
				.isEqualTo(201);
		assertThat(postCard("{\"listId\": " + ids.todoListId() + ", \"title\": \"" + "😀".repeat(100) + "\"}").getStatus())
				.isEqualTo(201);
	}

	@Test
	void タイトルが正しくないときは_400と日本語の理由を返し_カードは増えない() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		int before = countCards();
		String list = "\"listId\": " + ids.todoListId();

		// {本文, 期待する理由}
		String[][] cases = {
				{ "{" + list + ", \"title\": \"\"}", "タイトルを入力してください" },
				{ "{" + list + ", \"title\": \"   \"}", "タイトルを入力してください" },
				{ "{" + list + ", \"title\": \"\\u3000\\u3000\"}", "タイトルを入力してください" },
				{ "{" + list + ", \"title\": null}", "タイトルを入力してください" },
				{ "{" + list + "}", "タイトルを入力してください" },
				{ "{" + list + ", \"title\": \"" + "あ".repeat(101) + "\"}", "タイトルは100文字までです" },
				{ "{\"title\": \"請求書を送る\"}", "リストを指定してください" },
		};
		for (String[] c : cases) {
			MockHttpServletResponse response = postCard(c[0]);
			assertThat(response.getStatus()).as(c[0]).isEqualTo(400);
			assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
			assertThat(response.getContentAsString(StandardCharsets.UTF_8)).as(c[0]).contains(c[1]);
		}
		assertThat(countCards()).isEqualTo(before);
	}

	@Test
	void 本文が読めないときは_500ではなく400を返す() throws Exception {
		BoardTestData.insert(jdbc);

		String[] bodies = { "", "これはJSONではありません", "{\"listId\": \"abc\", \"title\": \"a\"}", "[1, 2]" };
		for (String body : bodies) {
			MockHttpServletResponse response = postCard(body);
			assertThat(response.getStatus()).as("body=%s", body).isEqualTo(400);
			assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("読み取れません");
		}
	}

	@Test
	void 存在しないリストには_404を返す() throws Exception {
		BoardTestData.insert(jdbc);

		MockHttpServletResponse response = postCard("{\"listId\": 999999999, \"title\": \"請求書を送る\"}");

		assertThat(response.getStatus()).isEqualTo(404);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("リストが見つかりません");
	}

	@Test
	void 完了のリストには_追加できず_400を返す() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		int before = countCards();

		MockHttpServletResponse response = postCard("{\"listId\": " + ids.doneListId() + ", \"title\": \"請求書を送る\"}");

		assertThat(response.getStatus()).isEqualTo(400);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("完了のリストには、カードを追加できません");
		assertThat(countCards()).isEqualTo(before);
	}

	@Test
	void 作ったカードは_DBに保存される() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		int before = countCards();

		postCard("{\"listId\": " + ids.todoListId() + ", \"title\": \"請求書を送る\"}");

		assertThat(countCards()).isEqualTo(before + 1);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM cards WHERE title = '請求書を送る' AND list_id = ?",
				Integer.class, ids.todoListId())).isEqualTo(1);
	}

	// ---- 補助 ----

	private MockHttpServletRequestBuilder postRequest(String json) {
		return post("/api/cards").contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(json);
	}

	private MockHttpServletResponse postCard(String json) throws Exception {
		return mockMvc.perform(postRequest(json)).andReturn().getResponse();
	}

	private int countCards() {
		return jdbc.queryForObject("SELECT count(*) FROM cards", Integer.class);
	}

}
