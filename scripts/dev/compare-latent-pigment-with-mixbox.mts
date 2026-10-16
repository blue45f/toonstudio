/**
 * 개발 전용 참고 비교: 자체 잠재 안료 혼합기와 `mixbox` 패키지의 혼색을 같은 색 쌍 격자에서 비교한다.
 *
 * clean-room 규칙: 이 스크립트는 `mixbox` 패키지를 **블랙박스 함수 호출**로만 쓴다. 패키지의 소스·상수·격자표를
 * 열거하거나 읽지 않고, 출력값을 시험 기대값이나 상수로 쓰지 않는다. 패키지가 해석되지 않으면(설치되어 있지 않으면)
 * 아무것도 하지 않고 종료 코드 0으로 끝난다. 운영 번들과 CI에 포함되지 않는다.
 * 결과는 문서에 "참고 수치"로만 적는다(품질 판정이나 합격 기준이 아니다).
 *
 * 비교 지표
 *  - ΔE2000: 두 혼색 결과의 CIEDE2000 색차(평균·중앙값·최대).
 *  - 방향 일치율: 선형 RGB 평균(안료 혼합이 아닌 기준)에서 각 혼색 결과로 향하는 CIELAB 벡터의 방향이
 *    둘 사이에서 같은 쪽(코사인 > 0)인 비율, 그리고 명도(L*) 이동 부호가 같은 비율.
 *
 * 사용법:  pnpm exec tsx scripts/dev/compare-latent-pigment-with-mixbox.mts
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { mixRgbPigments } from "../../apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-mixer";

import type { LatentPigmentRgb } from "../../apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-mixer";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

type Lab = readonly [number, number, number];

/** 순수 sRGB 팔레트 12색: 원색·보조색·실사용 색을 섞는다. */
export const COMPARISON_PALETTE: readonly string[] = Object.freeze([
  "ffffff", "000000", "e53935", "fdd835", "2a6fdb", "4caf50", "fb8c00", "8e24aa", "f48fb1", "26a69a", "6d4c41", "9e9e9e",
]);
export const COMPARISON_WEIGHTS: readonly number[] = Object.freeze([0.25, 0.5, 0.75]);

function fromHex(hex: string): LatentPigmentRgb {
  const channel = (offset: number): number => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
}

function rgbToHex(rgb: LatentPigmentRgb): string {
  return rgb.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("");
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** sRGB(0~1) → CIELAB(D65, 2°). */
export function srgbToLab(rgb: LatentPigmentRgb): Lab {
  const [r, g, b] = rgb.map(srgbToLinear);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000 색차(Sharma·Wu·Dalal 2005). */
export function deltaE2000(first: Lab, second: Lab): number {
  const rad = Math.PI / 180;
  const [l1, a1, b1] = first;
  const [l2, a2, b2] = second;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const meanC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number): number => {
    if (b === 0 && a === 0) return 0;
    const angle = Math.atan2(b, a) / rad;
    return angle < 0 ? angle + 360 : angle;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const deltaL = l2 - l1;
  const deltaC = c2p - c1p;
  let deltaH = 0;
  if (c1p * c2p !== 0) {
    deltaH = h2p - h1p;
    if (deltaH > 180) deltaH -= 360;
    else if (deltaH < -180) deltaH += 360;
  }
  const deltaBigH = 2 * Math.sqrt(c1p * c2p) * Math.sin((deltaH * rad) / 2);
  const meanL = (l1 + l2) / 2;
  const meanCp = (c1p + c2p) / 2;
  let meanH = h1p + h2p;
  if (c1p * c2p === 0) meanH = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) meanH /= 2;
  else meanH = (meanH + (h1p + h2p < 360 ? 360 : -360)) / 2;
  const t = 1 - 0.17 * Math.cos((meanH - 30) * rad) + 0.24 * Math.cos(2 * meanH * rad)
    + 0.32 * Math.cos((3 * meanH + 6) * rad) - 0.2 * Math.cos((4 * meanH - 63) * rad);
  const deltaTheta = 30 * Math.exp(-(((meanH - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
  const sc = 1 + 0.045 * meanCp;
  const sh = 1 + 0.015 * meanCp * t;
  const rt = -Math.sin(2 * deltaTheta * rad) * rc;
  return Math.sqrt(
    (deltaL / sl) ** 2 + (deltaC / sc) ** 2 + (deltaBigH / sh) ** 2 + rt * (deltaC / sc) * (deltaBigH / sh),
  );
}

function selfCheck(): void {
  // Sharma 등의 논문 부록 A 시험 쌍 중 하나: ΔE00 = 2.0425.
  const value = deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]);
  if (Math.abs(value - 2.0425) > 1e-3) throw new Error(`CIEDE2000 구현 자체 점검 실패: ${value}`);
}

type Triple = readonly [first: readonly number[], second: readonly number[], weight: number];

/**
 * 순수 `node` 자식 프로세스에서 `mixbox`의 공개 함수 `lerpFloat`만 호출한다. tsx 의 tsconfig `paths` 매핑이
 * `mixbox`를 타입 선언 파일로 바꿔 버리므로 로더 훅이 없는 프로세스를 쓴다. 패키지 파일은 읽지 않는다.
 * 입력 한 줄: JSON [[첫 색, 둘째 색, 가중치], ...], 출력: JSON [[r,g,b], ...]. 패키지가 없으면 null.
 */
function lerpWithMixbox(triples: readonly Triple[]): readonly (readonly number[])[] | null {
  const program = [
    "import { readFileSync } from 'node:fs';",
    "let mixbox;",
    "try { mixbox = (await import('mixbox')).default; } catch { process.exit(3); }",
    "if (typeof mixbox?.lerpFloat !== 'function') process.exit(3);",
    "const triples = JSON.parse(readFileSync(0, 'utf8'));",
    "process.stdout.write(JSON.stringify(triples.map(([a, b, t]) => mixbox.lerpFloat(a, b, t))));",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
    cwd: path.join(REPO_ROOT, "apps", "web"),
    input: JSON.stringify(triples),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status === 3) return null;
  if (result.status !== 0) throw new Error(`mixbox 블랙박스 호출 실패: ${result.stderr}`);
  const parsed: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(parsed)) throw new Error("mixbox 블랙박스 출력을 해석하지 못했습니다.");
  return parsed.map((entry: unknown) => {
    if (!Array.isArray(entry) || entry.length !== 3 || entry.some((value) => typeof value !== "number")) {
      throw new Error("mixbox 블랙박스 출력 형식이 예상과 다릅니다.");
    }
    return entry.map(Number);
  });
}

function labVector(from: Lab, to: Lab): Lab {
  return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
}

function cosine(a: Lab, b: Lab): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2]);
  return norm === 0 ? 1 : dot / norm;
}

