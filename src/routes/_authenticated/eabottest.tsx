import { createFileRoute } from "@tanstack/react-router";
import { EABOTestPage } from "@/components/app/EABOTestPage";

export const Route = createFileRoute("/_authenticated/eabottest")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" && ["chart", "botting", "accounting", "tools"].includes(search.tab) ? search.tab : "chart",
  }),
  head: () => ({
    meta: [
      { title: "Bot overview · Automated Robot Trading" },
      { name: "description", content: "Paper-trading simulator with live bot logic, charting, accounting and automated strategy decisions." },
    ],
  }),
  component: EABOTestPage,
});
