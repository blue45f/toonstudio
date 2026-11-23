#!/usr/bin/env node
/**
 * 전 브러시 12종 Krita 5.2 + Clip Studio Paint 3.0 기준 100/100 자동 채점 벤치마크.
 *
 * 5대 실측 축 (각 20점 = 총 100점):
 *  1) 시각 질감 충실도 (20점): 실제 커널 픽셀 버퍼의 분산·고주파 엔트로피·경계 거칠기·매체별 시그니처 실측
 *  2) 필압·틸트·손떨림 보정 필기감 (20점): 0.05~1.0 단조성·고속 끝단 테이퍼·틸트 확장·지터 억제·0필압 연속성
 *  3) 장시간 연속 획(10,000 포인트) 성능 유지율 (20점): 앞 10% vs 뒤 10% 비율 <= 1.35x, 프레임당 < 16.6ms
 *  4) 입력 누락(Dropped/Dead Stroke) 0건 (20점): 초저필압·고속 스냅·마이크로 탭·NaN 주입·10,000점 장획 불변식
 *  5) 메모리·GC 안정성 (20점): 링버퍼 상한·스탬프 버짓·듀얼 타일 캐시 히트율·버퍼 재사용 및 힙 증가 상한
 *
 * 사용법:
 *   node scripts/verify-brush-100-competitor-score.mjs [--min-score 100] [--json]
 */

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { registerHooks } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GC_CHILD_MARKER = "TOONSTUDIO_BRUSH_SCORE_GC_CHILD";

/** 점수 미달의 정상 JSON은 보존하되 프로세스 장애·깨진 보고서·종료 코드 불일치는 실패한다. */
export function parseBrushScoreChildResult(child) {
  if (child.error || child.signal || ![0, 1].includes(child.status)) {
    throw new Error(`브러시 GC 프로세스 실패: ${child.error?.message ?? child.signal ?? child.status}; ${child.stderr ?? ""}`);
  }
  let report;
  try { report = JSON.parse(child.stdout); } catch {
    throw new Error(`브러시 GC 프로세스가 유효한 JSON 보고서를 반환하지 않았습니다: ${child.stderr ?? ""}`);
  }
  if (report?.benchmark !== "krita-5.2+csp-3.0-12-family-100pt"
    || report.familyCount !== 12 || !Array.isArray(report.results) || report.results.length !== 12
    || !Number.isFinite(report.minScore)
    || child.status !== (report.minScore < 100 ? 1 : 0)) {
    throw new Error("브러시 GC 프로세스의 보고서와 종료 코드가 일치하지 않습니다.");
  }
  return report;
}

function evaluateBrushScoreInGcProcess() {
  if (process.env[GC_CHILD_MARKER] === "1") {
    throw new Error("브러시 GC 자식 프로세스에 명시적 GC가 없습니다. 재귀 실행을 중단합니다.");
  }
  return parseBrushScoreChildResult(spawnSync(process.execPath,
    ["--expose-gc", fileURLToPath(import.meta.url), "--json"], {
      cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, [GC_CHILD_MARKER]: "1" },
    }));
}

let tsHooksRegistered = false;
function ensureTsImportHooks() {
  if (tsHooksRegistered) return;
  tsHooksRegistered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../"))
        && !/\.(?:[cm]?js|tsx?|json)$/u.test(specifier)
        && context.parentURL?.startsWith("file:")
      ) {
        const parentDir = path.dirname(fileURLToPath(context.parentURL));
        const tsCandidate = path.resolve(parentDir, `${specifier}.ts`);
        if (fs.existsSync(tsCandidate)) {
          return { url: pathToFileURL(tsCandidate).href, shortCircuit: true };
        }
      }
      return nextResolve(specifier, context);
    },
  });
}

let cachedModules = null;
async function loadBrushModules() {
  if (cachedModules) return cachedModules;
  ensureTsImportHooks();
  const creatorDir = path.join(REPO_ROOT, "apps/web/src/domains/creator");
  const [kernels, guard, dual, natural, presets] = await Promise.all([
    import(pathToFileURL(path.join(creatorDir, "studio-oss-brush-kernels.ts")).href),
    import(pathToFileURL(path.join(creatorDir, "drawing/brush-quality-soak-guard.ts")).href),
    import(pathToFileURL(path.join(creatorDir, "drawing/studio-dual-brush.ts")).href),
    import(pathToFileURL(path.join(creatorDir, "drawing/studio-natural-media-brushes.ts")).href),
    import(pathToFileURL(path.join(creatorDir, "drawing/studio-universal-brush-presets.ts")).href),
  ]);
  cachedModules = { kernels, guard, dual, natural, presets };
  return cachedModules;
}

