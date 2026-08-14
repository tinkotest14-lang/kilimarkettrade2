import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ConnectInput = z.object({
  login: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  server: z.string().min(1).max(128),
  platform: z.string().min(1).max(64).default("MetaTrader 5"),
});

const OrderInput = z.object({
  symbol: z.string().min(1).max(32),
  side: z.enum(["buy", "sell"]),
  volume: z.number().positive().max(1000),
  stopLoss: z.number().nullable().optional(),
  takeProfit: z.number().nullable().optional(),
  comment: z.string().max(64).optional(),
});

export interface Mt5Account {
  login: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  leverage: number;
}

export interface Mt5Position {
  ticket: string;
  symbol: string;
  side: string;
  volume: number;
  price_open: number;
  price_current: number;
  stop_loss: number | null;
  take_profit: number | null;
  profit: number;
  swap: number;
  opened_at: string;
}

export interface Mt5Deal {
  ticket: string;
  symbol: string;
  side: string;
  volume: number;
  price: number;
  profit: number;
  closed_at: string;
}

function bridge() {
  const url = process.env.MT5_BRIDGE_URL;
  const token = process.env.MT5_BRIDGE_TOKEN;
  if (!url) throw new Error("MT5 bridge is not configured yet.");
  return {
    async call<T>(path: string, body?: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
      const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`MT5 bridge error (${res.status}): ${text.slice(0, 200)}`);
      return (text ? JSON.parse(text) : {}) as T;
    },
  };
}

export const mt5Configured = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(process.env.MT5_BRIDGE_URL),
}));

export const mt5Connect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConnectInput.parse(input))
  .handler(async ({ data, context }) => {
    const account = await bridge().call<Mt5Account>("/connect", data);
    await context.supabase.from("broker_accounts").upsert(
      {
        user_id: context.userId,
        login: data.login,
        server: data.server,
        platform: data.platform,
        is_connected: true,
        last_connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,login,server" },
    );
    return account;
  });

export const mt5Disconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await bridge().call("/disconnect", {});
    await context.supabase
      .from("broker_accounts")
      .update({ is_connected: false })
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const mt5Account = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () =>
    bridge().call<Mt5Account>("/account", undefined, "GET"),
  );

export const mt5Positions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => bridge().call<Mt5Position[]>("/positions", undefined, "GET"));

export const mt5History = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => bridge().call<Mt5Deal[]>("/history", undefined, "GET"));

export const mt5PlaceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrderInput.parse(input))
  .handler(async ({ data }) => bridge().call<{ ticket: string; price: number }>("/order", data));

export const mt5ClosePosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ticket: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => bridge().call<{ price: number; profit: number }>("/close", data));
