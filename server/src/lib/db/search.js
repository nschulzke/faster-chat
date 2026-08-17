// Match delimiters for snippet()/highlight(). Split back into {text, match} segments so the
// frontend never renders search output as HTML.
const OPEN = "\u0002";
const CLOSE = "\u0003";

const TITLE_WEIGHT = 3.0;
const SNIPPET_TOKENS = 14;
const SNIPPETS_PER_CHAT = 3;

// Characters the unicode61 tokenizer keeps. Anything else is a separator, so stripping it here
// avoids emitting empty FTS phrases like `""`.
const NON_TOKEN = /[^\p{L}\p{N}_\-\s]/gu;

export function toMatchExpr(raw) {
  if (typeof raw !== "string") {
    return null;
  }

  const tokens = raw.match(/"[^"]*"|\S+/g) ?? [];
  const terms = [];

  for (const token of tokens) {
    const term = token.replace(/"/g, " ").replace(NON_TOKEN, " ").trim().replace(/\s+/g, " ");
    if (term) {
      terms.push({ term, quoted: token.startsWith('"') });
    }
  }

  if (terms.length === 0) {
    return null;
  }

  return terms
    .map(({ term, quoted }, index) => {
      const phrase = `"${term}"`;
      return quoted || index !== terms.length - 1 ? phrase : `${phrase}*`;
    })
    .join(" ");
}

export function toSegments(text) {
  if (!text) {
    return [];
  }

  const segments = [];
  let buffer = "";
  let inMatch = false;

  const flush = () => {
    if (buffer) {
      segments.push({ text: buffer, match: inMatch });
      buffer = "";
    }
  };

  for (const char of text) {
    if (char === OPEN && !inMatch) {
      flush();
      inMatch = true;
    } else if (char === CLOSE && inMatch) {
      flush();
      inMatch = false;
    } else if (char !== OPEN && char !== CLOSE) {
      buffer += char;
    }
  }
  flush();

  return segments;
}

export function createSearchUtils({ db }) {
  const rankChats = db.prepare(`
    WITH message_hits AS MATERIALIZED (
      SELECT m.chat_id AS chat_id, bm25(messages_fts) AS score
      FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      WHERE messages_fts MATCH ? AND m.user_id = ?
    ),
    body AS (
      SELECT chat_id, MIN(score) AS score, COUNT(*) AS hits
      FROM message_hits
      GROUP BY chat_id
    ),
    titles AS (
      SELECT c.id AS chat_id, bm25(chats_fts) AS score, highlight(chats_fts, 0, ?, ?) AS marked
      FROM chats_fts
      JOIN chats c ON c.rowid = chats_fts.rowid
      WHERE chats_fts MATCH ? AND c.user_id = ?
    )
    SELECT c.id, c.title, c.folder_id, c.pinned_at, c.updated_at,
           titles.marked AS marked_title,
           COALESCE(body.hits, 0) AS hits,
           COALESCE(titles.score, 0) * ? + COALESCE(body.score, 0) AS score
    FROM chats c
    LEFT JOIN body ON body.chat_id = c.id
    LEFT JOIN titles ON titles.chat_id = c.id
    WHERE c.user_id = ?
      AND c.deleted_at IS NULL
      AND (body.chat_id IS NOT NULL OR titles.chat_id IS NOT NULL)
      AND (? OR c.archived_at IS NULL)
    ORDER BY score ASC, c.updated_at DESC
    LIMIT ? OFFSET ?
  `);

  function topSnippets(matchExpr, userId, chatIds) {
    const placeholders = chatIds.map(() => "?").join(",");
    const stmt = db.prepare(`
      WITH hits AS MATERIALIZED (
        SELECT m.chat_id AS chat_id, m.id AS message_id, m.role AS role,
               m.created_at AS created_at,
               snippet(messages_fts, 0, ?, ?, '…', ${SNIPPET_TOKENS}) AS snip,
               bm25(messages_fts) AS score
        FROM messages_fts
        JOIN messages m ON m.rowid = messages_fts.rowid
        WHERE messages_fts MATCH ? AND m.user_id = ? AND m.chat_id IN (${placeholders})
      )
      SELECT chat_id, message_id, role, created_at, snip FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY score) AS rn FROM hits
      )
      WHERE rn <= ${SNIPPETS_PER_CHAT}
      ORDER BY chat_id, rn
    `);
    return stmt.all(OPEN, CLOSE, matchExpr, userId, ...chatIds);
  }

  return {
    searchChats(userId, matchExpr, { limit = 20, offset = 0, includeArchived = false } = {}) {
      if (!matchExpr) {
        return { results: [], hasMore: false };
      }

      const rows = rankChats.all(
        matchExpr,
        userId,
        OPEN,
        CLOSE,
        matchExpr,
        userId,
        TITLE_WEIGHT,
        userId,
        includeArchived ? 1 : 0,
        limit + 1,
        offset
      );

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      if (page.length === 0) {
        return { results: [], hasMore: false };
      }

      const byChat = new Map(page.map((row) => [row.id, []]));
      for (const snip of topSnippets(
        matchExpr,
        userId,
        page.map((row) => row.id)
      )) {
        byChat.get(snip.chat_id)?.push({
          messageId: snip.message_id,
          role: snip.role,
          createdAt: snip.created_at,
          snippet: toSegments(snip.snip),
        });
      }

      return {
        hasMore,
        results: page.map((row) => ({
          chatId: row.id,
          title: row.marked_title
            ? toSegments(row.marked_title)
            : row.title
              ? [{ text: row.title, match: false }]
              : [],
          folderId: row.folder_id,
          pinnedAt: row.pinned_at,
          updatedAt: row.updated_at,
          matchCount: row.hits,
          messages: byChat.get(row.id) ?? [],
        })),
      };
    },
  };
}