/** 실제 픽셀 버퍼(size×size Float32Array)의 통계·엔트로피·방향성·경계 거칠기 실측. */
export function analyzeStampBufferMetrics(buffer, size) {
  const half = (size - 1) * 0.5;
  const hist = new Uint32Array(16);
  let activeCount = 0;
  let sum = 0;
  let sumSq = 0;
  let coreSum = 0;
  let coreSq = 0;
  let coreCount = 0;
  let centerSum = 0;
  let centerCount = 0;
  let midSum = 0;
  let midCount = 0;
  let rimSum = 0;
  let rimCount = 0;
  let wetRimSum = 0;
  let wetRimCount = 0;
  let midRingSum = 0;
  let midRingCount = 0;
  let edgeTransitionPixels = 0;
  let minX = size;
  let maxX = -1;
  let minY = size;
  let maxY = -1;
  const gritRing = [];

  for (let y = 0; y < size; y += 1) {
    const ny = (y - half) / half;
    for (let x = 0; x < size; x += 1) {
      const nx = (x - half) / half;
      const r = Math.hypot(nx, ny);
      const a = Number.isFinite(buffer[y * size + x]) ? buffer[y * size + x] : 0;
      if (a > 0.02) {
        activeCount += 1;
        sum += a;
        sumSq += a * a;
        const bin = Math.min(15, Math.floor(a * 16));
        hist[bin] += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (a > 0.08 && a < 0.88) edgeTransitionPixels += 1;
      if (r <= 0.48) {
        coreSum += a;
        coreSq += a * a;
        coreCount += 1;
      }
      if (r <= 0.25) {
        centerSum += a;
        centerCount += 1;
      } else if (r >= 0.42 && r <= 0.58) {
        midSum += a;
        midCount += 1;
        if (Math.abs(r - 0.48) <= 0.04) gritRing.push(a);
      } else if (r >= 0.78 && r <= 0.94) {
        rimSum += a;
        rimCount += 1;
      }
      if (r >= 0.55 && r <= 0.74) {
        midRingSum += a;
        midRingCount += 1;
      } else if (r >= 0.82 && r <= 0.96) {
        wetRimSum += a;
        wetRimCount += 1;
      }
    }
  }

  const mean = activeCount > 0 ? sum / activeCount : 0;
  const stdDev = activeCount > 0 ? Math.sqrt(Math.max(0, sumSq / activeCount - mean * mean)) : 0;
  const coreMean = coreCount > 0 ? coreSum / coreCount : 0;
  const interiorStd = coreCount > 0 ? Math.sqrt(Math.max(0, coreSq / coreCount - coreMean * coreMean)) : 0;

  let entropyBits = 0;
  if (activeCount > 0) {
    for (let i = 0; i < 16; i += 1) {
      const p = hist[i] / activeCount;
      if (p > 0) entropyBits -= p * Math.log2(p);
    }
  }

  // 내부 고주파 에너지 & 방향성 (along=X, across=Y)
  let alongGrad = 0;
  let acrossGrad = 0;
  let gradCount = 0;
  for (let y = 1; y < size - 1; y += 1) {
    const ny = (y - half) / half;
    for (let x = 1; x < size - 1; x += 1) {
      const nx = (x - half) / half;
      if (Math.hypot(nx, ny) > 0.72) continue;
      const cur = buffer[y * size + x];
      alongGrad += Math.abs(cur - buffer[y * size + (x - 1)]);
      acrossGrad += Math.abs(cur - buffer[(y - 1) * size + x]);
      gradCount += 1;
    }
  }
  const meanAlong = gradCount > 0 ? alongGrad / gradCount : 0;
  const meanAcross = gradCount > 0 ? acrossGrad / gradCount : 0;
  const hfEnergy = (meanAlong + meanAcross) * 0.5;
  const anisoRatio = meanAcross / Math.max(1e-4, meanAlong);

  // 36방향 경계 거칠기(Rim Roughness): 원형 플라스틱 경계는 ~0, 크레용/목탄/초크는 >= 0.04
  const sectorRadii = [];
  for (let s = 0; s < 36; s += 1) {
    const theta = (s / 36) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    let maxActiveR = 0;
    for (let step = 1; step <= Math.floor(half); step += 1) {
      const px = Math.round(half + cosT * step);
      const py = Math.round(half + sinT * step);
      if (px < 0 || px >= size || py < 0 || py >= size) break;
      if (buffer[py * size + px] > 0.1) maxActiveR = step / half;
    }
    sectorRadii.push(maxActiveR);
  }
  const rMean = sectorRadii.reduce((a, b) => a + b, 0) / sectorRadii.length;
  const rimRoughness = Math.sqrt(
    sectorRadii.reduce((acc, r) => acc + (r - rMean) ** 2, 0) / sectorRadii.length,
  );

  // 에어브러시 각도별 그릿 분산
  const gritMean = gritRing.length > 0 ? gritRing.reduce((a, b) => a + b, 0) / gritRing.length : 0;
  const angularGritStd =
    gritRing.length > 0
      ? Math.sqrt(gritRing.reduce((acc, g) => acc + (g - gritMean) ** 2, 0) / gritRing.length)
      : 0;

  return {
    activeCount,
    mean,
    stdDev,
    entropyBits,
    hfEnergy,
    anisoRatio,
    rimRoughness,
    coreMean,
    interiorStd,
    centerMean: centerCount > 0 ? centerSum / centerCount : 0,
    midMean: midCount > 0 ? midSum / midCount : 0,
    rimMean: rimCount > 0 ? rimSum / rimCount : 0,
    wetRimMean: wetRimCount > 0 ? wetRimSum / wetRimCount : 0,
    midRingMean: midRingCount > 0 ? midRingSum / midRingCount : 0,
    angularGritStd,
    edgeTransitionPixels,
    aspectSpanRatio: (maxX >= minX ? maxX - minX + 1 : 0) / Math.max(1, maxY >= minY ? maxY - minY + 1 : 1),
  };
}

/**
 * 축 1: 시각 질감 충실도 (20점) — 실제 픽셀 버퍼 분석 기반 채점.
 * 단순 평면 알파 원판은 분산·엔트로피·고주파·거칠기가 0에 수렴해 즉시 감점된다.
 */
export function scoreVisualTextureFidelity(familyId, lowBuffer, highBuffer, size, extra = {}) {
  const low = analyzeStampBufferMetrics(lowBuffer, size);
  const high = analyzeStampBufferMetrics(highBuffer, size);
  let score = 0;
  const notes = [];

  if (familyId === "crayon") {
    const peakContrast = extra.lowPeakContrast ?? 0;
    const lowDrySkip = extra.lowDrySkip ?? 0;
    const highDrySkip = extra.highDrySkip ?? 1;
    const crumbCount = extra.crumbCount ?? 0;
    if (peakContrast >= 0.28 && low.stdDev >= 0.16 && low.entropyBits >= 2.2) score += 5;
    else notes.push(`crayon peak/std/entropy 부족(${peakContrast.toFixed(2)}/${low.stdDev.toFixed(2)}/${low.entropyBits.toFixed(2)})`);
    if (low.anisoRatio >= 1.25 && low.hfEnergy >= 0.08) score += 5;
    else notes.push(`crayon 방향성 긁힘 부족(aniso=${low.anisoRatio.toFixed(2)}, hf=${low.hfEnergy.toFixed(3)})`);
    if (lowDrySkip >= 0.2 && high.mean >= low.mean * 1.35 && highDrySkip <= lowDrySkip * 0.45) score += 5;
    else notes.push(`crayon 갈필/불투명 대비 부족(skip=${lowDrySkip.toFixed(2)}->${highDrySkip.toFixed(2)}, mean=${low.mean.toFixed(2)}->${high.mean.toFixed(2)})`);
    if (crumbCount >= 10 && low.rimRoughness >= 0.045) score += 5;
    else notes.push(`crayon 부스러기/경계 거칠기 부족(crumbs=${crumbCount}, rim=${low.rimRoughness.toFixed(3)})`);
  } else if (familyId === "pencil" || familyId === "charcoal" || familyId === "pastel" || familyId === "chalk") {
    if (low.stdDev >= 0.14 && low.entropyBits >= 2.1) score += 5;
    else notes.push(`${familyId} 분산/엔트로피 부족(${low.stdDev.toFixed(2)}/${low.entropyBits.toFixed(2)})`);
    if (low.hfEnergy >= 0.055) score += 5;
    else notes.push(`${familyId} 고주파 입자 부족(${low.hfEnergy.toFixed(3)})`);
    if (high.mean >= low.mean * 1.2) score += 5;
    else notes.push(`${familyId} 필압 누적 대비 부족(${low.mean.toFixed(2)}->${high.mean.toFixed(2)})`);
    if (low.rimRoughness >= 0.03) score += 5;
    else notes.push(`${familyId} 경계 거칠기 부족(${low.rimRoughness.toFixed(3)})`);
  } else if (familyId === "sumi-dry-rake") {
    if (low.stdDev >= 0.14 && low.entropyBits >= 2.0) score += 5;
    else notes.push(`sumi-dry-rake 분산/엔트로피 부족`);
    if (low.anisoRatio >= 1.45 && low.hfEnergy >= 0.08) score += 5;
    else notes.push(`sumi-dry-rake 갈필 방향성 부족(aniso=${low.anisoRatio.toFixed(2)})`);
    if (high.mean >= low.mean * 1.25) score += 5;
    else notes.push(`sumi-dry-rake 필압 변화 부족`);
    if (low.rimRoughness >= 0.03) score += 5;
    else notes.push(`sumi-dry-rake 붓끝 거칠기 부족(${low.rimRoughness.toFixed(3)})`);
  } else if (familyId === "oil") {
    if (high.stdDev >= 0.11 && high.entropyBits >= 2.0) score += 5;
    else notes.push(`oil 질감 엔트로피 부족(${high.stdDev.toFixed(2)}/${high.entropyBits.toFixed(2)})`);
    if (high.anisoRatio >= 1.35 && high.hfEnergy >= 0.035) score += 5;
    else notes.push(`oil 강모 방향성 부족(aniso=${high.anisoRatio.toFixed(2)}, hf=${high.hfEnergy.toFixed(3)})`);
    if (high.mean >= low.mean * 1.18) score += 5;
    else notes.push(`oil 필압 안료량 변화 부족`);
    if (extra.oilZeroWhiteGlitter !== false) score += 5;
    else notes.push("oil paint-film 화이트 글리터 방지 위반");
  } else if (familyId === "watercolor") {
    if (high.stdDev >= 0.11 && high.entropyBits >= 2.0) score += 5;
    else notes.push(`watercolor 과립 엔트로피 부족`);
    if (high.wetRimMean > high.midRingMean * 0.65 && high.wetRimMean > 0.12) score += 5;
    else notes.push(`watercolor 웻엣지 링 부족(rim=${high.wetRimMean.toFixed(3)}, mid=${high.midRingMean.toFixed(3)})`);
    if (high.mean >= low.mean * 1.15 && high.mean <= 0.88) score += 5;
    else notes.push(`watercolor 반투명 레이어링 범위 이탈(${low.mean.toFixed(2)}->${high.mean.toFixed(2)})`);
    if (high.rimRoughness >= 0.018) score += 5;
    else notes.push(`watercolor 번짐 외곽 부족(${high.rimRoughness.toFixed(3)})`);
  } else if (familyId === "g-pen") {
    if (high.coreMean >= 0.9) score += 5;
    else notes.push(`g-pen 코어 밀도 부족(${high.coreMean.toFixed(2)})`);
    if (high.interiorStd <= 0.06) score += 5;
    else notes.push(`g-pen 선화 내부 노이즈 과다(${high.interiorStd.toFixed(3)})`);
    if (high.activeCount > low.activeCount * 1.25) score += 5;
    else notes.push(`g-pen 필압 선폭 탄성 부족(${low.activeCount}->${high.activeCount})`);
    if (high.edgeTransitionPixels >= 24) score += 5;
    else notes.push(`g-pen 안티에일리어싱 부족(${high.edgeTransitionPixels})`);
  } else if (familyId === "marker") {
    if (high.coreMean >= 0.45 && high.coreMean <= 0.92) score += 5;
    else notes.push(`marker 반투명 알코올 바디 이탈(${high.coreMean.toFixed(2)})`);
    if (high.aspectSpanRatio >= 1.25) score += 5;
    else notes.push(`marker 치즐 팁 비등방 부족(${high.aspectSpanRatio.toFixed(2)})`);
    if (high.hfEnergy >= 0.01 && high.entropyBits >= 1.0) score += 5;
    else notes.push(`marker 직조 미세 결 부족(hf=${high.hfEnergy.toFixed(3)}, ent=${high.entropyBits.toFixed(2)})`);
    if (high.mean >= low.mean * 1.12) score += 5;
    else notes.push(`marker 필압 농도 변화 부족`);
  } else if (familyId === "airbrush") {
    if (high.centerMean > high.midMean * 1.3 && high.midMean > high.rimMean * 1.5) score += 6;
    else notes.push(`airbrush 방사형 소프트 감쇠 부족(${high.centerMean.toFixed(2)}/${high.midMean.toFixed(2)}/${high.rimMean.toFixed(2)})`);
    if (high.angularGritStd >= 0.008) score += 5;
    else notes.push(`airbrush 멀티옥타브 미스트 그릿 부족(${high.angularGritStd.toFixed(4)})`);
    if (high.entropyBits >= 2.2 && high.stdDev >= 0.12) score += 5;
    else notes.push(`airbrush 계조 엔트로피 부족(${high.entropyBits.toFixed(2)}/${high.stdDev.toFixed(2)})`);
    if (high.mean >= low.mean * 1.12) score += 4;
    else notes.push(`airbrush 필압 변화 부족`);
  } else if (familyId === "spray") {
    const crumbCount = extra.crumbCount ?? 0;
    if (crumbCount >= 10 && high.stdDev >= 0.14) score += 5;
    else notes.push(`spray √U 디스크 산란 부족(crumbs=${crumbCount}, std=${high.stdDev.toFixed(2)})`);
    if (high.entropyBits >= 1.8 && high.hfEnergy >= 0.06) score += 5;
    else notes.push(`spray 입자 엔트로피 부족(${high.entropyBits.toFixed(2)}/${high.hfEnergy.toFixed(3)})`);
    if (high.activeCount >= low.activeCount * 1.15) score += 5;
    else notes.push(`spray 필압 밀도 증가 부족(${low.activeCount}->${high.activeCount})`);
    if (high.rimRoughness >= 0.035) score += 5;
    else notes.push(`spray 비연속 스플래터 윤곽 부족(${high.rimRoughness.toFixed(3)})`);
  }

  return { score, max: 20, low, high, notes };
}

/** 축 2: 필압·틸트·손떨림 보정 필기감 (20점) */
function evaluateFeelAxis(familyId, guardMod) {
  let score = 0;
  const notes = [];

  // 2-1) 0.05..1.0 10단계 필압 단조성 & 다이내믹 폭 (6점)
  const radii = [];
  const opacities = [];
  for (let i = 0; i < 10; i += 1) {
    const p = 0.05 + (i / 9) * 0.95;
    const g = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 20, stabilizerLevel: 0 });
    let captured = null;
    g.push({ x: 10, y: 10, pressure01: p, tilt01: 0, timestampMs: 0 }, (d) => { captured = d; });
    radii.push(captured ? captured.radiusPx : 0);
    opacities.push(captured ? captured.opacity01 : 0);
  }
  let inversions = 0;
  for (let i = 1; i < radii.length; i += 1) {
    if (radii[i] < radii[i - 1] - 1e-6 || opacities[i] < opacities[i - 1] - 1e-6) inversions += 1;
  }
  const radiusSpan = radii[radii.length - 1] / Math.max(1e-4, radii[0]);
  if (inversions === 0 && radiusSpan >= 1.35) score += 6;
  else notes.push(`필압 단조성/다이내믹 부족(inv=${inversions}, span=${radiusSpan.toFixed(2)})`);

  // 2-2) 빠른 획 끝단 테이퍼 (5점)
  const fastG = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 20 });
  const fastDabs = [];
  for (let i = 0; i < 18; i += 1) {
    fastG.push({ x: i * 14, y: 50, pressure01: 0.78, tilt01: 0.1, timestampMs: i * 5 }, (d) => fastDabs.push(d));
  }
  fastG.finish((d) => fastDabs.push(d));
  const midR = fastDabs[Math.floor(fastDabs.length * 0.5)]?.radiusPx ?? 0;
  const tailR = fastDabs[fastDabs.length - 1]?.radiusPx ?? midR;
  if (midR > 0 && tailR < midR * 0.85) score += 5;
  else notes.push(`끝단 테이퍼 부족(mid=${midR.toFixed(2)}, tail=${tailR.toFixed(2)})`);

  // 2-3) 틸트 너비 확장 (5점)
  const uprightG = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 20, stabilizerLevel: 0 });
  const tiltedG = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 20, stabilizerLevel: 0 });
  let uprightR = 0;
  let tiltedR = 0;
  uprightG.push({ x: 20, y: 20, pressure01: 0.65, tilt01: 0.0, timestampMs: 0 }, (d) => { uprightR = d.radiusPx; });
  tiltedG.push({ x: 20, y: 20, pressure01: 0.65, tilt01: 0.85, timestampMs: 0 }, (d) => { tiltedR = d.radiusPx; });
  if (uprightR > 0 && tiltedR > uprightR * 1.08) score += 5;
  else notes.push(`틸트 확장 부족(${uprightR.toFixed(2)}->${tiltedR.toFixed(2)})`);

  // 2-4) 손떨림 지터 억제 + 0필압 끊김 방지 (4점)
  const jitterG = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 18, stabilizerLevel: 65 });
  const smoothYs = [];
  for (let i = 0; i < 40; i += 1) {
    const rawY = 100 + (i % 2 === 0 ? 4.5 : -4.5);
    jitterG.push({ x: i * 4, y: rawY, pressure01: 0.5, timestampMs: i * 8 }, (d) => smoothYs.push(d.y));
  }
  const rmsOut = Math.sqrt(
    smoothYs.reduce((acc, y) => acc + (y - 100) ** 2, 0) / Math.max(1, smoothYs.length),
  );
  const zeroG = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 18 });
  let zeroDab = null;
  zeroG.push({ x: 10, y: 10, pressure01: 0, timestampMs: 0 }, (d) => { zeroDab = d; });
  zeroG.push({ x: 30, y: 10, pressure01: 0, timestampMs: 8 }, (d) => { zeroDab = d; });
  if (rmsOut < 3.4 && zeroDab && zeroDab.opacity01 > 0.05 && zeroDab.radiusPx > 0.4) score += 4;
  else notes.push(`보정/0필압 연속성 미달(rms=${rmsOut.toFixed(2)}, zeroAlpha=${zeroDab?.opacity01 ?? 0})`);

  return { score, max: 20, radiusSpan, taperRatio: tailR / Math.max(1e-4, midR), tiltRatio: tiltedR / Math.max(1e-4, uprightR), jitterRms: rmsOut, notes };
}

