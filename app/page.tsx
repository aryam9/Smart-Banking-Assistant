"use client";

import { useState } from "react";
import AgentChat from "@/components/AgentChat";
import Overview from "@/components/Overview";

export default function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">PayWise · Smart banking assistant</h1>
          <p className="text-sm text-slate-500">Ask in plain English. Your accounts update live.</p>
        </div>
        <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-900">
          Log out
        </button>
      </header>
      <div className="grid min-w-0 gap-4 md:grid-cols-5">
        <section className="md:col-span-3">
          <AgentChat onDataChanged={() => setRefreshKey((k) => k + 1)} />
        </section>
        <section className="min-w-0 md:col-span-2">
          <Overview refreshKey={refreshKey} />
        </section>
      </div>
    </main>
  );
}
