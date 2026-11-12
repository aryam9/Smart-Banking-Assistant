"use client";

import { useEffect, useState } from "react";

const categories = [
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

type OverviewData = {
  accounts: {
    id: string;
    nickname: string;
    account_type: string;
    masked_number: string;
    balance: number;
    is_frozen: boolean;
  }[];
  transactions: {
    id: number;
    txn_date: string;
    account_nickname: string;
    description: string;
    category: string;
    direction: "debit" | "credit";
    amount: number;
  }[];
  budgets: {
    category: string;
    monthly_limit: number;
    alert_at_pct: number;
    spent: number;
    percent_used: number;
  }[];
};

function formatRupees(amount: number): string {
  return `Rs ${Number(amount).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export default function Overview({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    async function loadOverview() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/overview", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load banking overview");
        if (active) {
          setData(result as OverviewData);
          setError("");
        }
      } catch (loadError) {
        if (active && loadError instanceof Error && loadError.name !== "AbortError") {
          setError(loadError.message);
        }
      }
    }

    void loadOverview();
    const intervalId = window.setInterval(() => void loadOverview(), 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      controller?.abort();
    };
  }, [refreshKey]);

  const visibleTransactions =
    data?.transactions.filter((transaction) => category === "all" || transaction.category === category) ??
    [];

  return (
    <div className="min-w-0 space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">My accounts</h2>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          {!data && !error && <p className="p-2 text-sm text-slate-500">Loading accounts...</p>}
          {data?.accounts.map((account) => (
            <article key={account.id} className="min-w-0 rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium">{account.nickname}</h3>
                  <p className="text-xs capitalize text-slate-500">{account.account_type}</p>
                </div>
                {account.is_frozen && (
                  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    Frozen
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500">{account.masked_number}</p>
              <p className="mt-1 text-lg font-semibold">{formatRupees(account.balance)}</p>
            </article>
          ))}
          {data?.accounts.length === 0 && (
            <p className="p-2 text-sm text-slate-500">No accounts found.</p>
          )}
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">My budgets</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {!data && !error && <p className="p-4 text-sm text-slate-500">Loading budgets...</p>}
          {data?.budgets.map((budget) => {
            const progressColor =
              budget.percent_used >= 100
                ? "bg-red-500"
                : budget.percent_used >= budget.alert_at_pct
                  ? "bg-amber-500"
                  : "bg-emerald-500";
            return (
              <div key={budget.category} className="px-4 py-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <span className="text-sm font-medium capitalize">{budget.category}</span>
                  <span className="text-right text-xs text-slate-600">
                    {formatRupees(budget.spent)} spent of {formatRupees(budget.monthly_limit)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${budget.category} budget used`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.max(0, budget.percent_used))}
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className={`h-full rounded-full ${progressColor}`}
                    style={{ width: `${Math.min(100, Math.max(0, budget.percent_used))}%` }}
                  />
                </div>
              </div>
            );
          })}
          {data?.budgets.length === 0 && (
            <p className="p-4 text-sm text-slate-500">No budgets set yet.</p>
          )}
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">Transactions</h2>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="max-w-[155px] rounded-md border border-slate-300 bg-white px-2 py-1 text-sm capitalize"
            >
              <option value="all">All</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="divide-y divide-slate-100">
          {!data && !error && <p className="p-4 text-sm text-slate-500">Loading transactions...</p>}
          {visibleTransactions.map((transaction) => {
            const isCredit = transaction.direction === "credit";
            return (
              <article
                key={transaction.id}
                className="flex min-w-0 items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{transaction.description}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(transaction.txn_date)} · {transaction.account_nickname}
                  </p>
                </div>
                <p
                  className={`shrink-0 whitespace-nowrap text-sm font-semibold ${
                    isCredit ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {isCredit ? "+" : "-"}
                  {formatRupees(transaction.amount)}
                </p>
              </article>
            );
          })}
          {data && visibleTransactions.length === 0 && (
            <p className="p-4 text-sm text-slate-500">No transactions in this category.</p>
          )}
        </div>
      </section>
    </div>
  );
}
