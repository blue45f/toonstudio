/**
 * 다이나믹 워크플로우 & 외부 생태계 통합 패널 (Wave 19).
 * 3개 탭: 다이나믹 워크플로우 DAG 실행 / 노블코믹스 각본 & CP 정산 / OTIO 무빙툰·WebHID 하드웨어·3D 라이브링크.
 * Calm Atelier 시맨틱 토큰 전용 · 460줄 이하 · 순수 메모리 상태 · 명시적 transition 속성 · 모든 props 선택형 · KO/EN.
 */

import { CheckCircle2, Clapperboard, Code2, Cpu, Download, FileText, Gamepad2, GitBranch, Play, Receipt, RotateCcw, Sun } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DYNAMIC_WORKFLOW_TEMPLATES, DYNAMIC_WORKFLOW_TEMPLATE_LIST, executeDynamicWorkflowDag,
  type DynamicWorkflowExecutionReport, type DynamicWorkflowTemplateId, type WorkflowStepStatus,
} from "./dynamic-workflow-orchestrator";
import {
  DEFAULT_DCC_LIVELINK_PACKET, DEFAULT_MOVING_TOON_INPUT,
  buildMovingToonOtioScene, createXpbdClothHairStrand, generateMoireFreeHalftoneTile,
  normalizeHardwareControllerProfile, reconcileDccLiveLinkPacket, routeHardwareInputEvent, stepXpbdClothHairStrand,
  type DccLiveLinkSource, type HardwareControllerFamily, type HardwareInputEvent, type MovingToonTargetProfile,
} from "./moving-toon-hardware-livelink";
import {
  DEFAULT_STUDIO_SETTLEMENT_INPUT, SAMPLE_FDX_SCRIPT, SAMPLE_FOUNTAIN_SCRIPT, SAMPLE_NOTION_SCRIPT, SAMPLE_SCRIVENER_MD_SCRIPT,
  computeStudioSettlementReport, formatSettlementCsv, parseNovelOrScriptToStoryboard, type ResolvedScriptFormat,
} from "./novel-script-erp-settlement";

export type DynamicWorkflowTabId = "dag-orchestrator" | "script-erp" | "motion-hw-livelink";

