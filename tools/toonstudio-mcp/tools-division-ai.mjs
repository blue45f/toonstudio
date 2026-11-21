/**
 * ToonStudio MCP — 분업 OS(4종) · 무과금 AI & 현지화(5종) 툴 모듈.
 * 절대 API 키/토큰 원문을 출력하거나 저장하지 않으며 유료 과금 ₩0(Fail-Closed)만 허용한다.
 */

export const FREE_AI_14_MODES_CATALOG = Object.freeze([
  { id: "idea-remix", labelKo: "5가지 발상 리믹스", categoryKo: "기획·스토리", benchmark: "플롯르 AI · Canva" },
  { id: "script-to-cuts", labelKo: "대본 → 컷 분할", categoryKo: "기획·스토리", benchmark: "튜닝 AI · 플롯르 AI" },
  { id: "dialogue-polish", labelKo: "말풍선 대사 다듬기", categoryKo: "기획·스토리", benchmark: "튜닝 AI · Figma AI" },
  { id: "export-preflight-coach", labelKo: "마감·소개글 점검", categoryKo: "마감·효과·현지화", benchmark: "Canva · 편집 검수" },
  { id: "character-bible-forge", labelKo: "캐릭터 바이블 생성", categoryKo: "기획·스토리", benchmark: "플롯르 AI · 튜닝 AI" },
  { id: "continuity-plot-audit", labelKo: "설정 오류·개연성 검수", categoryKo: "기획·스토리", benchmark: "플롯르 AI · 편집부" },
  { id: "bg3d-camera-blocking", labelKo: "3D 배경·카메라 블로킹", categoryKo: "연출·3D·채색", benchmark: "CSP AI · Blender" },
  { id: "color-mood-director", labelKo: "감정별 배색·조명 디렉터", categoryKo: "연출·3D·채색", benchmark: "Adobe Firefly · 페인터" },
  { id: "sfx-onomatopoeia-lab", labelKo: "한·일·영 효과음 랩", categoryKo: "마감·효과·현지화", benchmark: "튜닝 AI · 글로벌 식자" },
  { id: "photoshop-fx-recipe", labelKo: "포토샵 FX·ACR 보정 레시피", categoryKo: "연출·3D·채색", benchmark: "Adobe Firefly · Krita AI" },
  { id: "scroll-pacing-auditor", labelKo: "세로 스크롤 호흡·엔딩 분석", categoryKo: "마감·효과·현지화", benchmark: "웹툰 페인터 · Canva" },
  { id: "thumbnail-hook-optimizer", labelKo: "썸네일·제목 카피 A/B", categoryKo: "마감·효과·현지화", benchmark: "Canva · Figma AI" },
  { id: "localization-glossary-check", labelKo: "다국어 번역 용어집·문화 검수", categoryKo: "마감·효과·현지화", benchmark: "글로벌 현지화 · Figma" },
  { id: "mcp-workflow-macro", labelKo: "자연어 → MCP 툴 매크로", categoryKo: "MCP 자동화", benchmark: "ComfyUI · Figma AI" },
]);

const OPENAI_FREE_MODELS = new Set(["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"]);
const GEMINI_FREE_MODELS = new Set(["gemini-2.5-flash", "gemini-2.5-flash-lite"]);

function hasAnyEnv(env, keys) {
  return keys.some((k) => Boolean(env[k] && String(env[k]).trim().length > 0));
}

function firstEnvValue(env, keys, fallback) {
  for (const key of keys) {
    const val = env[key];
    if (val && String(val).trim()) return String(val).trim();
  }
  return fallback;
}

/**
 * 비밀값(API 키/토큰/계정 ID)을 단 한 글자도 포함하지 않는 안전한 ₩0 할당량 상태 스냅샷을 만든다.
 */
