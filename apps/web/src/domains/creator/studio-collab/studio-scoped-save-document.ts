import { canonicalJson } from "@toonstudio/studio-project-model";
import type { StudioScopedSharedDocumentInput } from "../studio-shared-document-client";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("담당 원고의 저장 본문을 확인할 수 없습니다.");
  return value as Record<string, unknown>;
}
/** 본문 저장은 실제 현재 요소를 전송하며 전역·페이지 설정·master는 저장 기준본을 보존한다. 권한은 서버가 다시 검사한다. */
export function projectStudioScopedSaveDocument(saved: Record<string, unknown>, runtime: Record<string, unknown>): Record<string, unknown> {
  const savedPages = saved.pagesList, runtimePages = runtime.pagesList;
  if (!Array.isArray(savedPages) || !Array.isArray(runtimePages) || savedPages.length !== runtimePages.length) {
    throw new Error("페이지 구성이 변경됐습니다. 최신 공동 원고를 맞춘 뒤 다시 저장하세요.");
  }
  const ids = new Set<string>();
  const pagesList = savedPages.map((value, index) => {
    const page = record(value), current = record(runtimePages[index]);
    if (typeof page.id !== "string" || ids.has(page.id) || current.id !== page.id || !Array.isArray(current.elements)
      || (current.groups !== undefined && !Array.isArray(current.groups))) throw new Error("페이지 구성과 실제 원고 요소를 다시 확인하세요.");
    ids.add(page.id);
    return { ...page, elements: current.elements,
      ...(page.groups !== undefined || (Array.isArray(current.groups) && current.groups.length) ? { groups: current.groups ?? [] } : {}) };
  });
  return { ...saved, pagesList };
}

/** 저장에서 제외한 실제 편집 상태만 진단한다. 미상 서버 확장과 현재 페이지 선택은 clean 판정을 막지 않는다. */
export function studioScopedSaveHasExcludedChanges(saved: Record<string, unknown>, runtime: Record<string, unknown>): boolean {
  const authoredGlobals = ["width", "master", "characterBible", "writerRoom", "aiProvenance", "aiImageReferences", "comments",
    "releaseSchedule", "publicationAnalytics", "referenceBoard", "webtoonTheme", "panelGutter", "publishPack"];
  if (authoredGlobals.some((key) => canonicalJson(saved[key]) !== canonicalJson(runtime[key]))) return true;
  const savedPages = saved.pagesList, runtimePages = runtime.pagesList;
  if (!Array.isArray(savedPages) || !Array.isArray(runtimePages) || savedPages.length !== runtimePages.length) return true;
  return runtimePages.some((value, index) => {
    const page = record(value), original = record(savedPages[index]);
    return Object.keys(page).some((key) => key !== "elements" && key !== "groups" && canonicalJson(page[key]) !== canonicalJson(original[key]));
  });
}

/** 같은 본문 재시도는 새 ID로 바꾸지 않는다. 원고나 계정은 해시 입력이며 별도 로그에 남기지 않는다. */
export async function studioScopedSaveMutationId(actor: string, workId: string, input: Omit<StudioScopedSharedDocumentInput, "mutationId">): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson({ purpose: "studio-scoped-rest-v1", actor, workId, ...input })));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 15) | 128; bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
