"use client";

import { useTransition } from "react";
import { updateQaSiteField } from "@/app/(app)/qa/actions";

type ChecklistItem = {
  field: string;
  label: string;
  value: string;
};

export function QaSiteChecklist({
  siteId,
  items,
  isAdmin,
}: {
  siteId: string;
  items: ChecklistItem[];
  isAdmin: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <CheckItem key={item.field} siteId={siteId} item={item} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

function CheckItem({
  siteId,
  item,
  isAdmin,
}: {
  siteId: string;
  item: ChecklistItem;
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const isDone = item.value?.toLowerCase() === "done";

  const handleToggle = () => {
    if (!isAdmin) return;
    startTransition(async () => {
      await updateQaSiteField(siteId, item.field, isDone ? "" : "Done");
    });
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
        isDone ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"
      } ${isAdmin ? "cursor-pointer hover:border-slate-300" : ""} ${isPending ? "opacity-60" : ""}`}
      onClick={isAdmin ? handleToggle : undefined}
      role={isAdmin ? "checkbox" : undefined}
      aria-checked={isDone}
    >
      <span className={`flex-shrink-0 text-base ${isDone ? "text-green-600" : "text-slate-300"}`}>
        {isDone ? "✓" : "○"}
      </span>
      <span className={`leading-tight ${isDone ? "text-green-800" : "text-slate-600"}`}>
        {item.label}
      </span>
    </div>
  );
}