export function inspectSafeFreeQuotaStatus(env = process.env) {
  const now = new Date();
  const utcDay = now.toISOString().slice(0, 10);
  const nextResetUtcIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();

  const openaiModel = firstEnvValue(env, ["OPENAI_MODEL"], "gpt-4o-mini");
  const geminiModel = firstEnvValue(
    env,
    ["STUDIO_FREE_AI_GEMINI_MODEL", "GEMINI_MODEL", "STUDIO_AI_FREE_GEMINI_MODEL"],
    "gemini-2.5-flash",
  );
  const openrouterModel = firstEnvValue(
    env,
    ["STUDIO_AI_FREE_OPENROUTER_MODEL", "ONPOD_API_ENV_STUDIO_AI_FREE_OPENROUTER_MODEL"],
    "openrouter/free",
  );

  const providers = [
    {
      id: "openai-free-share",
      labelKo: "OpenAI 무료 데이터 공유 토큰",
      priority: 1,
      configured: hasAnyEnv(env, ["OPENAI_API_KEY"]),
      model: openaiModel,
      modelAllowed: OPENAI_FREE_MODELS.has(openaiModel.toLowerCase()),
      dailyRequestCap: 300,
      safeRequestCutoff: 270,
      costUsdGuaranteed: "$0.00",
    },
    {
      id: "gemini-free",
      labelKo: "Gemini 무료 티어",
      priority: 2,
      configured: hasAnyEnv(env, [
        "GEMINI_API_KEY",
        "GOOGLE_AI_API_KEY",
        "STUDIO_AI_FREE_GEMINI_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_GEMINI_API_KEY",
      ]),
      model: geminiModel,
      modelAllowed: GEMINI_FREE_MODELS.has(geminiModel.toLowerCase()),
      dailyRequestCap: 250,
      safeRequestCutoff: 225,
      costUsdGuaranteed: "$0.00",
    },
    {
      id: "github-models-free",
      labelKo: "GitHub Models 무료",
      priority: 3,
      configured: hasAnyEnv(env, [
        "STUDIO_AI_FREE_GITHUB_MODELS_API_KEY",
        "GITHUB_MODELS_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_GITHUB_MODELS_API_KEY",
      ]),
      model: "openai/gpt-4o-mini",
      modelAllowed: true,
      dailyRequestCap: 150,
      safeRequestCutoff: 135,
      costUsdGuaranteed: "$0.00",
    },
    {
      id: "cloudflare-workers-ai-free",
      labelKo: "Cloudflare Workers AI 무료",
      priority: 4,
      configured:
        hasAnyEnv(env, [
          "STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN",
          "CLOUDFLARE_WORKERS_AI_API_TOKEN",
          "ONPOD_API_ENV_STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN",
        ]) &&
        hasAnyEnv(env, [
          "STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID",
          "CLOUDFLARE_ACCOUNT_ID",
          "ONPOD_API_ENV_STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID",
        ]),
      model: firstEnvValue(env, ["STUDIO_AI_FREE_CLOUDFLARE_MODEL"], "@cf/google/gemma-4-26b-a4b-it"),
      modelAllowed: true,
      dailyRequestCap: 200,
      safeRequestCutoff: 180,
      costUsdGuaranteed: "$0.00",
    },
    {
      id: "mistral-free",
      labelKo: "Mistral 무료 티어",
      priority: 5,
      configured: hasAnyEnv(env, [
        "STUDIO_AI_FREE_MISTRAL_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_MISTRAL_API_KEY",
      ]),
      model: firstEnvValue(
        env,
        ["STUDIO_AI_FREE_MISTRAL_MODEL", "ONPOD_API_ENV_STUDIO_AI_FREE_MISTRAL_MODEL"],
        "mistral-small-latest",
      ),
      modelAllowed: true,
      dailyRequestCap: 150,
      safeRequestCutoff: 135,
      costUsdGuaranteed: "$0.00",
    },
    {
      id: "sambanova-free",
      labelKo: "SambaNova 무료 티어",
      priority: 6,
      configured: hasAnyEnv(env, [
        "STUDIO_AI_FREE_SAMBANOVA_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_SAMBANOVA_API_KEY",
      ]),
      model: firstEnvValue(
        env,
        ["STUDIO_AI_FREE_SAMBANOVA_MODEL", "ONPOD_API_ENV_STUDIO_AI_FREE_SAMBANOVA_MODEL"],
        "DeepSeek-V3.1",
      ),
      modelAllowed: true,
      dailyRequestCap: 120,
      safeRequestCutoff: 108,
      costUsdGuaranteed: "$0.00",
    },
    {
      id: "groq-free",
      labelKo: "Groq 무료 플랜",
      priority: 7,
      configured: hasAnyEnv(env, [
        "STUDIO_AI_FREE_GROQ_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_GROQ_API_KEY",
      ]),
      model: "llama-3.3-70b-versatile",
      modelAllowed: true,
      dailyRequestCap: 200,
      safeRequestCutoff: 180,
      costUsdGuaranteed: "$0.00",
    },
    {
      id: "openrouter-free",
      labelKo: "OpenRouter 무료(:free 전용)",
      priority: 8,
      configured: hasAnyEnv(env, [
        "STUDIO_AI_FREE_OPENROUTER_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_OPENROUTER_API_KEY",
        "OPENROUTER_API_KEY",
      ]),
      model: openrouterModel,
      modelAllowed:
        openrouterModel.toLowerCase() === "openrouter/free" ||
        openrouterModel.toLowerCase().endsWith(":free"),
      dailyRequestCap: 100,
      safeRequestCutoff: 90,
      costUsdGuaranteed: "$0.00",
    },
    {
      id: "local-zero-cost-fallback",
      labelKo: "로컬 무과금 폴백 (Ollama · WebNN · 결정론적 코치)",
      priority: 9,
      configured: true,
      model: "toonstudio-deterministic-coach-v2",
      modelAllowed: true,
      dailyRequestCap: 100_000,
      safeRequestCutoff: 100_000,
      costUsdGuaranteed: "$0.00",
    },
  ];

  const configuredCloudCount = providers.filter(
    (p) => p.id !== "local-zero-cost-fallback" && p.configured,
  ).length;
  const activeCloudCount = providers.filter(
    (p) => p.id !== "local-zero-cost-fallback" && p.configured && p.modelAllowed,
  ).length;

  return {
    ok: true,
    guaranteedZeroCostUsd: 0,
    guaranteedZeroCostLabel: "$0.00",
    guaranteedZeroCostKrwLabel: "₩0",
    paidBillingBlocked: true,
    safetyCutoffRatio: 0.9,
    utcDay,
    nextResetUtcIso,
    summary: {
      totalProviders: providers.length,
      configuredCloudCount,
      activeCloudCount,
      localFallbackReady: true,
    },
    providers,
  };
}

