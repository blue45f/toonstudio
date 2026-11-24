/**
 * 온디바이스 웹툰 컷 연출 · 대사 어시스트 진단 엔진.
 *
 * - 브라우저 내장 로컬 LLM(`window.ai.languageModel` / `LanguageModel`) 및 WebGPU 어댑터를 감지하고,
 *   외부 서버 전송 없이 100% 결정론적 오프라인 한국어 웹툰 연출 문법 엔진으로 즉시 폴백한다.
 * - 컷 리듬·샷 크기(`ECU/CU/MS/WS`) 밸런스, 한국어 대사 자연스러움, 말풍선 과밀, 시선 꺾임을 진단한다.
 */

import {
  inspectKoreanDialogueBalloon,
  type CutDirectorDiagnosisReport,
  type CutSceneInput,
  type DialogueBalloonInput,
  type DialogueDiagnosticFinding,
  type EyeFlowDiagnosticIssue,
  type OnDeviceDirectorEnvLike,
  type OnDeviceDirectorRuntime,
  type RhythmDiagnosticIssue,
  type ShotDistributionSummary,
  type ShotSize,
} from "./ondevice-cut-director-rules";

export {
  CUT_DIRECTOR_DEMO_SCENES,
  SHOT_SIZE_META_KO,
  inspectKoreanDialogueBalloon,
  splitOvercrowdedKoreanBalloon,
} from "./ondevice-cut-director-rules";
export type {
  CutBeatType,
  CutDirectorDiagnosisReport,
  CutSceneInput,
  DialogueBalloonInput,
  DialogueDiagnosticFinding,
  DialogueFindingKind,
  EyeFlowDiagnosticIssue,
  EyeFlowIssueKind,
  OnDeviceDirectorBackend,
  OnDeviceDirectorEnvLike,
  OnDeviceDirectorRuntime,
  RhythmDiagnosticIssue,
  RhythmIssueKind,
  ShotDistributionSummary,
  ShotSize,
  TranslationeseMatch,
  WindowAiLanguageModelLike,
} from "./ondevice-cut-director-rules";

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function resolveDefaultEnv(): OnDeviceDirectorEnvLike {
  const g = globalThis as unknown as OnDeviceDirectorEnvLike;
  return {
    ai: g.ai,
    LanguageModel: g.LanguageModel,
    navigator:
      typeof navigator !== "undefined"
        ? (navigator as unknown as OnDeviceDirectorEnvLike["navigator"])
        : g.navigator,
  };
}

/** 온디바이스 로컬 LLM(`window.ai` / `LanguageModel` / WebGPU) 가용성을 동기식으로 진단한다. */
export function probeOnDeviceDirectorCapability(
  envOverride?: OnDeviceDirectorEnvLike,
): OnDeviceDirectorRuntime {
  const env = envOverride ?? resolveDefaultEnv();
  const lm = env.ai?.languageModel ?? env.LanguageModel;
  const hasWindowAi = Boolean(
    lm &&
      (typeof lm.create === "function" ||
        typeof lm.capabilities === "function" ||
        typeof lm.availability === "function"),
  );
  const hasWebGpu = Boolean(
    env.navigator?.gpu && typeof env.navigator.gpu.requestAdapter === "function",
  );

  if (hasWindowAi) {
    return {
      backend: "window-ai-nano",
      hasWindowAi: true,
      hasWebGpuAdapter: hasWebGpu,
      adapterLabel: "Browser Built-in AI (On-Device)",
      localExecutionReady: true,
      privacyMode: "100%-ondevice-zero-upload",
      runtimeNote: "브라우저 내장 window.ai 감지됨 — 오프라인 웹툰 연출 문법과 하이브리드 로컬 추론",
    };
  }
  if (hasWebGpu) {
    return {
      backend: "webgpu-local-llm",
      hasWindowAi: false,
      hasWebGpuAdapter: true,
      adapterLabel: "WebGPU Local Adapter",
      localExecutionReady: true,
      privacyMode: "100%-ondevice-zero-upload",
      runtimeNote: "WebGPU 로컬 어댑터 감지됨 — 100% 온디바이스 웹툰 문법 엔진 즉시 실행",
    };
  }
  return {
    backend: "offline-webtoon-grammar",
    hasWindowAi: false,
    hasWebGpuAdapter: false,
    adapterLabel: "Deterministic Offline Korean Webtoon Grammar",
    localExecutionReady: true,
    privacyMode: "100%-ondevice-zero-upload",
    runtimeNote: "외부 전송 0건 — 결정론적 한국어 웹툰 연출·대사 어시스트 엔진 가동",
  };
}

