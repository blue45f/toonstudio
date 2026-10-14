/**
 * Automation channel decision record — PhotoCraft-style full-registry external
 * channels (MCP / CLI / JSON) vs. the BLUEPRINT §4.2 command registry (S3-11~14).
 *
 * DECISION (2026-10-14, measured against main): DEFER the external agent
 * channels (MCP server, remote agent API). Do NOT expose the command catalog
 * to outside callers yet. This module is the machine-readable form of that
 * decision: the verdict table, the only execution allowlist an external
 * channel may ever start from, and the readiness gate that must pass before
 * the question is reopened. Passing the gate yields "ready-for-review",
 * never an automatic adoption — reopening is a human decision.
 *
 * Why deferred (each ground was measured on main, not assumed):
 * 1. The catalog is declaration data, not an executable tool schema.
 *    `studio-command-catalog.ts` (+`-base.ts`, 243 entries) carries
 *    id·category·labels·aliases·shortcut·helpNodeId·origins only — no typed
 *    argument/payload schema per command, and origins include
 *    dead·advertised-only·documented-only entries. MCP tools need typed
 *    inputs and a guaranteed execute path; most entries have neither today.
 * 2. There is no external principal. `CommandRegistry.execute` judges
 *    availability·permissions from a host-supplied `CommandContext`
 *    (`grantedPermissions` absent = "unknown → deny"), and
 *    `EditorCommandSource` enumerates only in-app surfaces
 *    (menu·shortcut·palette·rail·radial·mobile-dock·inspector·companion·ai·test).
 *    No scoped token, per-actor audit binding, or consent surface exists for
 *    an outside agent acting on a user's (possibly collaborative) document.
 * 3. The in-app surface is not finished first. The macro recorder
 *    (`studio-macro-recorder.ts`) has no production caller — users cannot
 *    even start a recording in the UI yet (separate checklist item). The
 *    standing priority is removing usability friction for people in the
 *    editor; an agent channel serves neither that nor the "too difficult"
 *    complaints, and would freeze a public protocol around an unfinished
 *    registry (S3-11~14 exposure/pinned layers are still landing).
 * 4. Web physics differ from PhotoCraft's desktop/local model. A browser tab
 *    cannot listen on a socket; an MCP endpoint means a relay server or a
 *    user-installed local bridge — new install friction, new attack surface,
 *    and relay/auth/rate-limit operations the free-tier cost rule excludes.
 *    The one external shape already approved follows the hardware-bridge
 *    pattern instead: loopback-only, pairing token, fail-closed.
 *
 * What IS adopted (already the product's automation story, keep investing):
 * - In-app macros: the recorder's 9-type allowlist (high-level commands only,
 *   no pointer streams, unknown input normalizes to null) converted to Auto
 *   Actions via `studio-macro-to-auto-actions.ts`.
 * - JSON as a FILE format, user-initiated: Auto Action sets
 *   (`toonstudio-studio-auto-actions` v1) are zod-validated with hard limits
 *   (size·depth·command count, dangerous keys rejected) and run through
 *   dry-run/apply. JSON enters by a user gesture, never by a listener.
 * The stage-1 candidate, if demand appears, is exactly that pattern widened:
 * gesture-initiated JSON import → existing normalizers → dry-run preview →
 * explicit apply with undo. No socket, no server, no new protocol.
 *
 * CLI is judged not-applicable (not deferred): the product has no local
 * process to attach a CLI to; batch work is served by the JSON file format.
 */

import type { StudioMacroCommand } from "./studio-macro-recorder";

export const STUDIO_AUTOMATION_CHANNEL_DECISION_VERSION = 1 as const;

/* ------------------------------------------------------------------ verdicts */

export type StudioAutomationChannelId =
  | "in-app-macro"
  | "auto-action-json-file"
  | "hardware-bridge-loopback"
  | "json-import-gesture"
  | "mcp-server"
  | "remote-agent-api"
  | "cli";

export type StudioAutomationChannelVerdict =
  | "adopted"
  | "conditional"
  | "deferred"
  | "not-applicable";

