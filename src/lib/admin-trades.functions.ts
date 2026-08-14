import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ADMIN_EMAIL } from "@/integrations/supabase/client";

function formatSupabaseError(error: unknown, request?: string) {
  const err = error as any;
  const code = err?.code ?? err?.status ?? err?.error?.code ?? "UNKNOWN";
  const message = err?.message ?? err?.error?.message ?? String(err ?? "Unknown error");
  const details = err?.details ?? err?.error?.details ?? err?.error_description ?? "None";
  const hint = err?.hint ?? err?.error?.hint ?? "None";
  const requestContext = request ? `Request: ${request}\n` : "";

  return `${requestContext}Supabase Error:\nCode: ${code}\nMessage: ${message}\nDetails: ${details}\nHint: ${hint}`;
}

export const fetchAdminTradeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [usersResult, tradesResult, manualTradesResult, subscriptionResult, topupsResult, withdrawalsResult, mt5Result, requestsResult] = await Promise.all([
      supabaseAdmin.from("users").select("*").limit(500),
      supabaseAdmin.from("bot_trades").select("*").order("created_at", { ascending: false }).limit(500),
      supabaseAdmin.from("manual_trades").select("*").order("created_at", { ascending: false }).limit(500),
      supabaseAdmin.from("subscription_requests").select("*").order("created_at", { ascending: false }).limit(500),
      supabaseAdmin.from("topups").select("*").order("created_at", { ascending: false }).limit(500),
      supabaseAdmin.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(500),
      supabaseAdmin.from("mt5_requests").select("*").order("created_at", { ascending: false }).limit(500),
      supabaseAdmin.from("account_change_requests").select("*").order("created_at", { ascending: false }).limit(500),
    ]);

    const users = usersResult.data ?? [];
    const usersById = new Map((users as any[]).map((user) => [user.id, user]));
    const botTrades = (tradesResult.data ?? []).map((trade: any) => ({
      ...trade,
      trade_source: "bot",
      trade_type: "bot",
      user_email: usersById.get(trade.user_id)?.email ?? trade.user_email ?? trade.user_id,
      user_name: usersById.get(trade.user_id)?.email ?? trade.user_email ?? trade.user_id,
      outcome: trade.outcome_mode ?? (trade.pnl == null ? "normal" : trade.pnl > 0 ? "profit" : trade.pnl < 0 ? "loss" : "normal"),
    }));
    const manualTrades = (manualTradesResult.data ?? []).map((trade: any) => ({
      ...trade,
      trade_source: "manual",
      trade_type: trade.trade_type ?? "manual",
      side: Number(trade.dir) === 1 ? "buy" : "sell",
      volume: trade.lots,
      entry_price: trade.entry_price,
      user_email: usersById.get(trade.user_id)?.email ?? trade.user_email ?? trade.user_id,
      user_name: usersById.get(trade.user_id)?.email ?? trade.user_email ?? trade.user_id,
      outcome: trade.outcome_mode ?? (trade.pnl == null ? "normal" : trade.pnl > 0 ? "profit" : trade.pnl < 0 ? "loss" : "normal"),
    }));
    const trades = [...botTrades, ...manualTrades].sort((a, b) =>
      new Date(b.created_at ?? b.opened_at ?? 0).getTime() - new Date(a.created_at ?? a.opened_at ?? 0).getTime()
    );

    return {
      users,
      trades,
      manualTrades,
      subscriptionRequests: subscriptionResult.data ?? [],
      topups: topupsResult.data ?? [],
      withdrawals: withdrawalsResult.data ?? [],
      mt5Requests: mt5Result.data ?? [],
      requests: requestsResult.data ?? [],
    };
  });

// Admin: add balance to user (server-side, uses service role)
export const adminAddBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const p = input as any;
    if (!p || typeof p.userId !== 'string') {
      throw new Error(`Invalid input: ${JSON.stringify(p)}`);
    }
    const amount = typeof p.amount === 'string' ? Number(p.amount) : p.amount;
    if (typeof amount !== 'number' || Number.isNaN(amount)) {
      throw new Error(`Invalid input: ${JSON.stringify(p)}`);
    }
    return { userId: p.userId, amount } as { userId: string; amount: number };
  })
  .handler(async ({ data, context }) => {
    try {
      console.log('[adminAddBalance] invoked', { claims: context?.claims, data });
      if (context.claims?.email !== ADMIN_EMAIL) throw new Error('Unauthorized');
      const { userId, amount } = data as { userId: string; amount: number };
      const userData = await supabaseAdmin.from('users').select('balance').eq('id', userId).single();
      if (userData.error) throw new Error(formatSupabaseError(userData.error, `select users where id=${userId}`));
      const next = Number(userData.data?.balance ?? 0) + Number(amount ?? 0);
      const updated = await supabaseAdmin.from('users').update({ balance: next }).eq('id', userId);
      if (updated.error) throw new Error(formatSupabaseError(updated.error, `update users set balance=${next} where id=${userId}`));
      return { ok: true, balance: next };
    } catch (err) {
      console.error('[adminAddBalance] error', err, { data, claims: context?.claims });
      throw new Error(formatSupabaseError(err, `adminAddBalance ${JSON.stringify(data)}`));
    }
  });

