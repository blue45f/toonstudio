#!/usr/bin/env node
/**
 * ToonStudio 100/100 마스터 검증 체크리스트 CLI 게이트.
 *
 * 20개 핵심 혁신 항목(각 5점 = 100점 만점)의 실제 파일, 마운트, JSON 기준선,
 * 스프라이트, CLI/MCP, 정본 문서 존재 및 핵심 구현 계약을 실측 검증한다.
 *
 * 선택 플래그:
 *   --json          머신 리더블 JSON 결과 출력
 *   --strict-wave8  Wave 8 Track 1/2 및 신규 9종 스프라이트까지 23/23 보너스 엄격 검증
 *   --root <dir>    대체 저장소 루트 지정 (테스트용)
 *   --help          사용법 출력
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, "..");
export const POINTS_PER_CORE_CHECK = 5;
export const CORE_CHECK_COUNT = 20;
export const MAX_CORE_SCORE = CORE_CHECK_COUNT * POINTS_PER_CORE_CHECK;
export const WAVE8_BONUS_CHECK_COUNT = 3;

const CREATOR = "apps/web/src/domains/creator";
const SHOWCASE = "apps/web/src/domains/showcase";
const SPRITE_DIR = "apps/web/public/assets/studio/vibrant-sprites";

const CORE_REQUIRED_SPRITES = [
  "emblem-studio.webp",
  "emblem-benchmark.webp",
  "emblem-tech-lab.webp",
  "tech-webgpu.webp",
  "tech-remotion.webp",
  "tool-gpen.webp",
  "device-digitizer.webp",
];

const SITEWIDE_8_HUB_BANNER_PAGES = [
  "apps/web/src/domains/catalog/DiscoverHubPage.tsx",
  "apps/web/src/domains/catalog/LibraryPage.tsx",
  "apps/web/src/domains/community/CommunityPage.tsx",
  "apps/web/src/domains/market/pages/MarketHomePage.tsx",
  "apps/web/src/domains/marketing/PricingWorkstyleMatcher.tsx",
  "apps/web/src/domains/legal/SitemapPage.tsx",
  `${CREATOR}/workspace/StudioWorkspaceLiveHome.tsx`,
  `${CREATOR}/production-hub/ProductionLandingPage.tsx`,
];

const REQUIRED_9_LLM_CLIENTS = [
  "gemini-cli",
  "claude-code",
  "codex-cli",
  "meta-llama",
  "mistral-muse",
  "cursor",
  "windsurf",
  "openrouter-bridge",
  "ollama-local",
];

const WAVE8_EXACT_SPRITES = [
  "wow-hero-atelier-stage.webp",
  "innov-neural-memory.webp",
  "innov-crossmedia-ip.webp",
  "innov-rights-ledger.webp",
  "innov-live-palette.webp",
];

function readTextSafe(repoRoot, relPath) {
  const fullPath = path.join(repoRoot, relPath);
  if (!existsSync(fullPath)) return { exists: false, content: "", bytes: 0 };
  const stat = statSync(fullPath);
  if (!stat.isFile()) return { exists: false, content: "", bytes: 0 };
  return { exists: true, content: readFileSync(fullPath, "utf8"), bytes: stat.size };
}

function readJsonSafe(repoRoot, relPath) {
  const file = readTextSafe(repoRoot, relPath);
  if (!file.exists) return { exists: false, data: null, error: `파일 누락: ${relPath}` };
  try {
    return { exists: true, data: JSON.parse(file.content), error: null };
  } catch (cause) {
    return {
      exists: true,
      data: null,
      error: `JSON 파싱 실패(${relPath}): ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}

function listNonEmptyWebpFiles(repoRoot, relDir) {
  const fullDir = path.join(repoRoot, relDir);
  if (!existsSync(fullDir) || !statSync(fullDir).isDirectory()) return { exists: false, files: [] };
  const files = readdirSync(fullDir)
    .filter((name) => name.endsWith(".webp"))
    .filter((name) => {
      const entry = statSync(path.join(fullDir, name));
      return entry.isFile() && entry.size > 0;
    })
    .sort((a, b) => a.localeCompare(b));
  return { exists: true, files };
}

function verifyFilesAndMounts(repoRoot, { files = [], patterns = [], forbidden = [] }) {
  const reasons = [];
  let verifiedFileCount = 0;

  for (const relPath of files) {
    const file = readTextSafe(repoRoot, relPath);
    if (!file.exists || file.bytes === 0) reasons.push(`필수 파일 누락 또는 빈 파일: ${relPath}`);
    else verifiedFileCount += 1;
  }

  for (const [relPath, rules] of patterns) {
    const file = readTextSafe(repoRoot, relPath);
    if (!file.exists) {
      reasons.push(`계약 검증 대상 파일 누락: ${relPath}`);
      continue;
    }
    for (const [label, matcher] of rules) {
      const ok = typeof matcher === "string" ? file.content.includes(matcher) : matcher.test(file.content);
      if (!ok) reasons.push(`${relPath}에서 필수 심볼/마운트 누락: ${label}`);
    }
  }

  for (const { file: relPath, stripComments = false, rules } of forbidden) {
    const file = readTextSafe(repoRoot, relPath);
    if (!file.exists) continue;
    const haystack = stripComments ? file.content.replace(/\/\*[\s\S]*?\*\//g, "") : file.content;
    for (const [label, matcher] of rules) {
      const hit = typeof matcher === "string" ? haystack.includes(matcher) : matcher.test(haystack);
      if (hit) reasons.push(`${relPath}에서 금지 패턴 검출: ${label}`);
    }
  }

  return { reasons, verifiedFileCount };
}

function makeResult(meta, passed, evidence, missingReasons = []) {
  return {
    id: meta.id,
    index: meta.index,
    title: meta.title,
    tier: meta.tier,
    points: meta.points,
    earned: passed ? meta.points : 0,
    passed,
    evidence,
    missingReasons,
    remediation: passed ? null : meta.remediation,
  };
}

function specCheck(config) {
  const { index, id, title, tier = "core", points = POINTS_PER_CORE_CHECK, remediation, evidence, ...spec } = config;
  return {
    index,
    id,
    title,
    tier,
    points,
    remediation,
    run(repoRoot) {
      const out = verifyFilesAndMounts(repoRoot, spec);
      const ok = out.reasons.length === 0;
      const summary = typeof evidence === "function" ? evidence(out) : evidence;
      return makeResult(this, ok, summary, out.reasons);
    },
  };
}

function createCoreCheckDefinitions() {
  return [
    {
      index: 1,
      id: "lint-warning-ratchet",
      title: "엄격 린트 경고 예산 <= 1",
      tier: "core",
      points: POINTS_PER_CORE_CHECK,
      remediation: "config/architecture-source-ratchet.json의 lintStrictMaxWarnings 값을 1 이하로 복구하세요.",
      run(repoRoot) {
        const parsed = readJsonSafe(repoRoot, "config/architecture-source-ratchet.json");
        if (parsed.error) return makeResult(this, false, "ratchet JSON 읽기 실패", [parsed.error]);
        const budget = parsed.data?.lintStrictMaxWarnings;
        const ok = typeof budget === "number" && Number.isFinite(budget) && budget >= 0 && budget <= 1;
        return makeResult(
          this,
          ok,
          `lintStrictMaxWarnings=${String(budget)} (기준 <= 1)`,
          ok ? [] : [`lintStrictMaxWarnings 예산 초과 또는 누락: ${String(budget)}`],
        );
      },
    },
    {
      index: 2,
      id: "studio-eager-graph-zero-forbidden",
      title: "Studio 진입 그래프 금지 도메인 0",
      tier: "core",
      points: POINTS_PER_CORE_CHECK,
      remediation: "pnpm run check:studio-eager-graph로 지연 로딩 경계를 복구하세요.",
      run(repoRoot) {
        const parsed = readJsonSafe(repoRoot, "scripts/studio-eager-graph-baseline.json");
        if (parsed.error) return makeResult(this, false, "studio-eager-graph-baseline.json 읽기 실패", [parsed.error]);
        const forbidden = parsed.data?.forbiddenDomains;
        if (!forbidden || typeof forbidden !== "object" || Object.keys(forbidden).length === 0) {
          return makeResult(this, false, "forbiddenDomains 비어 있음", ["forbiddenDomains 정의 누락"]);
        }
        const entries = Object.entries(forbidden);
        const violations = entries
          .filter(([, s]) => (s?.modules ?? -1) !== 0 || (s?.bytes ?? -1) !== 0 || !Array.isArray(s?.files) || s.files.length !== 0)
          .map(([domain, s]) => `${domain}: modules=${s?.modules}, bytes=${s?.bytes}, files=${s?.files?.length}`);
        return makeResult(
          this,
          violations.length === 0,
          `${entries.length}개 금지 도메인 전부 0모듈·0B (${parsed.data?.totals?.modules ?? "?"}모듈 기준선)`,
          violations,
        );
      },
    },
    {
      index: 3,
      id: "vibrant-jewel-sprites-44plus",
      title: "44+ 투명 WebP 주얼 아틀리에 스프라이트 실존",
      tier: "core",
      points: POINTS_PER_CORE_CHECK,
      remediation: `${SPRITE_DIR}에 44종 이상 투명 WebP 스프라이트를 배치하세요.`,
      run(repoRoot) {
        const listing = listNonEmptyWebpFiles(repoRoot, SPRITE_DIR);
        const reasons = [];
        if (!listing.exists) reasons.push(`스프라이트 디렉터리 누락: ${SPRITE_DIR}`);
        else if (listing.files.length < 44) reasons.push(`WebP 스프라이트 부족: ${listing.files.length}개 (기준 >= 44개)`);
        for (const sprite of CORE_REQUIRED_SPRITES) {
          if (!listing.files.includes(sprite)) reasons.push(`핵심 스프라이트 누락: ${SPRITE_DIR}/${sprite}`);
        }
        return makeResult(this, reasons.length === 0, `비어있지 않은 WebP ${listing.files.length}개 확인 (기준 >= 44)`, reasons);
      },
    },
    specCheck({
      index: 4,
      id: "vibrant-studio-fx-foley-km7-haptics",
      title: "Web Audio 절차적 Foley & KM7 믹싱 & 햅틱 엔진",
      remediation: "vibrant-studio-fx 모듈, StudioCspFullBrushAtelierPanel 마운트, KM7 코어를 확인하세요.",
      files: [
        `${CREATOR}/vibrant-studio-fx/studio-procedural-foley-audio.ts`,
        `${CREATOR}/vibrant-studio-fx/studio-paper-and-pigment-physics.ts`,
        `${CREATOR}/vibrant-studio-fx/studio-tactile-touch-fx-engine.ts`,
        `${CREATOR}/vibrant-studio-fx/StudioVibrantSpriteIcon.tsx`,
        `${CREATOR}/vibrant-studio-fx/studio-vibrant-studio-fx.test.tsx`,
        `${CREATOR}/render/studio-webgpu-km7-spectral-core.ts`,
      ],
      patterns: [
        [`${CREATOR}/render/studio-webgpu-km7-spectral-core.ts`, [["KM7_BAND_COUNT = 7", /KM7_BAND_COUNT\s*=\s*7/]]],
        [`${CREATOR}/csp-brush-atelier/StudioCspFullBrushAtelierPanel.tsx`, [["vibrant-studio-fx import", "../vibrant-studio-fx"], ["<StudioVibrantSpriteIcon 마운트", "<StudioVibrantSpriteIcon"]]],
      ],
      evidence: (r) => `핵심 파일 ${r.verifiedFileCount}/6 + 브러시 아틀리에 마운트·KM7 확인`,
    }),
    specCheck({
      index: 5,
      id: "canvas-chrome-8viewports-zero-overlap",
      title: "8대 뷰포트 0px² HUD 비겹침 캔버스 크롬",
      remediation: "canvas-chrome 모듈 및 StudioLeftToolRail/StudioColorPopover 마운트를 확인하세요.",
      files: [
        `${CREATOR}/canvas-chrome/studio-hud-collision-guard.ts`,
        `${CREATOR}/canvas-chrome/StudioHudCollisionAndReachabilityAudit.test.ts`,
        `${CREATOR}/canvas-chrome/StudioAdaptiveModeChromeBar.tsx`,
        `${CREATOR}/canvas-chrome/StudioSpectralBlendPreviewChip.tsx`,
        `${CREATOR}/canvas-chrome/StudioVibrantToolArtwork.tsx`,
      ],
      patterns: [
        [`${CREATOR}/StudioLeftToolRail.tsx`, [["studio-hud-collision-guard 연동", "canvas-chrome/studio-hud-collision-guard"]]],
        [`${CREATOR}/StudioColorPopover.tsx`, [["<StudioSpectralBlendPreviewChip 마운트", "<StudioSpectralBlendPreviewChip"]]],
      ],
      evidence: (r) => `캔버스 크롬 ${r.verifiedFileCount}/5 + 좌측 툴레일/컬러 팝오버 마운트 확인`,
    }),
    specCheck({
      index: 6,
      id: "capsule-compact-offline-badge",
      title: "캡슐형 초소형 오프라인 배지 (StudioOfflinePanel)",
      remediation: "StudioOfflinePanel.tsx의 캡슐형 details 스타일 및 StudioEditorRoute 마운트를 확인하세요.",
      files: [`${CREATOR}/offline/StudioOfflinePanel.tsx`, `${CREATOR}/offline/StudioOfflinePanel.test.tsx`],
      patterns: [
        [`${CREATOR}/offline/StudioOfflinePanel.tsx`, [["rounded-full 캡슐", "rounded-full"], ["open:rounded-2xl 전개", "open:rounded-2xl"], ["data-studio-offline-panel", "data-studio-offline-panel"]]],
        [`${CREATOR}/studio-router/routes/StudioEditorRoute.tsx`, [["<StudioOfflinePanel 마운트", "<StudioOfflinePanel"]]],
      ],
      evidence: "캡슐형 details(rounded-full -> open:rounded-2xl) 및 에디터 라우트 마운트 확인",
    }),
    specCheck({
      index: 7,
      id: "multi-device-ecosystem-hub",
      title: "멀티 디바이스·워치·TV·WebHID·WebMIDI·Gamepad 허브",
      remediation: "multi-device-ecosystem 모듈 및 StudioErgonomicsSettingsSection 지연 마운트를 확인하세요.",
      files: [
        `${CREATOR}/multi-device-ecosystem/StudioMultiDeviceEcosystemHub.tsx`,
        `${CREATOR}/multi-device-ecosystem/StudioSmartwatchCompanionView.tsx`,
        `${CREATOR}/multi-device-ecosystem/StudioSmartTvModeView.tsx`,
        `${CREATOR}/multi-device-ecosystem/peripheral-input-orchestrator.ts`,
        `${CREATOR}/multi-device-ecosystem/multi-device-ecosystem.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/multi-device-ecosystem/peripheral-input-orchestrator.ts`, [["WebHID 지원", "WebHID"], ["WebMIDI 지원", "WebMIDI"], ["Gamepad 해석기", "interpretGamepadSnapshot"]]],
        [`${CREATOR}/ergonomics/StudioErgonomicsSettingsSection.tsx`, [["StudioMultiDeviceEcosystemHub 마운트", "StudioMultiDeviceEcosystemHub"]]],
      ],
      evidence: (r) => `멀티 디바이스 모듈 ${r.verifiedFileCount}/5 + 인체공학 설정 마운트 확인`,
    }),
    specCheck({
      index: 8,
      id: "nextgen-perf-wasm64-webnn-lod",
      title: "Wasm64·WebNN·Compute Pressure·Shader Vector Ink 엔진",
      remediation: "nextgen-perf-engine 모듈 및 StudioAppSettingsPanel 마운트를 확인하세요.",
      files: [
        `${CREATOR}/nextgen-perf-engine/wasm64-memory-arena-planner.ts`,
        `${CREATOR}/nextgen-perf-engine/webnn-webcodecs-stream-adapter.ts`,
        `${CREATOR}/nextgen-perf-engine/vector-ink-lod-kernel.ts`,
        `${CREATOR}/nextgen-perf-engine/StudioNextGenPerfTelemetryCard.tsx`,
        `${CREATOR}/nextgen-perf-engine/nextgen-perf-engine.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/nextgen-perf-engine/wasm64-memory-arena-planner.ts`, [["detectWasm64Support", "detectWasm64Support"]]],
        [`${CREATOR}/nextgen-perf-engine/vector-ink-lod-kernel.ts`, [["tessellateShaderVectorInkRibbon", "tessellateShaderVectorInkRibbon"]]],
        [`${CREATOR}/StudioAppSettingsPanel.tsx`, [["<StudioNextGenPerfTelemetryCard 마운트", "<StudioNextGenPerfTelemetryCard"]]],
      ],
      evidence: (r) => `차세대 성능 엔진 ${r.verifiedFileCount}/5 + 앱 설정 HUD 마운트 확인`,
    }),
    specCheck({
      index: 9,
      id: "ai-simple-setup-and-precision-3d-gate",
      title: "초보자 1-스위치 AI 워터폴 & 매니폴드-0 3D 품질 게이트",
      remediation: "ai-simple-setup 및 precision-3d-craft 모듈과 소비처 마운트를 확인하세요.",
      files: [
        `${CREATOR}/ai-simple-setup/StudioSimpleAiSetupCard.tsx`,
        `${CREATOR}/ai-simple-setup/ai-quality-waterfall-engine.ts`,
        `${CREATOR}/ai-simple-setup/ai-simple-setup.test.tsx`,
        `${CREATOR}/precision-3d-craft/StudioPrecision3dCraftPanel.tsx`,
        `${CREATOR}/precision-3d-craft/precision-3d-mesh-quality-engine.ts`,
        `${CREATOR}/precision-3d-craft/precision-3d-craft.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/precision-3d-craft/precision-3d-mesh-quality-engine.ts`, [["isManifoldClean 매니폴드-0 게이트", "isManifoldClean"]]],
        [`${CREATOR}/ai/PersonalInferencePage.tsx`, [["<StudioSimpleAiSetupCard 마운트", "<StudioSimpleAiSetupCard"]]],
        [`${CREATOR}/bg3d/StudioBg3dArchitecturalModelingPanel.tsx`, [["<StudioPrecision3dCraftPanel 마운트", "<StudioPrecision3dCraftPanel"]]],
      ],
      evidence: (r) => `AI 워터폴 + 3D 매니폴드 게이트 ${r.verifiedFileCount}/6 + 2개 패널 마운트 확인`,
    }),
    specCheck({
      index: 10,
      id: "studio-scale-and-42socket-vrm-fit",
      title: "42-소켓 VRM Auto-Fit & 멀티모니터·작업부스",
      remediation: "studio-scale-and-3d-fit 모듈과 ProductionTeamFeaturePreview 마운트를 확인하세요.",
      files: [
        `${CREATOR}/studio-scale-and-3d-fit/StudioScaleAnd3dFitConsole.tsx`,
        `${CREATOR}/studio-scale-and-3d-fit/vrm-autofit-socket-registry.ts`,
        `${CREATOR}/studio-scale-and-3d-fit/character-3d-item-autofit-engine.ts`,
        `${CREATOR}/studio-scale-and-3d-fit/multi-monitor-and-virtual-workdesk.ts`,
        `${CREATOR}/studio-scale-and-3d-fit/studio-scale-and-3d-fit.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/studio-scale-and-3d-fit/vrm-autofit-socket-registry.ts`, [["42 소켓 레지스트리", "42"]]],
        [`${CREATOR}/production-hub/ProductionTeamFeaturePreview.tsx`, [["<StudioScaleAnd3dFitConsole 마운트", "<StudioScaleAnd3dFitConsole"]]],
      ],
      evidence: (r) => `42-소켓 VRM Auto-Fit ${r.verifiedFileCount}/5 + 프로덕션 허브 마운트 확인`,
    }),
    specCheck({
      index: 11,
      id: "ai-teammate-and-5axis-visual-search",
      title: "6-페르소나 AI 팀메이트 & 5축 스마트 비주얼 검색",
      remediation: "ai-teammate-and-search 모듈 및 StudioUnifiedAssetToolPopoverContentDirectDrag 마운트를 확인하세요.",
      files: [
        `${CREATOR}/ai-teammate-and-search/StudioAiTeammateAndAssetSearchHub.tsx`,
        `${CREATOR}/ai-teammate-and-search/ai-teammate-roster-engine.ts`,
        `${CREATOR}/ai-teammate-and-search/visual-asset-smart-search-engine.ts`,
        `${CREATOR}/ai-teammate-and-search/SmartAssetSearchTabPanel.tsx`,
        `${CREATOR}/ai-teammate-and-search/ai-teammate-and-search.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/StudioUnifiedAssetToolPopoverContentDirectDrag.tsx`, [["<StudioAiTeammateAndAssetSearchHub 마운트", "<StudioAiTeammateAndAssetSearchHub"]]],
      ],
      evidence: (r) => `AI 팀메이트·5축 비주얼 검색 ${r.verifiedFileCount}/5 + 에셋 툴 팝오버 마운트 확인`,
    }),
    specCheck({
      index: 12,
      id: "ip-crossmedia-and-reader-goods-hub",
      title: "크로스미디어 IP·게임 변환 & 독자 굿즈 제안 마켓",
      remediation: "ip-market-guide-hub 모듈 및 GrowthExpansionSections 마운트를 확인하세요.",
      files: [
        `${CREATOR}/ip-market-guide-hub/StudioIpMarketAndInteractiveGuideHub.tsx`,
        `${CREATOR}/ip-market-guide-hub/ip-game-transformer-engine.ts`,
        `${CREATOR}/ip-market-guide-hub/ReaderGoodsProposalCard.tsx`,
        `${CREATOR}/ip-market-guide-hub/market-tryon-bounty-engine.ts`,
        `${CREATOR}/ip-market-guide-hub/ip-market-guide-hub.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/growth-ip/sections/GrowthExpansionSections.tsx`, [["<StudioIpMarketAndInteractiveGuideHub 마운트", "<StudioIpMarketAndInteractiveGuideHub"]]],
      ],
      evidence: (r) => `크로스미디어 IP·굿즈 마켓 ${r.verifiedFileCount}/5 + 성장 섹션 마운트 확인`,
    }),
    specCheck({
      index: 13,
      id: "academy-12roles-8stage-7tier-governance",
      title: "12종 한국 웹툰 직무·8단계 바통터치·7티어 거버넌스·아카데미",
      remediation: "academy-and-roles 모듈 및 ProductionAdoptionCenter 지연 마운트를 확인하세요.",
      files: [
        `${CREATOR}/academy-and-roles/StudioAcademyAndRoleCraftHub.tsx`,
        `${CREATOR}/academy-and-roles/studio-role-catalog.ts`,
        `${CREATOR}/academy-and-roles/studio-pipeline-governance-engine.ts`,
        `${CREATOR}/academy-and-roles/studio-governance-catalog.ts`,
        `${CREATOR}/academy-and-roles/toonstudio-academy-curriculum.ts`,
        `${CREATOR}/academy-and-roles/academy-and-roles.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/academy-and-roles/index.ts`, [["STUDIO_CREATOR_ROLES", "STUDIO_CREATOR_ROLES"], ["WEBTOON_8_STAGE_PIPELINE", "WEBTOON_8_STAGE_PIPELINE"], ["STUDIO_GOVERNANCE_TIERS", "STUDIO_GOVERNANCE_TIERS"]]],
        [`${CREATOR}/production-hub/ProductionAdoptionCenter.tsx`, [["StudioAcademyAndRoleCraftHub 마운트", "StudioAcademyAndRoleCraftHub"]]],
      ],
      evidence: (r) => `12직무·8단계·7티어 아카데미 ${r.verifiedFileCount}/6 + 도입 센터 마운트 확인`,
    }),
    specCheck({
      index: 14,
      id: "smart-defaults-conveyor-settlement-qc",
      title: "5단계 20필드 스마트 기본값·3~4화차 컨베이어·3.3%/10% 정산",
      remediation: "smart-defaults-pm-ops 모듈 및 StudioSoloDeadlineMeterPanel 마운트를 확인하세요.",
      files: [
        `${CREATOR}/smart-defaults-pm-ops/StudioLargePmConveyorConsole.tsx`,
        `${CREATOR}/smart-defaults-pm-ops/smart-defaults-stage-catalog.ts`,
        `${CREATOR}/smart-defaults-pm-ops/smart-defaults-intent-engine.ts`,
        `${CREATOR}/smart-defaults-pm-ops/large-studio-pm-conveyor-engine.ts`,
        `${CREATOR}/smart-defaults-pm-ops/large-studio-settlement-qc-engine.ts`,
        `${CREATOR}/smart-defaults-pm-ops/smart-defaults-pm-ops.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/deadline-meter/StudioSoloDeadlineMeterPanel.tsx`, [["<StudioLargePmConveyorConsole 마운트", "<StudioLargePmConveyorConsole"]]],
      ],
      evidence: (r) => `스마트 기본값·PM 컨베이어·정산 ${r.verifiedFileCount}/6 + 마감 패널 마운트 확인`,
    }),
    specCheck({
      index: 15,
      id: "global-ost-premiere-craft-certificate",
      title: "@캐릭터 일관성·20개국 SFX·웹 OST 크로스페이드·시사회·히트맵·작화증명",
      remediation: "global-ost-premiere 모듈 및 PublishSpecAutoOptimizeSection 마운트를 확인하세요.",
      files: [
        `${CREATOR}/global-ost-premiere/StudioGlobalOstPremiereHub.tsx`,
        `${CREATOR}/global-ost-premiere/character-mention-and-sfx-repaint.ts`,
        `${CREATOR}/global-ost-premiere/ost-sync-premiere-and-trust.ts`,
        `${CREATOR}/global-ost-premiere/human-craft-and-ergonomic-trust.ts`,
        `${CREATOR}/global-ost-premiere/global-ost-premiere.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/global-ost-premiere/human-craft-and-ergonomic-trust.ts`, [["generateHumanCraftCertificate", "generateHumanCraftCertificate"], ["buildStealthWatermarkSignature", "buildStealthWatermarkSignature"]]],
        [`${CREATOR}/publish/PublishSpecAutoOptimizeSection.tsx`, [["<StudioGlobalOstPremiereHub 마운트", "<StudioGlobalOstPremiereHub"]]],
      ],
      evidence: (r) => `글로벌 OST·시사회·작화증명 ${r.verifiedFileCount}/5 + 출고 최적화 섹션 마운트 확인`,
    }),
    specCheck({
      index: 16,
      id: "universal-9llm-mcp-cli-and-10k-stroke-bench",
      title: "범용 9-LLM CLI/MCP 브리지 & 10,000획 장시간 드로잉 벤치마크",
      remediation: "scripts/toonstudio-llm-mcp-cli.mjs의 9대 클라이언트 설정과 10,000획 벤치마크를 확인하세요.",
      files: [
        "scripts/toonstudio-llm-mcp-cli.mjs",
        "scripts/toonstudio-llm-mcp-cli.test.mjs",
        `${CREATOR}/session-endurance/history-opfs-spill-store.ts`,
      ],
      patterns: [
        [
          "scripts/toonstudio-llm-mcp-cli.mjs",
          [
            ["SUPPORTED_LLM_MCP_CLIENTS", "SUPPORTED_LLM_MCP_CLIENTS"],
            ["TOONSTUDIO_MCP_TOOLS", "TOONSTUDIO_MCP_TOOLS"],
            ["runLongStrokeEnduranceBenchmark", "runLongStrokeEnduranceBenchmark"],
            ...REQUIRED_9_LLM_CLIENTS.map((id) => [`LLM 클라이언트(${id})`, `"${id}"`]),
          ],
        ],
      ],
      evidence: "9대 LLM CLI/MCP 설정 생성기 + 10,000획 벤치마크 + OPFS 스필 저장소 확인",
    }),
    specCheck({
      index: 17,
      id: "showcase-compare-tech-and-4innov-strip",
      title: "/compare/studio & /tech 6탭 라이브 쇼케이스 + 4대 혁신 스트립",
      remediation: "StudioNextGenInnovationsStrip.tsx 및 StudioCompetitorBenchmarkPage.tsx 마운트, catalog.routes.tsx를 확인하세요.",
      files: [
        `${SHOWCASE}/StudioCompetitorBenchmarkPage.tsx`,
        `${SHOWCASE}/ToonStudioTechShowcasePage.tsx`,
        `${SHOWCASE}/TechLlmMcpAndResearchTabs.tsx`,
        `${SHOWCASE}/StudioNextGenInnovationsStrip.tsx`,
        `${SHOWCASE}/showcase-pages.test.tsx`,
      ],
      patterns: [
        [`${SHOWCASE}/StudioCompetitorBenchmarkPage.tsx`, [["<StudioNextGenInnovationsStrip 마운트", "<StudioNextGenInnovationsStrip"]]],
        [
          `${SHOWCASE}/StudioNextGenInnovationsStrip.tsx`,
          [
            ["neural-memory 혁신", "neural-memory"],
            ["crossmedia-ip 혁신", "crossmedia-ip"],
            ["rights-ledger 혁신", "rights-ledger"],
            ["live-palette 혁신", "live-palette"],
          ],
        ],
        ["apps/web/src/app/routes/groups/catalog.routes.tsx", [["/compare/studio 라우트", '"/compare/studio"'], ["/tech 라우트", '"/tech"']]],
      ],
      forbidden: [
        {
          file: `${SHOWCASE}/StudioNextGenInnovationsStrip.tsx`,
          stripComments: true,
          rules: [["TSX 원시 hex 색상 금지", /#[0-9a-fA-F]{3,8}\b/]],
        },
      ],
      evidence: "쇼케이스 5파일 + 4대 혁신 스트립 마운트(원시 hex 0) + /compare/studio·/tech 라우트 확인",
    }),
    specCheck({
      index: 18,
      id: "sitewide-8hub-banners-and-footer-links",
      title: "전 페이지 8대 허브 아이소메트릭 배너 & 푸터 /compare/studio·/tech 연결",
      remediation: "VibrantPageIdentityBanner 8대 허브 마운트와 site-footer.tsx 링크를 확인하세요.",
      files: [
        "apps/web/src/shared/ui/vibrant-identity/VibrantPageIdentityBanner.tsx",
        "apps/web/src/shared/ui/vibrant-identity/page-identity-catalog.ts",
        "apps/web/src/shared/components/site-footer.tsx",
      ],
      patterns: [
        ...SITEWIDE_8_HUB_BANNER_PAGES.map((file) => [file, [["<VibrantPageIdentityBanner 마운트", "<VibrantPageIdentityBanner"]]]),
        ["apps/web/src/shared/components/site-footer.tsx", [["푸터 /compare/studio 링크", 'href="/compare/studio"'], ["푸터 /tech 링크", 'href="/tech"']]],
      ],
      evidence: "8대 허브 페이지 배너 실마운트 + 푸터 /compare/studio·/tech 연결 확인",
    }),
    specCheck({
      index: 19,
      id: "gpu-ink-route-motion-and-tactile-css",
      title: "GPU 잉크 도착 전환 연출 & 촉각 마이크로 모션",
      remediation: "RouteEnterMotion.tsx, AppShell.tsx 마운트, atelier-motion.css 접근성 가드를 확인하세요.",
      files: [
        "apps/web/src/app/RouteEnterMotion.tsx",
        "apps/web/src/app/styles/atelier-motion.css",
        "apps/web/src/app/AppShell.tsx",
        "apps/web/src/app/main.tsx",
      ],
      patterns: [
        ["apps/web/src/app/RouteEnterMotion.tsx", [["data-route-arrival-ink", "data-route-arrival-ink"], ["prefers-reduced-motion 가드", "prefers-reduced-motion"]]],
        ["apps/web/src/app/AppShell.tsx", [["<RouteEnterMotion 마운트", "<RouteEnterMotion"]]],
        ["apps/web/src/app/main.tsx", [["atelier-motion.css import", "./styles/atelier-motion.css"]]],
        [
          "apps/web/src/app/styles/atelier-motion.css",
          [
            [".fx-press", ".fx-press"],
            [".fx-lift", ".fx-lift"],
            ["prefers-reduced-motion: reduce", "prefers-reduced-motion: reduce"],
            ["contrast 테마 해제", 'data-design-theme="contrast"'],
          ],
        ],
      ],
      forbidden: [
        {
          file: "apps/web/src/app/styles/atelier-motion.css",
          stripComments: true,
          rules: [["transition-all / transition: all 금지", /\btransition-all\b|transition\s*:\s*all\b/i]],
        },
      ],
      evidence: "RouteEnterMotion 잉크 헤어라인 + AppShell 마운트 + atelier-motion.css GPU/접근성 가드 확인",
    }),
    {
      index: 20,
      id: "canonical-docs-tech-benchmark-ir",
      title: "기술 백서·글로벌 벤치마크·IR 차별화 브리프 3종 정본 문서",
      tier: "core",
      points: POINTS_PER_CORE_CHECK,
      remediation: "docs/tech, docs/benchmarks, docs/ir 정본 문서 3종 존재와 분량(>= 4KB)을 확인하세요.",
      run(repoRoot) {
        const docs = [
          "docs/tech/toonstudio-nextgen-engineering-whitepaper.md",
          "docs/benchmarks/toonstudio-global-competitor-device-benchmark-2026-11.md",
          "docs/ir/toonstudio-ir-promo-differentiation-brief-2026-11.md",
        ];
        const reasons = [];
        let totalBytes = 0;
        for (const docPath of docs) {
          const file = readTextSafe(repoRoot, docPath);
          if (!file.exists) reasons.push(`정본 문서 누락: ${docPath}`);
          else if (file.bytes < 4000) reasons.push(`정본 문서 내용 부족(${file.bytes}B < 4000B): ${docPath}`);
          else totalBytes += file.bytes;
        }
        return makeResult(this, reasons.length === 0, `정본 문서 3종 실존 (합계 ${(totalBytes / 1024).toFixed(1)} KiB)`, reasons);
      },
    },
  ];
}

function createWave8BonusCheckDefinitions() {
  return [
    specCheck({
      index: 21,
      id: "wave8-track1-home-wow-sandbox",
      title: "[Wave 8] 홈 첫인상 WOW 인터랙티브 아틀리에 샌드박스",
      tier: "wave8-bonus",
      points: 0,
      remediation: "Wave 8 Track 1 브랜치(HomeInteractiveWowShowcase.tsx)를 병합하세요.",
      files: [
        "apps/web/src/domains/marketing/wow-showcase/HomeInteractiveWowShowcase.tsx",
        "apps/web/src/domains/marketing/wow-showcase/home-wow-showcase.css",
        "apps/web/src/domains/marketing/wow-showcase/HomeInteractiveWowShowcase.test.tsx",
      ],
      patterns: [
        ["apps/web/src/domains/marketing/ReferenceCreatorDashboard.tsx", [["<HomeInteractiveWowShowcase 마운트", "<HomeInteractiveWowShowcase"]]],
      ],
      evidence: "HomeInteractiveWowShowcase 3파일 + ReferenceCreatorDashboard 마운트 확인",
    }),
    specCheck({
      index: 22,
      id: "wave8-track2-beginner-30s-wizard",
      title: "[Wave 8] 초보자 30초 4컷 웹툰 시작 위저드",
      tier: "wave8-bonus",
      points: 0,
      remediation: "Wave 8 Track 2 브랜치(BeginnerInstantComicWizard.tsx)를 병합하세요.",
      files: [
        `${CREATOR}/studio-shell/beginner-quickstart/BeginnerInstantComicWizard.tsx`,
        `${CREATOR}/studio-shell/beginner-quickstart/beginner-instant-wizard.css`,
        `${CREATOR}/studio-shell/beginner-quickstart/BeginnerInstantComicWizard.test.tsx`,
      ],
      patterns: [
        [`${CREATOR}/studio-shell/CreateStartGrandAtelierSection.tsx`, [["<BeginnerInstantComicWizard 마운트", "<BeginnerInstantComicWizard"]]],
      ],
      evidence: "BeginnerInstantComicWizard 3파일 + CreateStartGrandAtelierSection 마운트 확인",
    }),
    {
      index: 23,
      id: "wave8-new-9-vibrant-sprites",
      title: "[Wave 8] 신규 9종 투명 WebP 스프라이트 실존",
      tier: "wave8-bonus",
      points: 0,
      remediation: `${SPRITE_DIR}에 Wave 8 신규 9종 WebP(wow-hero 1 + innov 4 + beginner-1..4 4종)를 배치하세요.`,
      run(repoRoot) {
        const listing = listNonEmptyWebpFiles(repoRoot, SPRITE_DIR);
        const reasons = [];
        for (const sprite of WAVE8_EXACT_SPRITES) {
          if (!listing.files.includes(sprite)) reasons.push(`Wave 8 신규 스프라이트 누락: ${SPRITE_DIR}/${sprite}`);
        }
        const beginnerMatches = [1, 2, 3, 4].map((step) => ({
          step,
          file: listing.files.find((name) => new RegExp(`^beginner-${step}-[a-z0-9-]+\\.webp$`).test(name)) ?? null,
        }));
        for (const item of beginnerMatches) {
          if (!item.file) reasons.push(`초보자 단계 스프라이트 누락: ${SPRITE_DIR}/beginner-${item.step}-*.webp`);
        }
        const foundCount =
          WAVE8_EXACT_SPRITES.filter((s) => listing.files.includes(s)).length
          + beginnerMatches.filter((m) => m.file !== null).length;
        return makeResult(this, reasons.length === 0, `Wave 8 신규 스프라이트 ${foundCount}/9 확인`, reasons);
      },
    },
  ];
}

export function runMasterChecklist(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const strictWave8 = Boolean(options.strictWave8);
  const checks = createCoreCheckDefinitions().map((def) => def.run(repoRoot));
  const wave8Checks = createWave8BonusCheckDefinitions().map((def) => def.run(repoRoot));

  const passedCoreCount = checks.filter((item) => item.passed).length;
  const coreScore = checks.reduce((sum, item) => sum + item.earned, 0);
  const wave8PassedCount = wave8Checks.filter((item) => item.passed).length;

  const totalCount = strictWave8 ? checks.length + wave8Checks.length : checks.length;
  const passedCount = strictWave8 ? passedCoreCount + wave8PassedCount : passedCoreCount;
  const passed = strictWave8
    ? passedCoreCount === checks.length && wave8PassedCount === wave8Checks.length
    : coreScore === MAX_CORE_SCORE && passedCoreCount === checks.length;

  const activeItems = strictWave8 ? [...checks, ...wave8Checks] : checks;
  const failedChecks = activeItems
    .filter((item) => !item.passed)
    .map(({ id, index, title, missingReasons, remediation }) => ({ id, index, title, missingReasons, remediation }));

  return {
    schema: "toonstudio.master-checklist/1",
    repoRoot,
    strictWave8,
    score: coreScore,
    maxScore: MAX_CORE_SCORE,
    coreScore,
    coreMaxScore: MAX_CORE_SCORE,
    passedCoreCount,
    totalCoreCount: checks.length,
    passedCount,
    totalCount,
    passed,
    checks,
    wave8Bonus: {
      enabled: strictWave8,
      passedCount: wave8PassedCount,
      totalCount: wave8Checks.length,
      passed: wave8PassedCount === wave8Checks.length,
      checks: wave8Checks,
    },
    failedChecks,
  };
}

export function formatMasterChecklistText(report) {
  const lines = [
    `[ToonStudio 마스터 검증 체크리스트] ${report.passed ? "PASS" : "FAIL"} · 핵심 ${report.coreScore}/${report.coreMaxScore}점 (${report.passedCoreCount}/${report.totalCoreCount})`
      + (report.strictWave8
        ? ` · --strict-wave8 합계 ${report.passedCount}/${report.totalCount}`
        : ` · Wave 8 보너스 준비도 ${report.wave8Bonus.passedCount}/${report.wave8Bonus.totalCount}`),
    "=".repeat(88),
  ];

  const appendItems = (items, passTag, failTag) => {
    for (const item of items) {
      const tag = item.passed ? (typeof passTag === "function" ? passTag(item) : passTag) : failTag;
      lines.push(`${String(item.index).padStart(2, "0")}. ${tag} ${item.title}`);
      lines.push(`    근거: ${item.evidence}`);
      if (!item.passed) {
        for (const reason of item.missingReasons) lines.push(`    미달 사유: ${reason}`);
        if (item.remediation) lines.push(`    복구 안내: ${item.remediation}`);
      }
    }
  };

  appendItems(report.checks, (item) => `[PASS +${item.earned}]`, "[FAIL  0]");
  if (report.strictWave8) {
    lines.push("-".repeat(88), "[--strict-wave8 보너스 게이트 (23/23 확장 검증)]");
    appendItems(report.wave8Bonus.checks, "[PASS W8]", "[FAIL W8]");
  }
  return lines.join("\n");
}

export function parseCliArgs(argv) {
  const parsed = { json: false, strictWave8: false, repoRoot: REPO_ROOT, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--strict-wave8") parsed.strictWave8 = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--root") {
      const value = argv[i + 1];
      if (!value) throw new Error("--root 옵션 뒤에 경로를 지정해야 합니다.");
      parsed.repoRoot = path.resolve(value);
      i += 1;
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }
  return parsed;
}

function main() {
  let args;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (cause) {
    process.stderr.write(`오류: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    process.stdout.write(
      [
        "사용법: node scripts/verify-toonstudio-master-checklist.mjs [--json] [--strict-wave8] [--root <dir>]",
        "  --json          JSON 형식으로 점수 및 항목별 실측 결과 출력",
        "  --strict-wave8  Wave 8 Track 1/2 및 신규 9종 스프라이트(23/23)까지 엄격 검증",
        "  --root <dir>    검증 대상 저장소 루트 지정",
      ].join("\n") + "\n",
    );
    return;
  }

  const report = runMasterChecklist({ repoRoot: args.repoRoot, strictWave8: args.strictWave8 });
  process.stdout.write(`${args.json ? JSON.stringify(report, null, 2) : formatMasterChecklistText(report)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
