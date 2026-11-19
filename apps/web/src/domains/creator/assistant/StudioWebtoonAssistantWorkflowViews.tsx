import {
  CheckCircle2,
  Compass,
  Copy,
  FileCheck2,
  Link2,
  Lock,
  PackageOpen,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import { resolveBg3dLightingConfigFromBindings } from "../bg3d/studio-bg3d-workflow-pack-adapter";
import { resolveBrushSlotConfigFromBindings } from "../brush/studio-brush-workflow-pack-adapter";
import {
  applyRightsRemediationPlan,
  buildRightsRemediationPlan,
} from "../export/studio-rights-receipt-remediation";
import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";
import { copyStudioText } from "../studio-workbench-clipboard";

import {
  routeStudioAssistantSkills,
  type StudioAssistantRoutableTab,
} from "./studio-assistant-skill-router";
import { verifySubmittedRightsReceipt } from "./studio-rights-receipt-verifier";
import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  evaluateWorkflowPackRightsClearance,
  parseStudioWorkflowPack,
  serializeStudioWorkflowPack,
  type StudioWorkflowPack,
} from "./studio-workflow-pack";
import {
  buildWorkflowPackShareUrl,
  extractWorkflowPackFromSearch,
} from "./studio-workflow-pack-deeplink";
import { buildWorkflowPackExportReceiptAttachment } from "./studio-workflow-pack-export-bundle";
import { evaluateWorkflowPackTeamPolicy } from "./studio-workflow-pack-policy";
import {
  dispatchWorkflowPackRuntimeEvent,
  resolveWorkflowPackRuntimeBindings,
} from "./studio-workflow-pack-runtime-bridge";
import {
  buildWorkflowPackFromAssistantState,
  deleteCustomStudioWorkflowPack,
  loadCustomStudioWorkflowPacks,
  saveCustomStudioWorkflowPack,
} from "./studio-workflow-pack-store";
import { broadcastWorkflowPackUpdate } from "./studio-workflow-pack-sync";
import {
  loadWorkflowPackTelemetrySummary,
  recordWorkflowPackEvent,
} from "./studio-workflow-pack-telemetry";
import { PERSPECTIVE_GUIDES, type PerspectiveGuidePreset } from "./webtoon-croquis-pose-guide";
import { WEBTOON_PLATFORM_SPECS, type WebtoonPlatformId } from "./webtoon-platform-spec-validator";

import type { SkinToneId } from "./webtoon-color-harmony-assistant";
import type { PomodoroMode, WebtoonProductionStage } from "./webtoon-focus-timer";
import type { ReaderScrollSpeedProfile } from "./webtoon-scroll-pacing-simulator";

import { cn } from "@/shared/lib/utils";

const CHIP_CLASS = cn(
  "inline-flex items-center justify-center rounded-lg border px-2.5 text-[0.65rem] font-bold",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
);

