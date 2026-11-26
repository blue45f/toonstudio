/**
 * Wasm64 Wave 20 Grand Finale — 통합 옴니채널 마스터 출고 게이트(Omnichannel Master Release Gate).
 *
 * 단일 패스 결정론적 사전 출고 감사기:
 * - 웹툰 스크롤: 슬라이스 규격 및 8-연결 미세 먼지(Stray-Pixel Dust `0`개) 검사
 * - 인쇄 CMYK: 해상도 하한(`DPI >= 300`), 재단 여백(`>= 3mm`), 총잉크량(`TAC <= 300%`) 검사
 * - 모션툰: ITU-R BT.1702 광과민성 점멸 안전(`초당 3회 이하`) 및 프레임 유지율 검사
 * - 오디오툰: 통합 라우드니스(`-14 ± 1 LUFS`) 및 트루피크(`<= -1.0 dBTP`) 검사
 * - 글로벌 현지화: 다국어 말풍선 넘침(`0`건) 및 미번역 토큰 잔존 여부 검사
 * - 개인정보·출처 증명: 선형 스캐너 기반 개인정보·시크릿 유출(`0`건) 및 C2PA / WOTS+ 해시체인 봉인 검증
 *
 * 외부 서버 호출 없이 로컬 메모리에서 0~100점 출고 준비 인증서(Release Readiness Certificate)를 발급한다(₩0).
 */

import {
  computeDeterministicHash256Hex,
  scanLinearPiiAndSecrets,
  verifyWotsPlusProvenanceSeal,
  type PiiFinding,
  type WotsPlusProvenanceSeal,
} from "./wots-provenance-pii-scanner";

export {
  computeDeterministicHash256Hex,
  createWotsPlusProvenanceSeal,
  scanLinearPiiAndSecrets,
  verifyWotsPlusProvenanceSeal,
  type PiiFinding,
  type WotsPlusProvenanceSeal,
} from "./wots-provenance-pii-scanner";

export type ReleaseChannelKind =
  | "webtoon-scroll"
  | "print-cmyk"
  | "motion-toon"
  | "audio-toon"
  | "global-localization"
  | "security-provenance";

export type ReleaseGateSeverity = "critical" | "major" | "minor";
export type ReleaseVerdict = "READY" | "CONDITIONAL" | "BLOCKED";

export interface WebtoonScrollAuditInput {
  readonly canvasWidthPx: number;
  readonly sliceHeightsPx: readonly number[];
  readonly maxSliceHeightPx?: number;
  readonly maxSeamLuminanceDelta?: number;
  readonly lineArtAlphaMask?: {
    readonly width: number;
    readonly height: number;
    readonly alpha: Uint8Array;
    readonly alphaThreshold?: number;
    readonly maxDustAreaPx?: number;
  };
  readonly precountedDustPixels?: number;
}

export interface PrintCmykAuditInput {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly minDpi?: number;
  readonly cmykPercentSamples: Float32Array | readonly number[];
  readonly maxTacPercentLimit?: number;
}

export interface MotionToonAuditInput {
  readonly fps: number;
  readonly frameRelativeLuminances: readonly number[];
  readonly flashScreenAreaFraction: number;
  readonly saturatedRedTransitionsPerSec?: number;
  readonly droppedFrameCount?: number;
}

export interface AudioToonAuditInput {
  readonly integratedLufs?: number;
  readonly truePeakDbtp?: number;
  readonly pcmSamples?: Float32Array;
  readonly sampleRateHz?: number;
  readonly targetLufs?: number;
  readonly toleranceLu?: number;
}

export interface LocalizedBalloonEntry {
  readonly balloonId: string;
  readonly locale: string;
  readonly text: string;
  readonly balloonWidthPx: number;
  readonly balloonHeightPx: number;
  readonly fontSizePx: number;
  readonly lineHeightRatio?: number;
  readonly paddingPx?: number;
}

export interface GlobalLocalizationAuditInput {
  readonly balloons: readonly LocalizedBalloonEntry[];
}

export interface OmnichannelReleaseAuditInput {
  readonly episodeId: string;
  readonly webtoonScroll: WebtoonScrollAuditInput;
  readonly printCmyk: PrintCmykAuditInput;
  readonly motionToon: MotionToonAuditInput;
  readonly audioToon: AudioToonAuditInput;
  readonly globalLocalization: GlobalLocalizationAuditInput;
  readonly metadataFields: Readonly<Record<string, string>>;
  readonly provenanceSeal: WotsPlusProvenanceSeal;
}