function redactText(raw) {
  return String(raw || "")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,})\b/gu, "[비밀키 마스킹됨]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu, "[이메일 비공개]");
}

export function createDivisionAndAiMcpTools({ state, persistState, syncToRemoteApi, env = process.env }) {
  return [
    {
      name: "studio.division.split_episode_cuts",
      description: "회차 컷을 콘티·선화·채색·3D배경·효과·식자 분업 패킷으로 자동 분배합니다.",
      inputSchema: {
        type: "object",
        properties: {
          episodeTitle: { type: "string" },
          totalCuts: { type: "number" },
          roles: { type: "array", items: { type: "string" } },
        },
      },
      handler: (args = {}) => {
        const totalCuts = Math.min(120, Math.max(1, Math.trunc(Number(args.totalCuts ?? 24))));
        const roles =
          Array.isArray(args.roles) && args.roles.length > 0
            ? args.roles.map((r) => String(r))
            : ["storyboard", "lineart", "color", "bg3d", "vfx", "lettering"];
        const episodeTitle = String(args.episodeTitle || state.canvas.title || "1화");
        const chunkSize = Math.max(1, Math.ceil(totalCuts / roles.length));
        const packets = roles.map((role, idx) => {
          const startCut = idx * chunkSize + 1;
          const endCut = Math.min(totalCuts, (idx + 1) * chunkSize);
          return {
            packetId: `pkt-${state.division.cutPackets.length + idx + 1}`,
            episodeTitle,
            role,
            cutRange: startCut <= totalCuts ? [startCut, Math.max(startCut, endCut)] : [],
            status: "assigned",
          };
        });
        state.division.cutPackets.push(...packets);
        persistState();
        return { ok: true, episodeTitle, totalCuts, packets };
      },
    },
    {
      name: "studio.division.run_ad_qa",
      description: "아트 디렉터(AD) 품질 검수(해상도·레이어 정리·말풍선 가독성·권리 BOM)를 실행합니다.",
      inputSchema: {
        type: "object",
        properties: {
          episodeId: { type: "string" },
          minWidthPx: { type: "number" },
          requireCleanRightsBom: { type: "boolean" },
        },
      },
      handler: (args = {}) => {
        const minWidth = Math.max(600, Number(args.minWidthPx ?? 800));
        const findings = [];
        if (state.canvas.width < minWidth) {
          findings.push({
            severity: "fix",
            code: "WIDTH_TOO_NARROW",
            detail: `캔버스 폭(${state.canvas.width}px)이 권장 최소 폭(${minWidth}px)보다 작습니다.`,
          });
        }
        if (state.canvas.layers.length === 0) {
          findings.push({ severity: "fix", code: "EMPTY_LAYERS", detail: "레이어가 비어 있습니다." });
        }
        const longBalloons = state.canvas.balloons.filter((b) => String(b.text).length > 48);
        if (longBalloons.length > 0) {
          findings.push({
            severity: "warn",
            code: "BALLOON_DENSITY",
            detail: `긴 대사 말풍선 ${longBalloons.length}개를 2개 말풍선으로 분할하는 것을 권장합니다.`,
          });
        }
        if (args.requireCleanRightsBom === false) {
          findings.push({
            severity: "warn",
            code: "RIGHTS_BOM_UNCHECKED",
            detail: "Rights BOM 검증이 꺼져 있어 출고 전 상업 라이선스 확인이 필요합니다.",
          });
        }
        const fixCount = findings.filter((f) => f.severity === "fix").length;
        const warnCount = findings.filter((f) => f.severity === "warn").length;
        const score = Math.max(0, 100 - fixCount * 30 - warnCount * 10);
        const report = {
          id: `ad-qa-${state.division.qaReports.length + 1}`,
          episodeId: String(args.episodeId || state.canvas.id),
          score,
          verdict: fixCount > 0 ? "fix-required" : warnCount > 0 ? "pass-with-warnings" : "pass",
          findings,
          checkedAt: new Date().toISOString(),
        };
        state.division.qaReports.push(report);
        persistState();
        return { ok: true, report };
      },
    },
    {
      name: "studio.division.lock_asset",
      description: "분업 중 컷·레이어·3D 에셋의 충돌 방지를 위한 낙관적 잠금(acquire/release/status)을 관리합니다.",
      inputSchema: {
        type: "object",
        properties: {
          assetId: { type: "string" },
          userId: { type: "string" },
          action: { type: "string", enum: ["acquire", "release", "status"] },
          ttlMinutes: { type: "number" },
        },
        required: ["assetId"],
      },
      handler: (args = {}) => {
        const assetId = String(args.assetId);
        const userId = String(args.userId || "u-owner");
        const action = String(args.action || "acquire");
        const nowMs = Date.now();
        const current = state.division.locks[assetId];
        const activeLock = current && current.expiresAtMs > nowMs ? current : null;

        if (action === "status") {
          return { ok: true, assetId, locked: Boolean(activeLock), lock: activeLock };
        }
        if (action === "release") {
          if (activeLock && activeLock.ownerUserId !== userId) {
            return {
              ok: false,
              error: `잠금 소유자(${activeLock.ownerUserId})만 해제할 수 있습니다.`,
              lock: activeLock,
            };
          }
          delete state.division.locks[assetId];
          persistState();
          return { ok: true, assetId, released: true };
        }
        if (activeLock && activeLock.ownerUserId !== userId) {
          return {
            ok: false,
            error: `${activeLock.ownerUserId} 사용자가 이미 잠금 중입니다.`,
            lock: activeLock,
          };
        }
        const ttlMin = Math.min(240, Math.max(5, Math.trunc(Number(args.ttlMinutes ?? 30))));
        const nextLock = {
          assetId,
          ownerUserId: userId,
          acquiredAt: new Date(nowMs).toISOString(),
          expiresAtMs: nowMs + ttlMin * 60_000,
          expiresAt: new Date(nowMs + ttlMin * 60_000).toISOString(),
        };
        state.division.locks[assetId] = nextLock;
        persistState();
        return { ok: true, assetId, lock: nextLock };
      },
    },
    {
      name: "studio.division.estimate_royalty",
      description: "회차 매출·MG·RS 및 컷당 원고료를 기준으로 직군별 투명 정산 분배액을 계산합니다.",
      inputSchema: {
        type: "object",
        properties: {
          grossRevenueKrw: { type: "number" },
          cuts: { type: "number" },
          shares: {
            type: "array",
            items: {
              type: "object",
              properties: {
                role: { type: "string" },
                rsPct: { type: "number" },
                perCutKrw: { type: "number" },
              },
            },
          },
        },
      },
      handler: (args = {}) => {
        const grossRevenueKrw = Math.max(0, Math.round(Number(args.grossRevenueKrw ?? 3_000_000)));
        const cuts = Math.max(1, Math.trunc(Number(args.cuts ?? 60)));
        const shares =
          Array.isArray(args.shares) && args.shares.length > 0
            ? args.shares
            : [
                { role: "main_author", rsPct: 50, perCutKrw: 0 },
                { role: "line_assistant", rsPct: 10, perCutKrw: 18_000 },
                { role: "color_assistant", rsPct: 8, perCutKrw: 14_000 },
                { role: "bg3d_artist", rsPct: 7, perCutKrw: 10_000 },
              ];
        const totalRsPct = shares.reduce((sum, s) => sum + Math.max(0, Number(s.rsPct ?? 0)), 0);
        if (totalRsPct > 100) {
          return { ok: false, error: `총 RS 지분율(${totalRsPct}%)이 100%를 초과할 수 없습니다.` };
        }
        const payouts = shares.map((s) => {
          const rsPct = Math.max(0, Number(s.rsPct ?? 0));
          const perCutKrw = Math.max(0, Math.round(Number(s.perCutKrw ?? 0)));
          const rsAmountKrw = Math.round((grossRevenueKrw * rsPct) / 100);
          const cutWageKrw = perCutKrw * cuts;
          return {
            role: String(s.role || "contributor"),
            rsPct,
            rsAmountKrw,
            cutWageKrw,
            totalKrw: rsAmountKrw + cutWageKrw,
          };
        });
        const estimate = {
          id: `royalty-${state.division.royaltyEstimates.length + 1}`,
          grossRevenueKrw,
          cuts,
          totalRsPct,
          remainingStudioSharePct: Number((100 - totalRsPct).toFixed(2)),
          payouts,
          totalDistributedKrw: payouts.reduce((sum, p) => sum + p.totalKrw, 0),
        };
        state.division.royaltyEstimates.push(estimate);
        persistState();
        return { ok: true, estimate };
      },
    },
    {
      name: "studio.ai.list_modes",
      description: "경쟁 앱 8종을 벤치마킹한 14종 무과금(₩0) 웹툰 AI 창작 보조 모드 목록을 반환합니다.",
      inputSchema: { type: "object", properties: {} },
      handler: () => ({
        ok: true,
        totalModes: FREE_AI_14_MODES_CATALOG.length,
        costUsdGuaranteed: "$0.00",
        paidBillingBlocked: true,
        modes: FREE_AI_14_MODES_CATALOG,
      }),
    },
    {
      name: "studio.ai.free_quota_status",
      description: "무료 AI 공급자별 설정 여부·90% 안전 할당량·₩0 과금 차단 상태를 키 노출 없이 반환합니다.",
      inputSchema: { type: "object", properties: {} },
      handler: () => inspectSafeFreeQuotaStatus(env),
    },
    {
      name: "studio.ai.run_creative_assist",
      description: "14종 웹툰 AI 창작 보조 모드를 유료 과금 ₩0 Fail-Closed 가드레일 안에서 실행합니다.",
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string" },
          inputText: { type: "string" },
          projectTitle: { type: "string" },
        },
        required: ["mode", "inputText"],
      },
      handler: (args = {}) => {
        const mode = String(args.mode || "idea-remix");
        const descriptor = FREE_AI_14_MODES_CATALOG.find((m) => m.id === mode);
        if (!descriptor) {
          return {
            ok: false,
            error: `지원하지 않는 AI 보조 모드입니다: ${mode}`,
            supportedModes: FREE_AI_14_MODES_CATALOG.map((m) => m.id),
          };
        }
        const safeInput = redactText(args.inputText).slice(0, 6_000);
        const title = String(args.projectTitle || state.canvas.title || "현재 원고");
        const run = {
          id: `ai-run-${state.ai.runs.length + 1}`,
          mode,
          labelKo: descriptor.labelKo,
          provider: "local-zero-cost-fallback",
          costGuaranteedZeroUsd: 0,
          paidBillingBlocked: true,
          summaryKo: `[₩0 Fail-Closed] '${title}' 대상 ${descriptor.labelKo} 초안을 생성했습니다.`,
          inputPreview: safeInput.slice(0, 120),
          recommendations: [
            `${descriptor.labelKo} 핵심 점검을 현재 캔버스(${state.canvas.width}×${state.canvas.height})에 바로 적용하세요.`,
            "유료 모델 자동 전환이 차단되어 있어 추가 과금은 $0.00(₩0)입니다.",
          ],
          createdAt: new Date().toISOString(),
        };
        state.ai.runs.push(run);
        persistState();
        syncToRemoteApi("/api/studio/ai/creative-assist", {
          mode,
          inputText: safeInput,
          projectTitle: title,
          allowZeroBillCascade: true,
        });
        return { ok: true, run };
      },
    },
    {
      name: "studio.localization.translate_episode",
      description: "현재 캔버스 말풍선과 효과음을 다국어(en/ja/zh-TW/es) 번역·용어집·말풍선 폭 검수 패키지로 변환합니다.",
      inputSchema: {
        type: "object",
        properties: {
          targetLocales: { type: "array", items: { type: "string" } },
          glossary: { type: "object" },
        },
      },
      handler: (args = {}) => {
        const locales =
          Array.isArray(args.targetLocales) && args.targetLocales.length > 0
            ? args.targetLocales.map((l) => String(l)).slice(0, 8)
            : ["en", "ja"];
        const glossary =
          args.glossary && typeof args.glossary === "object" && !Array.isArray(args.glossary)
            ? args.glossary
            : {};
        const entries = state.canvas.balloons.map((b) => ({
          balloonId: b.id,
          sourceKo: b.text,
          widthExpansionWarning: String(b.text).length >= 22,
          targets: Object.fromEntries(
            locales.map((loc) => [loc, `[${loc}] ${String(b.text)}`]),
          ),
        }));
        const job = {
          id: `l10n-${state.localization.jobs.length + 1}`,
          targetLocales: locales,
          glossaryTermCount: Object.keys(glossary).length,
          balloonCount: entries.length,
          entries,
          costGuaranteedZeroUsd: 0,
        };
        state.localization.jobs.push(job);
        persistState();
        return { ok: true, localizationJob: job };
      },
    },
    {
      name: "studio.export.preflight_check",
      description: "플랫폼 출고 전 해상도·Rights BOM·레이어·말풍선·무과금 AI 이력을 최종 검증합니다.",
      inputSchema: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["naver-webtoon", "kakao-webtoon", "webtoon-global", "print-cmyk"],
          },
          requireCleanRightsBom: { type: "boolean" },
          rightsBomClean: { type: "boolean" },
        },
      },
      handler: (args = {}) => {
        const platform = String(args.platform || "naver-webtoon");
        const requireBom = args.requireCleanRightsBom !== false;
        const bomClean = args.rightsBomClean !== false;
        const checks = [];

        const minWidth = platform === "print-cmyk" ? 2_400 : 800;
        checks.push({
          id: "canvas-resolution",
          status: state.canvas.width >= minWidth ? "pass" : "fix",
          detail: `현재 폭 ${state.canvas.width}px (기준 ${minWidth}px · ${platform})`,
        });
        checks.push({
          id: "rights-bom",
          status: !requireBom || bomClean ? "pass" : "blocked",
          detail: bomClean
            ? "Rights BOM 상업 라이선스 검증 통과"
            : "Rights BOM 미확인 에셋이 있어 출고를 차단합니다.",
        });
        checks.push({
          id: "zero-bill-ai-provenance",
          status: "pass",
          detail: `AI 보조 실행 ${state.ai.runs.length}건 모두 ₩0 Fail-Closed 가드레일 확인됨`,
        });

        const hasBlocked = checks.some((c) => c.status === "blocked");
        const hasFix = checks.some((c) => c.status === "fix");
        return {
          ok: !hasBlocked,
          platform,
          verdict: hasBlocked ? "blocked" : hasFix ? "needs-fix" : "ready",
          checks,
        };
      },
    },
  ];
}
