/**
 * 개방형 하이브리드 웹툰 생태계 패널 (Wave 18 Track 1).
 *
 * - 탭 1 [협업·이슈 연동]: Jira·Linear·Slack·Discord·Notion·GitHub 토글, 실시간 Dry-Run 페이로드 & 양방향 웹훅/멱등성 테스트
 * - 탭 2 [BYOT 타사 툴 브리지]: Clip Studio·Photoshop·Procreate·Blender·SketchUp·Figma 선택적 라운드트립 & Rights BOM 상속
 * - 탭 3 [오픈 플러그인·웹훅 SDK]: Wasm 샌드박스 최소 권한 검증기 & 에셋 스토어·플랫폼 출판 커넥터 매트릭스
 * Calm Atelier 시맨틱 토큰 전용 · 470줄 이하 · 원시 색상·비권장 브라우저 저장소 미사용 · 모든 props optional · KO/EN 지원.
 */

import { ArrowLeftRight, CheckCircle2, Cloud, Layers, Plug, ShieldAlert, ShieldCheck, Webhook } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  BYOT_TOOL_META, DEFAULT_BYOT_LAYERS, DEFAULT_EXTERNAL_LINKED_ASSETS, ECOSYSTEM_CONNECTOR_MATRIX,
  NONPRINT_REDLINE_LAYER_NAME, OPTIONAL_MODULE_META, SAMPLE_SAFE_PLUGIN_MANIFEST, SAMPLE_UNSAFE_PLUGIN_MANIFEST,
  STORAGE_BACKEND_META, createByotRoundtripSession, parseAndValidatePluginManifestJson,
  reconcileByotLayerDiff, reconcileExternalAssetChanges,
  type ByotExternalToolId, type ByotRoundtripReconcileResult, type ByotRoundtripReconcileSummary,
  type ByotStorageBackendId, type ExternalAssetReconcileReport, type OpenPluginManifest,
  type PluginManifestValidationResult, type ToonStudioOptionalModuleId,
} from "./byot-roundtrip-and-plugin-sdk";
import {
  DEFAULT_CONNECTOR_CONFIGS, EXTERNAL_TRACKER_PROVIDERS, PROVIDER_METADATA, SAMPLE_REVIEW_EVENT,
  buildExternalTrackerDryRunEnvelope, createIdempotencyLedger, hmacSha256Hex, parseExternalTrackerWebhook, sha256Hex,
  type ExternalTrackerConnectorConfig, type ExternalTrackerProvider, type IdempotencyLedger,
  type NormalizedWebhookTransition, type ToonStudioReviewEvent, type ToonStudioReviewEventKind,
} from "./external-tracker-connectors";

export type OpenEcosystemTabId = "trackers" | "byot-bridge" | "plugin-sdk";