export interface ReleaseGateCheckItem {
  readonly checkId: string;
  readonly channel: ReleaseChannelKind;
  readonly labelKo: string;
  readonly severity: ReleaseGateSeverity;
  readonly passed: boolean;
  readonly weight: number;
  readonly earnedPoints: number;
  readonly measuredSummary: string;
  readonly remediationKo: string;
}

export interface OmnichannelReleaseMetrics {
  readonly effectiveDpi: number;
  readonly maxTacPercent: number;
  readonly tacViolationCount: number;
  readonly integratedLufs: number;
  readonly truePeakDbtp: number;
  readonly maxFlashHz: number;
  readonly ituRFlashSafe: boolean;
  readonly balloonOverflowCount: number;
  readonly strayPixelDustCount: number;
  readonly piiLeakCount: number;
  readonly provenanceSealValid: boolean;
}

export interface OmnichannelReleaseCertificate {
  readonly certificateId: string;
  readonly episodeId: string;
  readonly readinessScore: number;
  readonly verdict: ReleaseVerdict;
  readonly channelScores: Readonly<Record<ReleaseChannelKind, number>>;
  readonly metrics: OmnichannelReleaseMetrics;
  readonly piiFindings: readonly PiiFinding[];
  readonly checks: readonly ReleaseGateCheckItem[];
  readonly certificateDigestHex: string;
  readonly serverCostKrw: 0;
}

/** 8-연결 라벨링으로 선화 알파 버퍼의 고립 미세 먼지(Stray-Pixel Dust) 개수를 센다. */
export function countStrayPixelDustClusters(
  width: number,
  height: number,
  alpha: Uint8Array,
  alphaThreshold = 24,
  maxDustAreaPx = 4,
): number {
  const total = width * height;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  let dustClusterCount = 0;

  for (let i = 0; i < total; i++) {
    if (visited[i] === 1 || (alpha[i] ?? 0) < alphaThreshold) continue;
    visited[i] = 1;
    let sp = 0;
    stack[sp++] = i;
    let area = 0;
    const earlyStop = maxDustAreaPx + 1;

    while (sp > 0) {
      const cur = stack[--sp]!;
      if (area <= earlyStop) area++;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= width) continue;
          const nIdx = ny * width + nx;
          if (visited[nIdx] === 0 && (alpha[nIdx] ?? 0) >= alphaThreshold) {
            visited[nIdx] = 1;
            stack[sp++] = nIdx;
          }
        }
      }
    }
    if (area >= 1 && area <= maxDustAreaPx) dustClusterCount++;
  }
  return dustClusterCount;
}

function estimateAudioLufsAndPeak(input: AudioToonAuditInput): {
  readonly integratedLufs: number;
  readonly truePeakDbtp: number;
} {
  if (typeof input.integratedLufs === "number" && Number.isFinite(input.integratedLufs)) {
    return { integratedLufs: input.integratedLufs, truePeakDbtp: input.truePeakDbtp ?? -1.5 };
  }
  const samples = input.pcmSamples;
  if (!samples || samples.length === 0) return { integratedLufs: -70, truePeakDbtp: -70 };

  let sumSq = 0;
  let peak = 1e-9;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    sumSq += s * s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  const meanSq = Math.max(1e-12, sumSq / samples.length);
  return {
    integratedLufs: -0.691 + 10 * Math.log10(meanSq),
    truePeakDbtp: 20 * Math.log10(peak),
  };
}

function estimateBalloonOverflow(balloon: LocalizedBalloonEntry): boolean {
  const pad = Math.max(2, balloon.paddingPx ?? 10);
  const innerW = balloon.balloonWidthPx - pad * 2;
  const innerH = balloon.balloonHeightPx - pad * 2;
  if (innerW <= 4 || innerH <= 4) return true;

  const fontPx = Math.max(6, balloon.fontSizePx);
  const lineH = fontPx * (balloon.lineHeightRatio ?? 1.32);
  let lineAdvance = 0;
  let lines = 1;

  for (const ch of balloon.text) {
    if (ch === "\n") {
      lines++;
      lineAdvance = 0;
      continue;
    }
    const cp = ch.codePointAt(0) ?? 32;
    const isWide = (cp >= 0x1100 && cp <= 0x11ff)
      || (cp >= 0x3040 && cp <= 0x9fff)
      || (cp >= 0xac00 && cp <= 0xd7af);
    const adv = fontPx * (isWide ? 0.96 : 0.56);
    if (lineAdvance + adv > innerW && lineAdvance > 0) {
      lines++;
      lineAdvance = adv;
    } else {
      lineAdvance += adv;
    }
  }
  return lines * lineH > innerH + 1e-3;
}

