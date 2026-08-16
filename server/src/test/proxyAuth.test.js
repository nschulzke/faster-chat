import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp, resetDatabase, createTestUser, makeRequest, db } from "./helpers.js";
import { isTrustedProxy } from "../lib/proxyAuth.js";
import { createApp } from "../app.js";

const PROXY_ENV_KEYS = [
  "PROXY_AUTH_ENABLED",
  "PROXY_AUTH_USER_HEADER",
  "PROXY_AUTH_GROUPS_HEADER",
  "PROXY_AUTH_TRUSTED_PROXIES",
  "PROXY_AUTH_ADMIN_USER",
  "PROXY_AUTH_ADMIN_GROUP",
  "PROXY_AUTH_AUTO_PROVISION",
  "PROXY_AUTH_LOGOUT_URL",
];

function enableProxyAuth(overrides = {}) {
  process.env.PROXY_AUTH_ENABLED = "true";
  process.env.PROXY_AUTH_TRUSTED_PROXIES = "10.0.0.0/8";
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}

function proxyRequest(app, method, path, { user, groups, peerIP = "10.0.0.7", ...rest } = {}) {
  const headers = { ...rest.headers };
  if (user) {
    headers["Remote-User"] = user;
  }
  if (groups) {
    headers["Remote-Groups"] = groups;
  }
  return makeRequest(app, method, path, { ...rest, headers, peerIP });
}