/** `window.ai` 모델 가용성과 `navigator.gpu.requestAdapter()`를 비동기 확인해 런타임을 확정한다. */
export async function probeOnDeviceDirectorRuntimeAsync(
  envOverride?: OnDeviceDirectorEnvLike,
): Promise<OnDeviceDirectorRuntime> {
  const env = envOverride ?? resolveDefaultEnv();
  const base = probeOnDeviceDirectorCapability(env);
  const lm = env.ai?.languageModel ?? env.LanguageModel;

  if (lm) {
    try {
      let availableStatus = "readily";
      if (typeof lm.availability === "function") availableStatus = await lm.availability();
      else if (typeof lm.capabilities === "function") {
        availableStatus = (await lm.capabilities()).available ?? "no";
      }
      if (availableStatus !== "no" && availableStatus !== "unavailable") {
        return {
          ...base,
          backend: "window-ai-nano",
          hasWindowAi: true,
          adapterLabel: `window.ai (${availableStatus})`,
          runtimeNote: `로컬 window.ai 준비 완료(${availableStatus}) — 외부 서버 전송 없음`,
        };
      }
    } catch {
      // window.ai 실패 시 WebGPU 또는 오프라인 문법으로 폴백
    }
  }

  if (env.navigator?.gpu?.requestAdapter) {
    try {
      const adapter = await env.navigator.gpu.requestAdapter();
      if (adapter) {
        return {
          ...base,
          backend: "webgpu-local-llm",
          hasWebGpuAdapter: true,
          adapterLabel: adapter.info?.description ?? "WebGPU Hardware Adapter",
          runtimeNote: "WebGPU 로컬 어댑터 확인 — 오프라인 한국어 웹툰 연출 문법과 결합 실행",
        };
      }
    } catch {
      // WebGPU 실패 시 오프라인 문법 폴백
    }
  }

  return {
    backend: "offline-webtoon-grammar",
    hasWindowAi: false,
    hasWebGpuAdapter: false,
    adapterLabel: "Deterministic Offline Korean Webtoon Grammar",
    localExecutionReady: true,
    privacyMode: "100%-ondevice-zero-upload",
    runtimeNote: "100% 오프라인 결정론적 한국어 웹툰 연출·대사 어시스트 엔진 가동",
  };
}

