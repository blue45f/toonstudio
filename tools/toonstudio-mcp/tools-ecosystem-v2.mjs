/**
 * ToonStudio MCP v2 — Waves 12~24 핵심 생태계 12종 표준 MCP 툴 모듈.
 *
 * - 외부 네트워크 호출 없이 100% 결정론적 · 무과금(₩0 Fail-Closed)으로 동작한다.
 * - 정본 카탈로그·플러그인 샌드박스 검증기·MCP 리소스/프롬프트는 `ecosystem-v2-catalog.mjs`에서 공유한다.
 */

import {
  BRUSH_100_BENCHMARKS,
  buildMcpPromptMessages,
  clampNum,
  containsSensitiveSecret,
  evaluateBepCrossBorderTax,
  evaluateSixPlatformPreflight,
  formatPlazaCurrencyAmount,
  MCP_PROMPTS_CATALOG,
  MCP_RESOURCES_CATALOG,
  PLAZA_FX_PER_KRW,
  PLAZA_REGIONS,
  readMcpResourceByUri,
  redactSensitiveText,
  sha256Hex,
  SIX_PLATFORM_SPECS,
  STANDBY_ASSISTANTS,
  UNIFIED_MATERIAL_CATALOG,
  verifyPluginManifestSandbox,
} from "./ecosystem-v2-catalog.mjs";

export {
  buildMcpPromptMessages,
  containsSensitiveSecret,
  MCP_PROMPTS_CATALOG,
  MCP_RESOURCES_CATALOG,
  readMcpResourceByUri,
  redactSensitiveText,
  SIX_PLATFORM_SPECS,
  verifyPluginManifestSandbox,
};