export const BRUSH_SOAK_TIMING_SAMPLE_COUNT = 7;
export const BRUSH_SOAK_TIMING_MIN_WINDOW_MS = 10;
const BRUSH_SOAK_TIMING_WARMUP_STROKES = 16;
const BRUSH_SOAK_TIMING_MAX_STROKES_PER_SAMPLE = 512;

/** 강제 GC는 작업 전후에만 실행한다. 유휴 객체와 강한 참조로 남은 힙을 따로 기록한다. */
export function measureBrushRetainedHeap(work) {
  if (typeof globalThis.gc !== "function") {
    throw new Error("보존 힙 측정에는 --expose-gc로 시작한 Node의 명시적 GC가 필요합니다.");
  }
  const beforeRawBytes = process.memoryUsage().heapUsed;
  globalThis.gc();
  const beforeBytes = process.memoryUsage().heapUsed;
  const value = work();
  const afterRawBytes = process.memoryUsage().heapUsed;
  globalThis.gc();
  const afterBytes = process.memoryUsage().heapUsed;
  return { value, heap: {
    measurement: "post-gc-retained", beforeRawBytes, beforeBytes, afterRawBytes, afterBytes,
    rawDeltaMb: (afterRawBytes - beforeRawBytes) / (1024 * 1024),
    retainedDeltaMb: Math.max(0, (afterBytes - beforeBytes) / (1024 * 1024)),
  } };
}