function diagnoseCutRhythm(cuts: readonly CutSceneInput[]): {
  readonly distribution: ShotDistributionSummary;
  readonly issues: readonly RhythmDiagnosticIssue[];
  readonly score: number;
} {
  const counts: Record<ShotSize, number> = { ECU: 0, CU: 0, MS: 0, WS: 0 };
  let monotonyRunMax = 0;
  let currentRun = 0;
  let prevShot: ShotSize | null = null;
  let runStartIdx = 0;
  const issues: RhythmDiagnosticIssue[] = [];

  const flushRun = (endExclusive: number): void => {
    if (currentRun < 3 || prevShot === null) return;
    const indices = cuts.slice(runStartIdx, endExclusive).map((c) => c.cutIndex);
    issues.push({
      kind: "monotony-run",
      severity: "bad",
      cutIndices: indices,
      message: `${indices[0]}~${indices[indices.length - 1]}컷이 모두 ${prevShot} 샷으로 ${currentRun}연속 반복돼 시선 텐션이 평탄합니다.`,
      recommendation: `중간 컷 하나를 ${prevShot === "MS" ? "CU(표정 강조) 또는 WS(공간 환기)" : "MS 또는 WS"}로 전환해 거리감을 흔드세요.`,
    });
  };

  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i]!;
    counts[cut.shotSize] += 1;

    if (cut.shotSize === prevShot) {
      currentRun += 1;
    } else {
      flushRun(i);
      prevShot = cut.shotSize;
      currentRun = 1;
      runStartIdx = i;
    }
    if (currentRun > monotonyRunMax) monotonyRunMax = currentRun;

    if (cut.beatType === "climax" && (cut.shotSize === "MS" || cut.shotSize === "WS")) {
      issues.push({
        kind: "beat-shot-mismatch",
        severity: "warn",
        cutIndices: [cut.cutIndex],
        message: `${cut.cutIndex}컷(클라이맥스)이 ${cut.shotSize}로 잡혀 감정 임팩트가 약해질 수 있습니다.`,
        recommendation: "클라이맥스 본 컷을 ECU 또는 CU로 당겨 몰입도를 높이세요.",
      });
    }
    if (cut.beatType === "breather" && cut.gutterAfterPx < 120) {
      issues.push({
        kind: "cramped-gutter",
        severity: "warn",
        cutIndices: [cut.cutIndex],
        message: `${cut.cutIndex}컷(여운 컷) 뒤 거터(${cut.gutterAfterPx}px)가 좁아 스크롤 호흡이 급합니다.`,
        recommendation: "여운 컷 뒤 거터를 140~220px로 늘려 시선을 잠시 멈추게 하세요.",
      });
    } else if (i < cuts.length - 1 && cut.balloons.length >= 2 && cut.gutterAfterPx < 64) {
      issues.push({
        kind: "cramped-gutter",
        severity: "warn",
        cutIndices: [cut.cutIndex],
        message: `${cut.cutIndex}컷(다중 대사) 뒤 거터(${cut.gutterAfterPx}px)가 좁아 다음 컷과 답답하게 붙습니다.`,
        recommendation: "대사가 많은 컷 뒤는 최소 80px 이상 거터를 확보하세요.",
      });
    }
  }
  flushRun(cuts.length);

  const total = Math.max(1, cuts.length);
  const ratiosPct: Record<ShotSize, number> = {
    ECU: Number(((counts.ECU / total) * 100).toFixed(1)),
    CU: Number(((counts.CU / total) * 100).toFixed(1)),
    MS: Number(((counts.MS / total) * 100).toFixed(1)),
    WS: Number(((counts.WS / total) * 100).toFixed(1)),
  };

  if (cuts.length >= 4 && ratiosPct.MS > 60) {
    issues.push({
      kind: "ms-overuse",
      severity: "warn",
      cutIndices: cuts.filter((c) => c.shotSize === "MS").map((c) => c.cutIndex),
      message: `전체 컷 중 MS(미디엄 샷) 비중이 ${ratiosPct.MS}%로 과도합니다.`,
      recommendation: "대화 컷 일부를 CU로 당기고 도입·전환에 WS를 배치하세요.",
    });
  }
  if (cuts.length >= 4 && counts.WS === 0) {
    issues.push({
      kind: "missing-establishing-ws",
      severity: "warn",
      cutIndices: [cuts[0]!.cutIndex],
      message: "공간 설정 샷(WS)이 없어 독자가 배경 위치와 인물 거리를 놓치기 쉽습니다.",
      recommendation: "장면 도입(1컷)이나 전환 지점에 WS 1컷을 넣어 공간 기준점을 잡으세요.",
    });
  }
  if (cuts.length >= 4 && counts.ECU + counts.CU === 0) {
    issues.push({
      kind: "missing-emotional-closeup",
      severity: "warn",
      cutIndices: [cuts[cuts.length - 1]!.cutIndex],
      message: "클로즈업(CU/ECU)이 한 컷도 없어 감정 정점이 밋밋합니다.",
      recommendation: "핵심 대사 컷에 CU 또는 ECU를 배치해 시선을 고정하세요.",
    });
  }

  let penalty = 0;
  for (const issue of issues) penalty += issue.severity === "bad" ? 18 : 10;
  return {
    distribution: { totalCuts: cuts.length, counts, ratiosPct, monotonyRunMax },
    issues,
    score: clamp(100 - penalty, 15, 100),
  };
}