export function StudioAssistantSkillRouterBar({
  query,
  onQueryChange,
  activeTab,
  focusStage,
  panelsCount,
  protectedRegionsCount,
  canvasHeight,
  onSelectTab,
}: {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly activeTab: StudioAssistantRoutableTab;
  readonly focusStage: WebtoonProductionStage;
  readonly panelsCount: number;
  readonly protectedRegionsCount: number;
  readonly canvasHeight: number;
  readonly onSelectTab: (tabId: StudioAssistantRoutableTab) => void;
}) {
  const routedSkills = routeStudioAssistantSkills(
    { query, focusStage, panelsCount, protectedRegionsCount, canvasHeight },
    3,
  );

  return (
    <div
      data-testid="studio-assistant-skill-router"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-raised/60 px-3 py-2"
    >
      <div className="relative min-w-44 flex-1">
        <Compass
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-accent"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="스마트 도구 자동 추천 검색"
          placeholder="작업 내용 입력 (예: 3D 로우앵글, 네이버 슬라이스, 로판 세팅)…"
          className={cn(
            "min-h-9 w-full rounded-lg border border-line bg-card pl-8 pr-2.5 text-xs text-fg",
            STUDIO_FOCUS_RING,
          )}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1" aria-label="추천 보조 도구">
        {routedSkills.map((match) => (
          <button
            key={match.tabId}
            type="button"
            onClick={() => {
              recordWorkflowPackEvent("router-jumped", match.tabId);
              onSelectTab(match.tabId);
            }}
            title={match.reason}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-lg border px-2 text-[0.65rem] font-bold",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              activeTab === match.tabId
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <span>{match.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export interface CurrentAssistantPackSnapshot {
  readonly platformId: WebtoonPlatformId;
  readonly skinToneId: SkinToneId;
  readonly perspectivePreset: PerspectiveGuidePreset;
  readonly focusStage: WebtoonProductionStage;
  readonly focusPreset: PomodoroMode;
  readonly readerSpeed: ReaderScrollSpeedProfile;
}

export function StudioWorkflowPacksPanel({
  appliedWorkflowPackId,
  currentSnapshot,
  onApplyPack,
}: {
  readonly appliedWorkflowPackId: string | null;
  readonly currentSnapshot: CurrentAssistantPackSnapshot;
  readonly onApplyPack: (pack: StudioWorkflowPack) => void;
}) {
  const [customPacks, setCustomPacks] = useState<StudioWorkflowPack[]>(() =>
    loadCustomStudioWorkflowPacks(),
  );
  const [customPackName, setCustomPackName] = useState("");
  const [lockTeamPolicy, setLockTeamPolicy] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [verifyReceiptJson, setVerifyReceiptJson] = useState("");
  const [remediationFeedback, setRemediationFeedback] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{
    readonly packId: string;
    readonly kind: "json" | "deeplink" | "receipt";
  } | null>(null);
  const [telemetry, setTelemetry] = useState(() => loadWorkflowPackTelemetrySummary());

  const deepLinkPack = useMemo(() => {
    if (typeof window === "undefined") return null;
    return extractWorkflowPackFromSearch(window.location.search);
  }, []);

  const allPacks = useMemo(
    () => [
      ...customPacks.map((pack) => ({ pack, isCustom: true })),
      ...BUILTIN_STUDIO_WORKFLOW_PACKS.map((pack) => ({ pack, isCustom: false })),
    ],
    [customPacks],
  );

  const receiptVerification = useMemo(() => {
    if (!verifyReceiptJson.trim()) return null;
    const prelim = verifySubmittedRightsReceipt(verifyReceiptJson);
    const refPack = prelim.packId
      ? allPacks.find(({ pack }) => pack.id === prelim.packId)?.pack
      : undefined;
    return refPack ? verifySubmittedRightsReceipt(verifyReceiptJson, refPack) : prelim;
  }, [verifyReceiptJson, allPacks]);

  function applyAndTrack(pack: StudioWorkflowPack) {
    onApplyPack(pack);
    dispatchWorkflowPackRuntimeEvent(pack);
    broadcastWorkflowPackUpdate(pack, "studio-assistant-modal");
    setTelemetry(recordWorkflowPackEvent("pack-applied", pack.id));
  }

  function handleSaveCurrentAsPack() {
    const base = buildWorkflowPackFromAssistantState({
      name: customPackName || "내 커스텀 제작 팩",
      ...currentSnapshot,
    });
    const created: StudioWorkflowPack = lockTeamPolicy
      ? {
          ...base,
          schemaVersion: 2,
          teamPolicyLock: {
            teamLabel: "스튜디오 팀 규약",
            lockedFields: ["platformId", "skinToneId"],
            requireCommercialClearance: true,
          },
        }
      : base;
    setCustomPacks(saveCustomStudioWorkflowPack(created));
    setCustomPackName("");
    setTelemetry(recordWorkflowPackEvent("pack-saved-custom", created.id));
  }

  function handleImportPack() {
    const parsed = parseStudioWorkflowPack(importJson);
    if (!parsed) {
      setImportError("올바른 Studio Workflow Pack JSON(schemaVersion: 1 또는 2) 형식이 아닙니다.");
      return;
    }
    setImportError(null);
    setCustomPacks(saveCustomStudioWorkflowPack(parsed));
    setImportJson("");
    applyAndTrack(parsed);
    setTelemetry(recordWorkflowPackEvent("pack-imported-json", parsed.id));
  }

  function handleOneClickRemediation(pack: StudioWorkflowPack) {
    const plan = buildRightsRemediationPlan(pack);
    if (!plan.needsRemediation) return;
    const result = applyRightsRemediationPlan(pack, plan);
    setCustomPacks(saveCustomStudioWorkflowPack(result.remediatedPack));
    applyAndTrack(result.remediatedPack);
    setRemediationFeedback(
      `${pack.name} 1클릭 복구 완료: ${result.appliedActions.join(" / ")}`,
    );
  }

  async function handleCopyKind(
    pack: StudioWorkflowPack,
    kind: "json" | "deeplink" | "receipt",
  ) {
    let text: string;
    if (kind === "json") {
      text = serializeStudioWorkflowPack(pack);
    } else if (kind === "deeplink") {
      const baseUrl =
        typeof window !== "undefined" ? window.location.href : "http://localhost/studio";
      text = buildWorkflowPackShareUrl(pack, baseUrl);
    } else {
      text = buildWorkflowPackExportReceiptAttachment(pack).content;
    }

    const ok = await copyStudioText(text);
    if (!ok) return;
    setCopyFeedback({ packId: pack.id, kind });
    if (kind === "deeplink") {
      setTelemetry(recordWorkflowPackEvent("pack-shared-deeplink", pack.id));
    } else if (kind === "receipt") {
      setTelemetry(recordWorkflowPackEvent("rights-receipt-copied", pack.id));
    }
  }

  return (
    <div data-testid="studio-workflow-packs-tab" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-card/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <PackageOpen className="size-4 text-accent" aria-hidden />
            <span>장르별 Studio Workflow Pack (v2 3D/브러시 · 팀 잠금 · 딥링크 · Rights Receipt)</span>
          </div>
          <span
            data-testid="workflow-pack-telemetry-badge"
            className="rounded bg-raised px-2 py-0.5 font-mono text-[0.6rem] font-bold text-fg-3"
          >
            적용 {telemetry.counts["pack-applied"]} · 공유 {telemetry.counts["pack-shared-deeplink"]} · 증명서{" "}
            {telemetry.counts["rights-receipt-copied"]}
          </span>
        </div>
        <p className="text-[0.65rem] text-fg-3">
          플랫폼 규격, 피부톤 팔레트, 투시 구도, 3D 조명·브러시 프리셋을 하나의 팩으로 저장·협업 동기화하고 상업 연재용 rights-bom-receipt.json을 발급합니다.
        </p>

        {deepLinkPack ? (
          <div
            data-testid="workflow-pack-deeplink-banner"
            className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-2"
          >
            <span className="text-[0.66rem] font-bold text-accent">
              공유 링크에서 워크플로우 팩 감지됨: {deepLinkPack.name}
            </span>
            <button
              type="button"
              onClick={() => applyAndTrack(deepLinkPack)}
              className={cn(CHIP_CLASS, "border-transparent bg-accent text-on-accent")}
            >
              공유 팩 바로 적용
            </button>
          </div>
        ) : null}

        {remediationFeedback ? (
          <p
            role="status"
            data-testid="workflow-pack-remediation-banner"
            className="mt-1 rounded-lg border border-good/40 bg-good/10 px-2.5 py-1.5 text-[0.65rem] font-bold text-good"
          >
            {remediationFeedback}
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <input
            type="text"
            value={customPackName}
            onChange={(event) => setCustomPackName(event.target.value)}
            aria-label="내 커스텀 팩 이름"
            placeholder="현재 세팅을 저장할 팩 이름 입력 (예: 내 작품 1화 세팅)"
            className={cn(
              "min-h-9 min-w-48 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg",
              STUDIO_FOCUS_RING,
            )}
          />
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.64rem] font-semibold text-fg-2">
            <input
              type="checkbox"
              checked={lockTeamPolicy}
              onChange={(event) => setLockTeamPolicy(event.target.checked)}
              className="accent-accent"
            />
            <span>팀 정책 잠금</span>
          </label>
          <button
            type="button"
            onClick={handleSaveCurrentAsPack}
            className={cn(CHIP_CLASS, "gap-1 border-line bg-raised text-fg hover:bg-card")}
          >
            <Plus className="size-3.5" aria-hidden />
            <span>현재 세팅 저장</span>
          </button>
        </div>

        <details className="mt-1 rounded-lg border border-line bg-card px-2.5 py-1.5">
          <summary className="cursor-pointer text-[0.66rem] font-bold text-fg-2">
            JSON으로 외부 팩 가져오기
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <textarea
              rows={3}
              value={importJson}
              onChange={(event) => {
                setImportJson(event.target.value);
                setImportError(null);
              }}
              aria-label="가져올 워크플로우 팩 JSON"
              placeholder='{"schemaVersion": 2, "id": "...", ...}'
              className={cn(
                "w-full rounded-lg border border-line bg-raised p-2 font-mono text-[0.65rem] text-fg",
                STUDIO_FOCUS_RING,
              )}
            />
            {importError ? (
              <p role="alert" className="text-[0.62rem] font-semibold text-bad">
                {importError}
              </p>
            ) : null}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleImportPack}
                className={cn(CHIP_CLASS, "border-transparent bg-accent text-on-accent")}
              >
                JSON 검증 후 적용
              </button>
            </div>
          </div>
        </details>

        <details className="mt-1 rounded-lg border border-line bg-card px-2.5 py-1.5">
          <summary className="cursor-pointer text-[0.66rem] font-bold text-fg-2">
            저작권 증명서(rights-bom-receipt.json) 무결성 검증
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <textarea
              rows={3}
              value={verifyReceiptJson}
              onChange={(event) => setVerifyReceiptJson(event.target.value)}
              aria-label="검증할 저작권 증명서 JSON"
              placeholder='{"receiptSchemaVersion": 1, "integrityHash": "fnv1a-...", ...}'
              className={cn(
                "w-full rounded-lg border border-line bg-raised p-2 font-mono text-[0.65rem] text-fg",
                STUDIO_FOCUS_RING,
              )}
            />
            {receiptVerification ? (
              <p
                role="status"
                data-testid="rights-receipt-verification-result"
                className={cn(
                  "rounded px-2 py-1 text-[0.64rem] font-bold",
                  receiptVerification.clearedForCommercialExport
                    ? "bg-good/10 text-good"
                    : "bg-warn/10 text-warn",
                )}
              >
                {receiptVerification.summary}
              </p>
            ) : null}
          </div>
        </details>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {allPacks.map(({ pack, isCustom }) => {
          const clearance = evaluateWorkflowPackRightsClearance(pack);
          const policyAudit = evaluateWorkflowPackTeamPolicy(pack, currentSnapshot);
          const runtimeBindings = resolveWorkflowPackRuntimeBindings(pack);
          const bg3dConfig = resolveBg3dLightingConfigFromBindings(runtimeBindings);
          const brushConfig = resolveBrushSlotConfigFromBindings(runtimeBindings);
          const isApplied = appliedWorkflowPackId === pack.id;
          const activeCopy = copyFeedback?.packId === pack.id ? copyFeedback.kind : null;
          return (
            <article
              key={pack.id}
              data-workflow-pack-id={pack.id}
              className={cn(
                "flex flex-col justify-between gap-3 rounded-xl border p-3",
                isApplied ? "border-accent bg-accent-soft/40" : "border-line bg-card",
              )}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.78rem] font-bold text-fg">{pack.name}</span>
                  <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.6rem] font-bold text-fg-3">
                    {isCustom ? `커스텀 · ${pack.genre}` : pack.genre}
                  </span>
                </div>
                <p className="text-[0.66rem] leading-relaxed text-fg-2">{pack.summary}</p>
                <div className="flex flex-wrap gap-1 text-[0.6rem] text-fg-3">
                  <span className="rounded border border-line bg-raised px-1.5 py-0.5">
                    {WEBTOON_PLATFORM_SPECS[pack.platformId].name}
                  </span>
                  <span className="rounded border border-line bg-raised px-1.5 py-0.5">
                    {PERSPECTIVE_GUIDES[pack.perspectivePreset].label}
                  </span>
                  {pack.bg3dLightingPresetId ? (
                    <span className="rounded border border-line bg-raised px-1.5 py-0.5">
                      3D:{bg3dConfig.displayName}
                    </span>
                  ) : null}
                  {pack.primaryBrushSlotId ? (
                    <span className="rounded border border-line bg-raised px-1.5 py-0.5">
                      브러시:{brushConfig.displayName}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <p
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold",
                      clearance.clearedForCommercialExport
                        ? "bg-good/10 text-good"
                        : "bg-warn/10 text-warn",
                    )}
                  >
                    <CheckCircle2 className="size-3" aria-hidden />
                    <span>{clearance.summary}</span>
                  </p>
                  {policyAudit.enforced ? (
                    <p
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold",
                        policyAudit.compliant ? "bg-good/10 text-good" : "bg-warn/10 text-warn",
                      )}
                    >
                      <Lock className="size-3" aria-hidden />
                      <span>
                        {policyAudit.compliant
                          ? `${policyAudit.teamLabel} 규약 준수`
                          : `${policyAudit.teamLabel} 잠금 확인 필요`}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2">
                <button
                  type="button"
                  onClick={() => applyAndTrack(pack)}
                  className={cn(
                    CHIP_CLASS,
                    "flex-1 border-transparent bg-accent text-on-accent hover:opacity-90",
                  )}
                >
                  {isApplied ? "적용됨" : "팩 일괄 적용"}
                </button>
                {!clearance.clearedForCommercialExport ? (
                  <button
                    type="button"
                    data-testid={`remediate-pack-${pack.id}`}
                    onClick={() => handleOneClickRemediation(pack)}
                    className={cn(CHIP_CLASS, "gap-1 border-warn/50 bg-warn/10 text-warn hover:opacity-90")}
                  >
                    <Wrench className="size-3" aria-hidden />
                    <span>1클릭 상업 복구</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyKind(pack, "deeplink");
                  }}
                  className={cn(CHIP_CLASS, "gap-1 border-line bg-raised text-fg hover:bg-card")}
                >
                  <Link2 className="size-3" aria-hidden />
                  <span>{activeCopy === "deeplink" ? "링크 복사됨" : "공유 링크"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyKind(pack, "receipt");
                  }}
                  className={cn(CHIP_CLASS, "gap-1 border-line bg-raised text-fg hover:bg-card")}
                >
                  <FileCheck2 className="size-3" aria-hidden />
                  <span>{activeCopy === "receipt" ? "증명서 복사됨" : "저작권 증명서"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyKind(pack, "json");
                  }}
                  className={cn(CHIP_CLASS, "gap-1 border-line bg-raised text-fg hover:bg-card")}
                >
                  <Copy className="size-3" aria-hidden />
                  <span>{activeCopy === "json" ? "JSON 복사됨" : "JSON"}</span>
                </button>
                {isCustom ? (
                  <button
                    type="button"
                    aria-label={`${pack.name} 삭제`}
                    onClick={() => setCustomPacks(deleteCustomStudioWorkflowPack(pack.id))}
                    className={cn(CHIP_CLASS, "border-bad/40 bg-bad/10 text-bad hover:opacity-90")}
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
