import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useUiState = create(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      // No shipped guess: the enabled model marked default wins until the user picks
      preferredModel: null,
      preferredImageModel: null,
      theme: "dark",
      autoScroll: true,
      imageMode: false,
      webSearchEnabled: false,
      pendingResubmit: null,
      searchOpen: false,

      setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarCollapsed: (isCollapsed) => set({ sidebarCollapsed: isCollapsed }),
      toggleSidebarCollapse: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setPreferredModel: (modelId) => set({ preferredModel: modelId }),
      setPreferredImageModel: (modelId) => set({ preferredImageModel: modelId }),
      toggleTheme: () => set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      setAutoScroll: (enabled) => set({ autoScroll: enabled }),
      setImageMode: (enabled) => set({ imageMode: enabled }),
      toggleImageMode: () => set((state) => ({ imageMode: !state.imageMode })),
      setWebSearchEnabled: (v) => set({ webSearchEnabled: v }),
      toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),
      setPendingResubmit: (pending) => set({ pendingResubmit: pending }),
      clearPendingResubmit: () => set({ pendingResubmit: null }),
      setSearchOpen: (isOpen) => set({ searchOpen: isOpen }),
    }),
    {
      name: "ui-state",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        sidebarCollapsed: state.sidebarCollapsed,
        preferredModel: state.preferredModel,
        preferredImageModel: state.preferredImageModel,
        theme: state.theme,
        autoScroll: state.autoScroll,
      }),
    }
  )
);