export interface StudioOpenEcosystemPanelProps {
  readonly initialWorkTitle?: string; readonly initialEpisodeTitle?: string; readonly initialCutId?: string;
  readonly initialTab?: OpenEcosystemTabId; readonly locale?: "ko" | "en"; readonly className?: string;
  readonly onConnectorToggle?: (provider: ExternalTrackerProvider, enabled: boolean) => void;
  readonly onByotReconcile?: (summary: ByotRoundtripReconcileSummary) => void;
  readonly onPluginValidate?: (result: PluginManifestValidationResult) => void;
}

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`;
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;

const BYOT_TOOL_ORDER: readonly ByotExternalToolId[] = ["clip-studio-paint", "photoshop", "procreate", "blender", "sketchup", "figma"];
const STORAGE_ORDER: readonly ByotStorageBackendId[] = ["local-opfs", "google-drive", "dropbox", "s3-r2"];
const OPTIONAL_MODULE_ORDER: readonly ToonStudioOptionalModuleId[] = ["nonprint-redline-review", "auto-qa-pinhole-bleed", "smart-publish-slice", "rights-bom-governance", "external-tracker-sync"];
const EVENT_KIND_OPTIONS: readonly { readonly id: ToonStudioReviewEventKind; readonly ko: string; readonly en: string }[] = [
  { id: "redline-pin-created", ko: "레드라인 검수 핀", en: "Redline Review Pin" },
  { id: "cut-changes-requested", ko: "컷 결재 반려", en: "Cut Changes Requested" },
  { id: "cut-approved", ko: "컷 승인 완료", en: "Cut Approved" },
  { id: "deadline-urgent", ko: "긴급 마감 경보", en: "Urgent Deadline Alert" },
];

function buildSampleWebhookBody(provider: ExternalTrackerProvider, cutId: string, episodeId: string, statusLabel: string): string {
  if (provider === "jira") return JSON.stringify({ webhookEvent: "jira:issue_updated", user: { displayName: "Seoyeon Kim PD" }, issue: { key: "WEBTOON-142", fields: { summary: `${cutId} lineart revision`, status: { name: statusLabel }, labels: ["toonstudio", `episode-${episodeId}`, `cut-${cutId}`, "pin-pin-07a"] } } });
  if (provider === "linear") return JSON.stringify({ type: "Issue", action: "update", actor: { name: "Hayun Jeong" }, data: { identifier: "WTN-88", title: `[${episodeId}/${cutId}] lineart fix`, state: { name: statusLabel, type: statusLabel === "Done" ? "completed" : "started" }, labels: [{ name: `cut-${cutId}` }] } });
  if (provider === "github") return JSON.stringify({ action: statusLabel === "Done" ? "closed" : "reopened", sender: { login: "studio-pd" }, issue: { number: 47, title: `[${episodeId}][${cutId}] QA checklist`, state: statusLabel === "Done" ? "closed" : "open", labels: [{ name: `cut:${cutId}` }, { name: `episode:${episodeId}` }] } });
  if (provider === "notion") return JSON.stringify({ type: "page.properties_updated", actorName: "Editorial Desk", cutId, episodeId, data: { id: "page-ep14-cut07", properties: { ReviewStatus: { select: { name: statusLabel === "Done" ? "Approved" : "In Progress" } }, cutId, episodeId } } });
  return JSON.stringify({ messageId: `${provider}-msg-07`, user: { name: "Seoyeon Kim PD" }, actions: [{ action_id: statusLabel === "Done" ? "toonstudio_approve_cut" : "toonstudio_request_changes", value: `${episodeId}:${cutId}:${statusLabel === "Done" ? "approved" : "changes requested"}` }] });
}

function formatManifestPreset(manifest: OpenPluginManifest, isEn: boolean): string {
  if (!isEn) return JSON.stringify(manifest, null, 2);
  const { descriptionKo: _omitKo, ...rest } = manifest;
  void _omitKo;
  return JSON.stringify(rest, null, 2);
}

export function StudioOpenEcosystemPanel({
  initialWorkTitle, initialEpisodeTitle, initialCutId, initialTab = "trackers", locale, className,
  onConnectorToggle, onByotReconcile, onPluginValidate,
}: StudioOpenEcosystemPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const workTitle = initialWorkTitle?.trim() || pick(SAMPLE_REVIEW_EVENT.workTitle, "Moonlight Atelier Contract");
  const episodeTitle = initialEpisodeTitle?.trim() || pick(SAMPLE_REVIEW_EVENT.episodeTitle, "EP.14 Seal Fracture");
  const cutId = initialCutId?.trim() || SAMPLE_REVIEW_EVENT.cutId;

  const [activeTab, setActiveTab] = useState<OpenEcosystemTabId>(initialTab);
  const [connectors, setConnectors] = useState<readonly ExternalTrackerConnectorConfig[]>(DEFAULT_CONNECTOR_CONFIGS);
  const [selectedProvider, setSelectedProvider] = useState<ExternalTrackerProvider>("jira");
  const [eventKind, setEventKind] = useState<ToonStudioReviewEventKind>("redline-pin-created");
  const [webhookLedger, setWebhookLedger] = useState<IdempotencyLedger>(() => createIdempotencyLedger());
  const [lastWebhookResult, setLastWebhookResult] = useState<NormalizedWebhookTransition | null>(null);
  const [lastDeliverySeq, setLastDeliverySeq] = useState<number>(0);

  const [byotTool, setByotTool] = useState<ByotExternalToolId>("clip-studio-paint");
  const [storageBackend, setStorageBackend] = useState<ByotStorageBackendId>("s3-r2");
  const [enabledModules, setEnabledModules] = useState<readonly ToonStudioOptionalModuleId[]>([
    "nonprint-redline-review", "auto-qa-pinhole-bleed", "smart-publish-slice", "rights-bom-governance", "external-tracker-sync",
  ]);
  const [reconcileResult, setReconcileResult] = useState<ByotRoundtripReconcileResult | null>(null);
  const [assetReport, setAssetReport] = useState<ExternalAssetReconcileReport | null>(null);

  const [manifestDraft, setManifestDraft] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string>("");

  const effectiveManifestDraft = manifestDraft ?? formatManifestPreset(SAMPLE_SAFE_PLUGIN_MANIFEST, isEn);
  const activeConfig = useMemo(() => connectors.find((item) => item.provider === selectedProvider) ?? connectors[0], [connectors, selectedProvider]);
  const enabledConnectorCount = useMemo(() => connectors.filter((c) => c.enabled).length, [connectors]);

  const previewEvent = useMemo<ToonStudioReviewEvent>(() => ({
    ...SAMPLE_REVIEW_EVENT,
    eventKind, workTitle, episodeTitle, cutId, locale: isEn ? "en" : "ko",
    summary: isEn ? "Adjust right index grip angle and sleeve folds" : SAMPLE_REVIEW_EVENT.summary,
    description: isEn ? "Keep external Clip Studio lineart intact; refine hand silhouette and 12px speech balloon padding." : SAMPLE_REVIEW_EVENT.description,
    reporterName: isEn ? "Seoyeon Kim PD" : SAMPLE_REVIEW_EVENT.reporterName,
    sourceToolLabel: `${BYOT_TOOL_META[byotTool].labelEn} (${BYOT_TOOL_META[byotTool].defaultFormat})`,
  }), [byotTool, cutId, episodeTitle, eventKind, isEn, workTitle]);

  const dryRunEnvelope = useMemo(() => buildExternalTrackerDryRunEnvelope(previewEvent, activeConfig), [activeConfig, previewEvent]);
  const byotSession = useMemo(
    () => reconcileResult?.nextSession ?? createByotRoundtripSession({
      workId: SAMPLE_REVIEW_EVENT.workId, episodeId: SAMPLE_REVIEW_EVENT.episodeId, cutId,
      sourceTool: byotTool, storageBackend, enabledModules, layers: DEFAULT_BYOT_LAYERS, externalAssets: DEFAULT_EXTERNAL_LINKED_ASSETS,
    }),
    [byotTool, cutId, enabledModules, reconcileResult, storageBackend],
  );
  const pluginCheck = useMemo(() => parseAndValidatePluginManifestJson(effectiveManifestDraft).result, [effectiveManifestDraft]);

  const handleToggleConnector = (provider: ExternalTrackerProvider): void => {
    let nextEnabled = false;
    setConnectors((prev) => prev.map((c) => (c.provider === provider ? ((nextEnabled = !c.enabled), { ...c, enabled: nextEnabled }) : c)));
    onConnectorToggle?.(provider, nextEnabled);
    setStatusNotice(pick(
      `${PROVIDER_METADATA[provider].nameKo} 커넥터를 ${nextEnabled ? "활성화" : "비활성화"}했습니다 (Dry-Run 모드).`,
      `${nextEnabled ? "Enabled" : "Disabled"} ${PROVIDER_METADATA[provider].nameEn} connector (Dry-Run mode).`,
    ));
  };

  const handleSimulateWebhook = (replayDuplicate: boolean): void => {
    const seq = replayDuplicate && lastDeliverySeq > 0 ? lastDeliverySeq : lastDeliverySeq + 1;
    const rawBody = buildSampleWebhookBody(selectedProvider, cutId, SAMPLE_REVIEW_EVENT.episodeId, seq % 2 === 1 ? "In Progress" : "Done");
    const demoKey = `dryrun-signing-slot-${selectedProvider}`;
    const deliveryId = `dlv-${selectedProvider}-${seq}`;
    const ts = "1795400000";
    const headers: Record<string, string> = selectedProvider === "slack"
      ? { "x-slack-request-timestamp": ts, "x-slack-signature": `v0=${hmacSha256Hex(demoKey, `v0:${ts}:${rawBody}`)}`, "x-idempotency-key": deliveryId }
      : { "x-atlassian-webhook-signature": `sha256=${hmacSha256Hex(demoKey, rawBody)}`, "x-atlassian-webhook-identifier": deliveryId };

    const res = parseExternalTrackerWebhook({
      provider: selectedProvider, rawBody, headers, webhookSecret: demoKey,
      nowEpochSec: 1795400020, statusMappings: activeConfig.statusMappings, ledger: webhookLedger,
    });
    setWebhookLedger(res.nextLedger);
    setLastWebhookResult(res);
    if (!replayDuplicate) setLastDeliverySeq(seq);
    setStatusNotice(res.duplicate
      ? pick(`중복 웹훅(${res.deliveryId}) 재전송을 멱등성 원장으로 차단했습니다 (중복 반영 0건).`, `Blocked duplicate webhook (${res.deliveryId}) via idempotency ledger (0 duplicate writes).`)
      : pick(`${PROVIDER_METADATA[selectedProvider].nameKo} 웹훅 HMAC 서명 검증 완료 → ${cutId} 상태가 ${res.nextToonStudioStatus ?? "unknown"}로 동기화되었습니다.`, `Verified ${PROVIDER_METADATA[selectedProvider].nameEn} HMAC webhook -> ${cutId} synced to ${res.nextToonStudioStatus ?? "unknown"}.`));
  };

  const handleToggleOptionalModule = (moduleId: ToonStudioOptionalModuleId): void => {
    setReconcileResult(null);
    setEnabledModules((prev) => (prev.includes(moduleId) ? (prev.length > 1 ? prev.filter((id) => id !== moduleId) : prev) : [...prev, moduleId]));
  };

  const handleRunByotRoundtrip = (): void => {
    const baseSession = createByotRoundtripSession({
      workId: SAMPLE_REVIEW_EVENT.workId, episodeId: SAMPLE_REVIEW_EVENT.episodeId, cutId,
      sourceTool: byotTool, storageBackend, enabledModules, layers: DEFAULT_BYOT_LAYERS, externalAssets: DEFAULT_EXTERNAL_LINKED_ASSETS,
    });
    const diff = reconcileByotLayerDiff(baseSession, [
      { ...DEFAULT_BYOT_LAYERS[0] },
      { ...DEFAULT_BYOT_LAYERS[1], name: "02_Char_Lineart_CSP_Final", pixelHashSha256: sha256Hex(`cut07:lineart:${byotTool}:v2`) },
      { ...DEFAULT_BYOT_LAYERS[2] },
      { ...DEFAULT_BYOT_LAYERS[3] },
      { name: "05_RimLight_External", kind: "raster", visible: true, opacity: 0.7, blendMode: "add-glow", pixelHashSha256: sha256Hex("cut07:rimlight:v1"), exportable: true },
    ]);
    const assets = reconcileExternalAssetChanges(DEFAULT_EXTERNAL_LINKED_ASSETS, [
      { assetId: "asset-blender-hallway", name: "academy_corridor_night.glb", sourceTool: "blender", storageBackend, storageUri: "r2://studio-assets/bg3d/academy_corridor_night.glb", contentDigestSeed: "blender:academy_corridor_night:v2-lighting" },
      { assetId: "asset-sketchup-chandelier", name: "vintage_chandelier_ref.skp", sourceTool: "sketchup", storageBackend: "google-drive", storageUri: "gdrive://ep14-refs/vintage_chandelier_ref.skp", contentSha256: DEFAULT_EXTERNAL_LINKED_ASSETS[1].contentSha256, claimedLicenseCode: "CC0" },
    ]);
    setReconcileResult(diff);
    setAssetReport(assets);
    onByotReconcile?.(diff.summary);
    setStatusNotice(pick(
      `${BYOT_TOOL_META[byotTool].labelKo} 라운드트립 세대 v${diff.summary.roundtripGeneration} 완료 · UID 보존 ${diff.summary.preservedUidCount}건 · 비출력 레드라인 격리 확인.`,
      `${BYOT_TOOL_META[byotTool].labelEn} roundtrip v${diff.summary.roundtripGeneration} complete · ${diff.summary.preservedUidCount} UIDs preserved · non-print redline isolated.`,
    ));
  };

  const handleLoadManifestPreset = (safe: boolean): void => {
    const formatted = formatManifestPreset(safe ? SAMPLE_SAFE_PLUGIN_MANIFEST : SAMPLE_UNSAFE_PLUGIN_MANIFEST, isEn);
    setManifestDraft(formatted);
    const check = parseAndValidatePluginManifestJson(formatted).result;
    onPluginValidate?.(check);
    setStatusNotice(check.valid
      ? pick(`Wasm 샌드박스 보안 검증 통과 (${check.securityGrade} · 메모리 ${check.effectiveMemoryLimitMb}MB).`, `Wasm sandbox validation passed (${check.securityGrade} · ${check.effectiveMemoryLimitMb}MB).`)
      : pick(`위험 권한·정책 ${check.errors.length}건이 감지되어 플러그인 로드를 차단했습니다.`, `Blocked plugin load: detected ${check.errors.length} security policy violation(s).`));
  };

  const tabs: readonly { readonly id: OpenEcosystemTabId; readonly label: string }[] = [
    { id: "trackers", label: pick("협업·이슈 연동", "Collaboration & Trackers") },
    { id: "byot-bridge", label: pick("BYOT 타사 툴 브리지", "BYOT Tool Bridge") },
    { id: "plugin-sdk", label: pick("오픈 플러그인·웹훅 SDK", "Open Plugin & Webhook SDK") },
  ];

  const layerRows = reconcileResult ? reconcileResult.diffEntries : byotSession.layers.map((l) => ({
    layerUid: l.layerUid, previousName: l.name, currentName: l.name,
    status: l.name === NONPRINT_REDLINE_LAYER_NAME ? "preserved-nonprint-redline" : "unchanged",
    uidPreserved: true, uidFallbackMatched: false, pixelChanged: false, exportable: l.exportable,
  }));
  const assetRows = assetReport ? assetReport.entries : byotSession.externalAssets.map((a) => ({
    assetId: a.assetId, name: a.name, changeKind: "unchanged" as const, previousSha256: a.contentSha256,
    currentSha256: a.contentSha256, rightsBom: a.rightsBom, licenseDowngradeBlocked: false, commercialPublishAllowed: true,
  }));

  return (
    <section aria-label={pick("개방형 하이브리드 웹툰 생태계", "Open Hybrid Webtoon Ecosystem")} className={`flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 text-fg [word-break:keep-all] ${className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Plug className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">{pick("개방형 하이브리드 웹툰 생태계", "Open Hybrid Webtoon Ecosystem")}</h2>
            <span className="rounded-full bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">{workTitle} · {episodeTitle}</span>
          </div>
          <p className="text-xs text-fg-2">
            {pick("Clip Studio·Photoshop·Blender로 계속 그리면서 Jira·Linear·Slack·ToonStudio 검수·QA·Rights BOM·출판만 선택 연결합니다.", "Keep drawing in Clip Studio, Photoshop, or Blender while selectively connecting Jira, Linear, Slack, ToonStudio QA, Rights BOM, and publishing.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">{pick(`활성 커넥터 ${enabledConnectorCount}/6`, `Active ${enabledConnectorCount}/6`)}</span>
          <span className="rounded-full bg-good-soft px-3 py-1 font-semibold text-good">{pick(`라운드트립 v${byotSession.roundtripGeneration}`, `Roundtrip v${byotSession.roundtripGeneration}`)}</span>
        </div>
      </header>

      <div role="tablist" aria-label={pick("개방형 생태계 섹션 탭", "Open ecosystem section tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_SOLID : BTN_OUTLINE}>{tab.label}</button>
        ))}
      </div>

      {statusNotice ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{statusNotice}</span>
        </div>
      ) : null}

      {activeTab === "trackers" ? (
        <div id={`${uid}-panel-trackers`} role="tabpanel" aria-labelledby={`${uid}-tab-trackers`} className="flex flex-col gap-4">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {EXTERNAL_TRACKER_PROVIDERS.map((provider) => {
              const cfg = connectors.find((c) => c.provider === provider) ?? DEFAULT_CONNECTOR_CONFIGS[0];
              const meta = PROVIDER_METADATA[provider];
              const isSelected = selectedProvider === provider;
              return (
                <article key={provider} className={`flex flex-col gap-2 rounded-xl border p-3 text-xs ${isSelected ? "border-accent bg-accent-soft/40" : "border-line bg-card"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setSelectedProvider(provider)} aria-pressed={isSelected} className={`cursor-pointer text-left font-bold text-fg ${FOCUS_RING}`}>{pick(meta.nameKo, meta.nameEn)}</button>
                    <button type="button" aria-pressed={cfg.enabled} onClick={() => handleToggleConnector(provider)} className={`min-h-11 cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${cfg.enabled ? "border-good bg-good-soft text-good" : "border-line bg-raised text-fg-2"}`}>
                      {cfg.enabled ? pick("연결 ON", "ON") : pick("연결 OFF", "OFF")}
                    </button>
                  </div>
                  <span className="text-[11px] font-medium text-fg-3">{meta.protocolLabel} · {cfg.targetKey}</span>
                  <p className="text-[11px] text-fg-2">{pick(meta.summaryKo, meta.summaryEn)}</p>
                </article>
              );
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-12">
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Webhook className="h-4 w-4 text-accent" aria-hidden="true" />
                  <span>{pick(`${PROVIDER_METADATA[selectedProvider].nameKo} 실시간 Dry-Run 페이로드`, `${PROVIDER_METADATA[selectedProvider].nameEn} Live Dry-Run Payload`)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={`${uid}-event-kind`} className="sr-only">{pick("이벤트 유형", "Event Kind")}</label>
                  <select id={`${uid}-event-kind`} value={eventKind} onChange={(e) => setEventKind(e.target.value as ToonStudioReviewEventKind)} className={INPUT_CLS}>
                    {EVENT_KIND_OPTIONS.map((opt) => <option key={opt.id} value={opt.id}>{pick(opt.ko, opt.en)}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums text-fg-2">
                <span className="rounded bg-raised px-2 py-0.5 font-mono">{dryRunEnvelope.method} {dryRunEnvelope.endpointTemplate}</span>
                <span className="rounded bg-good-soft px-2 py-0.5 font-semibold text-good">{pick(`인증 슬롯: ${dryRunEnvelope.authBinding} · 시크릿 유출 ${dryRunEnvelope.leakedSecretFindings.length}건`, `Auth slot: ${dryRunEnvelope.authBinding} · ${dryRunEnvelope.leakedSecretFindings.length} leaks`)}</span>
              </div>
              <pre data-testid="tracker-dryrun-json" className="max-h-52 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2"><code>{JSON.stringify(dryRunEnvelope.payload, null, 2)}</code></pre>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <ArrowLeftRight className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{pick("양방향 상태 매핑 · HMAC 웹훅 동기화", "Bidirectional Mapping & HMAC Webhook")}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {activeConfig.statusMappings.map((row) => (
                  <div key={row.externalStatus} className="flex items-center justify-between rounded-lg border border-line bg-canvas px-2.5 py-1.5">
                    <span className="font-semibold text-fg">{row.externalStatus}</span>
                    <span className="text-fg-3">→ {row.toonStudioStatus}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => handleSimulateWebhook(false)} className={BTN_SOLID}>{pick("웹훅 수신 시뮬레이션", "Simulate Webhook Sync")}</button>
                <button type="button" onClick={() => handleSimulateWebhook(true)} disabled={lastDeliverySeq === 0} className={`${BTN_OUTLINE} disabled:cursor-not-allowed disabled:opacity-50`}>{pick("중복 재전송 방어 테스트", "Test Duplicate Replay")}</button>
              </div>
              {lastWebhookResult ? (
                <div data-testid="webhook-sync-result" className={`rounded-lg border p-2.5 text-[11px] tabular-nums ${lastWebhookResult.duplicate ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"}`}>
                  <p className="font-bold">{lastWebhookResult.duplicate ? pick("중복 차단됨 (Idempotency OK)", "Duplicate Blocked (Idempotency OK)") : pick(`수신 반영 완료 (${lastWebhookResult.signatureStatus})`, `Synced (${lastWebhookResult.signatureStatus})`)}</p>
                  <p className="mt-1 text-fg-2">{lastWebhookResult.externalEntityKey} ({lastWebhookResult.externalStatus}) → {lastWebhookResult.mappedCutId ?? cutId}: {lastWebhookResult.nextToonStudioStatus ?? "-"}</p>
                  <p className="font-mono text-[10px] text-fg-3">key: {lastWebhookResult.idempotencyKey}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "byot-bridge" ? (
        <div id={`${uid}-panel-byot-bridge`} role="tabpanel" aria-labelledby={`${uid}-tab-byot-bridge`} className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <fieldset className="rounded-xl border border-line bg-card p-3.5">
              <legend className="flex items-center gap-1.5 px-1 text-xs font-bold text-fg"><Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("외부 창작 툴 선택 (BYOT)", "External Creative Tool (BYOT)")}</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BYOT_TOOL_ORDER.map((toolId) => {
                  const active = byotTool === toolId;
                  const meta = BYOT_TOOL_META[toolId];
                  return (
                    <button key={toolId} type="button" aria-pressed={active} onClick={() => { setByotTool(toolId); setReconcileResult(null); }} className={`min-h-11 cursor-pointer rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-accent" : "border-line bg-canvas text-fg-2 hover:bg-raised"}`}>
                      <div>{pick(meta.labelKo, meta.labelEn)}</div>
                      <div className="text-[10px] font-normal text-fg-3">{meta.defaultFormat}</div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-line bg-card p-3.5">
              <legend className="flex items-center gap-1.5 px-1 text-xs font-bold text-fg"><Cloud className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("스토리지 백엔드 & ToonStudio 선택 모듈", "Storage Backend & Optional ToonStudio Modules")}</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STORAGE_ORDER.map((id) => (
                  <button key={id} type="button" aria-pressed={storageBackend === id} onClick={() => setStorageBackend(id)} className={`min-h-11 cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${storageBackend === id ? "border-accent bg-accent-soft text-accent" : "border-line bg-canvas text-fg-2"}`}>{pick(STORAGE_BACKEND_META[id].labelKo, STORAGE_BACKEND_META[id].labelEn)}</button>
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {OPTIONAL_MODULE_ORDER.map((modId) => {
                  const on = enabledModules.includes(modId);
                  return (
                    <button key={modId} type="button" aria-pressed={on} onClick={() => handleToggleOptionalModule(modId)} className={`min-h-11 cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${on ? "border-good bg-good-soft text-good" : "border-line bg-raised text-fg-3"}`}>{pick(OPTIONAL_MODULE_META[modId].labelKo, OPTIONAL_MODULE_META[modId].labelEn)}</button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3.5 text-xs">
            <div className="space-y-0.5">
              <p className="font-bold text-fg">{pick(`세션 ${byotSession.sessionId} · ${BYOT_TOOL_META[byotTool].labelKo} (${byotSession.exchangeFormat})`, `Session ${byotSession.sessionId} · ${BYOT_TOOL_META[byotTool].labelEn} (${byotSession.exchangeFormat})`)}</p>
              <p className="text-[11px] text-fg-2">{pick(`비출력 레드라인(${NONPRINT_REDLINE_LAYER_NAME}) 자동 격리 및 3D Rights BOM 태그 상속 활성화`, `Auto-isolates ${NONPRINT_REDLINE_LAYER_NAME} (non-exportable) and inherits 3D Rights BOM tags`)}</p>
            </div>
            <button type="button" onClick={handleRunByotRoundtrip} className={BTN_SOLID}>{pick("외부 편집 후 라운드트립 Diff 검증", "Run Roundtrip Layer & BOM Diff")}</button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-3.5 text-xs">
              <h3 className="font-bold text-fg">{pick("레이어 UID 보존 · 비출력 레드라인 Diff", "Layer UID Preservation & Redline Diff")}</h3>
              <ul data-testid="byot-layer-list" className="mt-2.5 flex flex-col gap-1.5 tabular-nums">
                {layerRows.map((entry) => (
                  <li key={`${entry.layerUid}-${entry.currentName}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
                    <div><span className="font-semibold text-fg">{entry.currentName}</span><span className="ml-2 font-mono text-[10px] text-fg-3">{entry.layerUid}</span></div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                      <span className={`rounded px-1.5 py-0.5 ${entry.status === "preserved-nonprint-redline" ? "bg-accent-soft text-accent" : entry.status === "renamed-uid-preserved" ? "bg-good-soft text-good" : "bg-raised text-fg-2"}`}>{entry.status}</span>
                      {!entry.exportable ? <span className="rounded bg-warning-soft px-1.5 py-0.5 text-warn">{pick("비출력", "NON-PRINT")}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-card p-3.5 text-xs">
              <h3 className="font-bold text-fg">{pick("3D/클라우드 에셋 SHA-256 · Rights BOM 상속", "3D/Cloud Asset SHA-256 & Rights BOM Inheritance")}</h3>
              <ul data-testid="byot-asset-list" className="mt-2.5 flex flex-col gap-1.5 tabular-nums">
                {assetRows.map((item) => (
                  <li key={item.assetId} className="flex flex-col gap-1 rounded-lg border border-line bg-canvas px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-fg">{item.name}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${item.changeKind === "modified" ? "bg-warning-soft text-warn" : "bg-good-soft text-good"}`}>{item.changeKind}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-fg-2">
                      <span className="rounded bg-raised px-1.5 py-0.5 font-semibold">{item.rightsBom.licenseCode}</span>
                      {item.rightsBom.evaluatedTags.map((tag) => <span key={tag} className="rounded bg-good-soft px-1.5 py-0.5 font-semibold text-good">{tag}</span>)}
                      {item.licenseDowngradeBlocked ? <span className="rounded bg-bad-soft px-1.5 py-0.5 font-bold text-bad">{pick("원저작 라이선스 유지(완화 차단)", "Parent License Enforced")}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "plugin-sdk" ? (
        <div id={`${uid}-panel-plugin-sdk`} role="tabpanel" aria-labelledby={`${uid}-tab-plugin-sdk`} className="flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3.5 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`${uid}-plugin-manifest`} className="text-xs font-bold text-fg">{pick("Wasm 샌드박스 플러그인 매니페스트 (JSON)", "Wasm Sandbox Plugin Manifest (JSON)")}</label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => handleLoadManifestPreset(true)} className={BTN_OUTLINE}>{pick("정상 최소권한 샘플", "Safe Least-Privilege")}</button>
                  <button type="button" onClick={() => handleLoadManifestPreset(false)} className={BTN_OUTLINE}>{pick("위험 권한 차단 샘플", "Unsafe Policy Sample")}</button>
                </div>
              </div>
              <textarea id={`${uid}-plugin-manifest`} rows={9} value={effectiveManifestDraft} onChange={(e) => setManifestDraft(e.target.value)} className={`w-full rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg ${FOCUS_RING}`} />
            </div>

            <div data-testid="plugin-validation-card" className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3.5 text-xs tabular-nums lg:col-span-5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-bold text-fg">
                  {pluginCheck.valid ? <ShieldCheck className="h-4 w-4 text-good" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 text-bad" aria-hidden="true" />}
                  {pick("최소 권한 보안 감사 결과", "Least-Privilege Security Audit")}
                </span>
                <span data-testid="plugin-security-grade" className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${pluginCheck.valid ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{pluginCheck.securityGrade}</span>
              </div>
              <p className="text-[11px] text-fg-2">{pick(`메모리 상한 ${pluginCheck.effectiveMemoryLimitMb}MB / 256MB · CPU 타임아웃 ${pluginCheck.effectiveCpuTimeoutMs}ms`, `Memory Cap ${pluginCheck.effectiveMemoryLimitMb}MB / 256MB · CPU ${pluginCheck.effectiveCpuTimeoutMs}ms`)}</p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {pluginCheck.grantedScopes.map((s) => <span key={s} className="rounded bg-good-soft px-2 py-0.5 font-semibold text-good">{s}</span>)}
                {pluginCheck.deniedScopes.map((s) => <span key={s} className="rounded bg-bad-soft px-2 py-0.5 font-bold text-bad">{pick(`거부: ${s}`, `Denied: ${s}`)}</span>)}
              </div>
              {pluginCheck.errors.length > 0 ? (
                <ul className="flex flex-col gap-1 rounded-lg border border-bad bg-bad-soft p-2.5 text-[11px] text-bad">
                  {pluginCheck.errors.map((err) => <li key={err} className="font-mono">{err}</li>)}
                </ul>
              ) : (
                <p className="rounded-lg bg-good-soft p-2.5 text-[11px] font-semibold text-good">{pick("무단 네트워크·시크릿 접근 0건 · Wasm 샌드박스 격리 규격 충족", "0 unauthorized network/secret scopes · Wasm sandbox isolated")}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-card p-3.5 text-xs">
            <h3 className="font-bold text-fg">{pick("에셋 스토어 · 스토리지 · 출판 플랫폼 커넥터 매트릭스", "Asset Store, Cloud Storage & Publishing Connector Matrix")}</h3>
            <div className="mt-2.5 grid gap-2 md:grid-cols-2">
              {ECOSYSTEM_CONNECTOR_MATRIX.map((row) => (
                <article key={row.id} className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-fg">{pick(row.nameKo, row.nameEn)}</span>
                    <span className="rounded bg-raised px-2 py-0.5 text-[10px] font-semibold text-fg-2">{row.mode}</span>
                  </div>
                  <span className="font-mono text-[10px] text-fg-3">{row.formatsOrProtocol}</span>
                  <p className="text-[11px] text-fg-2">{pick(row.noteKo, row.noteEn)}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