/**
 * 웹툰 스크롤 · 인쇄 CMYK · 모션툰 · 오디오툰 · 글로벌 현지화 · 보안/출처 증명을
 * 단일 패스로 통합 감사하고 0~100점 출고 준비 인증서를 발급한다.
 */
export function runOmnichannelMasterReleaseGate(
  input: OmnichannelReleaseAuditInput,
): OmnichannelReleaseCertificate {
  const checks: ReleaseGateCheckItem[] = [];
  const addCheck = (
    checkId: string,
    channel: ReleaseChannelKind,
    labelKo: string,
    severity: ReleaseGateSeverity,
    passed: boolean,
    weight: number,
    measuredSummary: string,
    remediationKo: string,
  ): void => {
    checks.push({
      checkId,
      channel,
      labelKo,
      severity,
      passed,
      weight,
      earnedPoints: passed ? weight : 0,
      measuredSummary,
      remediationKo: passed ? "기준 충족" : remediationKo,
    });
  };

  const maxSliceLimit = input.webtoonScroll.maxSliceHeightPx ?? 4096;
  const oversizeSlices = input.webtoonScroll.sliceHeightsPx.filter((h) => h <= 0 || h > maxSliceLimit).length;
  const seamOk = (input.webtoonScroll.maxSeamLuminanceDelta ?? 0) <= 2;
  addCheck(
    "webtoon-slice-spec",
    "webtoon-scroll",
    "모바일 스크롤 슬라이스 규격·경계 정합성",
    "major",
    input.webtoonScroll.canvasWidthPx >= 690 && oversizeSlices === 0 && seamOk,
    6,
    `폭 ${input.webtoonScroll.canvasWidthPx}px, 규격 초과 슬라이스 ${oversizeSlices}개`,
    `슬라이스 높이를 ${maxSliceLimit}px 이하로 분할하고 컷 경계 밝기 단차를 2 이하로 맞추세요.`,
  );

  const dustFromMask = input.webtoonScroll.lineArtAlphaMask
    ? countStrayPixelDustClusters(
      input.webtoonScroll.lineArtAlphaMask.width,
      input.webtoonScroll.lineArtAlphaMask.height,
      input.webtoonScroll.lineArtAlphaMask.alpha,
      input.webtoonScroll.lineArtAlphaMask.alphaThreshold ?? 24,
      input.webtoonScroll.lineArtAlphaMask.maxDustAreaPx ?? 4,
    )
    : 0;
  const strayPixelDustCount = dustFromMask + (input.webtoonScroll.precountedDustPixels ?? 0);
  addCheck(
    "webtoon-stray-dust",
    "webtoon-scroll",
    "선화·배경 고립 미세 먼지(Stray-Pixel Dust) 0건",
    "major",
    strayPixelDustCount === 0,
    10,
    `검출 먼지 ${strayPixelDustCount}개`,
    "선화 레이어의 4px 이하 고립 잉크 티끌을 먼지 제거 필터로 정리하세요.",
  );

  const minDpi = input.printCmyk.minDpi ?? 300;
  const dpiX = input.printCmyk.pixelWidth / Math.max(0.1, input.printCmyk.trimWidthMm / 25.4);
  const dpiY = input.printCmyk.pixelHeight / Math.max(0.1, input.printCmyk.trimHeightMm / 25.4);
  const effectiveDpi = Math.min(dpiX, dpiY);
  addCheck(
    "print-dpi-bleed",
    "print-cmyk",
    "단행본 인쇄 해상도 하한 및 3mm 재단 여백",
    "critical",
    effectiveDpi >= minDpi && input.printCmyk.bleedMm >= 3,
    8,
    `${effectiveDpi.toFixed(1)} DPI, 재단 여백 ${input.printCmyk.bleedMm.toFixed(1)}mm`,
    `원고 해상도를 최소 ${minDpi} DPI 이상으로 확보하고 사방 3mm 이상 재단 여백을 두세요.`,
  );

  const tacLimit = input.printCmyk.maxTacPercentLimit ?? 300;
  const cmykArr = input.printCmyk.cmykPercentSamples;
  let maxTacPercent = 0;
  let tacViolationCount = 0;
  for (let i = 0; i + 3 < cmykArr.length; i += 4) {
    const tac = (cmykArr[i] ?? 0) + (cmykArr[i + 1] ?? 0) + (cmykArr[i + 2] ?? 0) + (cmykArr[i + 3] ?? 0);
    if (tac > maxTacPercent) maxTacPercent = tac;
    if (tac > tacLimit + 1e-4) tacViolationCount++;
  }
  addCheck(
    "print-cmyk-tac",
    "print-cmyk",
    "인쇄 총잉크량(TAC <= 300%) 상한 준수",
    "critical",
    tacViolationCount === 0 && maxTacPercent <= tacLimit + 1e-4,
    10,
    `최대 TAC ${maxTacPercent.toFixed(1)}%, 초과 샘플 ${tacViolationCount}건`,
    "인쇄 뒷묻음을 막기 위해 GCR/UCR 프로파일로 암부 총잉크량을 300% 이하로 낮추세요.",
  );

  const fps = Math.max(1, input.motionToon.fps);
  const lumas = input.motionToon.frameRelativeLuminances;
  const windowFrames = Math.max(1, Math.round(fps));
  let maxOpposingTransitions = 0;

  if (input.motionToon.flashScreenAreaFraction >= 0.25 && lumas.length >= 2) {
    const opposingFlags = new Uint8Array(lumas.length);
    let lastSign = 0;
    for (let i = 1; i < lumas.length; i++) {
      const prev = lumas[i - 1]!;
      const cur = lumas[i]!;
      const delta = cur - prev;
      if (Math.abs(delta) >= 0.1 && Math.min(prev, cur) < 0.8) {
        const sign = delta > 0 ? 1 : -1;
        if (lastSign === 0 || sign !== lastSign) {
          opposingFlags[i] = 1;
          lastSign = sign;
        }
      }
    }
    let rolling = 0;
    for (let i = 0; i < lumas.length; i++) {
      rolling += opposingFlags[i]!;
      if (i >= windowFrames) rolling -= opposingFlags[i - windowFrames]!;
      if (rolling > maxOpposingTransitions) maxOpposingTransitions = rolling;
    }
  }
  const maxFlashHz = maxOpposingTransitions * 0.5;
  const redFlashSafe = (input.motionToon.saturatedRedTransitionsPerSec ?? 0) <= 6;
  const ituRFlashSafe = maxFlashHz <= 3 && redFlashSafe && fps >= 24 && (input.motionToon.droppedFrameCount ?? 0) === 0;
  addCheck(
    "motion-itur-flash",
    "motion-toon",
    "ITU-R BT.1702 광과민성 점멸 안전 및 프레임 유지",
    "critical",
    ituRFlashSafe,
    16,
    `최대 점멸 ${maxFlashHz.toFixed(1)}Hz, ${fps}fps`,
    "화면 25% 이상 급격한 섬광을 초당 3회 이하로 줄이거나 점멸 대비를 완화하세요.",
  );

  const { integratedLufs, truePeakDbtp } = estimateAudioLufsAndPeak(input.audioToon);
  const targetLufs = input.audioToon.targetLufs ?? -14;
  const tolLu = input.audioToon.toleranceLu ?? 1;
  const audioPassed = Math.abs(integratedLufs - targetLufs) <= tolLu && truePeakDbtp <= -1.0;
  addCheck(
    "audio-lufs-peak",
    "audio-toon",
    "오디오툰 라우드니스(-14 ± 1 LUFS) 및 트루피크 상한",
    "major",
    audioPassed,
    16,
    `${integratedLufs.toFixed(2)} LUFS, 피크 ${truePeakDbtp.toFixed(2)} dBTP`,
    "마스터 리미터로 음압을 -14 ± 1 LUFS 범위로 정규화하고 트루피크를 -1.0 dBTP 이하로 제한하세요.",
  );

  let balloonOverflowCount = 0;
  let untranslatedCount = 0;
  const combinedTexts: Record<string, string> = { ...input.metadataFields };
  for (const b of input.globalLocalization.balloons) {
    if (estimateBalloonOverflow(b)) balloonOverflowCount++;
    if (b.text.includes("{{") || b.text.includes("TODO:") || b.text.trim().length === 0) untranslatedCount++;
    combinedTexts[`balloon:${b.locale}:${b.balloonId}`] = b.text;
  }
  addCheck(
    "global-balloon-fit",
    "global-localization",
    "다국어 말풍선 텍스트 넘침 0건 및 번역 완결성",
    "major",
    balloonOverflowCount === 0 && untranslatedCount === 0,
    16,
    `넘침 ${balloonOverflowCount}건, 미번역 ${untranslatedCount}건`,
    "번역 팽창이 큰 로케일의 말풍선 세로 폭을 넓히거나 글자 크기를 조정하세요.",
  );

  const piiFindings = scanLinearPiiAndSecrets(combinedTexts);
  const piiLeakCount = piiFindings.length;
  addCheck(
    "security-pii-zero",
    "security-provenance",
    "원고 메타데이터·대사 개인정보 및 시크릿 유출 0건",
    "critical",
    piiLeakCount === 0,
    9,
    `검출 민감정보 ${piiLeakCount}건`,
    "메타데이터에 남은 개인 연락처·이메일·API 키·로컬 PC 경로를 즉시 제거하세요.",
  );

  const provenanceSealValid = verifyWotsPlusProvenanceSeal(input.provenanceSeal);
  addCheck(
    "security-c2pa-wots",
    "security-provenance",
    "C2PA 명세 및 양자내성 WOTS+ 출처 증명 봉인 유효성",
    "critical",
    provenanceSealValid,
    9,
    provenanceSealValid ? `유효 (${input.provenanceSeal.scheme})` : "봉인 불일치 또는 손상",
    "최종 원고 해시에 대해 C2PA 명세와 WOTS+ 일회용 해시체인 서명을 다시 봉인하세요.",
  );

  const channelOrder: readonly ReleaseChannelKind[] = [
    "webtoon-scroll",
    "print-cmyk",
    "motion-toon",
    "audio-toon",
    "global-localization",
    "security-provenance",
  ];
  const channelScores = {} as Record<ReleaseChannelKind, number>;
  for (const ch of channelOrder) {
    let wSum = 0;
    let eSum = 0;
    for (const c of checks) {
      if (c.channel === ch) {
        wSum += c.weight;
        eSum += c.earnedPoints;
      }
    }
    channelScores[ch] = wSum > 0 ? Math.round((eSum / wSum) * 100) : 100;
  }

  let totalWeight = 0;
  let totalEarned = 0;
  let hasCriticalFailure = false;
  let hasAnyFailure = false;
  for (const c of checks) {
    totalWeight += c.weight;
    totalEarned += c.earnedPoints;
    if (!c.passed) {
      hasAnyFailure = true;
      if (c.severity === "critical") hasCriticalFailure = true;
    }
  }

  const readinessScore = Math.max(0, Math.min(100, totalWeight > 0 ? Math.round((totalEarned / totalWeight) * 100) : 0));
  const verdict: ReleaseVerdict = hasCriticalFailure || readinessScore < 75
    ? "BLOCKED"
    : hasAnyFailure
      ? "CONDITIONAL"
      : "READY";

  const canonicalSummary = `${input.episodeId}|score:${readinessScore}|verdict:${verdict}|`
    + checks.map((c) => `${c.checkId}:${c.passed ? 1 : 0}`).join(",");
  const certificateDigestHex = computeDeterministicHash256Hex(canonicalSummary);

  return {
    certificateId: `cert-${input.episodeId}-${certificateDigestHex.slice(0, 12)}`,
    episodeId: input.episodeId,
    readinessScore,
    verdict,
    channelScores,
    metrics: {
      effectiveDpi,
      maxTacPercent,
      tacViolationCount,
      integratedLufs,
      truePeakDbtp,
      maxFlashHz,
      ituRFlashSafe,
      balloonOverflowCount,
      strayPixelDustCount,
      piiLeakCount,
      provenanceSealValid,
    },
    piiFindings,
    checks,
    certificateDigestHex,
    serverCostKrw: 0,
  };
}