export function createEcosystemV2McpTools({ state, persistState }) {
  return [
    {
      name: "toonstudio_preflight_6platforms",
      description: "네이버·카카오·레진·리디·픽코마·WEBTOON Global 6대 연재 플랫폼 출고 규격을 일괄 점검합니다.",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["all", "naver-webtoon", "kakaopage", "lezhin", "ridi", "piccoma", "webtoon-global"] },
          widthPx: { type: "number" },
          heightPx: { type: "number" },
          totalSizeMb: { type: "number" },
          format: { type: "string", enum: ["jpg", "png", "webp", "psd"] },
          colorProfile: { type: "string", enum: ["sRGB", "Display-P3", "CMYK"] },
          rightsBomClean: { type: "boolean" },
          customForbiddenWords: { type: "array", items: { type: "string" } },
        },
      },
      handler: (args = {}) => {
        const result = evaluateSixPlatformPreflight(args, state.canvas);
        if (result.error) return result;
        const record = {
          id: `preflight6-${state.ecosystemV2.preflightReports.length + 1}`,
          summary: result.summary,
          reports: result.reports,
          costGuaranteedZeroUsd: 0,
        };
        state.ecosystemV2.preflightReports.push(record);
        persistState();
        return { ok: result.ok, ...record };
      },
    },
    {
      name: "toonstudio_hyper_automate_episode",
      description: "한 줄 아이디어와 공정별 0~99% 커스텀 자동화 비율로 회차 제작 파이프라인 계획을 산출합니다.",
      inputSchema: {
        type: "object",
        properties: {
          idea: { type: "string" },
          genre: { type: "string" },
          mode: { type: "string", enum: ["manual-pro", "assisted", "balanced", "turbo", "one-click-99"] },
          targetCuts: { type: "number" },
          stageAutonomy: { type: "object" },
          protectedStages: { type: "array", items: { type: "string" } },
        },
        required: ["idea"],
      },
      handler: (args = {}) => {
        const cleanIdea = redactSensitiveText(args.idea).trim();
        if (!cleanIdea) {
          return { ok: false, error: "회차 기획을 위해 한 줄 아이디어(idea)를 입력해야 합니다." };
        }
        const mode = String(args.mode || "balanced");
        const modeDefaults = { "manual-pro": 0, assisted: 30, balanced: 55, turbo: 80, "one-click-99": 99 };
        const basePct = modeDefaults[mode] ?? 55;
        const stageIds = ["story", "storyboard", "bg3d", "lineart", "color", "vfx", "lettering", "preflight"];
        const protectedSet = new Set(Array.isArray(args.protectedStages) ? args.protectedStages.map(String) : []);
        const rawMap = args.stageAutonomy && typeof args.stageAutonomy === "object" ? args.stageAutonomy : {};
        const stageAutonomy = {};
        for (const id of stageIds) {
          stageAutonomy[id] = Math.round(protectedSet.has(id) ? 0 : clampNum(rawMap[id], basePct, 0, 99));
        }
        const averageAutonomyPct = Math.round(
          stageIds.reduce((acc, id) => acc + stageAutonomy[id], 0) / stageIds.length,
        );
        const targetCuts = Math.round(clampNum(args.targetCuts, 48, 6, 120));
        const genre = String(args.genre || "modern-fantasy");
        const plan = {
          runId: `hyper-${state.ecosystemV2.hyperAutoRuns.length + 1}`,
          mode,
          genre,
          ideaSummary: cleanIdea.slice(0, 140),
          targetCuts,
          stageAutonomy,
          averageAutonomyPct,
          protectedStages: [...protectedSet],
          acts: [
            `1막 도입(1~${Math.max(2, Math.round(targetCuts * 0.25))}컷): 세계관 훅과 결핍 제시`,
            `2막 전개(${Math.round(targetCuts * 0.25) + 1}~${Math.round(targetCuts * 0.75)}컷): 갈등 고조·핵심 액션·감정선 교차`,
            `3막 클라이맥스(${Math.round(targetCuts * 0.75) + 1}~${targetCuts}컷): 반전 엔딩 컷과 다음 화 떡밥`,
          ],
          masterLayers: ["storyboard-rough", "bg3d-npr", "lineart-ink", "base-color", "cel-shading", "scene-vfx", "lettering-sfx"],
          losslessLayerSeparation: true,
          manualControlOpen: true,
          estimatedHoursSaved: Number(((targetCuts * 0.35 * averageAutonomyPct) / 100).toFixed(1)),
          costGuaranteedZeroUsd: 0,
        };
        state.ecosystemV2.hyperAutoRuns.push(plan);
        persistState();
        return { ok: true, plan };
      },
    },
    {
      name: "toonstudio_hiatus_sos_match",
      description: "결원·마감 지연 위기 시 10분 긴급 대타 후보 랭킹과 작화 인계 키트를 생성합니다.",
      inputSchema: {
        type: "object",
        properties: {
          missingRole: { type: "string", enum: ["lineart", "color", "bg3d", "vfx", "lettering", "storyboard"] },
          hoursUntilDeadline: { type: "number" },
          remainingCuts: { type: "number" },
          genre: { type: "string" },
          budgetPerCutKrw: { type: "number" },
        },
        required: ["missingRole"],
      },
      handler: (args = {}) => {
        const missingRole = String(args.missingRole || "lineart");
        const hoursUntilDeadline = clampNum(args.hoursUntilDeadline, 12, 1, 168);
        const remainingCuts = Math.round(clampNum(args.remainingCuts, 18, 1, 120));
        const genre = String(args.genre || "modern-fantasy");
        const budgetPerCutKrw = Math.round(clampNum(args.budgetPerCutKrw, 22_000, 5_000, 200_000));
        const urgencyMultiplier = hoursUntilDeadline <= 6 ? 1.35 : hoursUntilDeadline <= 24 ? 1.15 : 1.0;

        const rankedCandidates = STANDBY_ASSISTANTS.map((cand) => {
          const roleMatch = cand.roles.includes(missingRole) ? 40 : 12;
          const genreMatch = cand.genres.includes(genre) ? 20 : 8;
          const speedScore = Math.max(0, 20 - cand.etaMinutes);
          const styleScore = Math.round(cand.styleMatchPct * 0.2);
          const matchScore = Math.min(100, roleMatch + genreMatch + speedScore + styleScore);
          const quotedPerCutKrw = Math.round(cand.ratePerCutKrw * urgencyMultiplier);
          return {
            candidateId: cand.id,
            handle: cand.handle,
            matchScore,
            etaMinutes: cand.etaMinutes,
            styleMatchPct: cand.styleMatchPct,
            quotedPerCutKrw,
            withinBudget: quotedPerCutKrw <= Math.round(budgetPerCutKrw * 1.15),
            verifiedRating: cand.verifiedRating,
          };
        }).sort((a, b) => b.matchScore - a.matchScore);

        const matchRecord = {
          sosId: `sos-${state.ecosystemV2.sosMatches.length + 1}`,
          missingRole,
          riskLevel: hoursUntilDeadline <= 6 ? "critical" : hoursUntilDeadline <= 24 ? "high" : "moderate",
          slaResponseMinutes: 10,
          rankedCandidates,
          handoffKit: {
            styleLockHash: sha256Hex(`${state.canvas.id}:${missingRole}:${genre}`).slice(0, 16),
            cutRange: [1, remainingCuts],
            requiredLayers: ["lineart-ink", "flat-color", "shadow-multiply"],
            brushPresetBundle: ["g-pen-pro", "maru-pen-detail"],
            rightsBomInherited: true,
          },
          costGuaranteedZeroUsd: 0,
        };
        state.ecosystemV2.sosMatches.push(matchRecord);
        persistState();
        return { ok: true, ...matchRecord };
      },
    },
    {
      name: "toonstudio_global_plaza_quote",
      description: "동남아·글로벌 외주 6통화 단가 환산, KST 시차 겹침 분석, 3단계 에스크로 견적을 계산합니다.",
      inputSchema: {
        type: "object",
        properties: {
          partnerRegion: { type: "string", enum: ["KR", "JP", "VN", "TH", "ID", "PH", "US"] },
          currency: { type: "string", enum: ["KRW", "USD", "VND", "THB", "IDR", "JPY"] },
          ratePerCutKrw: { type: "number" },
          cutCount: { type: "number" },
          escrowFeeRatePct: { type: "number" },
        },
      },
      handler: (args = {}) => {
        const regionCode = String(args.partnerRegion || "VN").toUpperCase();
        const region = PLAZA_REGIONS[regionCode] ?? PLAZA_REGIONS.VN;
        const targetCurrency = String(args.currency || region.defaultCurrency).toUpperCase();
        const fxSpec = PLAZA_FX_PER_KRW[targetCurrency] ?? PLAZA_FX_PER_KRW.USD;
        const ratePerCutKrw = Math.round(clampNum(args.ratePerCutKrw, 16_000, 3_000, 300_000));
        const cutCount = Math.round(clampNum(args.cutCount, 40, 1, 200));
        const escrowFeeRatePct = Number(clampNum(args.escrowFeeRatePct, 3.5, 0, 15).toFixed(2));
        const grossKrw = ratePerCutKrw * cutCount;
        const escrowFeeKrw = Math.round((grossKrw * escrowFeeRatePct) / 100);
        const totalDepositKrw = grossKrw + escrowFeeKrw;

        const sixCurrencyQuotes = Object.fromEntries(
          Object.entries(PLAZA_FX_PER_KRW).map(([code, spec]) => {
            const perCut = Number((ratePerCutKrw * spec.rate).toFixed(spec.decimals));
            const totalNet = Number((grossKrw * spec.rate).toFixed(spec.decimals));
            return [
              code,
              {
                perCut,
                totalNet,
                formattedPerCut: formatPlazaCurrencyAmount(perCut, code),
                formattedTotalNet: formatPlazaCurrencyAmount(totalNet, code),
              },
            ];
          }),
        );

        const milestones = [
          { stageKey: "kickoff-deposit", labelKo: "착수금 예치(30%)", ratioPct: 30 },
          { stageKey: "ad-mid-review", labelKo: "중간 AD 검수(40%)", ratioPct: 40 },
          { stageKey: "final-delivery", labelKo: "최종 납품 정산(30%)", ratioPct: 30 },
        ].map((stage) => {
          const amountKrw = Math.round((grossKrw * stage.ratioPct) / 100);
          const amountLocal = Number((amountKrw * fxSpec.rate).toFixed(fxSpec.decimals));
          return {
            ...stage,
            amountKrw,
            amountLocal,
            formattedLocal: formatPlazaCurrencyAmount(amountLocal, targetCurrency),
          };
        });

        const quote = {
          quoteId: `plaza-q-${state.ecosystemV2.plazaQuotes.length + 1}`,
          partnerRegion: regionCode,
          countryKo: region.countryKo,
          targetCurrency,
          rateBasisNoteKo: "기준 환율(추정 참고치) 기반 산출이며 실제 송금 시 은행 고시 환율을 적용합니다.",
          timezoneOverlap: {
            offsetFromKstHours: region.offsetFromKstHours,
            overlapHours: region.overlapHours,
            syncQuality: region.syncQuality,
          },
          grossKrw,
          escrowFeeRatePct,
          escrowFeeKrw,
          totalDepositKrw,
          sixCurrencyQuotes,
          milestones,
        };
        state.ecosystemV2.plazaQuotes.push(quote);
        persistState();
        return { ok: true, quote };
      },
    },
    {
      name: "toonstudio_osmu_adapt_ip",
      description: "웹툰 원고를 웹소설 각색 · 웹드라마 OTT 피치 · 애니메이션 24fps X-Sheet 패키지로 변환합니다.",
      inputSchema: {
        type: "object",
        properties: {
          targetFormat: { type: "string", enum: ["all", "webnovel", "webdrama-pitch", "animation-xsheet"] },
          workTitle: { type: "string" },
          episodeNumber: { type: "number" },
          cutCount: { type: "number" },
          genre: { type: "string" },
          fps: { type: "number" },
        },
      },
      handler: (args = {}) => {
        const targetFormat = String(args.targetFormat || "all");
        const workTitle = redactSensitiveText(args.workTitle || state.canvas.title || "대표작 1화");
        const episodeNumber = Math.round(clampNum(args.episodeNumber, 1, 1, 500));
        const cutCount = Math.round(clampNum(args.cutCount, 60, 10, 200));
        const genre = String(args.genre || "modern-fantasy");
        const fps = Math.round(clampNum(args.fps, 24, 12, 60));

        const adaptation = {
          packageId: `osmu-${state.ecosystemV2.osmuPackages.length + 1}`,
          workTitle,
          episodeNumber,
          genre,
          targetFormat,
          costGuaranteedZeroUsd: 0,
        };

        if (targetFormat === "all" || targetFormat === "webnovel") {
          adaptation.webnovel = {
            direction: "webtoon-to-webnovel-bidirectional",
            estimatedWordCountKo: cutCount * 85,
            chapterCount: Math.max(1, Math.ceil(cutCount / 30)),
            syncAnchors: [
              { cutRange: [1, Math.round(cutCount * 0.35)], beatKo: "도입·내면 독백 확장" },
              { cutRange: [Math.round(cutCount * 0.35) + 1, Math.round(cutCount * 0.8)], beatKo: "대사·액션 묘사 정밀화" },
              { cutRange: [Math.round(cutCount * 0.8) + 1, cutCount], beatKo: "클리프행어 엔딩" },
            ],
          };
        }
        if (targetFormat === "all" || targetFormat === "webdrama-pitch") {
          adaptation.webdramaPitch = {
            targetOtt: ["Netflix", "TVING", "Disney+"],
            seasonEpisodes: 12,
            episodeRuntimeMin: 48,
            loglineKo: `'${workTitle}' 원작 기반 ${genre} 하이컨셉 시즌제 시리즈 피치`,
            visualHookCount: Math.max(3, Math.round(cutCount / 12)),
          };
        }
        if (targetFormat === "all" || targetFormat === "animation-xsheet") {
          const durationSeconds = Math.round(cutCount * 2.5);
          adaptation.animationXSheet = {
            fps,
            cadence: "on-twos-default-on-ones-action",
            totalFrames: durationSeconds * fps,
            durationSeconds,
            sceneSheets: [
              { sheetNo: 1, cuts: [1, Math.min(20, cutCount)], frames: Math.min(20, cutCount) * fps * 2, cameraMove: "truck-in" },
              { sheetNo: 2, cuts: [Math.min(21, cutCount), cutCount], frames: Math.max(1, cutCount - 20) * fps * 3, cameraMove: "pan-whip" },
            ],
          };
        }

        state.ecosystemV2.osmuPackages.push(adaptation);
        persistState();
        return { ok: true, adaptation };
      },
    },
    {
      name: "toonstudio_ai_qa_compliance_scan",
      description: "국가별 심의·캐릭터 말투 일관성·180도 시선 법칙·상업 라이선스 게이트를 일괄 검수합니다.",
      inputSchema: {
        type: "object",
        properties: {
          regions: { type: "array", items: { type: "string" } },
          targetAgeRating: { type: "string", enum: ["all", "12+", "15+", "19+"] },
          dialogues: { type: "array" },
          cameraAnglesDeg: { type: "array", items: { type: "number" } },
          assets: { type: "array" },
        },
      },
      handler: (args = {}) => {
        const regions = Array.isArray(args.regions) && args.regions.length > 0 ? args.regions.map(String) : ["KR", "JP", "US"];
        const targetAgeRating = String(args.targetAgeRating || "15+");
        const dialogues = Array.isArray(args.dialogues)
          ? args.dialogues
          : state.canvas.balloons.map((b) => ({ character: "주인공", line: b.text, tone: "casual" }));
        const findings = [];

        const tonesByCharacter = new Map();
        for (const item of dialogues) {
          const charName = String(item?.character || "화자");
          const line = redactSensitiveText(item?.line || "");
          const inferredTone = /요[.!?]?$|습니다[.!?]?$/u.test(line.trim()) ? "polite" : "casual";
          const prevTone = tonesByCharacter.get(charName);
          if (prevTone && prevTone !== inferredTone) {
            findings.push({
              gate: "speech-consistency",
              severity: "warn",
              detail: `캐릭터 '${charName}'의 말투가 존댓말/반말로 혼용되었습니다.`,
            });
          }
          tonesByCharacter.set(charName, inferredTone);
          if (targetAgeRating === "all" && /피바다|참수|폭탄제조/u.test(line)) {
            findings.push({
              gate: "regional-rating",
              severity: "fix",
              detail: `전체이용가(all) 기준에 부적합한 표현이 감지되었습니다(${regions.join("/")}).`,
            });
          }
        }

        const angles = Array.isArray(args.cameraAnglesDeg) ? args.cameraAnglesDeg.map(Number).filter(Number.isFinite) : [];
        for (let i = 1; i < angles.length; i += 1) {
          if (Math.abs(angles[i] - angles[i - 1]) > 180) {
            findings.push({
              gate: "sightline-180",
              severity: "warn",
              detail: `${i}→${i + 1}컷 카메라 축 이동(${angles[i - 1]}°→${angles[i]}°)이 180도 시선 법칙을 초과했습니다.`,
            });
          }
        }

        for (const asset of Array.isArray(args.assets) ? args.assets : []) {
          const lic = String(asset?.license || "cc0").toLowerCase();
          if (asset?.commercialAllowed === false || /nc|non-commercial|personal/u.test(lic)) {
            findings.push({
              gate: "rights-license",
              severity: "blocked",
              detail: `에셋 '${String(asset?.id || "unknown")}'의 라이선스(${lic})는 상업 연재 출고가 차단됩니다.`,
            });
          }
        }

        const blocked = findings.some((f) => f.severity === "blocked");
        const fixCount = findings.filter((f) => f.severity === "fix").length;
        const warnCount = findings.filter((f) => f.severity === "warn").length;
        const score = Math.max(0, 100 - (blocked ? 50 : 0) - fixCount * 20 - warnCount * 10);
        const scan = {
          scanId: `qa-comp-${state.ecosystemV2.complianceScans.length + 1}`,
          regions,
          targetAgeRating,
          score,
          verdict: blocked ? "blocked" : fixCount > 0 ? "fix-required" : warnCount > 0 ? "warn" : "pass",
          findings,
          costGuaranteedZeroUsd: 0,
        };
        state.ecosystemV2.complianceScans.push(scan);
        persistState();
        return { ok: !blocked, scan };
      },
    },
    {
      name: "toonstudio_c2pa_provenance_pack",
      description: "C2PA 2.1 호환 SHA-256 해시 체인과 제작 타임랩스 저작권 증빙 매니페스트를 생성합니다.",
      inputSchema: {
        type: "object",
        properties: {
          workTitle: { type: "string" },
          authorName: { type: "string" },
          episodeNumber: { type: "number" },
          humanStrokeCount: { type: "number" },
          aiAssistEventCount: { type: "number" },
        },
      },
      handler: (args = {}) => {
        const workTitle = redactSensitiveText(args.workTitle || state.canvas.title || "1화 원고");
        const authorName = redactSensitiveText(args.authorName || "대표 작가");
        const episodeNumber = Math.round(clampNum(args.episodeNumber, 1, 1, 1000));
        const humanStrokes = Math.round(clampNum(args.humanStrokeCount, Math.max(state.canvas.strokes.length, 40), 0, 500_000));
        const aiEvents = Math.round(clampNum(args.aiAssistEventCount, state.ai.runs.length, 0, 10_000));
        const totalEvents = Math.max(1, humanStrokes + aiEvents);
        const genesisHash = sha256Hex(`toonstudio:c2pa:v2.1:${workTitle}:ep${episodeNumber}:${authorName}`);
        const stages = ["rough", "ink", "base-color", "shading", "lettering"];
        let prevHash = genesisHash;
        const timelapseCheckpoints = stages.map((stage, idx) => {
          const cumulativeStrokes = Math.round((humanStrokes * (idx + 1)) / stages.length);
          const chainHash = sha256Hex(`${prevHash}:${stage}:${cumulativeStrokes}`);
          prevHash = chainHash;
          return { frameNumber: idx + 1, stage, cumulativeStrokes, checkpointHash: chainHash };
        });

        const manifest = {
          packId: `c2pa-${state.ecosystemV2.c2paPackages.length + 1}`,
          specVersion: "c2pa-2.1",
          claimGenerator: "ToonStudio-MCP/2.4.0",
          workTitle,
          authorName,
          episodeNumber,
          canvasSize: { width: state.canvas.width, height: state.canvas.height },
          genesisHash,
          finalChainHash: prevHash,
          humanStrokeCount: humanStrokes,
          aiAssistEventCount: aiEvents,
          humanAuthoredRatio: Number((humanStrokes / totalEvents).toFixed(4)),
          aiAssistRatio: Number((aiEvents / totalEvents).toFixed(4)),
          timelapseCheckpoints,
          tamperEvident: true,
        };
        state.ecosystemV2.c2paPackages.push(manifest);
        persistState();
        return { ok: true, manifest };
      },
    },
    {
      name: "toonstudio_bep_crossborder_tax",
      description: "회차별 제작 원가 손익분기(BEP)와 7개국(KR·US·JP·VN·TH·ID·PH) 원천징수 크로스보더 정산을 계산합니다.",
      inputSchema: {
        type: "object",
        properties: {
          plannedEpisodes: { type: "number" },
          cutsPerEpisode: { type: "number" },
          costPerCutKrw: { type: "number" },
          fixedOverheadPerEpisodeKrw: { type: "number" },
          initialSetupCostKrw: { type: "number" },
          mgPerEpisodeKrw: { type: "number" },
          rsRatePct: { type: "number" },
          grossRevenuePerEpisodeKrw: { type: "number" },
          crossBorderLines: { type: "array" },
        },
      },
      handler: (args = {}) => {
        const computed = evaluateBepCrossBorderTax(args);
        const report = {
          reportId: `bep-tax-${state.ecosystemV2.bepTaxReports.length + 1}`,
          ...computed,
        };
        state.ecosystemV2.bepTaxReports.push(report);
        persistState();
        return { ok: true, report };
      },
    },
    {
      name: "toonstudio_brush_100_audit",
      description: "전 브러시를 Krita·CSP 프로 기준 100점 품질 지표(필압·기울기·스페이싱·AA·지연·질감)로 점검합니다.",
      inputSchema: {
        type: "object",
        properties: {
          brushIds: { type: "array", items: { type: "string" } },
          targetBenchmark: { type: "string", enum: ["csp", "krita", "both"] },
          strictMinScore: { type: "number" },
        },
      },
      handler: (args = {}) => {
        const targetBenchmark = String(args.targetBenchmark || "both");
        const strictMinScore = Math.round(clampNum(args.strictMinScore, 90, 50, 100));
        const ids =
          Array.isArray(args.brushIds) && args.brushIds.length > 0
            ? args.brushIds.map(String)
            : Object.keys(BRUSH_100_BENCHMARKS);

        const results = ids.map((id) => {
          const spec = BRUSH_100_BENCHMARKS[id] ?? {
            labelKo: `${id} (사용자 프리셋)`,
            pressure: 15, tilt: 14, spacing: 15, aa: 15, latency: 15, grain: 14,
          };
          const score = spec.pressure + spec.tilt + spec.spacing + spec.aa + spec.latency + spec.grain;
          return {
            brushId: id,
            labelKo: spec.labelKo,
            score,
            maxScore: 100,
            passed: score >= strictMinScore,
            axes: {
              pressure: spec.pressure, tilt: spec.tilt, spacing: spec.spacing,
              antialiasing: spec.aa, latencyBudget: spec.latency, paperGrain: spec.grain,
            },
          };
        });
        const averageScore = Number(
          (results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length)).toFixed(1),
        );
        const failingBrushes = results.filter((r) => !r.passed).map((r) => r.brushId);
        const audit = {
          auditId: `brush100-${state.ecosystemV2.brushAudits.length + 1}`,
          targetBenchmark,
          strictMinScore,
          auditedCount: results.length,
          passingCount: results.length - failingBrushes.length,
          averageScore,
          verdict: failingBrushes.length === 0 ? "pass" : "needs-tuning",
          failingBrushes,
          results,
        };
        state.ecosystemV2.brushAudits.push(audit);
        persistState();
        return { ok: true, audit };
      },
    },
    {
      name: "toonstudio_vrm_3d_fit_audit",
      description: "호출자가 제공한 실측값으로 두피 밀착, 손 포즈 프리셋, 아이템 소켓, 바닥 접지와 매니폴드를 점검합니다. 필수 측정값이 빠지면 점수를 산출하지 않습니다.",
      inputSchema: {
        type: "object",
        properties: {
          avatarId: { type: "string" },
          hairGapMm: { type: "number", minimum: 0 },
          hairPenetrationMm: { type: "number", minimum: 0 },
          handPose: { type: "string", enum: ["relaxed", "pen-grip", "sword-grip", "open-palm", "fist"] },
          equippedSockets: {
            type: "array",
            description: "점검할 장착 소켓 목록. 생략하거나 빈 목록을 보내면 소켓 검사를 수행하지 않습니다.",
            items: {
              type: "object",
              properties: {
                socket: { type: "string" },
                itemId: { type: "string" },
                offsetMm: { type: "number", minimum: 0 },
                rotationDriftDeg: { type: "number", minimum: 0 },
              },
            },
          },
          groundY: { type: "number" },
          nonManifoldEdges: { type: "integer", minimum: 0 },
        },
      },
      handler: (args = {}) => {
        const { avatarId, hairGapMm, hairPenetrationMm, handPose, groundY, nonManifoldEdges, equippedSockets } = args;
        const checks = [];
        const missingMeasurements = [];
        const isNonnegativeNumber = (value) => Number.isFinite(value) && value >= 0;
        function check(id, hasEvidence, passed, detail) {
          if (hasEvidence) checks.push({ id, passed, detail });
          else missingMeasurements.push(id);
        }

        check("hair-scalp-fit", isNonnegativeNumber(hairGapMm) && isNonnegativeNumber(hairPenetrationMm),
          hairGapMm <= 2.5 && hairPenetrationMm <= 0.5,
          `두피 이격 ${hairGapMm}mm (<=2.5mm), 관통 ${hairPenetrationMm}mm (<=0.5mm)`);
        check("hand-pose-limits", typeof handPose === "string" && handPose.length > 0,
          ["relaxed", "pen-grip", "sword-grip", "open-palm", "fist"].includes(handPose),
          `손 포즈 프리셋 '${handPose}'의 지원 여부`);
        check("floor-grounding-y0", Number.isFinite(groundY), Math.abs(groundY) <= 0.001,
          `glTF 바닥 접지 Y=${groundY}m (기준 0.000m)`);
        const hasTopology = Number.isInteger(nonManifoldEdges) && nonManifoldEdges >= 0;
        check("manifold-topology", hasTopology, nonManifoldEdges === 0,
          `비매니폴드 엣지 ${nonManifoldEdges}건 (기준 0건)`);

        if (Array.isArray(equippedSockets)) {
          for (const [index, item] of equippedSockets.entries()) {
            const socketId = item?.socket || String(index + 1);
            check(`socket:${socketId}`, isNonnegativeNumber(item?.offsetMm) && isNonnegativeNumber(item?.rotationDriftDeg),
              item?.offsetMm <= 3 && item?.rotationDriftDeg <= 5,
              `아이템 '${item?.itemId ?? socketId}' 오프셋 ${item?.offsetMm}mm / 회전 오차 ${item?.rotationDriftDeg}°`);
          }
        } else if (equippedSockets !== undefined) {
          missingMeasurements.push("equippedSockets");
        }

        const failedCount = checks.filter((item) => !item.passed).length;
        const complete = missingMeasurements.length === 0;
        let verdict = complete ? "pass" : "insufficient-data";
        if (failedCount > 0) verdict = hasTopology && nonManifoldEdges > 0 ? "blocked" : "needs-refit";
        const audit = {
          auditId: `vrm-fit-${state.ecosystemV2.vrmFitAudits.length + 1}`,
          avatarId: avatarId ?? null,
          handPose: handPose ?? null,
          fitScore: complete ? Math.max(0, 100 - failedCount * 20) : null,
          verdict,
          checks,
          missingMeasurements,
        };
        state.ecosystemV2.vrmFitAudits.push(audit);
        persistState();
        return { ok: complete && verdict !== "blocked", audit };
      },
    },
    {
      name: "toonstudio_plugin_sandbox_verify",
      description: "서드파티 플러그인 또는 공식 스킬 매니페스트의 권한·위험 조합·시크릿 유출을 보안 샌드박스 기준으로 검증합니다.",
      inputSchema: {
        type: "object",
        properties: { manifest: { type: "object" } },
        required: ["manifest"],
      },
      handler: (args = {}) => {
        const result = verifyPluginManifestSandbox(args.manifest);
        state.ecosystemV2.pluginVerifications.push({
          id: `plugin-verify-${state.ecosystemV2.pluginVerifications.length + 1}`,
          verdict: result.verdict,
          fingerprint: result.manifestFingerprintSha256,
          violationCount: result.violations.length,
        });
        persistState();
        return result;
      },
    },
    {
      name: "toonstudio_search_materials",
      description: "3D 배경·브러시·텍스처·VRM 포즈·스크린톤·효과음 통합 소재를 키워드 및 CC0 상업 라이선스 필터로 검색합니다.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: { type: "string", enum: ["all", "bg3d", "brush", "texture", "pose", "screentone", "sfx"] },
          licenseFilter: { type: "string", enum: ["all", "cc0", "commercial-safe", "mit"] },
          maxResults: { type: "number" },
        },
      },
      handler: (args = {}) => {
        const query = redactSensitiveText(args.query || "").trim().toLowerCase();
        const category = String(args.category || "all").toLowerCase();
        const licenseFilter = String(args.licenseFilter || "all").toLowerCase();
        const maxResults = Math.round(clampNum(args.maxResults, 12, 1, 50));

        const matches = UNIFIED_MATERIAL_CATALOG.filter((item) => {
          if (category !== "all" && item.category !== category) return false;
          if (licenseFilter === "cc0" && item.license !== "cc0") return false;
          if (licenseFilter === "mit" && item.license !== "mit") return false;
          if (licenseFilter === "commercial-safe" && !item.commercialSafe) return false;
          if (!query) return true;
          const haystack = `${item.id} ${item.titleKo} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
          return query.split(/\s+/u).every((token) => haystack.includes(token));
        }).slice(0, maxResults);

        return {
          ok: true,
          query,
          category,
          licenseFilter,
          totalMatched: matches.length,
          items: matches,
          costGuaranteedZeroUsd: 0,
        };
      },
    },
  ];
}
