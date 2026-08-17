import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import {
  createTestApp,
  resetDatabase,
  seedAdminUser,
  seedMemberUser,
  makeRequest,
} from "./helpers.js";
import db, { dbUtils } from "../lib/db.js";
import { toMatchExpr, toSegments } from "../lib/db/search.js";

const OPEN = "\u0002";
const CLOSE = "\u0003";

function plain(segments) {
  return segments.map((segment) => segment.text).join("");
}

function matched(segments) {
  return segments.filter((segment) => segment.match).map((segment) => segment.text);
}

function ftsRowCount(table) {
  return db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count;
}

describe("toMatchExpr", () => {
  test("quotes terms and prefixes the last one", () => {
    expect(toMatchExpr("hello world")).toBe('"hello" "world"*');
  });

  test("preserves quoted phrases without a prefix", () => {
    expect(toMatchExpr('"hello world"')).toBe('"hello world"');
  });

  test("keeps identifier characters the tokenizer keeps", () => {
    expect(toMatchExpr("snake_case kebab-case")).toBe('"snake_case" "kebab-case"*');
  });

  test.each([
    ['"', null],
    ["*", null],
    ["", null],
    ["   ", null],
    ["^", null],
    ["🎉", null],
    ["!!! ???", null],
  ])("neutralizes operator-only input %p", (input, expected) => {
    expect(toMatchExpr(input)).toBe(expected);
  });

  test.each(["AND", "OR", "NOT", "NEAR(a b)", "foo*bar", 'a" OR "b', "col:value"])(
    "produces a query FTS5 accepts for %p",
    (input) => {
      const expr = toMatchExpr(input);
      if (expr === null) {
        return;
      }
      expect(() =>
        db.prepare("SELECT count(*) FROM messages_fts WHERE messages_fts MATCH ?").get(expr)
      ).not.toThrow();
    }
  );

  test("rejects non-strings", () => {
    expect(toMatchExpr(null)).toBeNull();
    expect(toMatchExpr(42)).toBeNull();
  });
});

describe("toSegments", () => {
  test("splits delimited text into match segments", () => {
    expect(toSegments(`a ${OPEN}b${CLOSE} c`)).toEqual([
      { text: "a ", match: false },
      { text: "b", match: true },
      { text: " c", match: false },
    ]);
  });

  test("drops unpaired delimiters rather than desyncing", () => {
    expect(toSegments(`a${CLOSE}b${OPEN}c`)).toEqual([
      { text: "ab", match: false },
      { text: "c", match: true },
    ]);
  });

  test("returns an empty list for empty input", () => {
    expect(toSegments("")).toEqual([]);
    expect(toSegments(null)).toEqual([]);
  });
});

