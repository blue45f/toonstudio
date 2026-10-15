/**
 * 개발 전용: 잠재 안료 혼합기의 초기화 비용·처리량·색역 잔차·왕복 정확도를 측정해 출력한다.
 * 운영 번들과 CI에 포함되지 않는다. 문서(docs/features/latent-pigment-mixing.md)의 측정치는 이 스크립트 출력이다.
 *
 * 사용법:  pnpm exec tsx scripts/dev/latent-pigment-report.mts
 * 내부 모드: --cold=init | --cold=solve  새 프로세스의 첫 호출 시간(밀리초)만 JSON 한 줄로 출력한다.
 *   init  잠재 → RGB 변환(이 함수도 첫 호출에 지연 초기화를 일으킨다)을 풀이기보다 먼저 불러 초기화 비용을 따로 잰다.
 *   solve 풀이부터 불러 사용자가 처음 겪는 비용(초기화 + 풀이기 JIT + 풀이)을 잰다.
 *
 * 측정값은 기계·부하에 따라 달라진다. 실행 환경(Node 버전·CPU)을 함께 기록하세요.
 */
import { spawnSync } from "node:child_process";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  isLatentPigmentMixerInitialized,
  latentPigmentToRgb,
  mixRgbPigments,
  rgbToLatentPigment,
} from "../../apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-mixer";
import { COVERAGE_PRIMARY_COLORS, COVERAGE_TYPICAL_COLORS } from "../generate-latent-pigment-model.mts";

import type { LatentPigmentRgb } from "../../apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-mixer";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fromHex(hex: string): LatentPigmentRgb {
  const channel = (offset: number): number => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
}

function residualEightBit(rgb: LatentPigmentRgb): number {
  return Math.max(...rgbToLatentPigment(rgb).residual.map((value) => Math.abs(value) * 255));
}

function timeMs(action: () => void): number {
  const started = performance.now();
  action();
  return performance.now() - started;
}

function coldStart(mode: string): void {
  const initializedBefore = isLatentPigmentMixerInitialized();
  const sample: Record<string, number | boolean> = { initializedBefore };
  if (mode === "init") {
    const latent = { concentrations: [0.25, 0.25, 0.25, 0.25], residual: [0, 0, 0] } as const;
    sample.firstConversionMs = timeMs(() => { latentPigmentToRgb(latent); });
    sample.secondConversionMs = timeMs(() => { latentPigmentToRgb(latent); });
  }
  sample.firstSolveMs = timeMs(() => { rgbToLatentPigment([0.5, 0.5, 0.5]); });
  sample.secondSolveMs = timeMs(() => { rgbToLatentPigment([0.25, 0.5, 0.75]); });
  console.log(JSON.stringify({ mode, initializedAfter: isLatentPigmentMixerInitialized(), ...sample }));
}

function runCold(mode: "init" | "solve"): object {
  const result = spawnSync(process.execPath, ["--import", "tsx", SCRIPT_PATH, `--cold=${mode}`], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`냉시동 측정 실패: ${result.stderr}`);
  const parsed: unknown = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}");
  if (typeof parsed !== "object" || parsed === null) throw new Error("냉시동 측정 출력을 해석하지 못했습니다.");
  if (Reflect.get(parsed, "initializedBefore") !== false) throw new Error("모듈을 불러온 것만으로 초기화가 일어났습니다.");
  return parsed;
}

function numberField(sample: object, key: string): number {
  const value: unknown = Reflect.get(sample, key);
  if (typeof value !== "number") throw new Error(`냉시동 측정 출력에 ${key} 가 없습니다.`);
  return value;
}

