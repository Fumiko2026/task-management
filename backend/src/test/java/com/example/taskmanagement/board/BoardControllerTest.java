package com.example.taskmanagement.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

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

	// ---- PATCH /api/cards/{id}/move : カードの移動 ----

	private MockHttpServletResponse moveCard(long cardId, String json) throws Exception {
		return mockMvc.perform(patch("/api/cards/" + cardId + "/move")
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(json))
				.andReturn().getResponse();
	}

	private String move(long listId, Integer position) {
		return position == null ? "{\"listId\": " + listId + "}" : "{\"listId\": " + listId + ", \"position\": " + position + "}";
	}

	@Test
	void 同じリストの中で動かすと_200と動かしたカードを返し_ボードの順序が変わる() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		MockHttpServletResponse response = moveCard(ids.laterCardId(), move(ids.todoListId(), 1));

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("資料を送る");
		mockMvc.perform(get("/api/board"))
				.andExpect(jsonPath("$.lists[0].cards[0].title").value("資料を送る"))
				.andExpect(jsonPath("$.lists[0].cards[1].title").value("見積書を作る"))
				.andExpect(jsonPath("$.lists[0].cards[2].title").value("資料をまとめる"));
	}

	@Test
	void 位置を省略すると最後に_大きすぎる位置も最後に丸める() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		assertThat(moveCard(ids.estimateCardId(), move(ids.todoListId(), null)).getStatus()).isEqualTo(200);
		mockMvc.perform(get("/api/board")).andExpect(jsonPath("$.lists[0].cards[2].title").value("見積書を作る"));

		assertThat(moveCard(ids.noDueCardId(), move(ids.todoListId(), 999)).getStatus()).isEqualTo(200);
		mockMvc.perform(get("/api/board")).andExpect(jsonPath("$.lists[0].cards[2].title").value("資料をまとめる"));
	}

	@Test
	void 完了のリストへ動かすと_完了日時が入り_完了になる() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		mockMvc.perform(patch("/api/cards/" + ids.noDueCardId() + "/move")
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(move(ids.doneListId(), 1)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.title").value("資料をまとめる"))
				.andExpect(jsonPath("$.completedAt").isNotEmpty())
				.andExpect(jsonPath("$.dueStatus").value("COMPLETED"));

		mockMvc.perform(get("/api/board"))
				.andExpect(jsonPath("$.lists[0].cardCount").value(2))
				.andExpect(jsonPath("$.lists[1].cardCount").value(2))
				.andExpect(jsonPath("$.lists[1].cards[0].title").value("資料をまとめる"))
				.andExpect(jsonPath("$.lists[1].cards[1].title").value("契約書の確認"));
	}

	@Test
	void 完了のリストの中で並べ替えても_完了日時は変わらない() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		// 完了にもう1枚入れて、完了の中で並べ替える
		moveCard(ids.noDueCardId(), move(ids.doneListId(), 2));
		String before = mockMvc.perform(get("/api/cards/" + ids.doneCardId())).andReturn().getResponse()
				.getContentAsString(StandardCharsets.UTF_8);

		MockHttpServletResponse response = moveCard(ids.doneCardId(), move(ids.doneListId(), 2));

		assertThat(response.getStatus()).isEqualTo(200);
		String completedBefore = com.jayway.jsonpath.JsonPath.read(before, "$.completedAt");
		String completedAfter = com.jayway.jsonpath.JsonPath.read(response.getContentAsString(StandardCharsets.UTF_8), "$.completedAt");
		assertThat(completedAfter).isEqualTo(completedBefore);
	}

	@Test
	void 完了から出すと_完了日時が消えて_期限の状態に戻る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		mockMvc.perform(patch("/api/cards/" + ids.doneCardId() + "/move")
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(move(ids.todoListId(), 1)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.completedAt").doesNotExist())
				.andExpect(jsonPath("$.dueStatus").value("OVERDUE")); // 期限は昨日。完了が消えたので、超過に戻る

		mockMvc.perform(get("/api/board"))
				.andExpect(jsonPath("$.lists[1].cardCount").value(0))
				.andExpect(jsonPath("$.lists[0].cards[0].title").value("契約書の確認"));
	}

	@Test
	void 動かしたあとの並び順は_どのリストも連番になる() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		moveCard(ids.noDueCardId(), move(ids.doneListId(), 1));
		moveCard(ids.estimateCardId(), move(ids.doneListId(), 2));

		assertThat(jdbc.queryForList("SELECT position FROM cards WHERE list_id = ? ORDER BY position", Integer.class,
				ids.todoListId())).containsExactly(1);
		assertThat(jdbc.queryForList("SELECT position FROM cards WHERE list_id = ? ORDER BY position", Integer.class,
				ids.doneListId())).containsExactly(1, 2, 3);
	}

	@Test
	void 存在しないカード_存在しないリストは_404() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		MockHttpServletResponse noCard = moveCard(999999999L, move(ids.todoListId(), 1));
		MockHttpServletResponse noList = moveCard(ids.laterCardId(), move(999999999L, 1));

		assertThat(noCard.getStatus()).isEqualTo(404);
		assertThat(noCard.getContentAsString(StandardCharsets.UTF_8)).contains("カードが見つかりません");
		assertThat(noList.getStatus()).isEqualTo(404);
		assertThat(noList.getContentAsString(StandardCharsets.UTF_8)).contains("リストが見つかりません");
	}

	@Test
	void 別のボードのリストへは動かせず_400() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		long otherBoardId = jdbc.queryForObject(
				"INSERT INTO boards (user_id, name) VALUES (?, '別のボード') RETURNING id", Long.class, ids.userId());
		long otherListId = jdbc.queryForObject(
				"INSERT INTO lists (board_id, name, position) VALUES (?, '未着手', 1) RETURNING id", Long.class, otherBoardId);

		MockHttpServletResponse response = moveCard(ids.laterCardId(), move(otherListId, 1));

		assertThat(response.getStatus()).isEqualTo(400);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("別のボードのリストには、動かせません");
		assertThat(jdbc.queryForObject("SELECT list_id FROM cards WHERE id = ?", Long.class, ids.laterCardId()))
				.isEqualTo(ids.todoListId()); // 動いていない
	}

	@Test
	void 移動の入力が正しくないときは_400と日本語の理由を返す() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		// {本文, 期待する理由}
		String[][] cases = {
				{ move(ids.todoListId(), 0), "位置は1以上で指定してください" },
				{ move(ids.todoListId(), -3), "位置は1以上で指定してください" },
				{ "{\"position\": 1}", "移し先のリストを指定してください" },
				{ "{}", "移し先のリストを指定してください" },
				{ "これはJSONではありません", "読み取れません" },
				{ "{\"listId\": \"abc\"}", "読み取れません" },
				{ "", "読み取れません" },
		};
		for (String[] c : cases) {
			MockHttpServletResponse response = moveCard(ids.laterCardId(), c[0]);
			assertThat(response.getStatus()).as(c[0]).isEqualTo(400);
			assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
			assertThat(response.getContentAsString(StandardCharsets.UTF_8)).as(c[0]).contains(c[1]);
		}
		assertThat(titlesOf(ids.todoListId())).containsExactly("見積書を作る", "資料をまとめる", "資料を送る"); // 動いていない
	}

	private java.util.List<String> titlesOf(long listId) {
		return jdbc.queryForList("SELECT title FROM cards WHERE list_id = ? ORDER BY position", String.class, listId);
	}

	// ---- PATCH /api/cards/{id} : カードの期限の更新 ----

	private MockHttpServletResponse patchCard(long cardId, String json) throws Exception {
		return mockMvc.perform(patch("/api/cards/" + cardId)
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(json))
				.andReturn().getResponse();
	}

	/** 日本時間の「いま + 何時間後」を、時差つきの文字にする。 */
	private String jstInHours(long hours) {
		return OffsetDateTime.now(ZoneOffset.ofHours(9)).plusHours(hours).withNano(0).toString();
	}

	private String due(String iso) {
		return "{\"dueAt\": \"" + iso + "\"}";
	}

	@Test
	void 期限を設定すると_200と更新後のカードを返し_日本時間で返る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		mockMvc.perform(patch("/api/cards/" + ids.noDueCardId())
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(due(jstInHours(24 * 3))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.title").value("資料をまとめる"))
				.andExpect(jsonPath("$.dueAt").value(org.hamcrest.Matchers.endsWith("+09:00")))
				.andExpect(jsonPath("$.dueStatus").value("NORMAL"));
	}

	@Test
	void 期限の状態は_期限しだいで_通常_もうすぐ_超過になる() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		mockMvc.perform(patch("/api/cards/" + ids.noDueCardId())
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(due(jstInHours(5))))
				.andExpect(jsonPath("$.dueStatus").value("DUE_SOON"));
		mockMvc.perform(patch("/api/cards/" + ids.noDueCardId())
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(due(jstInHours(-5))))
				.andExpect(jsonPath("$.dueStatus").value("OVERDUE"));
	}

	@Test
	void Z付きの日時も_日本時間の時差にそろえて返す() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		mockMvc.perform(patch("/api/cards/" + ids.noDueCardId())
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(due("2030-12-01T09:00:00Z")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.dueAt").value("2030-12-01T18:00:00+09:00"));
	}

	@Test
	void nullを送ると_期限が消える() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		mockMvc.perform(patch("/api/cards/" + ids.estimateCardId())
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content("{\"dueAt\": null}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.dueAt").doesNotExist())
				.andExpect(jsonPath("$.dueStatus").value("NONE"));
		assertThat(jdbc.queryForObject("SELECT due_at FROM cards WHERE id = ?", java.sql.Timestamp.class, ids.estimateCardId()))
				.isNull();
	}

	@Test
	void 完了済みのカードの期限も変えられ_完了のまま_完了日時は変わらない() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		String before = mockMvc.perform(get("/api/cards/" + ids.doneCardId())).andReturn().getResponse()
				.getContentAsString(StandardCharsets.UTF_8);

		MockHttpServletResponse response = patchCard(ids.doneCardId(), due("2030-12-01T09:00:00Z"));

		assertThat(response.getStatus()).isEqualTo(200);
		String body = response.getContentAsString(StandardCharsets.UTF_8);
		assertThat((String) com.jayway.jsonpath.JsonPath.read(body, "$.dueStatus")).isEqualTo("COMPLETED");
		assertThat((String) com.jayway.jsonpath.JsonPath.read(body, "$.dueAt")).isEqualTo("2030-12-01T18:00:00+09:00");
		assertThat((String) com.jayway.jsonpath.JsonPath.read(body, "$.completedAt"))
				.isEqualTo(com.jayway.jsonpath.JsonPath.read(before, "$.completedAt"));
	}

	@Test
	void 期限を変えても_リストと並び順は変わらず_ボードに反映され_DBに保存される() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		patchCard(ids.laterCardId(), due("2030-12-01T09:00:00Z"));

		mockMvc.perform(get("/api/board"))
				.andExpect(jsonPath("$.lists[0].cards[0].title").value("見積書を作る"))
				.andExpect(jsonPath("$.lists[0].cards[1].title").value("資料をまとめる"))
				.andExpect(jsonPath("$.lists[0].cards[2].title").value("資料を送る"))
				.andExpect(jsonPath("$.lists[0].cards[2].dueAt").value("2030-12-01T18:00:00+09:00"))
				.andExpect(jsonPath("$.lists[1].cards[0].title").value("契約書の確認"));
		assertThat(jdbc.queryForObject("SELECT list_id FROM cards WHERE id = ?", Long.class, ids.laterCardId()))
				.isEqualTo(ids.todoListId());
	}

	@Test
	void 更新の入力が正しくないときは_400と日本語の理由を返し_期限は変わらない() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		java.sql.Timestamp before = jdbc.queryForObject("SELECT due_at FROM cards WHERE id = ?", java.sql.Timestamp.class,
				ids.estimateCardId());

		// {本文, 期待する理由}
		String[][] cases = {
				{ "{}", "変更する項目を指定してください" },
				{ "{\"title\": \"新しいタイトル\"}", "更新できない項目です: title" },
				{ "{\"dueAt\": 123}", "日時の文字、または null" },
				{ "{\"dueAt\": {\"a\": 1}}", "日時の文字、または null" },
				{ due("2030-12-01T18:00"), "期限の日時の形が正しくありません" },
				{ due("あした"), "期限の日時の形が正しくありません" },
				{ due("1999-12-31T23:59:59+09:00"), "範囲外" },
				{ due("2101-01-01T00:00:00+09:00"), "範囲外" },
				{ "これはJSONではありません", "読み取れません" },
				{ "[]", "読み取れません" },
				{ "", "読み取れません" },
		};
		for (String[] c : cases) {
			MockHttpServletResponse response = patchCard(ids.estimateCardId(), c[0]);
			assertThat(response.getStatus()).as(c[0]).isEqualTo(400);
			assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
			assertThat(response.getContentAsString(StandardCharsets.UTF_8)).as(c[0]).contains(c[1]);
		}
		assertThat(jdbc.queryForObject("SELECT due_at FROM cards WHERE id = ?", java.sql.Timestamp.class, ids.estimateCardId()))
				.isEqualTo(before);
	}

	@Test
	void 更新するカードが無いときは_404() throws Exception {
		BoardTestData.insert(jdbc);

		MockHttpServletResponse response = patchCard(999999999L, due("2030-12-01T09:00:00Z"));

		assertThat(response.getStatus()).isEqualTo(404);
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("カードが見つかりません");
	}

	// ---- DELETE /api/cards/{id} : カードの削除(物理削除) ----

	@Test
	void カードを削除すると_204で中身が無く_DBから行もチェックリストも消える() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		MockHttpServletResponse response = mockMvc.perform(delete("/api/cards/" + ids.estimateCardId()))
				.andReturn().getResponse();

		assertThat(response.getStatus()).isEqualTo(204);
		assertThat(response.getContentAsString()).isEmpty();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM cards WHERE id = ?", Integer.class, ids.estimateCardId()))
				.isZero(); // DB から消えた
		assertThat(jdbc.queryForObject("SELECT count(*) FROM checklist_items WHERE card_id = ?", Integer.class,
				ids.estimateCardId())).isZero(); // チェックリストも
	}

	@Test
	void 削除したカードは_取得すると404になり_ボードからも消え_件数が減る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		removeCard(ids.estimateCardId());

		mockMvc.perform(get("/api/cards/" + ids.estimateCardId())).andExpect(status().isNotFound());
		mockMvc.perform(get("/api/board"))
				.andExpect(jsonPath("$.lists[0].cardCount").value(2))
				.andExpect(jsonPath("$.lists[0].cards[0].title").value("資料をまとめる"))
				.andExpect(jsonPath("$.lists[0].cards[1].title").value("資料を送る"))
				.andExpect(jsonPath("$.lists[1].cardCount").value(1));
		mockMvc.perform(get("/api/tasks")).andExpect(jsonPath("$.length()").value(2));
	}

	@Test
	void 削除すると_残ったカードの並び順が連番になる() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		removeCard(ids.noDueCardId()); // 未着手の2番目

		assertThat(jdbc.queryForObject("SELECT string_agg(position::text, ',' ORDER BY position) FROM cards WHERE list_id = ?",
				String.class, ids.todoListId())).isEqualTo("1,2");
	}

	@Test
	void 完了済みのカードも削除できる() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		assertThat(removeCard(ids.doneCardId()).getStatus()).isEqualTo(204);

		mockMvc.perform(get("/api/board")).andExpect(jsonPath("$.lists[1].cardCount").value(0));
	}

	@Test
	void 無いカードを削除すると_404と日本語の理由を返す() throws Exception {
		BoardTestData.insert(jdbc);

		MockHttpServletResponse response = removeCard(999999999L);

		assertThat(response.getStatus()).isEqualTo(404);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("カードが見つかりません");
	}

	@Test
	void 同じカードを2回削除すると_2回目は404() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		assertThat(removeCard(ids.laterCardId()).getStatus()).isEqualTo(204);
		assertThat(removeCard(ids.laterCardId()).getStatus()).isEqualTo(404);
	}

	private MockHttpServletResponse removeCard(long cardId) throws Exception {
		return mockMvc.perform(delete("/api/cards/" + cardId)).andReturn().getResponse();
	}

	// ---- PATCH /api/cards/{id}/complete : 完了にする / 未完了に戻す ----

	private MockHttpServletResponse completeCall(long cardId, String json) throws Exception {
		return mockMvc.perform(patch("/api/cards/" + cardId + "/complete")
				.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(json))
				.andReturn().getResponse();
	}

	private String completed(boolean value, Integer position) {
		return position == null ? "{\"completed\": " + value + "}" : "{\"completed\": " + value + ", \"position\": " + position + "}";
	}

	private String titlesAt(long listId) {
		return String.join(",", jdbc.queryForList("SELECT title FROM cards WHERE list_id = ? ORDER BY position", String.class, listId));
	}

	private String positionsAt(long listId) {
		return jdbc.queryForObject("SELECT coalesce(string_agg(position::text, ',' ORDER BY position), '') FROM cards WHERE list_id = ?",
				String.class, listId);
	}

	private Long fromOf(long cardId) {
		return jdbc.queryForObject("SELECT completed_from_list_id FROM cards WHERE id = ?", Long.class, cardId);
	}

	/** 「進行中」のリスト(未着手の次、完了の前)を、もう1つ作る。 */
	private long insertDoingList(BoardTestData.Ids ids) {
		jdbc.update("UPDATE lists SET position = 3 WHERE id = ?", ids.doneListId()); // 完了を、いちばん右へ
		return jdbc.queryForObject(
				"INSERT INTO lists (board_id, name, position) VALUES (?, '進行中', 2) RETURNING id", Long.class, ids.boardId());
	}

	@Test
	void 完了にすると_完了リストのいちばん上に入り_完了日時が入り_元のリストの並び順は連番() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		MockHttpServletResponse response = completeCall(ids.noDueCardId(), completed(true, null));

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
		String body = response.getContentAsString(StandardCharsets.UTF_8);
		assertThat((String) com.jayway.jsonpath.JsonPath.read(body, "$.title")).isEqualTo("資料をまとめる");
		assertThat((String) com.jayway.jsonpath.JsonPath.read(body, "$.dueStatus")).isEqualTo("COMPLETED");
		assertThat((Object) com.jayway.jsonpath.JsonPath.read(body, "$.completedAt")).isNotNull();
		assertThat(titlesAt(ids.doneListId())).isEqualTo("資料をまとめる,契約書の確認"); // いちばん上
		assertThat(positionsAt(ids.doneListId())).isEqualTo("1,2");
		assertThat(titlesAt(ids.todoListId())).isEqualTo("見積書を作る,資料を送る");
		assertThat(positionsAt(ids.todoListId())).isEqualTo("1,2"); // 欠番なし
		assertThat(fromOf(ids.noDueCardId())).isEqualTo(ids.todoListId()); // 完了前のリストを覚えた
	}

	@Test
	void 未完了に戻すと_完了前のリストの最後に戻り_完了日時と記録が消える() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		completeCall(ids.noDueCardId(), completed(true, null));

		MockHttpServletResponse response = completeCall(ids.noDueCardId(), completed(false, null));

		assertThat(response.getStatus()).isEqualTo(200);
		String body = response.getContentAsString(StandardCharsets.UTF_8);
		assertThat((Object) com.jayway.jsonpath.JsonPath.read(body, "$.completedAt")).isNull();
		assertThat((String) com.jayway.jsonpath.JsonPath.read(body, "$.dueStatus")).isEqualTo("NONE");
		assertThat(titlesAt(ids.todoListId())).isEqualTo("見積書を作る,資料を送る,資料をまとめる"); // 最後
		assertThat(positionsAt(ids.todoListId())).isEqualTo("1,2,3");
		assertThat(titlesAt(ids.doneListId())).isEqualTo("契約書の確認");
		assertThat(fromOf(ids.noDueCardId())).isNull();
	}

	@Test
	void 位置を指定すると_その位置に入る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		completeCall(ids.noDueCardId(), completed(true, 2)); // 完了の2番目
		assertThat(titlesAt(ids.doneListId())).isEqualTo("契約書の確認,資料をまとめる");

		completeCall(ids.noDueCardId(), completed(false, 1)); // 未着手の1番目
		assertThat(titlesAt(ids.todoListId())).isEqualTo("資料をまとめる,見積書を作る,資料を送る");
	}

	@Test
	void 進行中から完了にしたカードは_未完了に戻すと_進行中に戻る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		long doingId = insertDoingList(ids);
		moveCard(ids.laterCardId(), move(doingId, 1)); // 資料を送る を、進行中へ

		completeCall(ids.laterCardId(), completed(true, null));
		assertThat(fromOf(ids.laterCardId())).isEqualTo(doingId);

		completeCall(ids.laterCardId(), completed(false, null));
		assertThat(titlesAt(doingId)).isEqualTo("資料を送る"); // 未着手ではなく、進行中へ
		assertThat(titlesAt(ids.todoListId())).isEqualTo("見積書を作る,資料をまとめる");
	}

	@Test
	void ドラッグ_move_で完了へ入れたカードも_完了前のリストが記録され_未完了に戻すと戻る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		long doingId = insertDoingList(ids);
		moveCard(ids.laterCardId(), move(doingId, 1));

		moveCard(ids.laterCardId(), move(ids.doneListId(), 1)); // ドラッグで、完了へ
		assertThat(fromOf(ids.laterCardId())).isEqualTo(doingId);

		completeCall(ids.laterCardId(), completed(false, null));
		assertThat(titlesAt(doingId)).isEqualTo("資料を送る");
		assertThat(fromOf(ids.laterCardId())).isNull();
	}

	@Test
	void ドラッグで完了から出すと_完了前のリストの記録が消える_完了の中の並べ替えでは残る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		moveCard(ids.noDueCardId(), move(ids.doneListId(), 2));
		assertThat(fromOf(ids.noDueCardId())).isEqualTo(ids.todoListId());

		moveCard(ids.noDueCardId(), move(ids.doneListId(), 1)); // 完了の中で並べ替え
		assertThat(fromOf(ids.noDueCardId())).isEqualTo(ids.todoListId()); // 残る

		moveCard(ids.noDueCardId(), move(ids.todoListId(), 1)); // 完了から出す
		assertThat(fromOf(ids.noDueCardId())).isNull();
	}

	@Test
	void 完了前のリストが分からないカード_シードの完了カード_は_いちばん左の開いたリストへ戻る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		long doingId = insertDoingList(ids);
		assertThat(fromOf(ids.doneCardId())).isNull();

		completeCall(ids.doneCardId(), completed(false, null));

		assertThat(titlesAt(ids.todoListId())).isEqualTo("見積書を作る,資料をまとめる,資料を送る,契約書の確認"); // 未着手(いちばん左)
		assertThat(titlesAt(doingId)).isEmpty();
	}

	@Test
	void 完了前のリストが消えていたら_いちばん左の開いたリストへ戻る() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		long doingId = insertDoingList(ids);
		moveCard(ids.laterCardId(), move(doingId, 1));
		completeCall(ids.laterCardId(), completed(true, null));
		jdbc.update("DELETE FROM lists WHERE id = ?", doingId); // 完了前のリストを消す
		assertThat(fromOf(ids.laterCardId())).isNull();

		completeCall(ids.laterCardId(), completed(false, null));

		assertThat(titlesAt(ids.todoListId())).isEqualTo("見積書を作る,資料をまとめる,資料を送る");
	}

	@Test
	void すでにその状態なら_何も変えずに200() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);
		String doneBefore = mockMvc.perform(get("/api/cards/" + ids.doneCardId())).andReturn().getResponse()
				.getContentAsString(StandardCharsets.UTF_8);

		MockHttpServletResponse stillDone = completeCall(ids.doneCardId(), completed(true, null)); // 完了済みに、完了
		MockHttpServletResponse stillOpen = completeCall(ids.laterCardId(), completed(false, null)); // 未完了に、未完了

		assertThat(stillDone.getStatus()).isEqualTo(200);
		assertThat((String) com.jayway.jsonpath.JsonPath.read(stillDone.getContentAsString(StandardCharsets.UTF_8), "$.completedAt"))
				.isEqualTo(com.jayway.jsonpath.JsonPath.read(doneBefore, "$.completedAt")); // 完了日時は変わらない
		assertThat(stillOpen.getStatus()).isEqualTo(200);
		assertThat(titlesAt(ids.todoListId())).isEqualTo("見積書を作る,資料をまとめる,資料を送る"); // 並びも変わらない
		assertThat(titlesAt(ids.doneListId())).isEqualTo("契約書の確認");
	}

	@Test
	void 完了の入力が正しくないときは_400_カードが無いときは404() throws Exception {
		BoardTestData.Ids ids = BoardTestData.insert(jdbc);

		// {本文, 期待する理由}
		String[][] cases = {
				{ "{}", "completed を、true か false で指定してください" },
				{ "{\"completed\": null}", "completed を、true か false で指定してください" },
				{ completed(true, 0), "位置は1以上で指定してください" },
				{ completed(false, -1), "位置は1以上で指定してください" },
				{ "{\"completed\": \"はい\"}", "読み取れません" },
				{ "これはJSONではありません", "読み取れません" },
				{ "", "読み取れません" },
		};
		for (String[] c : cases) {
			MockHttpServletResponse response = completeCall(ids.laterCardId(), c[0]);
			assertThat(response.getStatus()).as(c[0]).isEqualTo(400);
			assertThat(response.getContentType()).isEqualToIgnoringCase("application/json;charset=UTF-8");
			assertThat(response.getContentAsString(StandardCharsets.UTF_8)).as(c[0]).contains(c[1]);
		}
		assertThat(titlesAt(ids.todoListId())).isEqualTo("見積書を作る,資料をまとめる,資料を送る"); // 動いていない

		MockHttpServletResponse notFound = completeCall(999999999L, completed(true, null));
		assertThat(notFound.getStatus()).isEqualTo(404);
		assertThat(notFound.getContentAsString(StandardCharsets.UTF_8)).contains("カードが見つかりません");
	}

}