describe("FTS index sync", () => {
  let userId, chatId;

  beforeEach(() => {
    resetDatabase();
    userId = dbUtils.createUser("indexer", "hash", "member");
    chatId = crypto.randomUUID();
    dbUtils.createChat(chatId, userId, "Index title", null);
  });

  test("insert and delete keep messages_fts in step", () => {
    const messageId = crypto.randomUUID();
    dbUtils.createMessage(messageId, chatId, userId, "user", "photosynthesis in mangroves");
    expect(ftsRowCount("messages_fts")).toBe(1);

    dbUtils.deleteMessageByUser(messageId, userId, chatId);
    expect(ftsRowCount("messages_fts")).toBe(0);
  });

  test("content updates are reindexed", () => {
    const messageId = crypto.randomUUID();
    dbUtils.createMessage(messageId, chatId, userId, "user", "original wording");
    db.prepare("UPDATE messages SET content = ? WHERE id = ?").run("replaced wording", messageId);

    const hits = db
      .prepare("SELECT count(*) AS count FROM messages_fts WHERE messages_fts MATCH ?")
      .get('"original"');
    expect(hits.count).toBe(0);

    const replaced = db
      .prepare("SELECT count(*) AS count FROM messages_fts WHERE messages_fts MATCH ?")
      .get('"replaced"');
    expect(replaced.count).toBe(1);
  });

  test("title updates are reindexed", () => {
    dbUtils.updateChatTitle(chatId, "Renamed heading");
    const results = dbUtils.searchChats(userId, toMatchExpr("Renamed"));
    expect(results.results).toHaveLength(1);

    const stale = dbUtils.searchChats(userId, toMatchExpr("Index"));
    expect(stale.results).toHaveLength(0);
  });

  test("truncateChatFromMessage removes the tail from the index", () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    dbUtils.createMessage(first, chatId, userId, "user", "kept alpha");
    dbUtils.createMessage(second, chatId, userId, "assistant", "discarded beta");

    const target = dbUtils.getMessageByIdAndChat(second, chatId);
    dbUtils.truncateChatFromMessage(chatId, target);

    expect(ftsRowCount("messages_fts")).toBe(1);
    expect(dbUtils.searchChats(userId, toMatchExpr("discarded")).results).toHaveLength(0);
    expect(dbUtils.searchChats(userId, toMatchExpr("kept")).results).toHaveLength(1);
  });

  test("copyChatBeforeMessage indexes the copies", () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    dbUtils.createMessage(first, chatId, userId, "user", "duplicated gamma");
    dbUtils.createMessage(second, chatId, userId, "assistant", "boundary delta");

    const chat = dbUtils.getChatById(chatId);
    const target = dbUtils.getMessageByIdAndChat(second, chatId);
    dbUtils.copyChatBeforeMessage(chat, target);

    expect(ftsRowCount("messages_fts")).toBe(3);
    expect(dbUtils.searchChats(userId, toMatchExpr("duplicated")).results).toHaveLength(2);
  });

  test("deleting a chat clears its messages from the index", () => {
    dbUtils.createMessage(crypto.randomUUID(), chatId, userId, "user", "cascading epsilon");
    db.prepare("DELETE FROM chats WHERE id = ?").run(chatId);
    expect(ftsRowCount("messages_fts")).toBe(0);
    expect(ftsRowCount("chats_fts")).toBe(0);
  });
});

describe("searchChats", () => {
  let userId, otherUserId;

  beforeEach(() => {
    resetDatabase();
    userId = dbUtils.createUser("searcher", "hash", "member");
    otherUserId = dbUtils.createUser("stranger", "hash", "member");
  });

  function seedChat(owner, title, contents, mutate) {
    const chatId = crypto.randomUUID();
    dbUtils.createChat(chatId, owner, title, null);
    for (const content of contents) {
      dbUtils.createMessage(crypto.randomUUID(), chatId, owner, "user", content);
    }
    mutate?.(chatId);
    return chatId;
  }

  test("matches message bodies, not just titles", () => {
    const chatId = seedChat(userId, "Untitled", ["the capybara is a large rodent"]);
    const { results } = dbUtils.searchChats(userId, toMatchExpr("capybara"));

    expect(results).toHaveLength(1);
    expect(results[0].chatId).toBe(chatId);
    expect(matched(results[0].messages[0].snippet)).toContain("capybara");
  });

  test("returns highlighted title segments", () => {
    seedChat(userId, "Deploying FTS5 to production", []);
    const { results } = dbUtils.searchChats(userId, toMatchExpr("FTS5"));

    expect(plain(results[0].title)).toBe("Deploying FTS5 to production");
    expect(matched(results[0].title)).toEqual(["FTS5"]);
  });

  test("returns an unhighlighted title when only the body matched", () => {
    seedChat(userId, "Plain heading", ["a body mentioning marmots"]);
    const { results } = dbUtils.searchChats(userId, toMatchExpr("marmots"));

    expect(results[0].title).toEqual([{ text: "Plain heading", match: false }]);
  });

  test("ranks a title match above a body-only match", () => {
    const titled = seedChat(userId, "quokka notes", ["unrelated text"]);
    seedChat(userId, "misc", ["quokka appears only in the body"]);

    const { results } = dbUtils.searchChats(userId, toMatchExpr("quokka"));
    expect(results).toHaveLength(2);
    expect(results[0].chatId).toBe(titled);
  });

  test("isolates users", () => {
    seedChat(otherUserId, "private", ["a secret about okapi"]);
    expect(dbUtils.searchChats(userId, toMatchExpr("okapi")).results).toEqual([]);
    expect(dbUtils.searchChats(otherUserId, toMatchExpr("okapi")).results).toHaveLength(1);
  });

  test("includes chats that live in a folder", () => {
    const folderId = crypto.randomUUID();
    dbUtils.createFolder(folderId, userId, "Research", null, 0);
    const chatId = seedChat(userId, "filed away", ["notes about pangolins"], (id) =>
      db.prepare("UPDATE chats SET folder_id = ? WHERE id = ?").run(folderId, id)
    );

    const { results } = dbUtils.searchChats(userId, toMatchExpr("pangolins"));
    expect(results.map((r) => r.chatId)).toEqual([chatId]);
    expect(results[0].folderId).toBe(folderId);
  });

  test("excludes soft-deleted chats", () => {
    seedChat(userId, "gone", ["a note about axolotls"], (id) =>
      dbUtils.softDeleteChatByUser(id, userId)
    );
    expect(dbUtils.searchChats(userId, toMatchExpr("axolotls")).results).toEqual([]);
  });

  test("gates archived chats behind includeArchived", () => {
    seedChat(userId, "archived", ["a note about narwhals"], (id) =>
      dbUtils.archiveChat(id, userId)
    );

    expect(dbUtils.searchChats(userId, toMatchExpr("narwhals")).results).toEqual([]);
    expect(
      dbUtils.searchChats(userId, toMatchExpr("narwhals"), { includeArchived: true }).results
    ).toHaveLength(1);
  });

  test("caps snippets per chat and reports the full match count", () => {
    seedChat(
      userId,
      "many hits",
      Array.from({ length: 6 }, (_, i) => `mention ${i} of tapirs`)
    );

    const { results } = dbUtils.searchChats(userId, toMatchExpr("tapirs"));
    expect(results[0].matchCount).toBe(6);
    expect(results[0].messages).toHaveLength(3);
  });

  test("paginates with hasMore", () => {
    for (let i = 0; i < 3; i++) {
      seedChat(userId, `ibex ${i}`, []);
    }

    const first = dbUtils.searchChats(userId, toMatchExpr("ibex"), { limit: 2 });
    expect(first.results).toHaveLength(2);
    expect(first.hasMore).toBe(true);

    const second = dbUtils.searchChats(userId, toMatchExpr("ibex"), { limit: 2, offset: 2 });
    expect(second.results).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });

  test("returns nothing for a null match expression", () => {
    seedChat(userId, "anything", ["content"]);
    expect(dbUtils.searchChats(userId, null)).toEqual({ results: [], hasMore: false });
  });

  test("matches on prefix as you type", () => {
    seedChat(userId, "Untitled", ["discussing wildebeest migration"]);
    expect(dbUtils.searchChats(userId, toMatchExpr("wildeb")).results).toHaveLength(1);
  });
});