function main(): void {
  selfCheck();
  const cases: { first: LatentPigmentRgb; second: LatentPigmentRgb; weight: number }[] = [];
  for (let i = 0; i < COMPARISON_PALETTE.length; i += 1) {
    for (let j = i + 1; j < COMPARISON_PALETTE.length; j += 1) {
      for (const weight of COMPARISON_WEIGHTS) cases.push({ first: fromHex(COMPARISON_PALETTE[i]), second: fromHex(COMPARISON_PALETTE[j]), weight });
    }
  }
  const outputs = lerpWithMixbox(cases.map(({ first, second, weight }): Triple => [[...first], [...second], weight]));
  if (outputs === null) {
    console.log("mixbox 패키지가 해석되지 않아 비교를 건너뜁니다(정상 종료).");
    return;
  }
  const deltas: number[] = [];
  const labels: string[] = [];
  let sameDirection = 0;
  let sameLightness = 0;
  let directionCases = 0;
  cases.forEach(({ first, second, weight }, index) => {
    const ours = mixRgbPigments([{ rgb: first, weight: 1 - weight }, { rgb: second, weight }]);
    const [r, g, b] = outputs[index];
    const theirs: LatentPigmentRgb = [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))];
    const average: LatentPigmentRgb = [
      first[0] * (1 - weight) + second[0] * weight,
      first[1] * (1 - weight) + second[1] * weight,
      first[2] * (1 - weight) + second[2] * weight,
    ];
    const labOurs = srgbToLab(ours);
    const labTheirs = srgbToLab(theirs);
    const labAverage = srgbToLab(average);
    deltas.push(deltaE2000(labOurs, labTheirs));
    labels.push(`#${rgbToHex(first)}+#${rgbToHex(second)} 비율 ${weight}`);
    const shiftOurs = labVector(labAverage, labOurs);
    const shiftTheirs = labVector(labAverage, labTheirs);
    // 선형 평균에서 거의 벗어나지 않은 경우(ΔE76 < 3)는 방향이 의미 없으므로 방향 통계에서 뺀다.
    if (Math.hypot(...shiftOurs) >= 3 && Math.hypot(...shiftTheirs) >= 3) {
      directionCases += 1;
      if (cosine(shiftOurs, shiftTheirs) > 0) sameDirection += 1;
      if (Math.sign(shiftOurs[0]) === Math.sign(shiftTheirs[0])) sameLightness += 1;
    }
  });
  const sorted = [...deltas].sort((a, b) => a - b);
  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  console.log(`비교 대상: 팔레트 ${COMPARISON_PALETTE.length}색의 쌍 × 비율 ${COMPARISON_WEIGHTS.join("/")} = ${deltas.length}건 (mixbox 는 lerpFloat 블랙박스 호출)`);
  console.log(`ΔE2000: 평균 ${mean.toFixed(2)} · 중앙값 ${sorted[Math.floor(sorted.length / 2)].toFixed(2)} · 최대 ${sorted[sorted.length - 1].toFixed(2)}`);
  // 차이가 큰 쌍은 식별만 적는다(원본 출력값은 적지 않는다).
  const worst = deltas.map((value, index) => ({ value, label: labels[index] })).sort((a, b) => b.value - a.value).slice(0, 5);
  console.log(`차이가 큰 쌍: ${worst.map((item) => `${item.label} (ΔE ${item.value.toFixed(1)})`).join(" · ")}`);
  console.log(`방향 일치율(선형 평균 대비 이동 방향, ${directionCases}건): 색 이동 방향 ${(sameDirection / directionCases * 100).toFixed(1)}% · 명도 이동 부호 ${(sameLightness / directionCases * 100).toFixed(1)}%`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
