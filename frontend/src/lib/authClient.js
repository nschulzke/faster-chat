import { API_BASE, apiFetch } from "@/lib/api";

export const authClient = {
  async register(username, password) {
    return apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  async login(username, password) {
    return apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  async logout() {
    return apiFetch("/api/auth/logout", {
      method: "POST",
    });
  },

  // Reads the body on 401 too — it carries the auth mode the login UI needs.
  async getSession() {
    try {
      const response = await fetch(`${API_BASE}/api/auth/session`, { credentials: "include" });
      const data = await response.json().catch(() => null);
      return {
        user: data?.user ?? null,
        authMode: data?.authMode ?? "password",
        logoutUrl: data?.logoutUrl ?? null,
        error: data?.error ?? null,
      };
    } catch {
      return { user: null, authMode: "password", logoutUrl: null, error: null };
    }
  },
};
