"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Gift,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import CreateMarketForm from "@/components/admin/CreateMarketForm";
import ManageMarkets from "@/components/admin/ManageMarkets";
import ManageUsers from "@/components/admin/ManageUsers";
import ManageSubadmins from "@/components/admin/ManageSubadmins";
import ManageSuggestions from "@/components/admin/ManageSuggestions";
import PrizesEditor from "@/components/admin/PrizesEditor";
import AdminChat from "@/components/admin/AdminChat";
import clsx from "clsx";

type Tab = "create" | "markets" | "suggestions" | "users" | "subadmins" | "prizes" | "chat";

export default function AdminPage() {
  const { isStaff, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");

  // Server-side RLS + RPC checks are the real gate; this is just UX.
  useEffect(() => {
    if (!loading && !isStaff) router.replace("/");
  }, [loading, isStaff, router]);

  if (loading) {
    return <div className="py-20 text-center text-ink-faint">Loading…</div>;
  }
  if (!isStaff) {
    return (
      <div className="card mx-auto mt-10 max-w-md py-14 text-center">
        <h1 className="text-lg font-semibold">Not authorized</h1>
        <p className="mt-1 text-sm text-ink-dim">This area is for admins and sub-admins only.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: "create", label: "Create Market", icon: <LayoutGrid size={16} /> },
    { id: "markets", label: "Markets", icon: <ListChecks size={16} /> },
    { id: "suggestions", label: "Suggestions", icon: <Lightbulb size={16} /> },
    { id: "users", label: "Users", icon: <Users size={16} /> },
    { id: "subadmins", label: "Sub-admins", icon: <ShieldCheck size={16} />, adminOnly: true },
    { id: "prizes", label: "Prizes", icon: <Gift size={16} />, adminOnly: true },
    { id: "chat", label: "Chat", icon: <MessageSquare size={16} /> },
  ];
  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "create";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin panel</h1>
          <p className="text-sm text-ink-dim">
            {isAdmin ? "Full admin access." : "Sub-admin: manage markets & view players."}
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-bg-soft p-1">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              activeTab === t.id ? "bg-bg-hover text-ink" : "text-ink-faint hover:text-ink"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "create" && <CreateMarketForm />}
        {activeTab === "markets" && <ManageMarkets />}
        {activeTab === "suggestions" && <ManageSuggestions />}
        {activeTab === "users" && <ManageUsers />}
        {activeTab === "subadmins" && isAdmin && <ManageSubadmins />}
        {activeTab === "prizes" && isAdmin && <PrizesEditor />}
        {activeTab === "chat" && <AdminChat />}
      </div>
    </div>
  );
}