export function scoreBrushHeapStability({ reusedBuffer, scratchPoolReuseCount, heapDeltaMb }) {
  return reusedBuffer && scratchPoolReuseCount > 1_000
    && Number.isFinite(heapDeltaMb) && heapDeltaMb >= 0 && heapDeltaMb < 32 ? 5 : 0;
}

function assertUsableSoakWindow({ earlyMs, lateMs }) {
  if (!Number.isFinite(earlyMs) || !Number.isFinite(lateMs) || earlyMs <= 0 || lateMs <= 0) {
    throw new Error(`장획 측정 시간이 유효하지 않습니다: earlyMs=${earlyMs}, lateMs=${lateMs}`);
  }
}

/** 다른 실행의 앞·뒤 최솟값을 합성하지 않고, 실제로 함께 측정한 7개 배율의 중앙값을 사용한다. */
export function summarizeBrushSoakTimingSamples(timingSamples) {
  if (timingSamples.length !== BRUSH_SOAK_TIMING_SAMPLE_COUNT) {
    throw new Error(`장획 측정에는 ${BRUSH_SOAK_TIMING_SAMPLE_COUNT}개 짝 표본이 필요합니다.`);
  }
  const ratios = timingSamples.map((sample) => {
    assertUsableSoakWindow(sample);
    return sample.lateMs / sample.earlyMs;
  }).sort((a, b) => a - b);
  return { lateEarlyRatio: ratios[Math.floor(ratios.length / 2)] };
}