describe("proxy auth", () => {
  let app;

  beforeEach(() => {
    resetDatabase();
    app = createTestApp();
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      delete process.env[key];
    }
  });

  describe("trusted proxy matching", () => {
    test("matches exact IPs, CIDR ranges, and IPv4-mapped IPv6", () => {
      expect(isTrustedProxy("10.4.1.9", ["10.0.0.0/8"])).toBe(true);
      expect(isTrustedProxy("::ffff:10.4.1.9", ["10.0.0.0/8"])).toBe(true);
      expect(isTrustedProxy("172.16.0.1", ["10.0.0.0/8"])).toBe(false);
      expect(isTrustedProxy("127.0.0.1", ["127.0.0.1"])).toBe(true);
      expect(isTrustedProxy("127.0.0.2", ["127.0.0.1"])).toBe(false);
      expect(isTrustedProxy("203.0.113.5", ["*"])).toBe(true);
      expect(isTrustedProxy("203.0.113.5", [])).toBe(false);
      expect(isTrustedProxy(null, ["*"])).toBe(false);
    });
  });

  describe("configuration", () => {
    test("enabling without a trusted proxy list fails at startup", () => {
      process.env.PROXY_AUTH_ENABLED = "true";
      expect(() => createApp()).toThrow(/PROXY_AUTH_TRUSTED_PROXIES/);
    });
  });

  describe("header trust", () => {
    test("headers from an untrusted peer are rejected", async () => {
      enableProxyAuth();
      const res = await proxyRequest(app, "GET", "/api/auth/session", {
        user: "alice",
        peerIP: "203.0.113.9",
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.user).toBeNull();
      expect(data.authMode).toBe("proxy");
    });

    test("a trusted peer without an identity header is rejected", async () => {
      enableProxyAuth();
      const res = await proxyRequest(app, "GET", "/api/chats");
      expect(res.status).toBe(401);
    });

    test("a valid session cookie does not bypass a missing identity header", async () => {
      const user = await createTestUser({ username: "cookieuser" });
      const { sessionId } = (await import("../lib/db.js")).dbUtils.createSession(user.id);
      enableProxyAuth();

      const res = await proxyRequest(app, "GET", "/api/chats", {
        cookie: `session=${sessionId}`,
      });
      expect(res.status).toBe(401);
    });
  });

  describe("auto-provisioning", () => {
    test("first proxy user is provisioned as admin when no admin mapping is configured", async () => {
      enableProxyAuth();
      const res = await proxyRequest(app, "GET", "/api/auth/session", { user: "alice" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.username).toBe("alice");
      expect(data.user.role).toBe("admin");
      expect(data.authMode).toBe("proxy");

      const second = await proxyRequest(app, "GET", "/api/auth/session", { user: "bob" });
      expect((await second.json()).user.role).toBe("member");
    });

    test("provisioned accounts cannot be used for password login", async () => {
      enableProxyAuth();
      await proxyRequest(app, "GET", "/api/auth/session", { user: "alice" });

      delete process.env.PROXY_AUTH_ENABLED;
      const res = await makeRequest(app, "POST", "/api/auth/login", {
        body: { username: "alice", password: "proxy-auth:no-password" },
      });
      expect(res.status).toBe(401);
    });

    test("disabling auto-provision rejects unknown identities", async () => {
      enableProxyAuth({ PROXY_AUTH_AUTO_PROVISION: "false" });
      const res = await proxyRequest(app, "GET", "/api/auth/session", { user: "nobody" });
      expect(res.status).toBe(401);

      await createTestUser({ username: "known" });
      const known = await proxyRequest(app, "GET", "/api/auth/session", { user: "known" });
      expect(known.status).toBe(200);
    });

    test("a configurable identity header is honored", async () => {
      enableProxyAuth({ PROXY_AUTH_USER_HEADER: "Remote-Email" });
      const res = await proxyRequest(app, "GET", "/api/auth/session", {
        headers: { "Remote-Email": "alice@example.com" },
      });
      expect(res.status).toBe(200);
      expect((await res.json()).user.username).toBe("alice@example.com");
    });
  });

  describe("admin mapping", () => {
    test("configured admin group grants admin and revocation demotes", async () => {
      enableProxyAuth({ PROXY_AUTH_ADMIN_GROUP: "chat-admins" });

      const promoted = await proxyRequest(app, "GET", "/api/auth/session", {
        user: "alice",
        groups: "users,chat-admins",
      });
      expect((await promoted.json()).user.role).toBe("admin");

      const adminRes = await proxyRequest(app, "GET", "/api/admin/users", {
        user: "alice",
        groups: "users,chat-admins",
      });
      expect(adminRes.status).toBe(200);

      const demoted = await proxyRequest(app, "GET", "/api/auth/session", {
        user: "alice",
        groups: "users",
      });
      expect((await demoted.json()).user.role).toBe("member");

      const forbidden = await proxyRequest(app, "GET", "/api/admin/users", {
        user: "alice",
        groups: "users",
      });
      expect(forbidden.status).toBe(403);
    });

    test("configured admin user grants admin", async () => {
      enableProxyAuth({ PROXY_AUTH_ADMIN_USER: "alice" });

      const admin = await proxyRequest(app, "GET", "/api/auth/session", { user: "alice" });
      expect((await admin.json()).user.role).toBe("admin");

      const member = await proxyRequest(app, "GET", "/api/auth/session", { user: "bob" });
      expect((await member.json()).user.role).toBe("member");
    });

    test("role sync leaves non-admin custom roles alone", async () => {
      await createTestUser({ username: "reader", role: "readonly" });
      enableProxyAuth({ PROXY_AUTH_ADMIN_GROUP: "chat-admins" });

      const res = await proxyRequest(app, "GET", "/api/auth/session", { user: "reader" });
      expect((await res.json()).user.role).toBe("readonly");
    });

    test("roles are untouched when no admin mapping is configured", async () => {
      await createTestUser({ username: "existing-admin", role: "admin" });
      enableProxyAuth();

      const res = await proxyRequest(app, "GET", "/api/auth/session", { user: "existing-admin" });
      expect((await res.json()).user.role).toBe("admin");
    });
  });

  describe("password endpoints", () => {
    test("login, register, and change-password are disabled", async () => {
      enableProxyAuth();

      const login = await proxyRequest(app, "POST", "/api/auth/login", {
        body: { username: "alice", password: "whatever123" },
      });
      expect(login.status).toBe(403);

      const register = await proxyRequest(app, "POST", "/api/auth/register", {
        body: { username: "alice", password: "whatever123" },
      });
      expect(register.status).toBe(403);

      const change = await proxyRequest(app, "PUT", "/api/auth/change-password", {
        user: "alice",
        body: { currentPassword: "whatever123", newPassword: "whatever456" },
      });
      expect(change.status).toBe(403);
    });

    test("logout returns the provider logout URL without dropping the identity", async () => {
      enableProxyAuth({ PROXY_AUTH_LOGOUT_URL: "https://auth.example.com/logout" });

      const res = await proxyRequest(app, "POST", "/api/auth/logout", { user: "alice" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logoutUrl).toBe("https://auth.example.com/logout");

      const session = await proxyRequest(app, "GET", "/api/auth/session", { user: "alice" });
      expect(session.status).toBe(200);
    });
  });

  describe("request scoping", () => {
    test("proxy identity owns its own chats", async () => {
      enableProxyAuth();

      const created = await proxyRequest(app, "POST", "/api/chats", {
        user: "alice",
        body: { title: "Alice chat" },
      });
      expect(created.status).toBe(201);
      const { chat } = await created.json();

      const bobList = await proxyRequest(app, "GET", "/api/chats", { user: "bob" });
      const bobChats = await bobList.json();
      expect(bobChats.chats.find((entry) => entry.id === chat.id)).toBeUndefined();
    });
  });

  describe("password mode is unaffected", () => {
    test("session reports password mode when proxy auth is off", async () => {
      const res = await makeRequest(app, "GET", "/api/auth/session");
      expect(res.status).toBe(401);
      expect((await res.json()).authMode).toBe("password");
    });

    test("proxy headers are ignored when disabled", async () => {
      const res = await proxyRequest(app, "GET", "/api/auth/session", { user: "alice" });
      expect(res.status).toBe(401);
      expect(db.prepare("SELECT COUNT(*) as count FROM users").get().count).toBe(0);
    });
  });
});