function diagnoseEyeFlow(cuts: readonly CutSceneInput[]): {
  readonly issues: readonly EyeFlowDiagnosticIssue[];
  readonly score: number;
} {
  const issues: EyeFlowDiagnosticIssue[] = [];

  for (const cut of cuts) {
    if (cut.balloons.length < 2) continue;
    const ordered = [...cut.balloons].sort((a, b) => a.readingOrder - b.readingOrder);

    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1]!;
      const curr = ordered[i]!;
      const dy = curr.yPct - prev.yPct;
      const dx = curr.xPct - prev.xPct;

      if (dy < -8) {
        issues.push({
          cutId: cut.id,
          cutIndex: cut.cutIndex,
          fromBalloonId: prev.id,
          toBalloonId: curr.id,
          kind: "reverse-vertical-jump",
          severity: "bad",
          message: `${cut.cutIndex}컷에서 ${prev.readingOrder}번→${curr.readingOrder}번 말풍선 시선이 위쪽(${prev.yPct}%→${curr.yPct}%)으로 역행합니다.`,
          suggestedPosition: {
            xPct: clamp(prev.xPct < 50 ? prev.xPct + 22 : prev.xPct - 18, 22, 78),
            yPct: clamp(prev.yPct + 22, 18, 86),
          },
        });
      } else if (Math.abs(dy) <= 8 && dx < -18) {
        issues.push({
          cutId: cut.id,
          cutIndex: cut.cutIndex,
          fromBalloonId: prev.id,
          toBalloonId: curr.id,
          kind: "right-to-left-reversal",
          severity: "bad",
          message: `${cut.cutIndex}컷 같은 높이에서 시선이 우→좌(${prev.xPct}%→${curr.xPct}%)로 꺾여 읽기 순서가 혼동됩니다.`,
          suggestedPosition: {
            xPct: clamp(prev.xPct + 18, 24, 80),
            yPct: clamp(prev.yPct + 18, 18, 86),
          },
        });
      } else if (Math.abs(dx) > 54 && dy < 20) {
        issues.push({
          cutId: cut.id,
          cutIndex: cut.cutIndex,
          fromBalloonId: prev.id,
          toBalloonId: curr.id,
          kind: "sharp-horizontal-zigzag",
          severity: "warn",
          message: `${cut.cutIndex}컷에서 시선이 가로로 ${Math.abs(dx)}%p 급격히 튕깁니다(모바일 시선 피로).`,
          suggestedPosition: {
            xPct: clamp(prev.xPct + Math.sign(dx) * 32, 22, 78),
            yPct: clamp(Math.max(curr.yPct, prev.yPct + 22), 18, 86),
          },
        });
      } else if (Math.abs(dx) < 16 && Math.abs(dy) < 12) {
        issues.push({
          cutId: cut.id,
          cutIndex: cut.cutIndex,
          fromBalloonId: prev.id,
          toBalloonId: curr.id,
          kind: "balloon-collision",
          severity: "warn",
          message: `${cut.cutIndex}컷 ${prev.readingOrder}번·${curr.readingOrder}번 말풍선 간격이 지나치게 좁아 겹칠 위험이 있습니다.`,
          suggestedPosition: {
            xPct: clamp(prev.xPct < 50 ? prev.xPct + 24 : prev.xPct - 24, 22, 78),
            yPct: clamp(prev.yPct + 20, 18, 86),
          },
        });
      }
    }
  }

  let penalty = 0;
  for (const issue of issues) penalty += issue.severity === "bad" ? 20 : 12;
  return { issues, score: clamp(100 - penalty, 15, 100) };
}

/** 웹툰 컷 시퀀스 전체를 온디바이스에서 진단해 종합 연출·대사·시선 리포트를 생성한다. */
export function analyzeWebtoonCutDirection(
  cuts: readonly CutSceneInput[],
  envOverride?: OnDeviceDirectorEnvLike,
): CutDirectorDiagnosisReport {
  const startMs = nowMs();
  const runtime = probeOnDeviceDirectorCapability(envOverride);
  const rhythm = diagnoseCutRhythm(cuts);
  const eyeFlow = diagnoseEyeFlow(cuts);
  const dialogueFindings: DialogueDiagnosticFinding[] = [];
  let totalBalloons = 0;

  for (const cut of cuts) {
    for (const balloon of cut.balloons) {
      totalBalloons += 1;
      const check = inspectKoreanDialogueBalloon(balloon.text);
      if (check.matchedRules.length > 0) {
        dialogueFindings.push({
          cutId: cut.id,
          cutIndex: cut.cutIndex,
          balloonId: balloon.id,
          speaker: balloon.speaker,
          kind: "translationese",
          severity: check.matchedRules.length >= 2 ? "bad" : "warn",
          originalText: balloon.text,
          suggestedRewrite: check.suggestedRewrite,
          suggestedSplitBalloons: check.suggestedSplitBalloons,
          charCount: check.charCount,
          estimatedMobileLines: check.estimatedMobileLines,
          matchedRules: check.matchedRules,
          message: `${cut.cutIndex}컷 [${balloon.speaker}] 번역투 표현 ${check.matchedRules.length}건 감지(${check.matchedRules.map((r) => `'${r.matchedPhrase}'`).join(", ")})`,
        });
      }
      if (check.isOvercrowded) {
        dialogueFindings.push({
          cutId: cut.id,
          cutIndex: cut.cutIndex,
          balloonId: balloon.id,
          speaker: balloon.speaker,
          kind: "balloon-overcrowded",
          severity: check.charCount >= 48 ? "bad" : "warn",
          originalText: balloon.text,
          suggestedRewrite: check.suggestedRewrite,
          suggestedSplitBalloons: check.suggestedSplitBalloons,
          charCount: check.charCount,
          estimatedMobileLines: check.estimatedMobileLines,
          matchedRules: check.matchedRules,
          message: `${cut.cutIndex}컷 [${balloon.speaker}] 말풍선 과밀(${check.charCount}자 · 약 ${check.estimatedMobileLines}줄) — ${check.suggestedSplitBalloons.length}개 분할 권장`,
        });
      }
    }
  }

  let dialoguePenalty = 0;
  for (const f of dialogueFindings) dialoguePenalty += f.severity === "bad" ? 18 : 11;
  const dialogueNaturalnessScore =
    totalBalloons === 0 ? 100 : clamp(100 - dialoguePenalty, 15, 100);
  const overallScore = Math.round(
    rhythm.score * 0.34 + dialogueNaturalnessScore * 0.38 + eyeFlow.score * 0.28,
  );

  return {
    runtime,
    overallScore,
    rhythmScore: rhythm.score,
    dialogueNaturalnessScore,
    eyeFlowScore: eyeFlow.score,
    shotDistribution: rhythm.distribution,
    rhythmIssues: rhythm.issues,
    dialogueFindings,
    eyeFlowIssues: eyeFlow.issues,
    elapsedMs: Number(Math.max(0.01, nowMs() - startMs).toFixed(3)),
  };
}