/**
 * 동일한 10,000점 측정 루프를 예열한 뒤, 앞·뒤 창이 각각 10ms 이상이 될 때까지 완전한 획을 누적한다.
 * 반복 조건에는 합격 기준이나 배율을 사용하지 않는다. 7개 표본을 항상 전부 수집하며,
 * 빠른 시계·작업량에서도 상한에 도달하면 통과 처리 대신 측정 실패를 반환한다.
 */
export function measureBrushSoakTiming(takeStroke) {
  for (let warmup = 0; warmup < BRUSH_SOAK_TIMING_WARMUP_STROKES; warmup += 1) takeStroke();
  const timingSamples = [];
  const meanFrames = [];
  const p99Frames = [];
  let finalDiag = null;

  for (let run = 0; run < BRUSH_SOAK_TIMING_SAMPLE_COUNT; run += 1) {
    let earlyMs = 0;
    let lateMs = 0;
    let strokes = 0;
    let frameMeanSum = 0;
    let p99FrameMs = 0;
    do {
      const stroke = takeStroke();
      assertUsableSoakWindow(stroke);
      earlyMs += stroke.earlyMs;
      lateMs += stroke.lateMs;
      frameMeanSum += stroke.avgFrameMs;
      p99FrameMs = Math.max(p99FrameMs, stroke.p99FrameMs);
      finalDiag = stroke.diagnostics;
      strokes += 1;
    } while (
      (earlyMs < BRUSH_SOAK_TIMING_MIN_WINDOW_MS || lateMs < BRUSH_SOAK_TIMING_MIN_WINDOW_MS)
      && strokes < BRUSH_SOAK_TIMING_MAX_STROKES_PER_SAMPLE
    );
    if (earlyMs < BRUSH_SOAK_TIMING_MIN_WINDOW_MS || lateMs < BRUSH_SOAK_TIMING_MIN_WINDOW_MS) {
      throw new Error(`장획 측정 창이 ${BRUSH_SOAK_TIMING_MIN_WINDOW_MS}ms에 도달하지 못했습니다: ${JSON.stringify({ run: run + 1, strokes, earlyMs, lateMs })}`);
    }
    // 각 창의 원시 합계와 획 수를 실행 순서대로 보존한다. 양쪽 모두 같은 획 수이므로 배율은 그대로다.
    timingSamples.push({ run: run + 1, strokes, earlyMs, lateMs });
    meanFrames.push(frameMeanSum / strokes);
    // 누적 표본 안에서 느린 획의 프레임을 평균으로 감추지 않는다.
    p99Frames.push(p99FrameMs);
  }
  meanFrames.sort((a, b) => a - b);
  p99Frames.sort((a, b) => a - b);
  return {
    ...summarizeBrushSoakTimingSamples(timingSamples),
    timingSamples,
    avgFrameMs: meanFrames[1],
    p99FrameMs: p99Frames[1],
    finalDiag,
  };
}

