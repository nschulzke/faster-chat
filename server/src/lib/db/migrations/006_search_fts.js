const TOKENIZE = `unicode61 remove_diacritics 2 tokenchars '_-'`;

export const migration = {
  id: 6,
  up(database) {
    const fts5 = database
      .prepare(
        "SELECT count(*) AS count FROM pragma_compile_options WHERE compile_options LIKE 'ENABLE_FTS5%'"
      )
      .get();
    if (!fts5?.count) {
      throw new Error("SQLite was built without FTS5; chat search cannot be enabled");
    }

    database.exec(`
      CREATE VIRTUAL TABLE messages_fts USING fts5(
        content,
        content='messages',
        content_rowid='rowid',
        tokenize="${TOKENIZE}",
        prefix='2 3'
      );

      CREATE TRIGGER messages_fts_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TRIGGER messages_fts_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
      END;

      CREATE TRIGGER messages_fts_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
        INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE VIRTUAL TABLE chats_fts USING fts5(
        title,
        content='chats',
        content_rowid='rowid',
        tokenize="${TOKENIZE}",
        prefix='2 3'
      );

      CREATE TRIGGER chats_fts_ai AFTER INSERT ON chats BEGIN
        INSERT INTO chats_fts(rowid, title) VALUES (new.rowid, new.title);
      END;

      CREATE TRIGGER chats_fts_ad AFTER DELETE ON chats BEGIN
        INSERT INTO chats_fts(chats_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
      END;

      CREATE TRIGGER chats_fts_au AFTER UPDATE ON chats BEGIN
        INSERT INTO chats_fts(chats_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
        INSERT INTO chats_fts(rowid, title) VALUES (new.rowid, new.title);
      END;

      INSERT INTO messages_fts(messages_fts) VALUES ('rebuild');
      INSERT INTO chats_fts(chats_fts) VALUES ('rebuild');
    `);
  },
};
