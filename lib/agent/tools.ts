import "server-only";
import { z } from "zod";
import { defineTool, type AgentTool } from "./defineTool";
import { CURRENT_USER_ID } from "../currentUser";
import { monthRange } from "../dates";
import { getSupabase } from "../supabase";
import { isoDate } from "../schemas";

const transactionCategories = [
  "food",
  "groceries",
  "shopping",
  "travel",
  "bills",
  "rent",
  "entertainment",
  "health",
  "education",
  "salary",
  "transfer",
  "other",
] as const;

const spendingQuery = async (start: string, end: string) => {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("category, amount, accounts!inner(customer_id)")
    .eq("accounts.customer_id", CURRENT_USER_ID)
    .eq("direction", "debit")
    .neq("category", "transfer")
    .gte("txn_date", start)
    .lt("txn_date", end);
  if (error) throw new Error(error.message);
  return data;
};

const getMyAccounts = defineTool({
  name: "getMyAccounts",
  description:
    "Use this when the user asks to see their accounts or transfer limits. Takes no arguments and returns at most 20 accounts.",
  schema: z.object({}),
  run: async () => {
    const supabase = getSupabase();
    const [accountsResult, customerResult] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, nickname, account_type, masked_number, balance, is_frozen")
        .eq("customer_id", CURRENT_USER_ID)
        .limit(20),
      supabase.from("customers").select("kyc_level").eq("id", CURRENT_USER_ID).maybeSingle(),
    ]);
    if (accountsResult.error) throw new Error(accountsResult.error.message);
    if (customerResult.error) throw new Error(customerResult.error.message);
    if (!customerResult.data) throw new Error("Logged-in customer was not found");

    const { data: limits, error: limitsError } = await supabase
      .from("transfer_limits")
      .select("per_txn_limit, daily_limit")
      .eq("kyc_level", customerResult.data.kyc_level)
      .maybeSingle();
    if (limitsError) throw new Error(limitsError.message);
    if (!limits) throw new Error("Transfer limits were not found for this KYC level");

    return {
      accounts: accountsResult.data,
      kyc_level: customerResult.data.kyc_level,
      per_txn_limit: limits.per_txn_limit,
      daily_limit: limits.daily_limit,
    };
  },
});