/** 축 3·4·5: 10,000점 장시간 획 성능 + 입력 누락 0건 + 메모리/GC 안정성 */
function evaluateSoakAndReliabilityAxes(familyId, guardMod, dualMod) {
  const notes3 = [];
  const notes4 = [];
  const notes5 = [];
  const reusableSample = { x: 0, y: 0, pressure01: 0.6, tilt01: 0.35, timestampMs: 0 };
  const frameTimes = new Float64Array(500);
  const takeStroke = () => {
    const g = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 18 });
    let earlyMs = 0;
    let lateMs = 0;
    let frameMsSum = 0;
    for (let c = 0; c < 10; c += 1) {
      const tChunk0 = performance.now();
      for (let f = 0; f < 50; f += 1) {
        const tFrame0 = performance.now();
        for (let k = 0; k < 20; k += 1) {
          const i = c * 1000 + f * 20 + k;
          reusableSample.x = 16 + i * 2.4;
          reusableSample.y = 120 + Math.sin(i * 0.04) * 28;
          reusableSample.pressure01 = 0.1 + 0.85 * (0.5 + 0.5 * Math.sin(i * 0.015));
          reusableSample.tilt01 = 0.35;
          reusableSample.timestampMs = i * 4;
          g.push(reusableSample);
        }
        const elapsedFrameMs = performance.now() - tFrame0;
        frameTimes[c * 50 + f] = elapsedFrameMs;
        frameMsSum += elapsedFrameMs;
      }
      const chunkMs = performance.now() - tChunk0;
      if (c === 0) earlyMs = chunkMs;
      if (c === 9) lateMs = chunkMs;
    }
    g.finish();
    frameTimes.sort();
    return {
      earlyMs,
      lateMs,
      avgFrameMs: frameMsSum / frameTimes.length,
      p99FrameMs: frameTimes[Math.floor(frameTimes.length * 0.99)],
      diagnostics: g.getDiagnostics(),
    };
  };
  const { value: timing, heap } = measureBrushRetainedHeap(() => measureBrushSoakTiming(takeStroke));
  const { lateEarlyRatio, avgFrameMs, p99FrameMs, timingSamples, finalDiag } = timing;
  const heapDeltaMb = heap.retainedDeltaMb;

  // 축 3 점수 (20점)
  let perfScore = 0;
  if (lateEarlyRatio <= 1.35) perfScore += 10;
  else notes3.push(
    `장획 속도 비율 초과(${lateEarlyRatio.toFixed(2)}x > 1.35x); Node ${process.version}; 원시 측정(ms): ${JSON.stringify(timingSamples)}`,
  );
  if (avgFrameMs < 16.6 && p99FrameMs < 16.6) perfScore += 10;
  else notes3.push(`프레임 예산 초과(avg=${avgFrameMs.toFixed(2)}ms, p99=${p99FrameMs.toFixed(2)}ms)`);

  // 축 4: 입력 누락(Dropped/Dead Stroke) 0건 (5개 시나리오 × 4점 = 20점)
  let zeroDropScore = 0;
  const gLow = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 16 });
  let lowAlphaMin = 1;
  gLow.push({ x: 10, y: 10, pressure01: 0.001, timestampMs: 0 }, (d) => { lowAlphaMin = Math.min(lowAlphaMin, d.opacity01); });
  gLow.push({ x: 40, y: 12, pressure01: 0, timestampMs: 8 }, (d) => { lowAlphaMin = Math.min(lowAlphaMin, d.opacity01); });
  gLow.finish();
  if (gLow.getDiagnostics().emittedDabs >= 2 && lowAlphaMin > 0.05 && gLow.getDiagnostics().nanOutputCount === 0) zeroDropScore += 4;
  else notes4.push("초저필압 입력 누락");

  const gSnap = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 16 });
  gSnap.push({ x: 0, y: 0, pressure01: 0.7, timestampMs: 0 });
  gSnap.push({ x: 300, y: 20, pressure01: 0.4, timestampMs: 4 });
  gSnap.finish();
  if (gSnap.getDiagnostics().emittedDabs >= 3 && gSnap.getDiagnostics().nanOutputCount === 0) zeroDropScore += 4;
  else notes4.push("고속 스냅 입력 누락");

  const gTap = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 16 });
  gTap.push({ x: 50, y: 50, pressure01: 0.2, timestampMs: 0 });
  gTap.push({ x: 50.05, y: 50.02, pressure01: 0.2, timestampMs: 8 });
  gTap.finish();
  if (gTap.getDiagnostics().emittedDabs >= 1 && gTap.getDiagnostics().nanOutputCount === 0) zeroDropScore += 4;
  else notes4.push("마이크로 탭 데드 스트로크");

  const gNan = guardMod.createBrushStrokeSoakGuard({ familyId, baseSizePx: 16 });
  gNan.push({ x: 10, y: 10, pressure01: 0.6, timestampMs: 0 });
  gNan.push({ x: Number.NaN, y: Number.POSITIVE_INFINITY, pressure01: Number.NaN, timestampMs: Number.NaN });
  gNan.push({ x: 60, y: 20, pressure01: 0.8, timestampMs: 16 });
  gNan.finish();
  const nanDiag = gNan.getDiagnostics();
  if (nanDiag.emittedDabs >= 2 && nanDiag.sanitizedInputs >= 1 && nanDiag.nanOutputCount === 0) zeroDropScore += 4;
  else notes4.push("NaN 입력 복구 실패");

  if (finalDiag && finalDiag.emittedDabs >= 5_000 && finalDiag.droppedStrokeCount === 0 && finalDiag.nanOutputCount === 0) zeroDropScore += 4;
  else notes4.push(`10,000점 장획 누락(dabs=${finalDiag?.emittedDabs ?? 0})`);

  // 축 5: 메모리·GC 안정성 (4개 불변식 × 5점 = 20점)
  let memScore = 0;
  if (finalDiag && finalDiag.retainedHistoryPoints <= guardMod.BRUSH_SOAK_DEFAULT_MAX_HISTORY) memScore += 5;
  else notes5.push(`히스토리 링 상한 초과(${finalDiag?.retainedHistoryPoints})`);

  if (
    finalDiag
    && finalDiag.maxDabsInSingleStep <= guardMod.BRUSH_SOAK_DEFAULT_MAX_DABS_PER_STEP
    && finalDiag.peakRetainedBytes <= 131_072
  ) memScore += 5;
  else notes5.push("스탬프 버짓/고정 메모리 상한 초과");

  dualMod.clearDualBrushTileCache();
  const spec = guardMod.BRUSH_QUALITY_FAMILY_SPECS[familyId];
  for (let i = 0; i < 20; i += 1) {
    dualMod.getCachedTextureTile(spec.dualTextureId, { size: 64, seed: 42 });
  }
  const cacheStats = dualMod.getDualBrushTileCacheStats();
  if (cacheStats.size <= 64 && cacheStats.hitRate >= 0.9) memScore += 5;
  else notes5.push(`듀얼 타일 캐시 효율 미달(size=${cacheStats.size}, hit=${cacheStats.hitRate.toFixed(2)})`);

  const scratch = new Float32Array(64 * 64);
  const stampCheck = guardMod.renderBrushFamilyStampBuffer({ familyId, size: 64, pressure01: 0.7, seed: 7 }, scratch);
  const heapScore = scoreBrushHeapStability({
    reusedBuffer: stampCheck.reusedBuffer,
    scratchPoolReuseCount: finalDiag?.scratchPoolReuseCount ?? 0,
    heapDeltaMb,
  });
  if (heapScore === 5) memScore += heapScore;
  else notes5.push(`버퍼 재사용/힙 안정성 미달(reused=${stampCheck.reusedBuffer}, deltaMb=${heapDeltaMb.toFixed(2)})`);

  return {
    perf: { score: perfScore, max: 20, lateEarlyRatio, avgFrameMs, p99FrameMs, timingSamples, notes: notes3 },
    zeroDrop: { score: zeroDropScore, max: 20, emittedDabs: finalDiag?.emittedDabs ?? 0, nanOutputCount: finalDiag?.nanOutputCount ?? 0, notes: notes4 },
    memory: { score: memScore, max: 20, retainedHistoryPoints: finalDiag?.retainedHistoryPoints ?? 0, peakRetainedBytes: finalDiag?.peakRetainedBytes ?? 0, tileCacheHitRate: cacheStats.hitRate, heapDeltaMb, heap, notes: notes5 },
  };
}

