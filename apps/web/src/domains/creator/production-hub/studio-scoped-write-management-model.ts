import { assertScopeRef, scopeContains, type ProductionProjectAggregate, type ScopeRef } from "@toonstudio/core/production";
import type { StudioScopedEntity, StudioScopedWriteManagementCommand } from "@toonstudio/contracts/studio-scoped-write";

export interface ScopedSavedEntity extends StudioScopedEntity { readonly label: string; readonly type: string; readonly groupId: string | null; readonly consumerKeys?: readonly string[] }
export interface ScopedSavedPage { readonly id: string; readonly entities: readonly ScopedSavedEntity[]; readonly groups: readonly ScopedSavedEntity[]; readonly surfaces: readonly ScopedSavedEntity[] }
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u.test(value);

/** 실제 저장 원고의 ID만 나열한다. 프레임 위치나 폴더 이름으로 담당 대상을 고르지 않는다. */
export function scopedSavedPages(value: unknown): readonly ScopedSavedPage[] {
  const document = record(value);
  if (!document || !Array.isArray(document.pagesList)) throw new Error("저장 원고의 실제 페이지를 불러오지 못했습니다.");
  const seen = new Set<string>(), references = new Map<string, Set<string>>();
  const inspect = (value: unknown, key: string): void => {
    if (Array.isArray(value)) { for (const child of value) inspect(child, key); return; }
    const object = record(value);
    if (!object) return;
    for (const [name, child] of Object.entries(object)) {
      if ((name === "surfaceId" || name.endsWith("SurfaceId")) && id(child)) { const list = references.get(child) ?? new Set<string>(); list.add(key); references.set(child, list); }
      else inspect(child, key);
    }
  };
  const { pagesList, ...global } = document; inspect(global, "global");
  const pages = pagesList.map((value) => {
    const page = record(value);
    if (!page || !id(page.id) || seen.has(page.id) || !Array.isArray(page.elements) || (page.groups !== undefined && !Array.isArray(page.groups))) throw new Error("저장 원고의 페이지 연결을 확인하세요.");
    seen.add(page.id);
    const { elements: _elements, groups: _groups, ...properties } = page; inspect(properties, `page:${page.id}`);
    const groups = (Array.isArray(page.groups) ? page.groups : []).map((value): ScopedSavedEntity => {
      const group = record(value);
      if (!group || !id(group.id)) throw new Error("저장 원고의 실제 레이어 ID가 없습니다.");
      inspect(group, `group:${group.id}`);
      return { kind: "group", id: group.id, label: typeof group.name === "string" ? group.name : group.id, type: "group", groupId: group.id };
    });
    const entities = page.elements.map((value): ScopedSavedEntity => {
      const element = record(value);
      if (!element || !id(element.id) || typeof element.type !== "string") throw new Error("저장 원고의 실제 요소 ID가 없습니다.");
      inspect(element, `${element.type === "draw" ? "stroke" : "element"}:${element.id}`);
      return { kind: element.type === "draw" ? "stroke" : "element", id: element.id,
        label: typeof element.name === "string" && element.name ? element.name : element.id,
        type: element.type, groupId: id(element.groupId) ? element.groupId : null };
    });
    return { id: page.id, groups, entities };
  });
  return pages.map((page) => {
    const keys = new Set(page.entities.map((entry) => `${entry.kind}:${entry.id}`));
    const surfaces = [...references].filter(([, consumers]) => [...consumers].some((key) => keys.has(key))).map(([surfaceId, consumers]): ScopedSavedEntity => ({
      kind: "surface", id: surfaceId, label: "브러시 픽셀 레이어", type: "surface", groupId: null, consumerKeys: [...consumers],
    }));
    return { ...page, surfaces };
  });
}

export function scopedManagementScopes(aggregate: ProductionProjectAggregate, taskScope: ScopeRef): readonly { readonly key: string; readonly scope: ScopeRef; readonly label: string }[] {
  const scopes = [{ key: JSON.stringify(taskScope), scope: taskScope, label: "현재 작업 범위" }], seen = new Set(scopes.map((entry) => entry.key));
  for (const plan of aggregate.cutPlans.filter((plan) => plan.projectId === aggregate.projectId).sort((left, right) => right.revision - left.revision)) {
    const episode = aggregate.episodePlans.filter((entry) => entry.episodeId === plan.episodeId).sort((left, right) => right.revision - left.revision)[0];
    const scope: ScopeRef = { kind: "cut", id: plan.cutId, ancestors: [{ kind: "project", id: aggregate.projectId },
      ...(episode?.seasonId ? [{ kind: "season" as const, id: episode.seasonId }] : []), { kind: "episode", id: plan.episodeId }, { kind: "scene", id: plan.sceneId }] };
    assertScopeRef(scope);
    const key = JSON.stringify(scope);
    if (!seen.has(key) && scopeContains(taskScope, scope)) { seen.add(key); scopes.push({ key, scope, label: `${plan.episodeId} · 제작 컷 ${plan.cutId}` }); }
  }
  return scopes;
}

export function scopedManagementRequest(policyVersion: number, command: StudioScopedWriteManagementCommand["command"], mutationId = crypto.randomUUID()): StudioScopedWriteManagementCommand {
  return { mutationId, expectedPolicyVersion: policyVersion, command };
}
export function scopedDateTimeLocal(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
}