describe("GET /api/chats/search", () => {
  let app, adminCookie, memberCookie, adminUserId;

  beforeAll(async () => {
    resetDatabase();
    app = createTestApp();
    const admin = await seedAdminUser(app);
    adminCookie = admin.cookie;
    adminUserId = admin.user.id;
    const member = await seedMemberUser(app, adminCookie);
    memberCookie = member.cookie;

    const chatId = crypto.randomUUID();
    dbUtils.createChat(chatId, adminUserId, "Notes on hydrology", null);
    dbUtils.createMessage(
      crypto.randomUUID(),
      chatId,
      adminUserId,
      "user",
      "aquifer recharge rates vary by season"
    );
  });

  test("requires a session", async () => {
    const res = await makeRequest(app, "GET", "/api/chats/search?q=aquifer");
    expect(res.status).toBe(401);
  });

  test("is not shadowed by the /:chatId route", async () => {
    const res = await makeRequest(app, "GET", "/api/chats/search?q=aquifer", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].messages[0].snippet.some((s) => s.match)).toBe(true);
  });

  test("returns an empty result set for an operator-only query", async () => {
    const res = await makeRequest(app, "GET", "/api/chats/search?q=%22", { cookie: adminCookie });
    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([]);
  });

  test("does not leak another user's chats", async () => {
    const res = await makeRequest(app, "GET", "/api/chats/search?q=aquifer", {
      cookie: memberCookie,
    });
    expect((await res.json()).results).toEqual([]);
  });

  test("clamps the limit", async () => {
    const res = await makeRequest(app, "GET", "/api/chats/search?q=aquifer&limit=9999", {
      cookie: adminCookie,
    });
    expect((await res.json()).limit).toBe(50);
  });

  test("rejects a negative limit rather than returning everything", async () => {
    const res = await makeRequest(app, "GET", "/api/chats/search?q=aquifer&limit=-1", {
      cookie: adminCookie,
    });
    expect((await res.json()).limit).toBe(1);
  });
});