function measureCold(runs: number): void {
  const initRuns = Array.from({ length: runs }, () => runCold("init"));
  const solveRuns = Array.from({ length: runs }, () => runCold("solve"));
  const middle = (samples: readonly object[], key: string): number => median(samples.map((sample) => numberField(sample, key)));
  const initCost = median(initRuns.map((sample) => numberField(sample, "firstConversionMs") - numberField(sample, "secondConversionMs")));
  console.log(`초기화·냉시동 비용(새 프로세스 ${runs}회씩 중앙값, 모듈 import 이후):`);
  console.log(`  지연 초기화 ≈ ${initCost.toFixed(2)}ms (첫 잠재→RGB 호출 ${middle(initRuns, "firstConversionMs").toFixed(2)}ms − 둘째 호출 ${middle(initRuns, "secondConversionMs").toFixed(3)}ms)`);
  console.log(`  초기화 이후 첫 풀이 ${middle(initRuns, "firstSolveMs").toFixed(2)}ms (풀이기 JIT 포함) · 둘째 풀이 ${middle(initRuns, "secondSolveMs").toFixed(3)}ms`);
  console.log(`  풀이부터 부른 첫 호출 ${middle(solveRuns, "firstSolveMs").toFixed(2)}ms (초기화 + JIT + 풀이) · 둘째 호출 ${middle(solveRuns, "secondSolveMs").toFixed(3)}ms`);
}

function measureThroughput(): void {
  const random = createRandom(2026);
  const count = 100_000;
  const colors = Array.from({ length: count }, (): LatentPigmentRgb => [random(), random(), random()]);
  for (let index = 0; index < 5000; index += 1) rgbToLatentPigment(colors[index]); // 워밍업
  let sink = 0;
  let started = performance.now();
  const latents = colors.map((color) => rgbToLatentPigment(color));
  const toLatentMs = performance.now() - started;
  started = performance.now();
  for (const latent of latents) sink += latentPigmentToRgb(latent)[0];
  const toRgbMs = performance.now() - started;
  started = performance.now();
  for (let index = 0; index < 50_000; index += 1) {
    sink += mixRgbPigments([{ rgb: colors[index], weight: 0.4 }, { rgb: colors[index + 1], weight: 0.6 }])[0];
  }
  const mixMs = performance.now() - started;
  console.log(`  RGB→잠재  ${(toLatentMs / count * 1000).toFixed(1)}µs/건 (${Math.round(count / toLatentMs * 1000).toLocaleString("ko-KR")}건/초)`);
  console.log(`  잠재→RGB  ${(toRgbMs / count * 1000).toFixed(2)}µs/건 (${Math.round(count / toRgbMs * 1000).toLocaleString("ko-KR")}건/초)`);
  console.log(`  두 색 혼합(풀이 2회 포함)  ${(mixMs / 50_000 * 1000).toFixed(1)}µs/건 (${Math.round(50_000 / mixMs * 1000).toLocaleString("ko-KR")}건/초)  [${sink > 0 ? "검산 통과" : ""}]`);
}

function measureAccuracy(): void {
  const random = createRandom(7);
  let mismatches = 0;
  let worstFloat = 0;
  const samples = 200_000;
  for (let index = 0; index < samples; index += 1) {
    const bytes = [Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256)];
    const rgb: LatentPigmentRgb = [bytes[0] / 255, bytes[1] / 255, bytes[2] / 255];
    const back = latentPigmentToRgb(rgbToLatentPigment(rgb));
    if (back.some((value, channel) => Math.round(value * 255) !== bytes[channel])) mismatches += 1;
    worstFloat = Math.max(worstFloat, ...back.map((value, channel) => Math.abs(value - rgb[channel])));
  }
  console.log(`  8비트 왕복 ${samples.toLocaleString("ko-KR")}건: 불일치 ${mismatches}건 · 부동소수 최대 오차 ${worstFloat.toExponential(2)}`);
  let exhaustive = 0;
  for (let level = 0; level < 256; level += 1) {
    for (const [r, g, b] of [[level, level, level], [level, 0, 0], [0, level, 0], [0, 0, level]]) {
      const back = latentPigmentToRgb(rgbToLatentPigment([r / 255, g / 255, b / 255]));
      if (Math.round(back[0] * 255) !== r || Math.round(back[1] * 255) !== g || Math.round(back[2] * 255) !== b) exhaustive += 1;
    }
  }
  console.log(`  회색·채널 램프 1024건 전수: 불일치 ${exhaustive}건`);
}