// Admin: reset user balance to zero (server-side)
export const adminResetBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const p = input as any;
    if (!p || typeof p.userId !== 'string') {
      throw new Error(`Invalid input: ${JSON.stringify(p)}`);
    }
    return p as { userId: string };
  })
  .handler(async ({ data, context }) => {
    try {
      console.log('[adminResetBalance] invoked', { claims: context?.claims, data });
      if (context.claims?.email !== ADMIN_EMAIL) throw new Error('Unauthorized');
      const { userId } = data as { userId: string };
      const updated = await supabaseAdmin.from('users').update({ balance: 0 }).eq('id', userId);
      if (updated.error) throw new Error(formatSupabaseError(updated.error, `update users set balance=0 where id=${userId}`));
      return { ok: true };
    } catch (err) {
      console.error('[adminResetBalance] error', err, { data, claims: context?.claims });
      throw new Error(formatSupabaseError(err, `adminResetBalance ${JSON.stringify(data)}`));
    }
  });

export const approveSubscriptionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const p = input as any;
    if (!p || typeof p.requestId !== 'string') {
      throw new Error(`Invalid input: ${JSON.stringify(p)}`);
    }
    return { requestId: p.requestId };
  })
  .handler(async ({ data, context }) => {
    try {
      console.log('[approveSubscriptionRequest] invoked', { claims: context?.claims, data });
      
      if (!context?.claims?.email) {
        throw new Error('No email in claims - not authenticated');
      }
      
      if (context.claims.email !== ADMIN_EMAIL) {
        throw new Error(`Unauthorized: user email ${context.claims.email} is not admin email ${ADMIN_EMAIL}`);
      }

      const { requestId } = data as { requestId: string };
      console.log('[approveSubscriptionRequest] fetching subscription with id:', requestId);
      
      const subscription = await supabaseAdmin.from('subscription_requests').select('*').eq('id', requestId).single();
      if (subscription.error) throw new Error(formatSupabaseError(subscription.error, `select subscription_requests where id=${requestId}`));
      if (!subscription.data) throw new Error(`Subscription request not found: ${requestId}`);

      const request = subscription.data as any;
      console.log('[approveSubscriptionRequest] updating subscription_requests table');
      
      const requestUpdate = await supabaseAdmin.from('subscription_requests').update({ status: 'approved' }).eq('id', requestId);
      if (requestUpdate.error) throw new Error(formatSupabaseError(requestUpdate.error, `update subscription_requests set status=approved where id=${requestId}`));

      const updatePayload: any = {
        subscribed: true,
        subscription_status: 'approved',
      };
      if (request.subscription_plan) updatePayload.subscription_plan = request.subscription_plan;
      if (request.amount != null) updatePayload.subscription_amount = request.amount;
      if (request.network) updatePayload.subscription_network = request.network;

      const userIdentifier = request.user_id || request.user_email;
      if (!userIdentifier) throw new Error(`Subscription request missing user_id and user_email for request: ${requestId}`);

      console.log('[approveSubscriptionRequest] updating users table with payload:', updatePayload);
      
      const userQuery = request.user_id
        ? supabaseAdmin.from('users').update(updatePayload).eq('id', request.user_id)
        : supabaseAdmin.from('users').update(updatePayload).eq('email', request.user_email);

      const userUpdate = await userQuery;
      if (userUpdate.error) throw new Error(formatSupabaseError(userUpdate.error, `update users for approved subscription request ${requestId}`));

      console.log('[approveSubscriptionRequest] success');
      return { ok: true };
    } catch (err) {
      console.error('[approveSubscriptionRequest] error', err, { data, claims: context?.claims });
      throw new Error(formatSupabaseError(err, `approveSubscriptionRequest ${JSON.stringify(data)}`));
    }
  });