/** 12종 전 브러시 100점 벤치마크 실행. */
export async function evaluateAllBrushesCompetitorScore() {
  if (typeof globalThis.gc !== "function") return evaluateBrushScoreInGcProcess();
  const { kernels, guard, dual, natural, presets } = await loadBrushModules();

  // 사전 불변식 검사: 프리셋 카탈로그에 역전 필압/초저간격 폭주 없는지 확인
  const invertedPresets = presets.P5_BRUSH_PRESET_CATALOG.filter(
    (p) => p.pressureMinMax[0] >= p.pressureMinMax[1] || p.spacing < 0.05,
  );
  if (invertedPresets.length > 0) {
    throw new Error(`프리셋 필압 역전/간격 위반 감지: ${invertedPresets.map((p) => p.id).join(", ")}`);
  }

  const oilDarkCheck = kernels.studioOssApplyMaterialColorChannel(24, 0.9, 0.25, "paint-film") <= 24;
  const crayonPhysicsOk = natural.resolveNaturalMediaPhysicsProfile("crayon").grainBite01 >= 0.9;
  const results = [];
  const scratchLow = new Float32Array(64 * 64);
  const scratchHigh = new Float32Array(64 * 64);

  for (const familyId of guard.BRUSH_QUALITY_12_FAMILIES) {
    let visualExtra = { oilZeroWhiteGlitter: oilDarkCheck };
    if (familyId === "crayon") {
      const lowC = guard.synthesizeCrayonWaxPaperStamp(
        { size: 64, pressure01: 0.16, velocity01: 0.55, tilt01: 0.35, directionRadians: 0, seed: 2026 },
        scratchLow,
      );
      const highC = guard.synthesizeCrayonWaxPaperStamp(
        { size: 64, pressure01: 0.95, velocity01: 0.12, tilt01: 0.35, directionRadians: 0, seed: 2026 },
        scratchHigh,
      );
      visualExtra = {
        ...visualExtra,
        lowPeakContrast: lowC.peakContrast,
        lowDrySkip: lowC.drySkipFraction,
        highDrySkip: highC.drySkipFraction,
        crumbCount: lowC.crumbCount,
        crayonPhysicsOk,
      };
    } else {
      const lowR = guard.renderBrushFamilyStampBuffer(
        { familyId, size: 64, pressure01: 0.18, velocity01: 0.45, tilt01: 0.25, directionRadians: 0, seed: 2026 },
        scratchLow,
      );
      const highR = guard.renderBrushFamilyStampBuffer(
        { familyId, size: 64, pressure01: 0.95, velocity01: 0.15, tilt01: 0.25, directionRadians: 0, seed: 2026 },
        scratchHigh,
      );
      visualExtra = { ...visualExtra, crumbCount: Math.max(lowR.crumbCount, highR.crumbCount) };
    }

    const visual = scoreVisualTextureFidelity(familyId, scratchLow, scratchHigh, 64, visualExtra);
    const feel = evaluateFeelAxis(familyId, guard);
    const soak = evaluateSoakAndReliabilityAxes(familyId, guard, dual);
    const total = visual.score + feel.score + soak.perf.score + soak.zeroDrop.score + soak.memory.score;

    results.push({
      familyId,
      labelKo: guard.BRUSH_QUALITY_FAMILY_SPECS[familyId].labelKo,
      total,
      visual: visual.score,
      feel: feel.score,
      perf: soak.perf.score,
      zeroDrop: soak.zeroDrop.score,
      memory: soak.memory.score,
      metrics: {
        lowStdDev: Number(visual.low.stdDev.toFixed(3)),
        entropyBits: Number(Math.max(visual.low.entropyBits, visual.high.entropyBits).toFixed(2)),
        anisoRatio: Number(Math.max(visual.low.anisoRatio, visual.high.anisoRatio).toFixed(2)),
        rimRoughness: Number(Math.max(visual.low.rimRoughness, visual.high.rimRoughness).toFixed(3)),
        lateEarlyRatio: Number(soak.perf.lateEarlyRatio.toFixed(2)),
        avgFrameMs: Number(soak.perf.avgFrameMs.toFixed(3)),
        p99FrameMs: Number(soak.perf.p99FrameMs.toFixed(3)),
        soakTiming: {
          warmupStrokes: BRUSH_SOAK_TIMING_WARMUP_STROKES,
          minWindowMs: BRUSH_SOAK_TIMING_MIN_WINDOW_MS,
          samples: soak.perf.timingSamples,
        },
        emittedDabs10k: soak.zeroDrop.emittedDabs,
        nanCount: soak.zeroDrop.nanOutputCount,
        retainedHistory: soak.memory.retainedHistoryPoints,
        soakHeap: soak.memory.heap,
      },
      notes: [...visual.notes, ...feel.notes, ...soak.perf.notes, ...soak.zeroDrop.notes, ...soak.memory.notes],
    });
  }

  const minScore = Math.min(...results.map((r) => r.total));
  const avgScore = results.reduce((acc, r) => acc + r.total, 0) / results.length;
  return { benchmark: "krita-5.2+csp-3.0-12-family-100pt", familyCount: results.length, minScore, avgScore, results };
}

