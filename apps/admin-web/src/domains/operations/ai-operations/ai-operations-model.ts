import { STATUSES, parseAiOperationsSnapshot } from "@toonstudio/contracts/ai-operations";

import type { BoardItem, BoardSnapshot, BoardSource } from "@toonstudio/contracts/ai-operations";

export const AI_PAGES = [["overview", "통합 현황"], ["models", "Cloudflare 모델"], ["alerts", "Onpod 알림"], ["hypotheses", "원인 가설"], ["tasks", "작업 보드"], ["sources", "근거 자료"]] as const;
export type AiPage = typeof AI_PAGES[number][0];
export interface AiFilters { query: string; status: string; provider: string; priority: string }
export const EMPTY_FILTERS: AiFilters = { query: "", status: "", provider: "", priority: "" };
export const ITEM_TYPES: readonly [BoardItem["type"], string][] = [["model", "모델"], ["retired-model", "종료 대상 모델"], ["alert", "Onpod 알림"], ["hypothesis", "원인 가설"], ["task", "승인 대기 작업"], ["config", "설정 변경 검토"], ["change", "변경 검토"]];
export const SOURCE_KINDS: readonly BoardSource["kind"][] = ["공식 문서", "메일", "코드", "PR", "커밋", "CI", "배포", "저장소 문서"];
const MODEL_FIELDS = [["modelId", "모델 ID"], ["currentModelStatus", "현재 모델 상태"], ["retirementDate", "종료 예정일"], ["candidate", "대체 후보"], ["callPath", "호출 경로"], ["affectedFeatures", "영향받는 기능"], ["frequency", "호출 빈도·측정 구간"], ["userImpact", "장애 시 사용자 영향"], ["errorHandling", "404/model_not_found·410 대응"], ["minimalFiles", "최소 변경 파일"], ["rollback", "롤백 방법"], ["cheapValidation", "저비용 검증 방법"]];
const ALERT_FIELDS = [["notificationTime", "알림 시각"], ["exceededTime", "관측된 초과 시간"], ["measurementWindow", "측정 구간"], ["rateLimitConfig", "단일 인스턴스 로컬 rate limit 설정"], ["clusterConfig", "memory 기반 실시간 클러스터 설정"], ["recentChange", "최근 변경"], ["reproduction", "재현 여부"], ["costImpact", "비용 영향"], ["mitigation", "무료 한도 내 완화안"]];
const HYPOTHESIS_FIELDS = [["category", "가설 분류"], ["evidence", "지지·반대 근거"], ["reproduction", "재현 여부"], ["measurementWindow", "측정 구간"], ["cheapValidation", "무료 한도 내 검증"], ["costImpact", "비용 영향"]];

export function newAiItem(type: BoardItem["type"]): BoardItem {
  const approvalRequired = ["task", "config", "change"].includes(type);
  const fields = type === "model" || type === "retired-model" ? MODEL_FIELDS : type === "alert" ? ALERT_FIELDS : type === "hypothesis" ? HYPOTHESIS_FIELDS : [["impact", "영향 범위"], ["preconditions", "선행 조건"], ["rollback", "롤백 방법"], ["cheapValidation", "저비용 검증 방법"]];
  return { id: `item-${crypto.randomUUID()}`, type, provider: type === "model" || type === "retired-model" ? "Cloudflare" : type === "alert" || type === "hypothesis" ? "Onpod" : "공통", title: "새 기록", description: "", status: approvalRequired ? "승인 대기" : "미확인", priority: "P2", assurance: type === "hypothesis" ? "가설" : "미확인", fields: fields.map(([key, label]) => ({ key, label, value: "미확인" })), sourceIds: [], owner: "", nextAction: "", notes: "", verifiedAt: null, verificationNote: "", mainSha: null, tags: [], approvalRequired };
}

export function filterAiItems(items: BoardItem[], page: AiPage, filters: AiFilters): BoardItem[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (page === "models" && !["model", "retired-model"].includes(item.type)) return false;
    if (page === "alerts" && item.type !== "alert") return false;
    if (page === "hypotheses" && item.type !== "hypothesis") return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.provider && item.provider !== filters.provider) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    return !query || [item.title, item.description, item.owner, item.nextAction, item.notes, ...item.tags, ...item.fields.flatMap((field) => [field.label, field.value])].join(" ").toLocaleLowerCase().includes(query);
  });
}

export function aiDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "미확인";
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value))} KST`;
}
export function aiKstInput(value: string | null): string { return value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 9 * 3_600_000).toISOString().slice(0, 19) : ""; }
export function aiKstIso(value: string): string { return value ? new Date(`${value}+09:00`).toISOString() : ""; }
export function aiFreshness(snapshot: BoardSnapshot, now = Date.now()): string {
  const observed = Date.parse(snapshot.meta.snapshotAt);
  if (!Number.isFinite(observed)) return "관측 시각 미확인";
  return now - observed > 86_400_000 ? "24시간 경과 · 근거 재확인 필요" : "기준 관측 시각 기록됨 · 실시간 연결 아님";
}
export function aiCsv(items: BoardItem[]): string {
  const escape = (value: string): string => `"${(/^[\s]*[=+@-]/u.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  const rows = [["ID", "제공자", "유형", "제목", "상태", "근거 판정", "우선순위", "담당자", "다음 조치", "검증 시각", "main SHA", "세부 항목"], ...items.map((item) => [item.id, item.provider, item.type, item.title, item.status, item.assurance, item.priority, item.owner, item.nextAction, item.verifiedAt ?? "", item.mainSha ?? "", item.fields.map((field) => `${field.label}: ${field.value}`).join("\n")])];
  return "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n");
}
export function downloadAiFile(contents: string, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function statusTone(status: BoardItem["status"]): string { return `ai-status-${STATUSES.indexOf(status)}`; }

export function preserveAiApprovals(incoming: BoardSnapshot, current: BoardSnapshot | null): { snapshot: BoardSnapshot; preserved: number } {
  if (!current) return { snapshot: incoming, preserved: 0 };
  const retained = current.items.filter((item) => item.approvalRequired && !incoming.items.some((entry) => entry.id === item.id));
  const sources = [...incoming.sources];
  for (const item of retained) for (const id of item.sourceIds) {
    const previous = current.sources.find((source) => source.id === id); const imported = sources.find((source) => source.id === id);
    if (!previous) throw new Error("기존 승인 항목의 출처를 확인할 수 없습니다.");
    if (imported && JSON.stringify(imported) !== JSON.stringify(previous)) throw new Error(`보존할 승인 항목의 출처 ID ${id}가 가져온 다른 근거와 겹칩니다. 출처 ID를 구분한 뒤 다시 가져오세요.`);
    if (!imported) sources.push(previous);
  }
  return { snapshot: parseAiOperationsSnapshot({ ...incoming, items: [...incoming.items, ...retained], sources }, current), preserved: retained.length };
}
