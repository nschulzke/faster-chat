import { useAuthState } from "@/state/useAuthState";
import {
  hasSeenAdminConnectionsOnboarding,
  markAdminConnectionsOnboardingSeen,
} from "@/lib/adminOnboarding";
import { useChatsQuery } from "@/hooks/useChatsQuery";
import Home from "@/pages/authenticated/Home";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "preact/hooks";

export function IndexRouteGuard() {
  const navigate = useNavigate();
  const { user } = useAuthState();
  const { data: chats, isLoading } = useChatsQuery();
  const hasStartedNavigation = useRef(false);

  const needsAdminOnboarding =
    !isLoading &&
    user?.role === "admin" &&
    (chats?.length ?? 0) === 0 &&
    !hasSeenAdminConnectionsOnboarding(user.id);

  useEffect(() => {
    if (!needsAdminOnboarding || hasStartedNavigation.current) {
      return;
    }
    hasStartedNavigation.current = true;

    markAdminConnectionsOnboardingSeen(user.id);
    navigate({
      to: "/admin",
      search: { tab: "connections" },
      replace: true,
    });
  }, [navigate, user, needsAdminOnboarding]);

  if (needsAdminOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-theme-text-muted">Redirecting...</div>
      </div>
    );
  }

  return <Home />;
}
