import { freshness, STATUSES } from "@toonstudio/contracts/admin-production-change";

import type { RequestRecord } from "@toonstudio/contracts/admin-production-change";

export type ChangeView = "all" | "approval" | "conflict" | "verification" | "guide";
export type ChangeFilters = { search: string; status: string; impact: string; conflict: string; freshness: string; sort: string };
export const emptyChangeFilters = (): ChangeFilters => ({ search: "", status: "all", impact: "all", conflict: "all", freshness: "all", sort: "updated" });
export function filterProductionChanges(records: RequestRecord[], view: ChangeView, filters: ChangeFilters, now = Date.now()): RequestRecord[] {
  const weights = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return records.filter(record => {
    const fresh = freshness(record, now).key;
    return (view !== "approval" || ["submitted", "analysis", "review"].includes(record.status))
      && (view !== "conflict" || ["open", "resolved"].includes(record.data.conflictState))
      && (view !== "verification" || ["applied", "verified", "closed"].includes(record.status))
      && (filters.status === "all" || filters.status === record.status)
      && (filters.impact === "all" || filters.impact === record.data.impact)
      && (filters.conflict === "all" || filters.conflict === record.data.conflictState)
      && (filters.freshness === "all" || filters.freshness === fresh || (filters.freshness === "attention" && ["stale", "changed"].includes(fresh)))
      && (!filters.search || [record.code, record.data.title, record.data.project, record.data.episode, record.data.assets, record.data.baseRevision, record.data.application.resultRevision, record.data.owner].join(" ").toLocaleLowerCase().includes(filters.search.toLocaleLowerCase()));
  }).sort((a, b) => {
    if (filters.sort === "impact") return weights[b.data.impact] - weights[a.data.impact] || b.updatedAt.localeCompare(a.updatedAt);
    if (filters.sort === "status") return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
    if (filters.sort === "conflict") return Number(b.data.conflictState === "open") - Number(a.data.conflictState === "open") || b.updatedAt.localeCompare(a.updatedAt);
    if (filters.sort === "freshness") return (freshness(a, now).latestAt || "").localeCompare(freshness(b, now).latestAt || "");
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