const getTransactions = defineTool({
  name: "getTransactions",
  description:
    "Use this when the user asks to view or filter their transactions. Returns at most 20 rows, newest first; to_date is included, and dates use India time.",
  schema: z.object({
    account_id: z.string().optional().describe('Optional account ID, for example "A100".'),
    category: z
      .enum(transactionCategories)
      .optional()
      .describe(
        "Optional category: food, groceries, shopping, travel, bills, rent, entertainment, health, education, salary, transfer, or other."
      ),
    direction: z
      .enum(["debit", "credit"])
      .optional()
      .describe('Optional direction: "debit" or "credit".'),
    from_date: isoDate.optional().describe("Optional start date in YYYY-MM-DD format, India time."),
    to_date: isoDate
      .optional()
      .describe("Optional end date in YYYY-MM-DD format, India time, included in results."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum rows to return: a whole number from 1 to 20; defaults to 10."),
  }),
  run: async ({ account_id, category, direction, from_date, to_date, limit }) => {
    let query = getSupabase()
      .from("transactions")
      .select(
        "id, txn_date, description, category, direction, amount, accounts!inner(customer_id, nickname)"
      )
      .eq("accounts.customer_id", CURRENT_USER_ID)
      .order("txn_date", { ascending: false })
      .limit(limit);
    if (account_id) query = query.eq("account_id", account_id);
    if (category) query = query.eq("category", category);
    if (direction) query = query.eq("direction", direction);
    if (from_date) query = query.gte("txn_date", `${from_date}T00:00:00+05:30`);
    if (to_date) {
      const [year, month, day] = to_date.split("-").map(Number);
      const exclusiveEnd = new Date(Date.UTC(year, month - 1, day + 1));
      const nextDate = `${exclusiveEnd.getUTCFullYear()}-${String(exclusiveEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(exclusiveEnd.getUTCDate()).padStart(2, "0")}T00:00:00+05:30`;
      query = query.lt("txn_date", nextDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return {
      transactions: data.map((transaction) => {
        const account = Array.isArray(transaction.accounts)
          ? transaction.accounts[0]
          : transaction.accounts;
        if (!account) throw new Error("Transaction account was not found");
        return {
          id: transaction.id,
          txn_date: transaction.txn_date,
          account_nickname: account.nickname,
          description: transaction.description,
          category: transaction.category,
          direction: transaction.direction,
          amount: transaction.amount,
        };
      }),
    };
  },
});

const getSpendSummary = defineTool({
  name: "getSpendSummary",
  description:
    "Use this when the user asks for a spending summary. Spending includes debit transactions except transfer category, for this month or last month in India time.",
  schema: z.object({
    period: z
      .enum(["this_month", "last_month"])
      .default("this_month")
      .describe('Month to summarize: "this_month" or "last_month"; defaults to "this_month".'),
  }),
  run: async ({ period }) => {
    const range = monthRange(period === "this_month" ? "this" : "last");
    const transactions = await spendingQuery(range.start, range.end);
    const totals = new Map<string, number>();
    let totalSpent = 0;
    for (const transaction of transactions) {
      const amount = Number(transaction.amount);
      totalSpent += amount;
      totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + amount);
    }
    const categories = [...totals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    return {
      period,
      total_spent: totalSpent,
      transaction_count: transactions.length,
      categories,
    };
  },
});

const getBudgetStatus = defineTool({
  name: "getBudgetStatus",
  description:
    "Use this when the user asks how their budgets are doing. Takes no arguments and returns at most 20 budgets with this month's debit spending excluding transfers, in India time.",
  schema: z.object({}),
  run: async () => {
    const { data: budgets, error } = await getSupabase()
      .from("budgets")
      .select("category, monthly_limit, alert_at_pct")
      .eq("customer_id", CURRENT_USER_ID)
      .limit(20);
    if (error) throw new Error(error.message);

    const range = monthRange("this");
    const transactions = await spendingQuery(range.start, range.end);
    const spendingByCategory = new Map<string, number>();
    for (const transaction of transactions) {
      spendingByCategory.set(
        transaction.category,
        (spendingByCategory.get(transaction.category) ?? 0) + Number(transaction.amount)
      );
    }

    return {
      budgets: budgets.map((budget) => {
        const spent = spendingByCategory.get(budget.category) ?? 0;
        const monthlyLimit = Number(budget.monthly_limit);
        return {
          category: budget.category,
          monthly_limit: monthlyLimit,
          spent,
          left: Math.max(0, monthlyLimit - spent),
          percent_used: Math.round((spent / monthlyLimit) * 100),
          alert_at_pct: budget.alert_at_pct,
          alert_reached: spent >= (monthlyLimit * budget.alert_at_pct) / 100,
        };
      }),
    };
  },
});

const transferFunds = defineTool({
  name: "transferFunds",
  description:
    "Use this when the customer wants to move money between their own accounts. Needs real account ids, so call getMyAccounts first if you do not know them.",
  writes: true,
  schema: z.object({
    from_account: z.string().describe('Source account ID, for example "A100".'),
    to_account: z.string().describe('Destination account ID, for example "A101".'),
    amount: z.number().positive().describe("Transfer amount in rupees; must be more than 0."),
    note: z
      .string()
      .max(100)
      .optional()
      .describe("Optional transfer note, at most 100 characters."),
  }),
  run: async ({ from_account, to_account, amount, note }) => {
    const { data, error } = await getSupabase().rpc("transfer_funds", {
      p_customer_id: CURRENT_USER_ID,
      p_from_account: from_account,
      p_to_account: to_account,
      p_amount: amount,
      p_note: note ?? null,
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

const budgetCategories = [
  "food",
  "groceries",
  "shopping",
  "travel",
  "bills",
  "rent",
  "entertainment",
  "health",
  "education",
  "other",
] as const;

const setBudgetAlert = defineTool({
  name: "setBudgetAlert",
  description:
    "Use this when the customer wants to set or change a monthly spending budget or an alert level for a category.",
  writes: true,
  schema: z.object({
    category: z
      .enum(budgetCategories)
      .describe(
        "Budget category: food, groceries, shopping, travel, bills, rent, entertainment, health, education, or other."
      ),
    monthly_limit: z
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .describe("Monthly budget in whole rupees; more than 0 and at most 1,000,000."),
    alert_at_pct: z
      .number()
      .int()
      .min(10)
      .max(100)
      .default(80)
      .describe("Alert percentage as a whole number from 10 to 100; defaults to 80."),
  }),
  run: async ({ category, monthly_limit, alert_at_pct }) => {
    if (!Number.isInteger(monthly_limit) || monthly_limit <= 0 || monthly_limit > 1_000_000) {
      throw new Error("Monthly budget must be a whole number of rupees from 1 to 1,000,000.");
    }
    if (!Number.isInteger(alert_at_pct) || alert_at_pct < 10 || alert_at_pct > 100) {
      throw new Error("Alert level must be a whole-number percentage from 10 to 100.");
    }

    const supabase = getSupabase();
    const { data: existing, error: existingError } = await supabase
      .from("budgets")
      .select("monthly_limit")
      .eq("customer_id", CURRENT_USER_ID)
      .eq("category", category)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const { data, error } = await supabase
      .from("budgets")
      .upsert(
        {
          customer_id: CURRENT_USER_ID,
          category,
          monthly_limit,
          alert_at_pct,
        },
        { onConflict: "customer_id,category" }
      )
      .select("category, monthly_limit, alert_at_pct")
      .single();
    if (error) throw new Error(error.message);

    return {
      category: data.category,
      monthly_limit: Number(data.monthly_limit),
      alert_at_pct: data.alert_at_pct,
      action: existing ? "updated" : "created",
      previous_limit: existing ? Number(existing.monthly_limit) : null,
    };
  },
});

export const tools: AgentTool[] = [
  getMyAccounts,
  getTransactions,
  getSpendSummary,
  getBudgetStatus,
  transferFunds,
  setBudgetAlert,
];