export interface StudioAutomationChannelDecision {
  id: StudioAutomationChannelId;
  labelKo: string;
  labelEn: string;
  verdict: StudioAutomationChannelVerdict;
  /** Short ground for the verdict; the full reasoning is the header above. */
  basis: string;
}

export const STUDIO_AUTOMATION_CHANNELS: readonly StudioAutomationChannelDecision[] =
  Object.freeze([
    {
      id: "in-app-macro",
      labelKo: "앱 내 매크로 (레코더 → 자동 액션)",
      labelEn: "In-app macro (recorder → auto actions)",
      verdict: "adopted",
      basis:
        "이미 존재하는 자동화 본선. 허용목록 9종·정규화 fail-closed·자동 액션 변환까지 갖췄다. 남은 것은 녹화 UI 배선(별도 항목)이며 외부 채널보다 먼저다.",
    },
    {
      id: "auto-action-json-file",
      labelKo: "자동 액션 JSON 파일 (사용자 개시 가져오기/내보내기)",
      labelEn: "Auto Action JSON file (user-initiated import/export)",
      verdict: "adopted",
      basis:
        "JSON 채널은 파일 형태로 이미 채택됨: kind/version 고정, zod 검증, 크기·깊이·명령 수 상한, 위험 키 거부, dry-run/적용. 리스너 없는 형태가 웹 제품의 정답이다.",
    },
    {
      id: "hardware-bridge-loopback",
      labelKo: "하드웨어 브리지 (루프백 전용)",
      labelEn: "Hardware bridge (loopback only)",
      verdict: "conditional",
      basis:
        "외부 실행의 유일하게 승인된 형태: 루프백 웹소켓 + 페어링 토큰 + fail-closed. 별도 항목(hardware-controller-command-api)에서 확정됐고, MCP 판단의 선례로만 참조한다.",
    },
    {
      id: "json-import-gesture",
      labelKo: "제스처 개시 JSON 명령 가져오기 (1단계 후보)",
      labelEn: "Gesture-initiated JSON command import (stage-1 candidate)",
      verdict: "conditional",
      basis:
        "수요 신호가 생기면 이 형태부터: 붙여넣기/파일 → 기존 정규화기 → dry-run 미리보기 → 명시 적용+실행 취소. 소켓·서버·신규 프로토콜 없음. 준비 게이트 통과가 전제다.",
    },
    {
      id: "mcp-server",
      labelKo: "MCP 서버 (외부 에이전트 채널)",
      labelEn: "MCP server (external agent channel)",
      verdict: "deferred",
      basis:
        "보류. 카탈로그에 명령별 타입 인자 스키마와 보장된 실행 경로가 없고, 외부 주체의 권한·동의·감사 모델이 없으며, 브라우저는 리슨할 수 없어 릴레이/로컬 브리지 운영이 새로 붙는다. 준비 게이트를 전부 통과하면 재검토한다.",
    },
    {
      id: "remote-agent-api",
      labelKo: "원격 에이전트 API",
      labelEn: "Remote agent API",
      verdict: "deferred",
      basis:
        "MCP와 같은 게이트를 공유하는 보류. 타인 문서(협업 원고)에 쓰기 권한을 가진 외부 행위자를 여는 일이라, 스코프 토큰·행위자별 감사 리시트·회수 수단이 먼저다.",
    },
    {
      id: "cli",
      labelKo: "CLI 채널",
      labelEn: "CLI channel",
      verdict: "not-applicable",
      basis:
        "웹 제품에는 CLI가 붙을 로컬 프로세스가 없다. 배치 수요는 자동 액션 JSON 파일 형식이 담당하므로 별도 CLI를 만들지 않는다.",
    },
  ]);

export function studioAutomationChannelVerdict(
  id: StudioAutomationChannelId,
): StudioAutomationChannelVerdict | null {
  return STUDIO_AUTOMATION_CHANNELS.find((channel) => channel.id === id)?.verdict ?? null;
}

/* ------------------------------------------- external execution allowlist */

/**
 * The ceiling for ANY external or imported execution, now and after the gate:
 * exactly the macro recorder's allowlist, expressed in Auto Action types (the
 * mapping is `studio-macro-to-auto-actions.ts`, verbatim). A catalog id that
 * is not reachable through this list (e.g. navigation, file, publish
 * commands) is never externally executable by default — widening this list
 * is a separate decision per command family, with its own dry-run story.
 */
