/**
 * creator 잔여 로딩·실패·빈 상태 문구 사전 (A4 4라운드 cat1 실측 분리 후속).
 *
 * 3라운드 형제 모듈 선례와 같은 방식: 기존 등록 모듈(studio-panel-status-i18n
 * 계열)은 키 개수 단언 테스트가 있어 확장하지 않고 형제 모듈로 신설한다.
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (r4-cat1-status-i18n.test.ts가 패리티를 고정한다).
 *
 * 소비 파일은 모듈을 직접 import하고 생산 시점에 현재 로케일로 해석하는
 * `r4CreatorStatusText(key, koFallback)` 형태로 호출한다 (resourceStatusText
 * 선례와 같은 비훅 리졸버 계약).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "r4cat1.creator.storyBible.emptyEntities": "아직 연결할 항목이 없습니다. 먼저 장면·장소·소품을 등록하면, 다른 기록에 그 이름이 나올 때 자동으로 연결됩니다.",
  "r4cat1.creator.storyBible.emptyDocuments": "연결을 찾을 기록이 아직 없습니다. 항목 설명이나 약속·회수 원장에 내용을 적으면 이름이 서로 이어지기 시작합니다.",
  "r4cat1.creator.masterPage.empty": "아직 마스터 요소가 없어요. 위의 ‘마스터 편집 시작’을 누르고 로고나 문구를 추가해 보세요.",
  "r4cat1.creator.artHandoff.blocked": "이 회차 비트에 다른 회차 표시가 섞여 있어 작화 계획을 만들 수 없어요. 비트의 회차 연결을 먼저 확인해 주세요.",
  "r4cat1.creator.artifactTray.empty": "아직 들어온 산출물이 없어요. 기획에서 초안을 쓰거나, 3D 캡처·이미지 생성을 하면 여기에 자동으로 쌓입니다.",
  "r4cat1.creator.commandSearch.noActionHint": "이 항목은 아직 검색에서 열 수 없습니다",
  "r4cat1.creator.saveSync.retryNow": "지금 다시 시도",
  "r4cat1.creator.toolchain.processingJobs": "처리 중 작업",
  "r4cat1.creator.scenarioDesk.missingOrFailed": "미생성·실패",
});

registerI18nLocaleEntries("en", {
  "r4cat1.creator.storyBible.emptyEntities": "No items to link yet. Register a scene, place, or prop first, and it will be linked automatically when its name appears in another record.",
  "r4cat1.creator.storyBible.emptyDocuments": "No records to search for links yet. Add content to item descriptions or the promise/payoff ledger, and names will start linking to each other.",
  "r4cat1.creator.masterPage.empty": "No master elements yet. Press 'Start master editing' above and add a logo or text.",
  "r4cat1.creator.artHandoff.blocked": "This episode beat contains markers from another episode, so an art plan cannot be created. Check the beat's episode link first.",
  "r4cat1.creator.artifactTray.empty": "No artifacts yet. Drafts from planning, 3D captures, and image generations will collect here automatically.",
  "r4cat1.creator.commandSearch.noActionHint": "This item cannot be opened from search yet",
  "r4cat1.creator.saveSync.retryNow": "Retry now",
  "r4cat1.creator.toolchain.processingJobs": "Jobs in progress",
  "r4cat1.creator.scenarioDesk.missingOrFailed": "Not generated · Failed",
});

/** 비훅 생산자·렌더 시점용 상태 문구 리졸버 — resourceStatusText 선례와 같은 계약. */
export function r4CreatorStatusText(key: string, koFallback: string): string;
export function r4CreatorStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function r4CreatorStatusText(
  key: string,
  paramsOrFallback: Readonly<Record<string, string | number>> | string,
  koFallback?: string,
): string {
  const params = typeof paramsOrFallback === "string" ? undefined : paramsOrFallback;
  const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : koFallback ?? "";
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}