export const declineSubscriptionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const p = input as any;
    if (!p || typeof p.requestId !== 'string') {
      throw new Error(`Invalid input: ${JSON.stringify(p)}`);
    }
    return { requestId: p.requestId };
  })
  .handler(async ({ data, context }) => {
    try {
      console.log('[declineSubscriptionRequest] invoked', { claims: context?.claims, data });
      
      if (!context?.claims?.email) {
        throw new Error('No email in claims - not authenticated');
      }
      
      if (context.claims.email !== ADMIN_EMAIL) {
        throw new Error(`Unauthorized: user email ${context.claims.email} is not admin email ${ADMIN_EMAIL}`);
      }

      const { requestId } = data as { requestId: string };
      console.log('[declineSubscriptionRequest] fetching subscription with id:', requestId);
      
      const subscription = await supabaseAdmin.from('subscription_requests').select('*').eq('id', requestId).single();
      if (subscription.error) throw new Error(formatSupabaseError(subscription.error, `select subscription_requests where id=${requestId}`));
      if (!subscription.data) throw new Error(`Subscription request not found: ${requestId}`);

      const request = subscription.data as any;
      console.log('[declineSubscriptionRequest] updating subscription_requests table');
      
      const requestUpdate = await supabaseAdmin.from('subscription_requests').update({ status: 'declined' }).eq('id', requestId);
      if (requestUpdate.error) throw new Error(formatSupabaseError(requestUpdate.error, `update subscription_requests set status=declined where id=${requestId}`));

      console.log('[declineSubscriptionRequest] updating users table');
      
      const userQuery = request.user_id
        ? supabaseAdmin.from('users').update({ subscribed: false, subscription_status: 'declined' }).eq('id', request.user_id)
        : supabaseAdmin.from('users').update({ subscribed: false, subscription_status: 'declined' }).eq('email', request.user_email);

      const userUpdate = await userQuery;
      if (userUpdate.error) throw new Error(formatSupabaseError(userUpdate.error, `update users for declined subscription request ${requestId}`));

      console.log('[declineSubscriptionRequest] success');
      return { ok: true };
    } catch (err) {
      console.error('[declineSubscriptionRequest] error', err, { data, claims: context?.claims });
      throw new Error(formatSupabaseError(err, `declineSubscriptionRequest ${JSON.stringify(data)}`));
    }
  });

// New: Direct user subscription management
export const updateUserSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const p = input as any;
    if (!p || typeof p.userId !== 'string') {
      throw new Error(`Invalid input: userId required`);
    }
    return {
      userId: p.userId,
      subscribed: p.subscribed ?? false,
      subscription_status: p.subscription_status ?? 'pending',
      subscription_plan: p.subscription_plan ?? null,
      subscription_amount: p.subscription_amount ?? null,
      subscription_network: p.subscription_network ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    try {
      console.log('[updateUserSubscription] invoked', { claims: context?.claims, data });
      if (context.claims?.email !== ADMIN_EMAIL) throw new Error('Unauthorized');

      const { userId, subscribed, subscription_status, subscription_plan, subscription_amount, subscription_network } = data as any;
      
      const updatePayload: any = {
        subscribed,
        subscription_status,
      };
      if (subscription_plan) updatePayload.subscription_plan = subscription_plan;
      if (subscription_amount != null) updatePayload.subscription_amount = subscription_amount;
      if (subscription_network) updatePayload.subscription_network = subscription_network;

      // Update users table
      const updated = await supabaseAdmin.from('users').update(updatePayload).eq('id', userId);
      if (updated.error) throw new Error(formatSupabaseError(updated.error, `update users subscription for ${userId}`));

      // Also update any pending subscription_requests for this user to match
      if (subscription_status && subscription_status !== 'pending') {
        await supabaseAdmin
          .from('subscription_requests')
          .update({ status: subscription_status })
          .eq('user_id', userId)
          .in('status', ['pending', 'Pending']); // Only update if currently pending
      }

      return { ok: true };
    } catch (err) {
      console.error('[updateUserSubscription] error', err, { data, claims: context?.claims });
      throw new Error(formatSupabaseError(err, `updateUserSubscription ${JSON.stringify(data)}`));
    }
  });


