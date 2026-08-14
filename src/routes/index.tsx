import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KiliMarkets \u2014 AI Algorithmic Trading Terminal" },
      {
        name: "description",
        content:
          "Live charts, technical indicators and automated trading bots with MetaTrader 5 execution, in one dark terminal.",
      },
      { property: "og:title", content: "KiliMarkets \u2014 AI Algorithmic Trading Terminal" },
      {
        property: "og:description",
        content: "Live charts, indicators and automated trading bots with MetaTrader 5 execution.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    void navigate({ to: user ? "/charts" : "/auth", replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
