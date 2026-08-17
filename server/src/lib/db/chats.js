function parseMessageMetadata(message) {
  if (message?.metadata) {
    try {
      message.metadata = JSON.parse(message.metadata);
    } catch {
      message.metadata = null;
    }
  }
  return message;
}

export function createChatUtils({ db }) {
  // Batch fetch file IDs for messages, ordered by created_at ASC, rowid ASC
  function getMessageFileIds(messageIds) {
    if (!messageIds || messageIds.length === 0) {
      return {};
    }
    const placeholders = messageIds.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT message_id, file_id FROM message_files WHERE message_id IN (${placeholders}) ORDER BY created_at ASC, rowid ASC`
    );
    const rows = stmt.all(...messageIds);

    // Group file_ids by message_id
    const result = {};
    for (const row of rows) {
      if (!result[row.message_id]) {
        result[row.message_id] = [];
      }
      result[row.message_id].push(row.file_id);
    }
    return result;
  }

  // Attach file_ids to messages in memory
  function attachFileIds(messages) {
    if (!messages || messages.length === 0) {
      return messages;
    }
    const messageIds = messages.map((m) => m.id);
    const fileIdMap = getMessageFileIds(messageIds);
    for (const msg of messages) {
      msg.file_ids = fileIdMap[msg.id] ?? null;
    }
    return messages;
  }

  return {
    createChat(id, userId, title = null, folderId = null, createdAt = Date.now()) {
      const now = createdAt;
      const stmt = db.prepare(`
      INSERT INTO chats (id, user_id, title, folder_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
      stmt.run(id, userId, title, folderId, now, now);
      return {
        id,
        user_id: userId,
        title,
        folder_id: folderId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
    },

    getChatById(chatId) {
      const stmt = db.prepare("SELECT * FROM chats WHERE id = ? AND deleted_at IS NULL");
      return stmt.get(chatId);
    },

    getChatByIdAndUser(chatId, userId) {
      const stmt = db.prepare(
        "SELECT * FROM chats WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
      );
      return stmt.get(chatId, userId);
    },

    getArchivedChatsByUserId(userId) {
      const stmt = db.prepare(`
      SELECT * FROM chats
      WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NOT NULL
      ORDER BY archived_at DESC
    `);
      return stmt.all(userId);
    },

    updateChatTitle(chatId, title) {
      const now = Date.now();
      const stmt = db.prepare("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?");
      stmt.run(title, now, chatId);
    },

    setChatTitleIfEmpty(chatId, title) {
      const now = Date.now();
      const stmt = db.prepare(
        "UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND title IS NULL"
      );
      const result = stmt.run(title, now, chatId);
      return result.changes > 0;
    },

    updateChatTimestamp(chatId) {
      const now = Date.now();
      const stmt = db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?");
      stmt.run(now, chatId);
    },

    updateChatTimestampTo(chatId, timestamp) {
      const stmt = db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?");
      stmt.run(timestamp, chatId);
    },

    softDeleteChatByUser(chatId, userId) {
      const now = Date.now();
      const stmt = db.prepare(
        "UPDATE chats SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      );
      const result = stmt.run(now, now, chatId, userId);
      return result.changes > 0;
    },

    pinChat(chatId, userId) {
      const now = Date.now();
      const stmt = db.prepare(
        "UPDATE chats SET pinned_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
      );
      const result = stmt.run(now, now, chatId, userId);
      return result.changes > 0;
    },

    unpinChat(chatId, userId) {
      const now = Date.now();
      const stmt = db.prepare(
        "UPDATE chats SET pinned_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
      );
      const result = stmt.run(now, chatId, userId);
      return result.changes > 0;
    },

    archiveChat(chatId, userId) {
      const now = Date.now();
      const stmt = db.prepare(
        "UPDATE chats SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
      );
      const result = stmt.run(now, now, chatId, userId);
      return result.changes > 0;
    },

    unarchiveChat(chatId, userId) {
      const now = Date.now();
      const stmt = db.prepare(
        "UPDATE chats SET archived_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
      );
      const result = stmt.run(now, chatId, userId);
      return result.changes > 0;
    },

    // ========================================
    // MESSAGE UTILITIES
    // ========================================,

    createMessage(
      id,
      chatId,
      userId,
      role,
      content,
      model = null,
      fileIds = null,
      metadata = null
    ) {
      const now = Date.now();
      const metadataJson = metadata ? JSON.stringify(metadata) : null;

      // Start transaction for atomicity
      db.transaction(() => {
        // Insert message row (no file_ids column)
        const stmt = db.prepare(`
        INSERT INTO messages (id, chat_id, user_id, role, content, model, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
        stmt.run(id, chatId, userId, role, content, model, metadataJson, now);

        // Insert junction rows for file associations - one per unique fileId
        if (fileIds && fileIds.length > 0) {
          const insertStmt = db.prepare(
            "INSERT INTO message_files (message_id, file_id, created_at) VALUES (?, ?, ?)"
          );
          for (const fileId of new Set(fileIds)) {
            insertStmt.run(id, fileId, now);
          }
        }
      })();

      return {
        id,
        chat_id: chatId,
        user_id: userId,
        role,
        content,
        model,
        // null when there are no associations, matching how reads return them
        file_ids: fileIds?.length ? fileIds : null,
        metadata,
        created_at: now,
      };
    },

    deleteMessageByUser(messageId, userId, chatId) {
      const stmt = db.prepare("DELETE FROM messages WHERE id = ? AND user_id = ? AND chat_id = ?");
      const result = stmt.run(messageId, userId, chatId);
      return result.changes > 0;
    },

    getMessageByIdAndChat(messageId, chatId) {
      const stmt = db.prepare("SELECT rowid, * FROM messages WHERE id = ? AND chat_id = ?");
      return stmt.get(messageId, chatId);
    },

    // Delete the target message and everything after it in the chat.
    // Junction rows cascade; file rows are left intact.
    truncateChatFromMessage(chatId, target) {
      // Junction rows cascade into `changes`, so count the messages separately
      const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE chat_id = ? AND (created_at > ? OR (created_at = ? AND rowid >= ?))
    `);
      const deleteStmt = db.prepare(`
      DELETE FROM messages
      WHERE chat_id = ? AND (created_at > ? OR (created_at = ? AND rowid >= ?))
    `);
      const bumpStmt = db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?");
      const args = [chatId, target.created_at, target.created_at, target.rowid];

      return db.transaction(() => {
        const { count } = countStmt.get(...args);
        deleteStmt.run(...args);
        bumpStmt.run(Date.now(), chatId);
        return count;
      })();
    },

    // Copy a chat up to (excluding) the target message into a new chat.
    // Copied messages keep their original timestamps and point at the same file rows.
    copyChatBeforeMessage(chat, target) {
      const newChatId = crypto.randomUUID();
      const now = Date.now();

      const selectMessages = db.prepare(`
      SELECT rowid, * FROM messages
      WHERE chat_id = ? AND (created_at < ? OR (created_at = ? AND rowid < ?))
      ORDER BY created_at ASC, rowid ASC
    `);
      const selectFiles = db.prepare(`
      SELECT file_id, created_at FROM message_files
      WHERE message_id = ? ORDER BY created_at ASC, rowid ASC
    `);
      const insertChat = db.prepare(`
      INSERT INTO chats (id, user_id, title, folder_id, memory_disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
      const insertMessage = db.prepare(`
      INSERT INTO messages (id, chat_id, user_id, role, content, model, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
      const insertFile = db.prepare(
        "INSERT INTO message_files (message_id, file_id, created_at) VALUES (?, ?, ?)"
      );

      return db.transaction(() => {
        insertChat.run(
          newChatId,
          chat.user_id,
          chat.title,
          chat.folder_id,
          chat.memory_disabled ?? 0,
          now,
          now
        );

        const rows = selectMessages.all(
          chat.id,
          target.created_at,
          target.created_at,
          target.rowid
        );
        for (const row of rows) {
          const copyId = crypto.randomUUID();
          insertMessage.run(
            copyId,
            newChatId,
            row.user_id,
            row.role,
            row.content,
            row.model,
            row.metadata,
            row.created_at
          );
          for (const file of selectFiles.all(row.id)) {
            insertFile.run(copyId, file.file_id, file.created_at);
          }
        }

        return { chatId: newChatId, messageCount: rows.length };
      })();
    },

    deleteMessagesByChat(chatId) {
      const stmt = db.prepare("DELETE FROM messages WHERE chat_id = ?");
      const result = stmt.run(chatId);
      return result.changes;
    },

    getMessageCountByChat(chatId) {
      const stmt = db.prepare("SELECT COUNT(*) as count FROM messages WHERE chat_id = ?");
      const result = stmt.get(chatId);
      return result.count;
    },

    getChatsByUserIdPaginated(userId, limit = 50, offset = 0, includeArchived = false) {
      const stmt = db.prepare(`
      SELECT * FROM chats
      WHERE user_id = ? AND deleted_at IS NULL AND folder_id IS NULL ${includeArchived ? "" : "AND archived_at IS NULL"}
      ORDER BY
        CASE WHEN pinned_at IS NOT NULL THEN 0 ELSE 1 END,
        pinned_at DESC,
        updated_at DESC
      LIMIT ? OFFSET ?
    `);
      return stmt.all(userId, limit, offset);
    },

    getMessagesByChatAndUserPaginated(chatId, userId, limit = 100, offset = 0) {
      const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE chat_id = ? AND user_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `);
      const messages = stmt.all(chatId, userId, limit, offset);
      for (const msg of messages) {
        parseMessageMetadata(msg);
      }
      return attachFileIds(messages);
    },

    purgeSoftDeletedChats(olderThanMs) {
      const cutoff = Date.now() - olderThanMs;
      const stmt = db.prepare("DELETE FROM chats WHERE deleted_at IS NOT NULL AND deleted_at < ?");
      const result = stmt.run(cutoff);
      return result.changes;
    },
  };
}
