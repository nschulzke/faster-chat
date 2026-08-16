import { create } from "zustand";
import { authClient } from "../lib/authClient.js";
import { queryClient } from "../App.jsx";

export const useAuthState = create((set) => ({
  user: null,
  isLoading: true,
  error: null,
  authMode: "password",
  logoutUrl: null,

  setUser: (user) => set({ user, error: null }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  checkSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await authClient.getSession();
      set({
        user: data.user,
        authMode: data.authMode,
        logoutUrl: data.logoutUrl,
        error: data.error,
        isLoading: false,
      });
      return data.user;
    } catch (error) {
      set({ user: null, isLoading: false, error: error.message });
      return null;
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authClient.login(username, password);
      set({ user: data.user, isLoading: false });
      return data.user;
    } catch (error) {
      set({ user: null, isLoading: false, error: error.message });
      throw error;
    }
  },

  register: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authClient.register(username, password);
      set({ user: data.user, isLoading: false });
      return data.user;
    } catch (error) {
      set({ user: null, isLoading: false, error: error.message });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await authClient.logout();
      // Clear all cached data to prevent cache bleed between users
      queryClient.clear();
      set({ user: null, isLoading: false });
      // Proxy auth owns the session — the identity provider has to end it.
      if (data?.logoutUrl) {
        window.location.href = data.logoutUrl;
      }
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },
}));