export const STUDIO_AUTOMATION_EXTERNAL_ALLOWLIST: readonly {
  macroType: StudioMacroCommand["type"];
  autoActionType: string;
}[] = Object.freeze([
  { macroType: "set-opacity", autoActionType: "element.set-opacity" },
  { macroType: "set-hidden", autoActionType: "element.set-hidden" },
  { macroType: "set-locked", autoActionType: "element.set-locked" },
  { macroType: "set-blend-mode", autoActionType: "element.set-blend-mode" },
  { macroType: "lettering-font-size", autoActionType: "lettering.set-size" },
  { macroType: "lettering-color", autoActionType: "lettering.set-color" },
  { macroType: "lettering-font", autoActionType: "lettering.set-font" },
  { macroType: "page-set-background", autoActionType: "page.set-background" },
  { macroType: "page-apply-grade-preset", autoActionType: "page.apply-grade-preset" },
]);

const EXTERNAL_AUTO_ACTION_TYPES: ReadonlySet<string> = new Set(
  STUDIO_AUTOMATION_EXTERNAL_ALLOWLIST.map((entry) => entry.autoActionType),
);

/** Fail-closed: anything not on the allowlist is refused, including unknowns. */
export function isStudioAutomationExternalCommandAllowed(autoActionType: unknown): boolean {
  return typeof autoActionType === "string" && EXTERNAL_AUTO_ACTION_TYPES.has(autoActionType);
}

/* ------------------------------------------------------------ readiness gate */

export type StudioAutomationPrerequisiteId =
  | "macro-ui-wired"
  | "catalog-typed-payloads"
  | "external-principal-auth"
  | "audit-receipt"
  | "demand-signal";

export interface StudioAutomationReadinessSignals {
  /** Users can start/stop a recording and apply the converted set in the UI. */
  macroUiWired: boolean;
  /** Share (0..1) of catalog entries with a typed payload schema AND a wired execute path. */
  catalogTypedPayloadCoverage: number;
  /** Scoped, revocable token for an external principal exists (hardware-bridge pattern or better). */
  externalPrincipalAuthReady: boolean;
  /** Every externally triggered run leaves an actor-bound receipt the user can inspect and undo. */
  auditReceiptReady: boolean;
  /** Count of distinct, recorded user/team requests for agent or batch automation. */
  demandSignalCount: number;
}

export const STUDIO_AUTOMATION_READINESS_THRESHOLDS = Object.freeze({
  minCatalogTypedPayloadCoverage: 0.8,
  minDemandSignalCount: 3,
});

export interface StudioAutomationReadiness {
  /** Still a human decision afterwards — this only reopens the question. */
  verdict: "deferred" | "ready-for-review";
  unmet: readonly StudioAutomationPrerequisiteId[];
}

export function evaluateStudioAutomationChannelReadiness(
  signals: StudioAutomationReadinessSignals,
): StudioAutomationReadiness {
  const unmet: StudioAutomationPrerequisiteId[] = [];
  if (signals.macroUiWired !== true) unmet.push("macro-ui-wired");
  const coverage = signals.catalogTypedPayloadCoverage;
  if (
    !Number.isFinite(coverage) ||
    coverage < STUDIO_AUTOMATION_READINESS_THRESHOLDS.minCatalogTypedPayloadCoverage
  ) {
    unmet.push("catalog-typed-payloads");
  }
  if (signals.externalPrincipalAuthReady !== true) unmet.push("external-principal-auth");
  if (signals.auditReceiptReady !== true) unmet.push("audit-receipt");
  const demand = Number.isFinite(signals.demandSignalCount)
    ? Math.max(0, Math.floor(signals.demandSignalCount))
    : 0;
  if (demand < STUDIO_AUTOMATION_READINESS_THRESHOLDS.minDemandSignalCount) {
    unmet.push("demand-signal");
  }
  return Object.freeze({
    verdict: unmet.length === 0 ? "ready-for-review" : "deferred",
    unmet: Object.freeze(unmet),
  });
}