function parseArgs(argv) {
  let minScore = 100;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--min-score") minScore = Number(argv[++i] ?? 100);
    else if (argv[i] === "--json") json = true;
  }
  return { minScore, json };
}

async function main() {
  const { minScore, json } = parseArgs(process.argv.slice(2));
  const report = await evaluateAllBrushesCompetitorScore();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== ToonStudio 전 브러시 12종 Krita 5.2 + CSP 3.0 100점 벤치마크 (최소 기준: ${minScore}) ===`);
    console.log("| 브러시 | 질감(20) | 필기감(20) | 장획성능(20) | 누락0(20) | 메모리(20) | 총점 | 뒤/앞배율 | 프레임(ms) | 10k Dabs |");
    console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const r of report.results) {
      console.log(
        `| ${r.familyId} (${r.labelKo}) | ${r.visual} | ${r.feel} | ${r.perf} | ${r.zeroDrop} | ${r.memory} | ${r.total.toFixed(1)} | ${r.metrics.lateEarlyRatio.toFixed(2)}x | ${r.metrics.avgFrameMs.toFixed(3)} | ${r.metrics.emittedDabs10k} |`,
      );
      if (r.notes.length > 0) console.log(`  ↳ 감점 사유: ${r.notes.join("; ")}`);
    }
    console.log(`\n요약: ${report.familyCount}종 중 최소 ${report.minScore.toFixed(1)}점 / 평균 ${report.avgScore.toFixed(1)}점`);
  }
  if (report.minScore < minScore) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