function measureResiduals(): void {
  const typical = COVERAGE_TYPICAL_COLORS.map((hex) => residualEightBit(fromHex(hex)));
  const primaries = COVERAGE_PRIMARY_COLORS.map((hex) => residualEightBit(fromHex(hex)));
  const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  console.log(`  실사용 색 27개 잔차(채널 최대, /255): 평균 ${mean(typical).toFixed(1)} · 최대 ${Math.max(...typical).toFixed(1)} · 잔차 10 이하 ${typical.filter((value) => value <= 10).length}개`);
  const worst = COVERAGE_TYPICAL_COLORS.map((hex, index) => `#${hex}:${typical[index].toFixed(0)}`).sort((a, b) => Number(b.split(":")[1]) - Number(a.split(":")[1])).slice(0, 6);
  console.log(`    큰 쪽: ${worst.join(" ")}`);
  console.log(`  sRGB 원색 6개 잔차(채널 최대, /255): 평균 ${mean(primaries).toFixed(1)} · 최대 ${Math.max(...primaries).toFixed(1)}`);
  const grid: number[] = [];
  for (let r = 0; r <= 5; r += 1) for (let g = 0; g <= 5; g += 1) for (let b = 0; b <= 5; b += 1) grid.push(residualEightBit([r / 5, g / 5, b / 5]));
  console.log(`  RGB 큐브 6³=216색 잔차(채널 최대, /255): 평균 ${mean(grid).toFixed(1)} · 중앙값 ${median(grid).toFixed(1)} · 최대 ${Math.max(...grid).toFixed(1)} · 잔차 10 이하 ${grid.filter((value) => value <= 10).length}개`);
}

function measureNeutrality(): void {
  let worst = 0;
  for (const first of [0, 16, 32, 64, 96, 128, 160, 192, 224, 255]) {
    for (const second of [0, 16, 32, 64, 96, 128, 160, 192, 224, 255]) {
      for (const weight of [0.25, 0.5, 0.75]) {
        const mixed = mixRgbPigments([
          { rgb: [first / 255, first / 255, first / 255], weight: 1 - weight },
          { rgb: [second / 255, second / 255, second / 255], weight },
        ]);
        worst = Math.max(worst, (Math.max(...mixed) - Math.min(...mixed)) * 255);
      }
    }
  }
  console.log(`  회색 쌍 혼합 300건의 최대 채널 편차: ${worst.toFixed(1)} / 255`);
}

function printSamples(): void {
  const hex = (rgb: LatentPigmentRgb): string => `#${rgb.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`;
  const pairs: readonly (readonly [string, string])[] = [
    ["ffe000", "0050dc"], ["fdd835", "2a6fdb"], ["ff0000", "ffff00"], ["ff0000", "0000ff"],
    ["ffffff", "e53935"], ["ffffff", "0050dc"], ["ffffff", "000000"], ["d81b60", "2a6fdb"],
  ];
  console.log("  색 쌍 (50:50)       안료 혼합     선형 평균");
  for (const [a, b] of pairs) {
    const first = fromHex(a);
    const second = fromHex(b);
    const mixed = mixRgbPigments([{ rgb: first, weight: 1 }, { rgb: second, weight: 1 }]);
    const average: LatentPigmentRgb = [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2, (first[2] + second[2]) / 2];
    console.log(`  #${a} + #${b}   ${hex(mixed)}     ${hex(average)}`);
  }
}

function main(argv: readonly string[]): void {
  const coldMode = argv.find((argument) => argument.startsWith("--cold="));
  if (coldMode !== undefined) {
    coldStart(coldMode.slice("--cold=".length));
    return;
  }
  console.log(`환경: Node ${process.version} · ${os.cpus()[0]?.model ?? "CPU 정보 없음"} · 논리 코어 ${os.cpus().length} · 부하 평균 ${os.loadavg()[0].toFixed(1)}`);
  measureCold(9);
  console.log("처리량(워밍업 후, 임의 색 10만 건):");
  measureThroughput();
  console.log("왕복 정확도:");
  measureAccuracy();
  console.log("색역 잔차(잔차가 작을수록 안료다운 혼합이 유지된다):");
  measureResiduals();
  console.log("중립성:");
  measureNeutrality();
  console.log("혼색 예시:");
  printSamples();
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
