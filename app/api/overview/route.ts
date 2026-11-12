import { NextResponse } from "next/server";
import { CURRENT_USER_ID } from "@/lib/currentUser";
import { monthRange } from "@/lib/dates";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabase();
    const [accountsResult, transactionsResult, budgetsResult] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, nickname, account_type, masked_number, balance, is_frozen")
        .eq("customer_id", CURRENT_USER_ID),
      supabase
        .from("transactions")
        .select(
          "id, txn_date, description, category, direction, amount, accounts!inner(customer_id, nickname)"
        )
        .eq("accounts.customer_id", CURRENT_USER_ID)
        .order("txn_date", { ascending: false })
        .limit(30),
      supabase
        .from("budgets")
        .select("category, monthly_limit, alert_at_pct")
        .eq("customer_id", CURRENT_USER_ID),
    ]);

    if (accountsResult.error) throw accountsResult.error;
    if (transactionsResult.error) throw transactionsResult.error;
    if (budgetsResult.error) throw budgetsResult.error;

    const transactions = transactionsResult.data.map((transaction) => {
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
    });

    const { start, end } = monthRange("this");
    const { data: spendingTransactions, error: spendingError } = await supabase
      .from("transactions")
      .select("category, amount, accounts!inner(customer_id)")
      .eq("accounts.customer_id", CURRENT_USER_ID)
      .eq("direction", "debit")
      .neq("category", "transfer")
      .gte("txn_date", start)
      .lt("txn_date", end);
    if (spendingError) throw spendingError;

    const spendingByCategory = new Map<string, number>();
    for (const transaction of spendingTransactions) {
      spendingByCategory.set(
        transaction.category,
        (spendingByCategory.get(transaction.category) ?? 0) + Number(transaction.amount)
      );
    }

    const budgets = budgetsResult.data.map((budget) => {
      const monthlyLimit = Number(budget.monthly_limit);
      const spent = spendingByCategory.get(budget.category) ?? 0;
      return {
        category: budget.category,
        monthly_limit: monthlyLimit,
        alert_at_pct: budget.alert_at_pct,
        spent,
        percent_used: Math.round((spent / monthlyLimit) * 100),
      };
    });

    return NextResponse.json({ accounts: accountsResult.data, transactions, budgets });
  } catch (error) {
    console.error("Failed to load PayWise overview:", error);
    return NextResponse.json({ error: "Could not load banking overview" }, { status: 500 });
  }
}