/** 번역투 교정 · 과밀 말풍선 분할 · 시선 꺾임 좌표 교정 · 단조 샷 변주를 일괄 적용한다. */
export function applyDirectorAutoAssist(cuts: readonly CutSceneInput[]): readonly CutSceneInput[] {
  const report = analyzeWebtoonCutDirection(cuts);
  const eyeFixByBalloon = new Map<string, { readonly xPct: number; readonly yPct: number }>();
  for (const issue of report.eyeFlowIssues) eyeFixByBalloon.set(issue.toBalloonId, issue.suggestedPosition);

  const shotOverrideByCutIndex = new Map<number, ShotSize>();
  for (const issue of report.rhythmIssues) {
    if (issue.kind === "monotony-run" && issue.cutIndices.length >= 3) {
      shotOverrideByCutIndex.set(issue.cutIndices[Math.floor(issue.cutIndices.length / 2)]!, "CU");
    }
    if (issue.kind === "missing-establishing-ws" && issue.cutIndices.length > 0) {
      shotOverrideByCutIndex.set(issue.cutIndices[0]!, "WS");
    }
    if (issue.kind === "beat-shot-mismatch" && issue.cutIndices.length > 0) {
      shotOverrideByCutIndex.set(issue.cutIndices[0]!, "ECU");
    }
  }

  return cuts.map((cut) => {
    const nextShot = shotOverrideByCutIndex.get(cut.cutIndex) ?? cut.shotSize;
    const nextGutter =
      cut.beatType === "breather" && cut.gutterAfterPx < 140
        ? 160
        : cut.balloons.length >= 2 && cut.gutterAfterPx < 84
          ? 92
          : cut.gutterAfterPx;

    const ordered = [...cut.balloons].sort((a, b) => a.readingOrder - b.readingOrder);
    const rebuilt: DialogueBalloonInput[] = [];
    let orderCursor = 1;
    let lastY = 12;

    for (const balloon of ordered) {
      const check = inspectKoreanDialogueBalloon(balloon.text);
      const fixPos = eyeFixByBalloon.get(balloon.id);
      const baseX = fixPos ? fixPos.xPct : balloon.xPct;
      const baseY = Math.max(lastY + 14, fixPos ? fixPos.yPct : balloon.yPct);
      const pieces = check.isOvercrowded ? check.suggestedSplitBalloons : [check.suggestedRewrite];

      for (let pIdx = 0; pIdx < pieces.length; pIdx += 1) {
        const yPos = clamp(Math.round(baseY + pIdx * 18), 16, 88);
        const xPos = clamp(Math.round(pIdx === 0 ? baseX : baseX < 50 ? baseX + 20 : baseX - 18), 20, 80);
        rebuilt.push({
          id: pIdx === 0 ? balloon.id : `${balloon.id}-split-${pIdx + 1}`,
          speaker: balloon.speaker,
          text: pieces[pIdx]!,
          xPct: xPos,
          yPct: yPos,
          readingOrder: orderCursor,
        });
        orderCursor += 1;
        lastY = yPos;
      }
    }

    return { ...cut, shotSize: nextShot, gutterAfterPx: nextGutter, balloons: rebuilt };
  });
}