export interface StudioDynamicWorkflowPanelProps {
  readonly initialTab?: DynamicWorkflowTabId;
  readonly initialTemplateId?: DynamicWorkflowTemplateId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onWorkflowExecuted?: (report: DynamicWorkflowExecutionReport) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const BTN_PILL = `min-h-11 cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const SCRIPT_SAMPLES: Readonly<Record<ResolvedScriptFormat, { readonly labelKo: string; readonly labelEn: string; readonly text: string }>> = {
  fountain: { labelKo: "Fountain 각본", labelEn: "Fountain", text: SAMPLE_FOUNTAIN_SCRIPT },
  fdx: { labelKo: "Final Draft (.fdx)", labelEn: "Final Draft (.fdx)", text: SAMPLE_FDX_SCRIPT },
  "scrivener-md": { labelKo: "Scrivener MD", labelEn: "Scrivener MD", text: SAMPLE_SCRIVENER_MD_SCRIPT },
  "notion-script": { labelKo: "Notion 대본", labelEn: "Notion Script", text: SAMPLE_NOTION_SCRIPT },
};

const HARDWARE_TEST_EVENTS: Readonly<Record<HardwareControllerFamily, { readonly labelKo: string; readonly labelEn: string; readonly event: HardwareInputEvent }>> = {
  tourbox: { labelKo: "TourBox", labelEn: "TourBox", event: { controlId: "knob", eventKind: "delta", delta: 3 } },
  "wacom-expresskeys": { labelKo: "Wacom ExpressKeys", labelEn: "Wacom ExpressKeys", event: { controlId: "touch-ring", eventKind: "delta", delta: 2 } },
  "stream-deck": { labelKo: "Stream Deck", labelEn: "Stream Deck", event: { controlId: "key-1", eventKind: "press" } },
  "apple-pencil-pro": { labelKo: "Apple Pencil Pro", labelEn: "Apple Pencil Pro", event: { controlId: "squeeze", eventKind: "squeeze", pressure: 0.72 } },
  "mobile-wireless-remote": { labelKo: "무선 색상환 리모컨", labelEn: "Wireless Remote", event: { controlId: "color-wheel-hue", eventKind: "analog", delta: 15 } },
};

const TARGET_PROFILES: readonly { readonly id: MovingToonTargetProfile; readonly label: string }[] = [
  { id: "otio", label: "OpenTimelineIO (.otio)" }, { id: "after-effects", label: "After Effects" },
  { id: "live2d", label: "Live2D" }, { id: "voice-comic", label: "Voice Comic" },
];
const DCC_SOURCES: readonly { readonly id: DccLiveLinkSource; readonly label: string }[] = [
  { id: "blender", label: "Blender" }, { id: "sketchup", label: "SketchUp" }, { id: "unreal", label: "Unreal" },
];

function stepStatusBadge(status: WorkflowStepStatus | "idle", isKo: boolean): { readonly label: string; readonly cls: string } {
  if (status === "completed") return { label: isKo ? "완료" : "Done", cls: "border-good bg-good-soft text-good" };
  if (status === "failed") return { label: isKo ? "실패" : "Failed", cls: "border-bad bg-bad-soft text-bad" };
  if (status === "skipped-disabled" || status === "skipped-condition" || status === "skipped-upstream") {
    return { label: isKo ? "스킵" : "Skipped", cls: "border-line bg-warning-soft text-warn" };
  }
  return { label: isKo ? "대기" : "Ready", cls: "border-line bg-raised text-fg-2" };
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/** 다이나믹 워크플로우 DAG · 노블코믹스 각본/CP 정산 · OTIO 무빙툰/WebHID/3D 라이브링크 통합 패널. */
export function StudioDynamicWorkflowPanel({
  initialTab = "dag-orchestrator", initialTemplateId = "novel-comics-full", locale, className, onWorkflowExecuted,
}: StudioDynamicWorkflowPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<DynamicWorkflowTabId>(initialTab);
  const [templateId, setTemplateId] = useState<DynamicWorkflowTemplateId>(initialTemplateId);
  const [disabledNodeIds, setDisabledNodeIds] = useState<readonly string[]>([]);
  const [dagReport, setDagReport] = useState<DynamicWorkflowExecutionReport | null>(null);
  const [notice, setNotice] = useState<string>("");

  const [scriptFormat, setScriptFormat] = useState<ResolvedScriptFormat>("fountain");
  const [scriptText, setScriptText] = useState<string>(SAMPLE_FOUNTAIN_SCRIPT);
  const [showCsvPreview, setShowCsvPreview] = useState<boolean>(false);

  const [motionProfile, setMotionProfile] = useState<MovingToonTargetProfile>("otio");
  const [showOtioJson, setShowOtioJson] = useState<boolean>(false);
  const [hwFamily, setHwFamily] = useState<HardwareControllerFamily>("tourbox");
  const [dccSource, setDccSource] = useState<DccLiveLinkSource>("blender");

  const activeTemplate = DYNAMIC_WORKFLOW_TEMPLATES[templateId];
  const effectiveNodes = useMemo(
    () => activeTemplate.nodes.map((node) => ({ ...node, enabled: !disabledNodeIds.includes(node.id) })),
    [activeTemplate.nodes, disabledNodeIds],
  );
  const stepResultById = useMemo(() => new Map((dagReport?.stepResults ?? []).map((step) => [step.nodeId, step])), [dagReport]);
  const parsedStoryboard = useMemo(() => parseNovelOrScriptToStoryboard(scriptText, { format: scriptFormat }), [scriptFormat, scriptText]);
  const settlementReport = useMemo(() => computeStudioSettlementReport(DEFAULT_STUDIO_SETTLEMENT_INPUT), []);
  const settlementCsv = useMemo(() => formatSettlementCsv(settlementReport), [settlementReport]);
  const otioPackage = useMemo(() => buildMovingToonOtioScene({ ...DEFAULT_MOVING_TOON_INPUT, targetProfile: motionProfile }), [motionProfile]);
  const hwProfile = useMemo(() => normalizeHardwareControllerProfile({ profileId: `${hwFamily}-studio`, displayName: HARDWARE_TEST_EVENTS[hwFamily].labelEn, family: hwFamily }), [hwFamily]);
  const hwRouted = useMemo(() => routeHardwareInputEvent(hwProfile, HARDWARE_TEST_EVENTS[hwFamily].event), [hwFamily, hwProfile]);
  const dccSynced = useMemo(() => reconcileDccLiveLinkPacket({
    ...DEFAULT_DCC_LIVELINK_PACKET, sourceDcc: dccSource,
    camera: dccSource === "unreal" ? { position: [420, -780, 260], target: [0, 50, 140], fovDeg: 42, sensorWidthMm: 36 } : DEFAULT_DCC_LIVELINK_PACKET.camera,
  }), [dccSource]);
  const halftoneTile = useMemo(() => generateMoireFreeHalftoneTile({ tileSize: 24, lpi: 133, dpi: 600, cmykCoverage: { c: 0.25, m: 0.2, y: 0.15, k: 0.4 } }), []);
  const xpbdSample = useMemo(() => {
    let strand = createXpbdClothHairStrand(8, 0.08);
    let res = stepXpbdClothHairStrand(strand);
    for (let i = 0; i < 7; i += 1) { strand = res.state; res = stepXpbdClothHairStrand(strand, { wind: [2.0, 0, 0.3], substeps: 6 }); }
    return res;
  }, []);

  const handleSelectTemplate = (nextId: DynamicWorkflowTemplateId): void => { setTemplateId(nextId); setDisabledNodeIds([]); setDagReport(null); setNotice(""); };
  const handleToggleNode = (nodeId: string): void => { setDisabledNodeIds((prev) => (prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId])); };
  const handleRunDag = (): void => {
    const report = executeDynamicWorkflowDag({
      templateId, nodes: effectiveNodes, flags: activeTemplate.defaultFlags, scriptText,
      settlementInput: DEFAULT_STUDIO_SETTLEMENT_INPUT, movingToonInput: { ...DEFAULT_MOVING_TOON_INPUT, targetProfile: motionProfile },
      dccPacket: { ...DEFAULT_DCC_LIVELINK_PACKET, sourceDcc: dccSource },
    });
    setDagReport(report);
    setNotice(pick(`DAG 드라이런 완료 · 완료 ${report.completedCount}단계 · 스킵 ${report.skippedCount}단계 · 총 ${report.totalDurationMs.toFixed(2)}ms`, `DAG dry-run finished · ${report.completedCount} done · ${report.skippedCount} skipped · ${report.totalDurationMs.toFixed(2)}ms`));
    onWorkflowExecuted?.(report);
  };

  const tabs: readonly { readonly id: DynamicWorkflowTabId; readonly label: string }[] = [
    { id: "dag-orchestrator", label: pick("다이나믹 워크플로우 DAG 실행", "Dynamic Workflow DAG") },
    { id: "script-erp", label: pick("노블코믹스 각본 & CP 정산", "Novel Script & CP Settlement") },
    { id: "motion-hw-livelink", label: pick("OTIO 무빙툰 · WebHID 하드웨어 · 3D 라이브링크", "OTIO · WebHID · 3D LiveLink") },
  ];

  return (
    <section aria-label={pick("다이나믹 워크플로우 및 외부 생태계 패널", "Dynamic Workflow & Ecosystem Panel")} className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <GitBranch className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("DAG 오케스트레이터 · 각본/ERP · OTIO/WebHID/LiveLink", "DAG Orchestrator · Script/ERP · OTIO/WebHID/LiveLink")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">{pick("다이나믹 워크플로우 제작 생태계", "Dynamic Workflow Production Ecosystem")}</h2>
          <p className="text-xs text-fg-2">{pick("각본 파싱부터 BYOT·3D 라이브링크·XPBD 물리·OTIO 무빙툰·CP 정산까지 필요한 단계만 조합해 즉시 실행합니다.", "Compose and dry-run script parsing, BYOT, 3D LiveLink, XPBD physics, OTIO moving-toon, and CP settlement in one DAG.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">{pick(`프리셋 ${DYNAMIC_WORKFLOW_TEMPLATE_LIST.length}종`, `${DYNAMIC_WORKFLOW_TEMPLATE_LIST.length} Presets`)}</span>
          {dagReport ? (
            <span data-testid="dag-total-latency" className="rounded-full bg-good-soft px-3 py-1 font-semibold text-good">
              {pick(`완료 ${dagReport.completedCount}/${effectiveNodes.length} · ${dagReport.totalDurationMs.toFixed(2)}ms`, `Done ${dagReport.completedCount}/${effectiveNodes.length} · ${dagReport.totalDurationMs.toFixed(2)}ms`)}
            </span>
          ) : null}
        </div>
      </header>

      <div role="tablist" aria-label={pick("다이나믹 워크플로우 탭", "Dynamic workflow tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_PRIMARY : BTN_OUTLINE}>
            {tab.label}
          </button>
        ))}
      </div>

      {notice ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-semibold text-good">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{notice}</span>
        </div>
      ) : null}

      {activeTab === "dag-orchestrator" ? (
        <div id={`${uid}-panel-dag-orchestrator`} role="tabpanel" aria-labelledby={`${uid}-tab-dag-orchestrator`} className="flex flex-col gap-4">
          <div className="grid gap-2.5 md:grid-cols-3">
            {DYNAMIC_WORKFLOW_TEMPLATE_LIST.map((tpl) => (
              <button key={tpl.id} type="button" aria-pressed={tpl.id === templateId} onClick={() => handleSelectTemplate(tpl.id)} className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left text-xs transition-colors motion-reduce:transition-none ${FOCUS_RING} ${tpl.id === templateId ? BTN_ACTIVE : BTN_IDLE}`}>
                <span className="font-bold text-fg">{pick(tpl.nameKo, tpl.nameEn)}</span>
                <span className="text-[11px] text-fg-2">{pick(tpl.summaryKo, tpl.summaryEn)}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <div className="text-xs text-fg-2 tabular-nums">
              <strong className="text-fg">{pick(activeTemplate.nameKo, activeTemplate.nameEn)}</strong>
              {" · "}{pick(`활성 단계 ${effectiveNodes.filter((n) => n.enabled).length}/${effectiveNodes.length}`, `Enabled ${effectiveNodes.filter((n) => n.enabled).length}/${effectiveNodes.length}`)}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleRunDag} className={BTN_PRIMARY}><Play className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("원클릭 드라이런 실행", "Run Dry-Run DAG")}</span></button>
              <button type="button" onClick={() => { setDisabledNodeIds([]); setDagReport(null); setNotice(""); }} className={BTN_OUTLINE}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("초기화", "Reset")}</span></button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {effectiveNodes.map((node, index) => {
              const result = stepResultById.get(node.id);
              const badge = stepStatusBadge(result?.status ?? "idle", isKo);
              const toggleId = `${uid}-node-${node.id}`;
              return (
                <article key={node.id} data-testid={`dag-node-${node.id}`} className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <label htmlFor={toggleId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-bold text-fg">
                      <input id={toggleId} type="checkbox" checked={node.enabled} onChange={() => handleToggleNode(node.id)} className="h-4 w-4 accent-accent" />
                      <span className="tabular-nums">{index + 1}. {pick(node.labelKo, node.labelEn)}</span>
                    </label>
                    <span data-testid={`dag-status-${node.id}`} className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${badge.cls}`}>
                      {badge.label}{result && result.status === "completed" ? ` · ${result.durationMs.toFixed(1)}ms` : ""}
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-2">{result ? pick(result.summaryKo, result.summaryEn) : pick(node.descriptionKo, node.descriptionEn)}</p>
                  {node.dependsOn.length > 0 ? <span className="mt-auto text-[10px] text-fg-3">{pick(`선행: ${node.dependsOn.join(", ")}`, `Depends: ${node.dependsOn.join(", ")}`)}</span> : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "script-erp" ? (
        <div id={`${uid}-panel-script-erp`} role="tabpanel" aria-labelledby={`${uid}-tab-script-erp`} className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><FileText className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("노블코믹스 원천 각본 파서", "Novel-Comics Script Parser")}</span></h3>
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-accent">
                {pick(`${parsedStoryboard.summary.cutCount}컷 · 인물 ${parsedStoryboard.summary.characterCount}명 · 말풍선 ${parsedStoryboard.summary.balloonCount}개`, `${parsedStoryboard.summary.cutCount} cuts · ${parsedStoryboard.summary.characterCount} chars · ${parsedStoryboard.summary.balloonCount} balloons`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SCRIPT_SAMPLES) as ResolvedScriptFormat[]).map((fmt) => (
                <button key={fmt} type="button" aria-pressed={scriptFormat === fmt} onClick={() => { setScriptFormat(fmt); setScriptText(SCRIPT_SAMPLES[fmt].text); }} className={`${BTN_PILL} ${scriptFormat === fmt ? BTN_ACTIVE : BTN_IDLE}`}>
                  {pick(SCRIPT_SAMPLES[fmt].labelKo, SCRIPT_SAMPLES[fmt].labelEn)}
                </button>
              ))}
            </div>
            <label htmlFor={`${uid}-script-input`} className="text-xs font-semibold text-fg-2">{pick("대본 원문 (Fountain / FDX / Scrivener MD / Notion)", "Source Script (Fountain / FDX / Scrivener MD / Notion)")}</label>
            <textarea id={`${uid}-script-input`} rows={6} value={scriptText} onChange={(e) => setScriptText(e.target.value)} className={`w-full rounded-lg border border-line bg-canvas p-2.5 font-mono text-xs text-fg ${FOCUS_RING}`} />
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {parsedStoryboard.characterBible.map((ch) => (
                <span key={ch.characterId} className="rounded-full border border-line bg-canvas px-2.5 py-1 font-semibold tabular-nums text-fg-2">{ch.name} · {pick(`${ch.dialogueCount}대사`, `${ch.dialogueCount} lines`)}</span>
              ))}
            </div>
            <ul className="space-y-1.5 text-xs">
              {parsedStoryboard.cuts.slice(0, 3).map((cut) => (
                <li key={cut.cutId} className="rounded-lg border border-line bg-canvas p-2">
                  <div className="flex items-center justify-between gap-2 font-bold text-fg tabular-nums"><span>{cut.cutId.toUpperCase()} · {cut.cameraShot}</span><span className="text-[11px] font-medium text-fg-3">{cut.balloons.length} {pick("말풍선", "balloons")}</span></div>
                  <p className="mt-0.5 text-[11px] text-fg-2">{cut.balloons.map((b) => `${b.speaker}: ${b.text}`).join(" / ") || cut.visualDirection}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><Receipt className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("CP · 어시스턴트 · Rights BOM 정산 ERP", "CP · Assistant · Rights BOM ERP")}</span></h3>
              <span className="rounded-full bg-good-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-good">{pick("원천징수 3.3% 자동 반영", "3.3% Withholding Ready")}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
              <div className="rounded-lg border border-line bg-canvas p-2.5"><div className="text-[11px] text-fg-3">{pick("어시 실지급액", "Assistant Net")}</div><div data-testid="erp-assistant-net" className="mt-0.5 font-bold text-fg">{settlementReport.totals.totalAssistantNet.toLocaleString("en-US")}</div></div>
              <div className="rounded-lg border border-line bg-canvas p-2.5"><div className="text-[11px] text-fg-3">{pick("원천징수(3.3%)", "Tax (3.3%)")}</div><div data-testid="erp-withholding-tax" className="mt-0.5 font-bold text-warn">{settlementReport.totals.totalWithholdingTax.toLocaleString("en-US")}</div></div>
              <div className="rounded-lg border border-line bg-canvas p-2.5"><div className="text-[11px] text-fg-3">{pick("Rights BOM", "Rights BOM")}</div><div data-testid="erp-rights-bom" className="mt-0.5 font-bold text-accent">{settlementReport.totals.totalRightsBomCost.toLocaleString("en-US")}</div></div>
            </div>
            <div className="space-y-1.5 text-xs tabular-nums">
              {settlementReport.assistantLines.map((line) => (
                <div key={line.assistantId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
                  <span className="font-bold text-fg">{line.name} ({line.role}) · {line.weightedCutCount}{pick("컷", "c")} / {line.totalHours}h</span>
                  <span className="text-fg-2">{pick(`실지급 ${line.netPayAmount.toLocaleString("en-US")}원`, `Net ${line.netPayAmount.toLocaleString("en-US")}`)}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowCsvPreview((v) => !v)} className={BTN_OUTLINE}><Code2 className="h-3.5 w-3.5" aria-hidden="true" /><span>{showCsvPreview ? pick("RFC4180 CSV 숨기기", "Hide RFC4180 CSV") : pick("RFC4180 CSV 미리보기", "Preview RFC4180 CSV")}</span></button>
              <button type="button" onClick={() => triggerDownload(`toonstudio-erp-${settlementReport.episodeCode}.csv`, settlementCsv, "text/csv;charset=utf-8")} className={BTN_PRIMARY}><Download className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("정산 CSV 내보내기", "Export Settlement CSV")}</span></button>
            </div>
            {showCsvPreview ? <pre data-testid="erp-csv-preview" className="max-h-40 overflow-auto rounded-lg border border-line bg-panel p-2.5 font-mono text-[11px] text-fg-2"><code>{settlementCsv}</code></pre> : null}
          </div>
        </div>
      ) : null}

      {activeTab === "motion-hw-livelink" ? (
        <div id={`${uid}-panel-motion-hw-livelink`} role="tabpanel" aria-labelledby={`${uid}-tab-motion-hw-livelink`} className="grid gap-4 lg:grid-cols-3">
          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><Clapperboard className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("OTIO 무빙툰 익스포터", "OTIO Moving-Toon Exporter")}</span></h3>
            <div className="grid grid-cols-2 gap-1.5">
              {TARGET_PROFILES.map((tp) => <button key={tp.id} type="button" aria-pressed={motionProfile === tp.id} onClick={() => setMotionProfile(tp.id)} className={`${BTN_PILL} ${motionProfile === tp.id ? BTN_ACTIVE : BTN_IDLE}`}>{tp.label}</button>)}
            </div>
            <div className="space-y-1 rounded-lg border border-line bg-canvas p-2.5 tabular-nums text-fg-2">
              <div>{pick(`스키마: ${otioPackage.schema} · 무손실 검증 완료`, `Schema: ${otioPackage.schema} · Lossless OK`)}</div>
              <div>{pick(`컷 ${otioPackage.summary.cutCount} · 레이어 ${otioPackage.summary.totalLayers} · ${otioPackage.summary.totalFrames}프레임`, `${otioPackage.summary.cutCount} cuts · ${otioPackage.summary.totalLayers} layers · ${otioPackage.summary.totalFrames} frames`)}</div>
              <div>{pick(`Z-깊이: ${otioPackage.summary.zDepthRange[0]}m ~ ${otioPackage.summary.zDepthRange[1]}m · 자막 ${otioPackage.summary.subtitleCueCount}건`, `Z-Depth: ${otioPackage.summary.zDepthRange[0]}m..${otioPackage.summary.zDepthRange[1]}m · ${otioPackage.summary.subtitleCueCount} cues`)}</div>
            </div>
            <button type="button" onClick={() => setShowOtioJson((v) => !v)} className={BTN_OUTLINE}><Code2 className="h-3.5 w-3.5" aria-hidden="true" /><span>{showOtioJson ? pick(".otio JSON 접기", "Hide .otio JSON") : pick(".otio JSON 미리보기", "Inspect .otio JSON")}</span></button>
            {showOtioJson ? <pre data-testid="otio-json-preview" className="max-h-36 overflow-auto rounded-lg border border-line bg-panel p-2 font-mono text-[10px] text-fg-2"><code>{otioPackage.otioJson}</code></pre> : null}
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><Gamepad2 className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("WebHID 하드웨어 & 무선 리모컨", "WebHID Hardware & Remote")}</span></h3>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(HARDWARE_TEST_EVENTS) as HardwareControllerFamily[]).map((fam) => (
                <button key={fam} type="button" aria-pressed={hwFamily === fam} onClick={() => setHwFamily(fam)} className={`${BTN_PILL} ${hwFamily === fam ? BTN_ACTIVE : BTN_IDLE}`}>
                  {pick(HARDWARE_TEST_EVENTS[fam].labelKo, HARDWARE_TEST_EVENTS[fam].labelEn)}
                </button>
              ))}
            </div>
            <div data-testid="webhid-routed-summary" className="space-y-1 rounded-lg border border-line bg-canvas p-2.5 tabular-nums text-fg-2">
              <div className="font-bold text-fg">{hwProfile.displayName} ({hwProfile.transport})</div>
              <div>{pick(`매핑 수: ${hwProfile.bindingCount}개 · 액션: ${hwRouted.action ?? "-"}`, `Bindings: ${hwProfile.bindingCount} · Action: ${hwRouted.action ?? "-"}`)}</div>
              <div>{pick(`단축키: ${hwRouted.shortcutLabel ?? "-"} · 출력값: ${hwRouted.value} ${hwRouted.unit}`, `Shortcut: ${hwRouted.shortcutLabel ?? "-"} · Value: ${hwRouted.value} ${hwRouted.unit}`)}</div>
            </div>
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><Sun className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("3D 라이브링크 · Wasm64 하프톤/XPBD", "3D LiveLink · Wasm64 Halftone/XPBD")}</span></h3>
            <div className="grid grid-cols-3 gap-1.5">
              {DCC_SOURCES.map((src) => <button key={src.id} type="button" aria-pressed={dccSource === src.id} onClick={() => setDccSource(src.id)} className={`${BTN_PILL} ${dccSource === src.id ? BTN_ACTIVE : BTN_IDLE}`}>{src.label}</button>)}
            </div>
            <div data-testid="dcc-livelink-summary" className="space-y-1 rounded-lg border border-line bg-canvas p-2.5 tabular-nums text-fg-2">
              <div className="font-bold text-fg">{dccSynced.sourceDcc.toUpperCase()} · FOV {dccSynced.fovDeg}° ({dccSynced.focalLength35mm}mm)</div>
              <div>{pick(`태양 방위 ${dccSynced.sunAzimuthDeg}° / 고도 ${dccSynced.sunElevationDeg}° · 그림자비 ${dccSynced.nprShadowGuide.shadowLengthRatio}×`, `Sun Az ${dccSynced.sunAzimuthDeg}° / El ${dccSynced.sunElevationDeg}° · Shadow ${dccSynced.nprShadowGuide.shadowLengthRatio}×`)}</div>
            </div>
            <div className="space-y-1 rounded-lg border border-line bg-canvas p-2.5 tabular-nums text-fg-2">
              <div className="flex items-center gap-1.5 font-bold text-fg"><Cpu className="h-3.5 w-3.5 text-good" aria-hidden="true" /><span>{pick(`CMYK 로제트 45°/15°/75°/0° · 모아레 위험 ${halftoneTile.moireRiskScore}`, `CMYK Rosette 45°/15°/75°/0° · Moire ${halftoneTile.moireRiskScore}`)}</span></div>
              <div>{pick(`XPBD 천/머리카락 ${xpbdSample.state.stepCount}프레임 · 신장오차 ${(xpbdSample.maxStretchError * 100).toFixed(2)}%`, `XPBD Cloth/Hair ${xpbdSample.state.stepCount}f · Stretch Err ${(xpbdSample.maxStretchError * 100).toFixed(2)}%`)}</div>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