export const adminCreateManualTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const p = input as any;
    if (!p || typeof p !== "object" || typeof p.userId !== "string" || typeof p.symbol !== "string") {
      throw new Error("Invalid input: userId and symbol are required");
    }
    const dir = Number(p.dir);
    const lots = Number(p.lots);
    const entryPrice = Number(p.entryPrice);
    if (![1, -1].includes(dir) || !Number.isFinite(lots) || lots <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
      throw new Error("Invalid input: dir, lots, and entryPrice are invalid");
    }
    const mode = ["normal", "profit", "loss"].includes(p.outcomeMode) ? p.outcomeMode : "normal";
    return { userId: p.userId, symbol: p.symbol, dir, lots, entryPrice, outcomeMode: mode as 'normal' | 'profit' | 'loss' };
  })
  .handler(async ({ data, context }) => {
    try {
      if (context.claims?.email !== ADMIN_EMAIL) throw new Error("Unauthorized");
      const { data: user, error: userError } = await supabaseAdmin.from("users").select("id, email, trading_outcome_mode").eq("id", data.userId).single();
      if (userError) throw new Error(formatSupabaseError(userError, `select users where id=${data.userId}`));
      const mode = data.outcomeMode ?? user.trading_outcome_mode ?? "normal";
      const inserted = await supabaseAdmin.from("manual_trades").insert({
        user_id: data.userId,
        user_email: user.email,
        symbol: data.symbol,
        dir: data.dir,
        lots: data.lots,
        entry_price: data.entryPrice,
        status: "open",
        trade_type: "manual",
        outcome_mode: mode,
        opened_at: new Date().toISOString(),
      }).select("*").single();
      if (inserted.error) throw new Error(formatSupabaseError(inserted.error, `insert manual_trades for ${data.userId}`));
      return { ok: true, trade: inserted.data };
    } catch (err) {
      throw new Error(formatSupabaseError(err, `adminCreateManualTrade ${JSON.stringify(data)}`));
    }
  });

// Admin: update user page locks. TanStack Start server functions receive their
// payload through the { data: ... } call shape.
export const updateUserPageLocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const p = input as any;
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      throw new Error("Invalid input: input must be an object with userId and pageLocks");
    }
    if (typeof p.userId !== "string" || !p.userId.trim()) {
      throw new Error("Invalid input: userId must be a non-empty string");
    }
    if (!p.pageLocks || typeof p.pageLocks !== "object" || Array.isArray(p.pageLocks)) {
      throw new Error("Invalid input: pageLocks must be an object");
    }
    const pageLocks: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(p.pageLocks)) {
      if (typeof value !== "boolean") throw new Error(`Invalid input: pageLocks.${key} must be boolean`);
      pageLocks[key] = value;
    }
    return { userId: p.userId, pageLocks };
  })
  .handler(async ({ data, context }) => {
    try {
      if (context.claims?.email !== ADMIN_EMAIL) throw new Error("Unauthorized");
      const { userId, pageLocks } = data;
      const updated = await supabaseAdmin
        .from("users")
        .update({ page_locks: pageLocks })
        .eq("id", userId)
        .select("id, page_locks")
        .single();
      if (updated.error) throw new Error(formatSupabaseError(updated.error, `update users set page_locks for ${userId}`));
      if (!updated.data) throw new Error(`User not found: ${userId}`);
      return { ok: true, userId, pageLocks: updated.data.page_locks ?? {} };
    } catch (err) {
      throw new Error(formatSupabaseError(err, `updateUserPageLocks ${JSON.stringify(data)}`));
    }
  });

export const updateUserTradingOutcomeMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const p = input as any;
    if (!p || typeof p !== "object" || typeof p.userId !== "string") {
      throw new Error("Invalid input: userId is required");
    }
    if (!['normal', 'profit', 'loss'].includes(p.mode)) {
      throw new Error("Invalid input: mode must be normal, profit, or loss");
    }
    return { userId: p.userId, mode: p.mode as 'normal' | 'profit' | 'loss' };
  })
  .handler(async ({ data, context }) => {
    try {
      if (context.claims?.email !== ADMIN_EMAIL) throw new Error("Unauthorized");
      const updated = await supabaseAdmin
        .from("users")
        .update({ trading_outcome_mode: data.mode })
        .eq("id", data.userId)
        .select("id, trading_outcome_mode")
        .single();
      if (updated.error) throw new Error(formatSupabaseError(updated.error, `update users trading_outcome_mode for ${data.userId}`));
      if (!updated.data) throw new Error(`User not found: ${data.userId}`);
      return { ok: true, ...updated.data };
    } catch (err) {
      throw new Error(formatSupabaseError(err, `updateUserTradingOutcomeMode ${JSON.stringify(data)}`));
    }
  });
