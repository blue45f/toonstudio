/**
 * 캐릭터 키트 검증기 (docs/authored-kit-spec.md 9절, KT-09).
 *
 * 실행: pnpm exec tsx scripts/verify-character-kit.mjs [--root <키트 폴더>] [--base female|male|all] [--json <out.json>] [--strict] [--only V1,V6,…]
 *
 * `tsx`가 `apps/character-lab/src/contracts/*`(순수 TS + zod)를 직접 읽으므로 본 이름·morph 어휘·예산 상수를 이 파일에 복제하지 않는다.
 * GLB 파싱은 루트 의존성 `@gltf-transform/core`를 쓴다. 순수 함수(`verifyKitManifest`, `verifyGlb`, `verifyUvOverlap`, `verifyMorphFollow` …)를
 * export하고 CLI는 얇게 둔다. 단위 테스트는 `scripts/verify-character-kit.test.mjs`가 합성 GLB로 통과/실패 케이스를 돌린다.
 *
 * 종료 코드: 0 = 오류 없음, 1 = 오류 있음(`--strict`면 경고 포함), 2 = 사용법 오류.
 *
 * 측정 정의(문서에 값이 없던 부분은 여기서 고정한다):
 * - 평균 휘도: 0..1로 정규화한 sRGB 인코딩 값의 휘도. PNG는 0.2126 R + 0.7152 G + 0.0722 B를 알파 가중 평균하고,
 *   JPEG는 Y 성분 8×8 블록 DC 계수의 평균(블록 평균, 가장자리 패딩 블록 포함)이다. 프로그레시브 JPEG·인터레이스 PNG는 측정하지 않고 경고한다.
 * - recolor 재질 텍스처 평균 휘도 ≥ 0.75, 단 역할 `iris`는 ≥ 0.55(리드 결정 A-2: 동공·윤부 링이 어둡다).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BODY_PARAM_KEYS,
  DEFAULT_RECIPE_COLORS,
  HUMANOID_BONE_NAMES,
  HUMANOID_BONE_PARENTS,
  KIT_BASE_IDS,
  KIT_BODY_NODE,
  KIT_BONE_MAP,
  KIT_BUDGET,
  KIT_CURRENT_VERSION,
  KIT_DEFAULT_BASE_ID,
  KIT_DEFAULT_ID,
  KIT_DEFAULT_SLOTS,
  KIT_ALLOWED_LICENSES,
  KIT_END_BONES,
  KIT_HEAD_NODE,
  KIT_HYPER3D_EVIDENCE_PREFIX,
  KIT_JOINT_COUNT,
  KIT_MANIFEST_FILENAME,
  KIT_MORPH_COVERAGE,
  KIT_MORPH_NAMES,
  KIT_PART_SLOTS,
  KIT_PART_SLOT_ROLES,
  KIT_REGION_IDS,
  KIT_REQUIRED_JOINT_OFFSET_MORPHS,
  KIT_REQUIRED_PRESETS,
  KIT_V2_SCHEMA_ID,
  OUTLINE_MESH_SUFFIX,
  AUTHORED_HAIR_MESH_PATTERN,
  SLOT_PRESET_IDS,
  isMorphTargetName,
  kitManifestObjectSchema,
  kitManifestSchema,
  kitManifestV2ObjectSchema,
  kitManifestV2Schema,
  parseExtendedMorphName,
} from "../apps/character-lab/src/contracts/index.ts";
import { deriveKitCapabilities } from "../apps/character-lab/src/domains/authored/kit-capability.ts";
import { classifyBoneNames } from "../apps/character-lab/src/domains/authored/bone-name-mapping.ts";
import { stableStringify } from "../apps/character-lab/src/shared/stable-json.ts";

import { checkContainerJson, loadGlbModel, parseGlbContainer, PointGrid, primsOf, targetNamesOf, triangleCountOf, trianglesOf, viewOf } from "./lib/character-kit-glb-model.mjs";
import { decodeImageInfo } from "./lib/character-kit-image-decode.mjs";
import * as v2 from "./lib/character-kit-v2-checks.mjs";

// 옮긴 모듈의 공개 함수는 이 검증기의 공개 API로 계속 내보낸다(시험·도구 호환).
export { checkContainerJson, decodeImageInfo, loadGlbModel, parseGlbContainer };
export const { V2_CHECKS, V2_LIMITS } = v2;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_KIT_ROOT = path.join(REPO_ROOT, "apps/character-lab/public/assets/characters/toonstudio-kit-v1");

// ---------------------------------------------------------------- 검사 목록·임계값

export const CHECKS = Object.freeze([
  { id: "V1", title: "manifest 스키마·상수" },
  { id: "V2", title: "파일 존재·크기·SHA-256" },
  { id: "V3", title: "용량 예산" },
  { id: "V4", title: "출처·라이선스" },
  { id: "V5", title: "glTF 컨테이너·확장" },
  { id: "V6", title: "이름·스켈레톤·메시 집합" },
  { id: "V7", title: "변환·스케일·기준 치수" },
  { id: "V8", title: "스킨" },
  { id: "V9", title: "morph" },
  { id: "V10", title: "영역 범위" },
  { id: "V11", title: "삼각형 예산·메시 선언" },
  { id: "V12", title: "UV" },
  { id: "V13", title: "재질·텍스처" },
  { id: "V14", title: "헤어 LOD·COLOR_0" },
  { id: "V15", title: "외곽선 셸 금지" },
  { id: "V16", title: "프리셋 어휘·필수 파츠" },
  { id: "V17", title: "슬롯 능력 선언" },
  { id: "V18", title: "관절 오프셋" },
  { id: "V19", title: "물리(정적)" },
  { id: "V20", title: "메시 무결성" },
]);
const CHECK_IDS = CHECKS.map((check) => check.id);
/** 키트 v2 manifest에서만 도는 검사까지 합친 목록(v1 키트 보고서는 `CHECKS`만 담아 예전과 같다) */
const ALL_CHECKS = Object.freeze([...CHECKS, ...v2.V2_CHECKS]);
const ALL_CHECK_IDS = ALL_CHECKS.map((check) => check.id);
const V2_CHECK_IDS = v2.V2_CHECKS.map((check) => check.id);
/** GLB를 열어야 하는 검사(`verifyGlb`가 도는 v1 집합). v2 전용 검사도 GLB가 필요하다(`NEEDS_GLB_IDS`). */
const GLB_CHECK_IDS = new Set(["V5", "V6", "V7", "V8", "V9", "V10", "V11", "V12", "V13", "V14", "V15", "V18", "V20"]);
const NEEDS_GLB_IDS = new Set([...GLB_CHECK_IDS, ...V2_CHECK_IDS]);

/** recolor 텍스처 평균 휘도 하한(계약 3.6) */
export const RECOLOR_MIN_MEAN_LUMINANCE = 0.75;
/** 역할 iris만 완화된 하한(리드 결정 A-2) */
export const IRIS_RECOLOR_MIN_MEAN_LUMINANCE = 0.55;
/** 고정색 eye-highlight 재질의 최소 휘도(리드 결정 A-1: 고정색 흰색) */
export const HIGHLIGHT_MIN_LUMINANCE = 0.85;

function hexLuminance(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) / 255;
}

export const LIMITS = Object.freeze({
  /** V9 이음매: 같은 위치로 보는 거리, 공유 타깃 델타 허용 차 */
  seamPositionToleranceM: 1e-6,
  seamDeltaToleranceM: 1e-5,
  /** V9 델타 상한·하한(m) */
  bodyMorphMaxM: 0.15,
  faceMorphMaxM: 0.05,
  morphMinMaxM: 1e-5,
  /** V9 따라가기 편차(m) */
  followWarnM: 0.005,
  followErrorM: 0.015,
  /** 따라가기에서 가장 가까운 기준 정점을 찾는 최대 거리(m). 이보다 먼 정점(치마 밑단 등)은 비교하지 않고 센다. */
  followSearchRadiusM: 0.06,
  /** V18 관절 오프셋 독립 대조(m) */
  jointOffsetWarnM: 0.01,
  jointOffsetErrorM: 0.025,
  /** V7 */
  heightTolerance: 0.02,
  soleToleranceM: 0.005,
  boundsToleranceM: 0.02,
  /** V12 */
  uvRangeMargin: 0.001,
  uvOverlapMaxRatio: 0.002,
  uvStretchP99Ratio: 4,
  uvRasterSize: 1024,
  /** V20 */
  normalLengthTolerance: 0.05,
  normalLengthFraction: 0.999,
  /** V14: COLOR_0 회색 허용 오차 */
  grayTolerance: 1 / 255,
  /** 삼각형 퇴화 면적(m²) */
  degenerateAreaM2: 1e-12,
});

// ---------------------------------------------------------------- 보고서

/** 검사 결과 수집기. 수준은 "error" | "warning" 두 가지다. */
export class Report {
  /** @param {Iterable<string>} selected 이번에 실행하는 검사 id */
  constructor(selected = CHECK_IDS) {
    this.selected = new Set(selected);
    /** 요약에 싣는 검사 목록(키트 v2면 V21~V24까지) */
    this.checks = CHECKS;
    /** @type {Array<{id: string, level: "error" | "warning", where: string, message: string}>} */
    this.findings = [];
    /** @type {Record<string, unknown>} */
    this.metrics = {};
    /** @type {Map<string, string>} */
    this.skipped = new Map();
    this.executed = new Set();
  }

  wants(id) {
    return this.selected.has(id);
  }

  /** 선택하지 않은 검사라도 선행 조건 실패를 보여 주기 위해 결과에 포함시킨다. */
  require(id) {
    this.selected.add(id);
  }

  /** 검사를 시작했음을 기록한다(통과 판정에 필요). */
  begin(id) {
    if (this.wants(id)) this.executed.add(id);
  }

  skip(id, reason) {
    if (this.wants(id) && !this.executed.has(id)) this.skipped.set(id, reason);
  }

  add(id, level, where, message) {
    if (!this.wants(id)) return;
    this.executed.add(id);
    this.findings.push({ id, level, where, message });
  }

  error(id, where, message) {
    this.add(id, "error", where, message);
  }

  warn(id, where, message) {
    this.add(id, "warning", where, message);
  }

  metric(key, value) {
    this.metrics[key] = value;
  }

  count(level, id) {
    return this.findings.filter((finding) => finding.level === level && (id === undefined || finding.id === id)).length;
  }

  summary() {
    const checks = {};
    for (const { id, title } of this.checks) {
      if (!this.wants(id)) continue;
      const errors = this.count("error", id);
      const warnings = this.count("warning", id);
      const executed = this.executed.has(id);
      const skippedReason = executed ? undefined : (this.skipped.get(id) ?? "선행 검사 실패 등으로 실행되지 않았습니다");
      let status = "pass";
      if (errors > 0) status = "fail";
      else if (!executed) status = "skipped";
      else if (warnings > 0) status = "warn";
      checks[id] = { title, status, errors, warnings, ...(skippedReason === undefined ? {} : { skippedReason }) };
    }
    return { errors: this.count("error"), warnings: this.count("warning"), checks };
  }
}

// ---------------------------------------------------------------- 파일 소스(디스크/메모리)

function toPosix(value) {
  return value.split(path.sep).join("/");
}

/** 키트 폴더를 디스크에서 읽는 소스. 폴더 밖을 가리키는 경로는 읽지 않는다. */
export function createDiskSource(root) {
  const base = path.resolve(root);
  return {
    label: base,
    read(relative) {
      const full = path.resolve(base, relative);
      if (full !== base && !full.startsWith(base + path.sep)) return null;
      try {
        if (!statSync(full).isFile()) return null;
        return new Uint8Array(readFileSync(full));
      } catch {
        return null;
      }
    },
    list() {
      const result = [];
      const walk = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const full = path.join(directory, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile()) result.push(toPosix(path.relative(base, full)));
        }
      };
      if (existsSync(base)) walk(base);
      return result.sort();
    },
  };
}

/** 테스트용 메모리 소스: `Map<상대경로, Uint8Array | string>` */
export function createMemorySource(files, label = "(memory)") {
  const textEncoder = new TextEncoder();
  return {
    label,
    read(relative) {
      const value = files.get(relative);
      if (value === undefined) return null;
      return typeof value === "string" ? textEncoder.encode(value) : value;
    },
    list() {
      return [...files.keys()].sort();
    },
  };
}

// ---------------------------------------------------------------- 작은 수학 도구

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** 정렬된 사본에서 분위수(q=1이면 최댓값). 빈 입력은 0 */
export function quantileOf(values, q) {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function fmt(value, digits = 4) {
  return Number.isFinite(value) ? String(Number(value.toFixed(digits))) : String(value);
}

function listFew(items, limit = 5) {
  return items.length <= limit ? items.join(", ") : `${items.slice(0, limit).join(", ")} 외 ${items.length - limit}개`;
}

function isIdentityMatrix(m, tolerance = 1e-6) {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return m.length === 16 && identity.every((value, index) => Math.abs((m[index] ?? Number.NaN) - value) <= tolerance);
}

/** 열 우선 4×4 행렬의 회전 부분(스케일 제거)을 v에 적용한다. */
function rotateByMatrix(m, x, y, z) {
  const c0 = Math.hypot(m[0], m[1], m[2]) || 1;
  const c1 = Math.hypot(m[4], m[5], m[6]) || 1;
  const c2 = Math.hypot(m[8], m[9], m[10]) || 1;
  return [
    (m[0] / c0) * x + (m[4] / c1) * y + (m[8] / c2) * z,
    (m[1] / c0) * x + (m[5] / c1) * y + (m[9] / c2) * z,
    (m[2] / c0) * x + (m[6] / c1) * y + (m[10] / c2) * z,
  ];
}

function allFinite(array) {
  for (let i = 0; i < array.length; i += 1) if (!Number.isFinite(array[i])) return false;
  return true;
}

function firstNonFinite(array) {
  for (let i = 0; i < array.length; i += 1) if (!Number.isFinite(array[i])) return i;
  return -1;
}

// ---------------------------------------------------------------- 순수 검증 함수(export)

function roleList(declaration) {
  if (declaration.role !== undefined) return [declaration.role];
  return declaration.primitiveRoles ?? [];
}

function materialList(declaration) {
  if (declaration.material !== undefined) return [declaration.material];
  return declaration.primitiveMaterials ?? [];
}

/**
 * V12: 1024² 삼각형 래스터에서 둘 이상의 삼각형이 덮는 픽셀 비율.
 * 픽셀 중심이 삼각형 안(경계에서 1e-6 이상 안쪽)일 때만 센다 — 공유 엣지 위의 픽셀은 어느 쪽에도 세지 않는다.
 * @returns {{overlapRatio: number, coveredPixels: number, overlappedPixels: number, skippedTriangles: number}}
 */
export function verifyUvOverlap(uvs, indices, size = LIMITS.uvRasterSize) {
  const counts = new Uint8Array(size * size);
  let covered = 0;
  let overlapped = 0;
  let skipped = 0;
  const triangleCount = Math.floor((indices === null ? uvs.length / 2 : indices.length) / 3);
  const epsilon = 1e-6;
  for (let t = 0; t < triangleCount; t += 1) {
    const a = indices === null ? t * 3 : indices[t * 3];
    const b = indices === null ? t * 3 + 1 : indices[t * 3 + 1];
    const c = indices === null ? t * 3 + 2 : indices[t * 3 + 2];
    const ax = uvs[a * 2] * size;
    const ay = uvs[a * 2 + 1] * size;
    const bx = uvs[b * 2] * size;
    const by = uvs[b * 2 + 1] * size;
    const cx = uvs[c * 2] * size;
    const cy = uvs[c * 2 + 1] * size;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!Number.isFinite(area) || Math.abs(area) < 1e-9) {
      skipped += 1;
      continue;
    }
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    const inverse = 1 / area;
    for (let y = minY; y <= maxY; y += 1) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inverse;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inverse;
        const w2 = 1 - w0 - w1;
        if (w0 <= epsilon || w1 <= epsilon || w2 <= epsilon) continue;
        const offset = y * size + x;
        const previous = counts[offset];
        if (previous === 0) {
          counts[offset] = 1;
          covered += 1;
        } else if (previous === 1) {
          counts[offset] = 2;
          overlapped += 1;
        }
      }
    }
  }
  return { overlapRatio: covered === 0 ? 0 : overlapped / covered, coveredPixels: covered, overlappedPixels: overlapped, skippedTriangles: skipped };
}

/**
 * V9 따라가기: 대상 메시(의상·속옷·속눈썹·눈썹) 정점마다 기준 메시(몸/머리)에서 가장 가까운 정점을 찾고,
 * 같은 이름 morph 타깃에서의 변위 차(m)를 잰다. 반경 안에 기준 정점이 없는 정점은 비교하지 않고 `unmatched`로 센다.
 * @param {{subject: {positions: Float32Array, targets: Map<string, Float32Array>}, reference: {positions: Float32Array, targets: Map<string, Float32Array>}, names: string[], quantile?: number, radius?: number}} input
 * @returns {{matched: number, unmatched: number, perTarget: Map<string, {statistic: number, max: number}>}}
 */
export function verifyMorphFollow({ subject, reference, names, quantile = 1, radius = LIMITS.followSearchRadiusM }) {
  const grid = new PointGrid(reference.positions, 0.02);
  const count = subject.positions.length / 3;
  const nearest = new Int32Array(count).fill(-1);
  let matched = 0;
  for (let v = 0; v < count; v += 1) {
    const index = grid.nearest(subject.positions[v * 3], subject.positions[v * 3 + 1], subject.positions[v * 3 + 2], radius);
    nearest[v] = index;
    if (index >= 0) matched += 1;
  }
  const perTarget = new Map();
  for (const name of names) {
    const a = subject.targets.get(name);
    const b = reference.targets.get(name);
    if (a === undefined || b === undefined) continue;
    const diffs = new Float64Array(matched);
    let n = 0;
    for (let v = 0; v < count; v += 1) {
      const r = nearest[v];
      if (r < 0) continue;
      diffs[n] = Math.hypot(a[v * 3] - b[r * 3], a[v * 3 + 1] - b[r * 3 + 1], a[v * 3 + 2] - b[r * 3 + 2]);
      n += 1;
    }
    perTarget.set(name, { statistic: quantileOf(diffs, quantile), max: quantileOf(diffs, 1) });
  }
  return { matched, unmatched: count - matched, perTarget };
}

/**
 * V9 심 일치: 두 메시에서 같은 위치(허용 거리 이내)의 정점 쌍을 찾아 공유 타깃의 델타 차를 잰다.
 * @returns {{pairs: number, sharedNames: string[], maxDelta: number, worstName: string | null}}
 */
export function verifyMorphSeam(first, second, tolerance = LIMITS.seamPositionToleranceM) {
  const sharedNames = [...first.targets.keys()].filter((name) => second.targets.has(name));
  const grid = new PointGrid(first.positions, 1e-4);
  const secondCount = second.positions.length / 3;
  let pairs = 0;
  let maxDelta = 0;
  let worstName = null;
  for (let v = 0; v < secondCount; v += 1) {
    const found = grid.within(second.positions[v * 3], second.positions[v * 3 + 1], second.positions[v * 3 + 2], tolerance);
    for (const u of found) {
      pairs += 1;
      for (const name of sharedNames) {
        const a = first.targets.get(name);
        const b = second.targets.get(name);
        const diff = Math.hypot(a[u * 3] - b[v * 3], a[u * 3 + 1] - b[v * 3 + 1], a[u * 3 + 2] - b[v * 3 + 2]);
        if (diff > maxDelta) {
          maxDelta = diff;
          worstName = name;
        }
      }
    }
  }
  return { pairs, sharedNames, maxDelta, worstName };
}

/**
 * V18 독립 대조. 선언한 관절 오프셋(부모 로컬 프레임)을 레스트 월드 회전으로 월드화해 관절 머리 이동을 누적하고,
 * 관절에 가중치 > 0.5로 묶인 정점 중 관절 머리 근처(반경 안)의 평균 변위와 비교한다.
 * @returns {{compared: number, worst: {morph: string, joint: string, diffM: number} | null, skippedJoints: number}}
 */
export function verifyJointOffsets({ jointOffsets, joints, parents, headWorld, parentWorldMatrix, views, morphs }) {
  const children = new Map();
  for (const joint of joints) {
    const parent = parents[joint];
    if (parent !== null && parent !== undefined) children.set(parent, [...(children.get(parent) ?? []), joint]);
  }
  const radiusOf = (joint) => {
    const list = children.get(joint) ?? [];
    if (list.length === 0) return 0.03;
    const here = headWorld.get(joint);
    if (here === undefined) return 0.03;
    const nearestChild = Math.min(...list.map((child) => Math.hypot(...(headWorld.get(child) ?? here).map((value, axis) => value - here[axis]))));
    return Math.min(0.06, Math.max(0.01, 0.4 * nearestChild));
  };
  const radius = new Map(joints.map((joint) => [joint, radiusOf(joint)]));
  const sums = new Map();
  for (const view of views) {
    if (view.joints === null || view.weights === null) continue;
    for (let v = 0; v < view.count; v += 1) {
      let slot = -1;
      for (let k = 0; k < 4; k += 1) {
        if (view.weights[v * 4 + k] > 0.5) {
          slot = k;
          break;
        }
      }
      if (slot < 0) continue;
      const joint = joints[view.joints[v * 4 + slot]];
      const head = joint === undefined ? undefined : headWorld.get(joint);
      if (head === undefined) continue;
      const distance = Math.hypot(view.positions[v * 3] - head[0], view.positions[v * 3 + 1] - head[1], view.positions[v * 3 + 2] - head[2]);
      if (distance > (radius.get(joint) ?? 0)) continue;
      for (const morph of morphs) {
        const delta = view.targets.get(morph);
        if (delta === undefined) continue;
        const key = `${morph}|${joint}`;
        const entry = sums.get(key) ?? { x: 0, y: 0, z: 0, n: 0 };
        entry.x += delta[v * 3];
        entry.y += delta[v * 3 + 1];
        entry.z += delta[v * 3 + 2];
        entry.n += 1;
        sums.set(key, entry);
      }
    }
  }
  // 관절 머리의 월드 이동 누적: Δworld(j) = Δworld(parent) + R_parentWorld · Δlocal(j)
  const ordered = [...joints].sort((a, b) => depthOf(a, parents) - depthOf(b, parents));
  let compared = 0;
  let skippedJoints = 0;
  let worst = null;
  for (const morph of morphs) {
    const table = jointOffsets[morph] ?? {};
    const world = new Map();
    for (const joint of ordered) {
      const parent = parents[joint];
      const base = parent === null || parent === undefined ? [0, 0, 0] : (world.get(parent) ?? [0, 0, 0]);
      const local = table[joint] ?? [0, 0, 0];
      const matrix = parentWorldMatrix.get(joint);
      const rotated = matrix === undefined ? local : rotateByMatrix(matrix, local[0], local[1], local[2]);
      world.set(joint, [base[0] + rotated[0], base[1] + rotated[1], base[2] + rotated[2]]);
    }
    for (const joint of joints) {
      const entry = sums.get(`${morph}|${joint}`);
      if (entry === undefined || entry.n < 3) {
        skippedJoints += 1;
        continue;
      }
      const predicted = world.get(joint) ?? [0, 0, 0];
      const diffM = Math.hypot(entry.x / entry.n - predicted[0], entry.y / entry.n - predicted[1], entry.z / entry.n - predicted[2]);
      compared += 1;
      if (worst === null || diffM > worst.diffM) worst = { morph, joint, diffM };
    }
  }
  return { compared, worst, skippedJoints };
}

function depthOf(joint, parents) {
  let depth = 0;
  let cursor = parents[joint];
  while (cursor !== null && cursor !== undefined && depth < 200) {
    depth += 1;
    cursor = parents[cursor];
  }
  return depth;
}

// ---------------------------------------------------------------- GLB 한 파일에 대한 검사(V5~V15, V20)

const BODY_AND_HEAD_NODES = new Set([KIT_BODY_NODE, KIT_HEAD_NODE]);
const BODY_PARAM_KEY_SET = new Set(BODY_PARAM_KEYS);
const PARAM_NAME_PATTERN = /^param:([A-Za-z]+):([+-])$/u;
const HANGUL = /[가-힣]/u;
const FACE_ROLES = ["eyeball", "teeth", "tongue", "lash", "brow"];
const IRIS_ROLES = KIT_PART_SLOT_ROLES.irises;

function whereOf(file, node) {
  return node === undefined ? file.path : `${file.path}:${node}`;
}

/** V6: skin.joints 이름 배열·부모, Armature, 메시 노드 집합, 헤어 이름 규칙 */
function checkNamesAndSkeleton(ctx, file, model) {
  const { report, manifest } = ctx;
  const where = file.path;
  // 키트 v2 강체 소품만 담은 파일은 스켈레톤 없이 둘 수 있다(스킨 없음 계약). 스킨이 있으면 아래 규칙을 그대로 지킨다.
  const rigidOnly = model.skins.length === 0 && file.declared.length > 0 && file.declared.every((mesh) => mesh.skinned === false);
  if (rigidOnly) {
    // 스켈레톤·Armature 규칙 건너뜀 — 메시 집합·이름 규칙은 아래에서 그대로 본다
  } else if (model.skins.length !== 1) {
    report.error("V6", where, `skin이 ${model.skins.length}개입니다. 정확히 1개여야 합니다(kit-joint-mismatch).`);
  } else {
    const expected = manifest.skeleton.joints;
    const actual = model.joints;
    const sameSet = actual.length === expected.length && expected.every((name) => actual.includes(name));
    if (!sameSet) {
      const missing = expected.filter((name) => !actual.includes(name));
      const extra = actual.filter((name) => !expected.includes(name));
      report.error("V6", where, `skin.joints(${actual.length}개)가 skeleton.joints(${expected.length}개)와 다릅니다. 없음: [${listFew(missing)}], 여분: [${listFew(extra)}] (kit-joint-mismatch)`);
    } else {
      const at = actual.findIndex((name, index) => name !== expected[index]);
      if (at >= 0) report.error("V6", where, `skin.joints 순서가 skeleton.joints와 다릅니다. ${at}번째: 기대 ${expected[at]}, 실제 ${actual[at]} (JOINTS 인덱스가 어긋납니다, kit-joint-mismatch)`);
    }
    // skin.skeleton: 생략하거나 루트 joint여야 한다. Armature 같은 조상을 가리키면 glTF상 유효해도 Babylon 로더가 그 노드를 joint 밖의 추가 본으로 만든다.
    const skeletonNode = model.skins[0].getSkeleton();
    const rootJoints = expected.filter((name) => (manifest.skeleton.parents[name] ?? null) === null);
    if (skeletonNode !== null && !rootJoints.includes(skeletonNode.getName())) {
      report.error("V6", where, `skin.skeleton이 '${skeletonNode.getName()}'입니다. 생략하거나 루트 joint(${rootJoints.join(", ")})여야 합니다 — 그 밖의 노드(Armature 등)를 가리키면 앱의 Babylon 로더가 그 노드를 추가 본으로 만들어 여분 joint로 거부합니다(kit-joint-mismatch).`);
    }
    for (const node of model.jointNodes) {
      const name = node.getName();
      if (!(name in manifest.skeleton.parents)) continue;
      const expectedParent = manifest.skeleton.parents[name] ?? manifest.skeleton.root;
      const actualParent = node.getParentNode()?.getName() ?? null;
      if (actualParent !== expectedParent) {
        report.error("V6", where, `joint ${name}의 부모가 ${String(actualParent)}입니다. 기대 ${expectedParent} (kit-joint-mismatch)`);
      }
    }
  }
  if (!rigidOnly && (model.nodeByName.get(manifest.skeleton.root)?.length ?? 0) !== 1) {
    report.error("V6", where, `루트 노드 '${manifest.skeleton.root}'가 정확히 1개 있어야 합니다.`);
  }
  for (const [name, nodes] of model.nodeByName) {
    if (nodes.length > 1 && (nodes.some((node) => node.getMesh() !== null) || manifest.skeleton.joints.includes(name))) {
      report.error("V6", where, `노드 이름 '${name}'이 ${nodes.length}번 중복되었습니다.`);
    }
  }
  const declared = new Set(file.declared.map((mesh) => mesh.node));
  const actualMeshNames = [...new Set(model.meshNodes.map((meshNode) => meshNode.name))];
  for (const name of actualMeshNames) if (!declared.has(name)) report.error("V6", whereOf(file, name), `kit.json에 선언되지 않은 메시 노드입니다(kit-mesh-undeclared).`);
  for (const name of declared) if (!actualMeshNames.includes(name)) report.error("V6", whereOf(file, name), `선언했지만 GLB에 없는 메시 노드입니다(kit-mesh-missing).`);
  if (file.slot === "hair") {
    for (const name of actualMeshNames) {
      const match = AUTHORED_HAIR_MESH_PATTERN.exec(name);
      if (match?.groups?.style !== file.name) report.error("V6", whereOf(file, name), `헤어 메시 이름은 TS_AuthoredHair_${file.name}_LOD<n> 형식이어야 합니다.`);
    }
  }
}

/** V7: Armature 항등, 음수 스케일 없음, 스킨 메시 변환 항등, 베이스 높이·발바닥·얼굴 방향 */
function checkTransforms(ctx, file, model) {
  const { report, manifest } = ctx;
  const root = model.nodeByName.get(manifest.skeleton.root)?.[0];
  if (root !== undefined) {
    const translation = root.getTranslation();
    const rotation = root.getRotation();
    const scale = root.getScale();
    const identityRotation = Math.hypot(rotation[0], rotation[1], rotation[2]) < 1e-6 && Math.abs(Math.abs(rotation[3]) - 1) < 1e-6;
    if (Math.hypot(...translation) > 1e-6 || !identityRotation || scale.some((value) => Math.abs(value - 1) > 1e-6)) {
      report.error("V7", file.path, `${manifest.skeleton.root} 노드의 변환이 항등·스케일 1이 아닙니다(이동 ${translation.map((v) => fmt(v)).join(",")}, 스케일 ${scale.map((v) => fmt(v)).join(",")}).`);
    }
  }
  const negative = model.nodes.filter((node) => node.getScale().some((value) => !(value > 0)));
  if (negative.length > 0) report.error("V7", file.path, `음수/0 스케일 노드가 있습니다: ${listFew(negative.map((node) => node.getName()))}`);
  for (const meshNode of model.meshNodes) {
    if (!isIdentityMatrix(meshNode.world)) report.error("V7", whereOf(file, meshNode.name), "스킨 메시 노드의 월드 변환이 항등이 아닙니다(kit-transform-invalid).");
  }
  if (file.kind !== "base") return;
  const baseId = [...file.baseIds][0];
  const base = manifest.bases[baseId];
  const body = model.meshNodeByName.get(KIT_BODY_NODE);
  const head = model.meshNodeByName.get(KIT_HEAD_NODE);
  if (base === undefined || body === undefined || head === undefined) return;
  const boundsOf = (view) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < view.positions.length; i += 1) {
      const axis = i % 3;
      const value = view.positions[i];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
    return { min, max };
  };
  const bodyBounds = boundsOf(viewOf(body));
  const headBounds = boundsOf(viewOf(head));
  const minY = Math.min(bodyBounds.min[1], headBounds.min[1]);
  const maxY = Math.max(bodyBounds.max[1], headBounds.max[1]);
  const height = maxY - minY;
  report.metric(`${file.path}.heightM`, Number(height.toFixed(4)));
  if (Math.abs(height - base.heightM) / base.heightM > LIMITS.heightTolerance) {
    report.error("V7", file.path, `TS_Body+TS_Head 높이 ${fmt(height)} m가 선언 heightM ${base.heightM} m와 ${LIMITS.heightTolerance * 100}% 넘게 다릅니다.`);
  }
  if (Math.abs(bodyBounds.min[1]) > LIMITS.soleToleranceM) {
    report.error("V7", file.path, `발바닥 min y가 ${fmt(bodyBounds.min[1] * 1000, 2)} mm입니다. ±${LIMITS.soleToleranceM * 1000} mm 안이어야 합니다.`);
  }
  const eyeCenters = ["TS_Eye_L", "TS_Eye_R"].map((name) => model.meshNodeByName.get(name)).filter((node) => node !== undefined).map((node) => boundsOf(viewOf(node)));
  if (eyeCenters.length > 0) {
    const eyeZ = eyeCenters.reduce((sum, bounds) => sum + (bounds.min[2] + bounds.max[2]) / 2, 0) / eyeCenters.length;
    const headZ = (headBounds.min[2] + headBounds.max[2]) / 2;
    if (!(eyeZ > headZ)) report.error("V7", file.path, `눈 중심 z(${fmt(eyeZ)})가 머리 bbox 중심 z(${fmt(headZ)})보다 앞(+Z)에 있지 않습니다. 얼굴이 +Z를 향해야 합니다.`);
  }
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const meshNode of model.meshNodes) {
    const bounds = boundsOf(viewOf(meshNode));
    min = min.map((value, axis) => Math.min(value, bounds.min[axis]));
    max = max.map((value, axis) => Math.max(value, bounds.max[axis]));
  }
  const offBounds = min.some((value, axis) => Math.abs(value - base.boundsM.min[axis]) > LIMITS.boundsToleranceM) || max.some((value, axis) => Math.abs(value - base.boundsM.max[axis]) > LIMITS.boundsToleranceM);
  if (offBounds) report.warn("V7", file.path, `선언 boundsM과 실제 bbox가 ${LIMITS.boundsToleranceM * 100} cm 넘게 다릅니다(실제 min ${min.map((v) => fmt(v, 3)).join(",")} max ${max.map((v) => fmt(v, 3)).join(",")}).`);
}

/** V8: 모든 메시는 JOINTS_0/WEIGHTS_0, 영향 ≤ 4, 가중치 합, 인덱스 범위, IBM 수 */
function checkSkin(ctx, file, model) {
  const { report } = ctx;
  // 키트 v2 강체 소품(`skinned: false`)은 스킨이 없어야 한다(V8 강체 예외). v1 선언에는 false가 올 수 없다.
  const rigid = new Set(file.declared.filter((mesh) => mesh.skinned === false).map((mesh) => mesh.node));
  const ibm = model.skins[0]?.getInverseBindMatrices() ?? null;
  if ((ibm === null && !(model.skins.length === 0 && rigid.size === file.declared.length)) || (ibm !== null && ibm.getCount() !== KIT_JOINT_COUNT)) {
    report.error("V8", file.path, `inverseBindMatrices가 ${ibm === null ? "없습니다" : `${ibm.getCount()}개입니다`}. ${KIT_JOINT_COUNT}개여야 합니다.`);
  }
  for (const meshNode of model.meshNodes) {
    const where = whereOf(file, meshNode.name);
    if (rigid.has(meshNode.name)) {
      v2.checkRigidMeshV2(ctx, file, meshNode);
      continue;
    }
    if (meshNode.skin === null || meshNode.skin !== model.skins[0]) {
      report.error("V8", where, "스킨에 바인딩되지 않은 메시입니다. 모든 파츠는 베이스 스켈레톤에 스키닝해야 합니다(kit-skin-invalid).");
      continue;
    }
    for (const prim of primsOf(meshNode)) {
      if (prim.joints === null || prim.weights === null) {
        report.error("V8", where, "JOINTS_0 또는 WEIGHTS_0가 없습니다(kit-skin-invalid).");
        continue;
      }
      if (prim.hasJoints1) report.error("V8", where, "JOINTS_1/WEIGHTS_1이 있습니다. 정점당 영향은 4개 이하여야 합니다(kit-skin-invalid).");
      let badSum = 0;
      let badIndex = 0;
      let badZero = 0;
      let nonFinite = 0;
      let firstBad = -1;
      for (let v = 0; v < prim.count; v += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) {
          const weight = prim.weights[v * 4 + k];
          const joint = prim.joints[v * 4 + k];
          if (!Number.isFinite(weight) || weight < 0) {
            nonFinite += 1;
            if (firstBad < 0) firstBad = v;
            continue;
          }
          sum += weight;
          if (joint >= KIT_JOINT_COUNT) {
            badIndex += 1;
            if (firstBad < 0) firstBad = v;
          }
          if (weight === 0 && joint !== 0) badZero += 1;
        }
        if (Math.abs(sum - 1) > KIT_BUDGET.weightSumTolerance) {
          badSum += 1;
          if (firstBad < 0) firstBad = v;
        }
      }
      if (nonFinite > 0) report.error("V8", where, `가중치에 NaN/Inf/음수가 있는 슬롯이 ${nonFinite}개 있습니다(첫 정점 ${firstBad}).`);
      if (badSum > 0) report.error("V8", where, `가중치 합이 1±${KIT_BUDGET.weightSumTolerance}를 벗어난 정점이 ${badSum}개 있습니다(첫 정점 ${firstBad}${prim.weightsNormalizedType === 5121 || prim.weightsNormalizedType === 5123 ? ", 정규화 정수 가중치는 양자화 오차가 커 FLOAT 사용을 권장" : ""}).`);
      if (badIndex > 0) report.error("V8", where, `joint 인덱스가 ${KIT_JOINT_COUNT} 이상인 슬롯이 ${badIndex}개 있습니다.`);
      if (badZero > 0) report.error("V8", where, `가중치 0인 슬롯인데 joint 인덱스가 0이 아닌 경우가 ${badZero}개 있습니다.`);
    }
  }
}

function morphNameLevelIsParam(name) {
  return PARAM_NAME_PATTERN.test(name);
}

/** V9: 메시 하나의 morph 이름·개수·선언 일치·필수 커버리지·크기·± 차이·법선 일관성 */
function checkMeshMorphs(ctx, file, declaration, meshNode) {
  const { report } = ctx;
  const where = whereOf(file, declaration.node);
  const prims = primsOf(meshNode);
  const targetCounts = new Set(prims.map((prim) => prim.targets.length));
  if (targetCounts.size > 1) {
    report.error("V9", where, "프리미티브마다 morph 타깃 수가 다릅니다.");
    return;
  }
  const count = prims[0]?.targets.length ?? 0;
  const names = targetNamesOf(meshNode.mesh);
  if (count > 0 && (names === null || names.length !== count)) {
    report.error("V9", where, `extras.targetNames가 없거나 타깃 수(${count})와 다릅니다(${names === null ? "없음" : names.length}개).`);
    return;
  }
  const actual = count === 0 ? [] : names;
  // 키트 v2: 변형 shapes에 선언한 이름의 `shape:<이름>:±`만 더 허용한다(v1 파일 사양은 shapes가 비어 있다)
  const vocabulary = new Set([...KIT_MORPH_NAMES, ...v2.allowedShapeMorphs(file)]);
  const unknown = actual.filter((name) => !vocabulary.has(name));
  if (unknown.length > 0) {
    const shapeNote = ctx.v2 && unknown.some((name) => name.startsWith("shape:")) ? "(형태 키는 변형 shapes에 선언한 이름만)" : "";
    report.error("V9", where, `morph 이름이 어휘 64개 밖입니다${unknown.some((name) => name.startsWith("ext:")) ? "(`ext:*`는 v1 금지)" : ""}${shapeNote}: ${listFew(unknown)}`);
  }
  const duplicates = actual.filter((name, index) => actual.indexOf(name) !== index);
  if (duplicates.length > 0) report.error("V9", where, `morph 이름이 중복되었습니다: ${listFew(duplicates)}`);
  if (actual.length > KIT_BUDGET.maxMorphTargetsPerMesh) report.error("V9", where, `morph 타깃 ${actual.length}개가 한도 ${KIT_BUDGET.maxMorphTargetsPerMesh}개를 넘습니다.`);
  const declared = new Set(declaration.morphs);
  const have = new Set(actual);
  const notInGlb = [...declared].filter((name) => !have.has(name));
  const notDeclared = [...have].filter((name) => !declared.has(name));
  if (notInGlb.length > 0) report.error("V9", where, `선언한 morph ${notInGlb.length}개가 GLB에 없습니다(kit-morph-missing): ${listFew(notInGlb)}`);
  if (notDeclared.length > 0) report.error("V9", where, `GLB에만 있고 선언하지 않은 morph ${notDeclared.length}개: ${listFew(notDeclared)}`);
  const roles = roleList(declaration);
  const missing = new Set();
  // 강체 소품(v2 `skinned: false`)은 체형을 따라가지 않으므로 필수 morph가 없다(계약 fileIssues와 같은 예외)
  if (declaration.skinned !== false) for (const role of roles) for (const name of KIT_MORPH_COVERAGE[role] ?? []) if (!have.has(name)) missing.add(name);
  if (missing.size > 0) report.error("V9", where, `역할 ${roles.join("/")}에 필수인 morph ${missing.size}개가 GLB에 없습니다: ${listFew([...missing])}`);

  const view = viewOf(meshNode);
  const primary = roles.includes("skin") || roles.includes("head");
  const maxima = new Map();
  for (const name of actual) {
    const delta = view.targets.get(name);
    if (delta === undefined) continue;
    if (parseExtendedMorphName(name)?.kind === "shape") continue; // 형태 키 크기·비영은 변형 단위로 v2 규칙이 본다
    let max = 0;
    for (let v = 0; v < delta.length; v += 3) {
      const length = Math.hypot(delta[v], delta[v + 1], delta[v + 2]);
      if (length > max) max = length;
    }
    maxima.set(name, max);
    const param = PARAM_NAME_PATTERN.exec(name);
    const limit = param !== null && BODY_PARAM_KEY_SET.has(param[1]) ? LIMITS.bodyMorphMaxM : LIMITS.faceMorphMaxM;
    if (max > limit) report.error("V9", where, `${name}의 최대 델타 ${fmt(max)} m가 상한 ${limit} m를 넘습니다.`);
    if (!(max >= LIMITS.morphMinMaxM)) {
      const message = `${name}의 델타가 사실상 0입니다(최대 ${fmt(max, 7)} m, 하한 ${LIMITS.morphMinMaxM} m).`;
      if (morphNameLevelIsParam(name) || primary) report.error("V9", where, message);
      else report.warn("V9", where, `${message} 이 메시에서 움직이지 않는 표정 타깃이면 무시해도 됩니다.`);
    }
  }
  for (const name of actual) {
    const param = PARAM_NAME_PATTERN.exec(name);
    if (param === null || param[2] !== "+") continue;
    const plus = view.targets.get(name);
    const minus = view.targets.get(`param:${param[1]}:-`);
    if (plus === undefined || minus === undefined) continue;
    let same = true;
    for (let i = 0; i < plus.length; i += 1) {
      if (Math.abs(plus[i] - minus[i]) > 1e-6) {
        same = false;
        break;
      }
    }
    if (same) report.error("V9", where, `${name}와 param:${param[1]}:-의 델타가 같습니다. +/-는 서로 다른 shape key여야 합니다.`);
  }
  const withNormals = prims.map((prim) => prim.targets.filter((target) => target.normal !== null).length);
  const consistent = withNormals.every((n) => n === 0) || withNormals.every((n, index) => n === prims[index].targets.length);
  if (!consistent) report.error("V9", where, "morph 법선 델타가 일부 타깃에만 있습니다. 한 메시 안에서는 전부 있거나 전부 없어야 합니다.");
  else if (withNormals.some((n) => n > 0) && !BODY_AND_HEAD_NODES.has(declaration.node)) {
    report.warn("V9", where, "morph 법선 델타는 TS_Head·TS_Body에만 두는 정책입니다(메모리 절감, 열린 질문 Q8).");
  }
}

/** V9: 몸/머리 이음매 + 의상·속눈썹·눈썹 따라가기. 베이스 모델 하나 기준으로 호출한다. */
function checkSeam(ctx, file, model) {
  const { report } = ctx;
  const body = model.meshNodeByName.get(KIT_BODY_NODE);
  const head = model.meshNodeByName.get(KIT_HEAD_NODE);
  if (body === undefined || head === undefined) return;
  const result = verifyMorphSeam(viewOf(body), viewOf(head));
  report.metric(`${file.path}.seam`, { pairs: result.pairs, sharedTargets: result.sharedNames.length, maxDeltaM: Number(result.maxDelta.toFixed(7)) });
  if (result.sharedNames.length === 0) {
    report.error("V9", file.path, "TS_Body와 TS_Head가 공유하는 체형 morph가 없어 목 이음매를 맞출 수 없습니다.");
    return;
  }
  if (result.pairs === 0) {
    report.error("V9", file.path, `TS_Body와 TS_Head에서 같은 위치(${LIMITS.seamPositionToleranceM} m)의 이음매 정점을 찾지 못했습니다. 분할 루프가 다르거나 목에 틈이 있습니다.`);
  } else if (result.maxDelta > LIMITS.seamDeltaToleranceM) {
    report.error("V9", file.path, `이음매 정점 ${result.pairs}쌍에서 ${result.worstName}의 몸/머리 델타 차가 ${fmt(result.maxDelta, 6)} m입니다(허용 ${LIMITS.seamDeltaToleranceM} m). 목 이음매가 벌어집니다.`);
  }
}

function followSubjects(file) {
  const subjects = [];
  for (const declaration of file.declared) {
    for (const role of roleList(declaration)) {
      if (["top", "bottom", "shoes", "underwear", "inner", "outer", "legwear"].includes(role)) subjects.push({ declaration, role, reference: KIT_BODY_NODE });
      else if (role === "lash" || role === "brow") subjects.push({ declaration, role, reference: KIT_HEAD_NODE });
    }
  }
  return subjects;
}

function checkFollow(ctx, file, model, baseModel, baseId) {
  const { report, options } = ctx;
  for (const { declaration, role, reference } of followSubjects(file)) {
    const meshNode = model.meshNodeByName.get(declaration.node);
    const referenceNode = baseModel.meshNodeByName.get(reference);
    if (meshNode === undefined || referenceNode === undefined) continue;
    const subjectView = viewOf(meshNode);
    const referenceView = viewOf(referenceNode);
    const names = KIT_MORPH_COVERAGE[role].filter((name) => subjectView.targets.has(name) && referenceView.targets.has(name));
    const where = `${whereOf(file, declaration.node)}@${baseId}`;
    const result = verifyMorphFollow({ subject: subjectView, reference: referenceView, names, quantile: options.followQuantile });
    let worst = null;
    for (const [name, value] of result.perTarget) if (worst === null || value.statistic > worst.statistic) worst = { name, ...value };
    report.metric(`${where}.follow`, { matched: result.matched, unmatched: result.unmatched, worstTarget: worst?.name ?? null, worstM: worst === null ? 0 : Number(worst.statistic.toFixed(5)) });
    if (result.matched === 0) {
      report.error("V9", where, `${reference} 표면 ${LIMITS.followSearchRadiusM * 100} cm 안에 정점이 하나도 없어 따라가기를 검증할 수 없습니다.`);
      continue;
    }
    if (result.unmatched > result.matched) {
      report.warn("V9", where, `정점의 ${Math.round((result.unmatched / (result.matched + result.unmatched)) * 100)}%가 ${reference}에서 ${LIMITS.followSearchRadiusM * 100} cm보다 멀어 따라가기 검사에서 제외되었습니다.`);
    }
    if (worst === null) continue;
    if (worst.statistic > LIMITS.followErrorM) {
      report.error("V9", where, `${worst.name}에서 ${reference}와 변위 차가 ${fmt(worst.statistic * 1000, 1)} mm입니다(오류 ${LIMITS.followErrorM * 1000} mm 초과). 의상/속눈썹/눈썹이 몸·머리를 따라가지 않습니다.`);
    } else if (worst.statistic > LIMITS.followWarnM) {
      report.warn("V9", where, `${worst.name}에서 ${reference}와 변위 차가 ${fmt(worst.statistic * 1000, 1)} mm입니다(경고 ${LIMITS.followWarnM * 1000} mm 초과).`);
    }
  }
}

/** V10: TS_Body 영역 범위·_REGION 속성 (베이스 전용) */
function checkRegions(ctx, file, model) {
  const { report, manifest } = ctx;
  if (file.kind !== "base") return;
  const base = manifest.bases[[...file.baseIds][0]];
  const body = model.meshNodeByName.get(KIT_BODY_NODE);
  const head = model.meshNodeByName.get(KIT_HEAD_NODE);
  if (base === undefined || body === undefined || head === undefined) return;
  const bodyPrims = primsOf(body);
  if (bodyPrims.length !== 1) {
    report.error("V10", whereOf(file, KIT_BODY_NODE), `TS_Body 프리미티브가 ${bodyPrims.length}개입니다. 영역 인덱스 범위를 쓰려면 1개여야 합니다(kit-region-range-invalid).`);
    return;
  }
  const bodyPrim = bodyPrims[0];
  const indexCount = bodyPrim.indices === null ? bodyPrim.count : bodyPrim.indices.length;
  const ranges = base.bodyRegions;
  if (indexCount % 3 !== 0) report.error("V10", whereOf(file, KIT_BODY_NODE), `TS_Body 인덱스 수(${indexCount})가 3의 배수가 아닙니다.`);
  let cursor = 0;
  for (const range of ranges) {
    if (range.indexStart !== cursor || range.indexCount % 3 !== 0) {
      report.error("V10", file.path, `영역 ${range.id}의 범위(${range.indexStart}+${range.indexCount})가 빈틈·겹침 없이 이어지지 않습니다. 기대 시작 ${cursor} (kit-region-range-invalid)`);
    }
    cursor = range.indexStart + range.indexCount;
  }
  if (cursor !== indexCount) report.error("V10", file.path, `영역 범위의 합(${cursor})이 TS_Body 인덱스 수(${indexCount})와 다릅니다(kit-region-range-invalid).`);
  const ids = ranges.map((range) => range.id);
  if (new Set(ids).size !== ids.length || ids.length !== KIT_REGION_IDS.length - 1) report.error("V10", file.path, `영역 id 15개가 한 번씩 있어야 합니다(현재 ${ids.length}개).`);

  const present = new Set();
  for (const [meshNode, name] of [[body, KIT_BODY_NODE], [head, KIT_HEAD_NODE]]) {
    for (const prim of primsOf(meshNode)) {
      if (prim.region === null || !(prim.region instanceof Uint8Array)) {
        report.error("V10", whereOf(file, name), "_REGION(UNSIGNED_BYTE) 정점 속성이 없습니다.");
        continue;
      }
      for (let v = 0; v < prim.region.length; v += 1) {
        if (prim.region[v] >= KIT_REGION_IDS.length) {
          report.error("V10", whereOf(file, name), `_REGION 값 ${prim.region[v]}가 영역 수(${KIT_REGION_IDS.length}) 이상입니다(정점 ${v}).`);
          break;
        }
        present.add(prim.region[v]);
      }
    }
  }
  const absent = KIT_REGION_IDS.filter((id, index) => !present.has(index));
  if (absent.length > 0) report.error("V10", file.path, `_REGION에 정점이 하나도 없는 영역이 있습니다: ${absent.join(", ")}`);
  if (bodyPrim.region instanceof Uint8Array) {
    for (const range of ranges) {
      const regionIndex = KIT_REGION_IDS.indexOf(range.id);
      let bad = 0;
      for (let t = range.indexStart / 3; t < (range.indexStart + range.indexCount) / 3; t += 1) {
        const a = bodyPrim.indices === null ? t * 3 : bodyPrim.indices[t * 3];
        const b = bodyPrim.indices === null ? t * 3 + 1 : bodyPrim.indices[t * 3 + 1];
        const c = bodyPrim.indices === null ? t * 3 + 2 : bodyPrim.indices[t * 3 + 2];
        if (bodyPrim.region[a] !== regionIndex && bodyPrim.region[b] !== regionIndex && bodyPrim.region[c] !== regionIndex) bad += 1;
      }
      if (bad > 0) report.error("V10", file.path, `영역 ${range.id} 범위의 삼각형 ${bad}개가 그 영역 정점을 하나도 갖지 않습니다. 면이 영역 순으로 정렬되지 않았습니다.`);
    }
  }
}

function roleStatsOf(file, model) {
  const byRole = new Map();
  let hairLod0 = 0;
  for (const declaration of file.declared) {
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const roles = roleList(declaration);
    primsOf(meshNode).forEach((prim, index) => {
      const role = roles.length > 1 ? roles[index] : roles[0];
      if (role === undefined) return;
      const triangles = triangleCountOf(prim);
      if (role === "hair") {
        if (declaration.lod === 0) hairLod0 += triangles;
        return;
      }
      byRole.set(role, (byRole.get(role) ?? 0) + triangles);
    });
  }
  if (hairLod0 > 0) byRole.set("hair", hairLod0);
  return byRole;
}

/** V11: 선언 삼각형/정점 수 일치, 역할별 예산, 퇴화 삼각형, 인덱스 범위 */
function checkTriangles(ctx, file, model) {
  const { report } = ctx;
  for (const declaration of file.declared) {
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const where = whereOf(file, declaration.node);
    const prims = primsOf(meshNode);
    const vertices = prims.reduce((sum, prim) => sum + prim.count, 0);
    const triangles = prims.reduce((sum, prim) => sum + triangleCountOf(prim), 0);
    ctx.meshes.push({ file: file.path, node: declaration.node, triangles, vertices, morphTargets: prims[0]?.targets.length ?? 0 });
    if (declaration.triangles !== triangles) report.error("V11", where, `선언 삼각형 ${declaration.triangles}개가 실제 ${triangles}개와 다릅니다.`);
    if (declaration.vertices !== vertices) report.error("V11", where, `선언 정점 ${declaration.vertices}개가 실제 ${vertices}개와 다릅니다.`);
    let degenerate = 0;
    let outOfRange = 0;
    for (const prim of prims) {
      const tris = trianglesOf(prim);
      for (let t = 0; t < tris.length; t += 1) {
        const a = tris.at(t, 0);
        const b = tris.at(t, 1);
        const c = tris.at(t, 2);
        if (a >= prim.count || b >= prim.count || c >= prim.count) {
          outOfRange += 1;
          continue;
        }
        if (a === b || b === c || a === c) {
          degenerate += 1;
          continue;
        }
        const ux = prim.positions[b * 3] - prim.positions[a * 3];
        const uy = prim.positions[b * 3 + 1] - prim.positions[a * 3 + 1];
        const uz = prim.positions[b * 3 + 2] - prim.positions[a * 3 + 2];
        const vx = prim.positions[c * 3] - prim.positions[a * 3];
        const vy = prim.positions[c * 3 + 1] - prim.positions[a * 3 + 1];
        const vz = prim.positions[c * 3 + 2] - prim.positions[a * 3 + 2];
        const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        if (!(area > LIMITS.degenerateAreaM2)) degenerate += 1;
      }
    }
    if (degenerate > 0) report.error("V11", where, `퇴화 삼각형이 ${degenerate}개 있습니다.`);
    if (outOfRange > 0) report.error("V11", where, `정점 수를 넘는 인덱스를 쓰는 삼각형이 ${outOfRange}개 있습니다.`);
  }
  const roles = roleStatsOf(file, model);
  const budgets = KIT_BUDGET.triangles;
  const limit = (role, max, label) => {
    // 액세서리 슬롯은 v2 헤어 부속(hair-accessory) 역할까지 합친다(v1 파일에는 그 역할이 없다)
    const value = (roles.get(role) ?? 0) + (role === "accessory" ? (roles.get("hair-accessory") ?? 0) : 0);
    if (value > max) report.error("V11", file.path, `${label} 삼각형 ${value}개가 예산 ${max}개를 넘습니다.`);
  };
  if (file.kind === "base") {
    const bodyAndHead = (roles.get("skin") ?? 0) + (roles.get("head") ?? 0);
    if (bodyAndHead > budgets.bodyAndHead) report.error("V11", file.path, `TS_Body+TS_Head 삼각형 ${bodyAndHead}개가 예산 ${budgets.bodyAndHead}개를 넘습니다.`);
    limit("underwear", budgets.underwear, "TS_Underwear");
    const face = FACE_ROLES.reduce((sum, role) => sum + (roles.get(role) ?? 0), 0);
    if (face > budgets.faceParts) report.error("V11", file.path, `눈·입·속눈썹·눈썹 삼각형 합 ${face}개가 예산 ${budgets.faceParts}개를 넘습니다.`);
  } else if (file.layer) limit(file.layer, budgets[v2.layerBudgetKey(file.layer)], `${file.layer} 층(${v2.layerBudgetKey(file.layer)} 예산)`);
  else if (file.slot === "hair") limit("hair", budgets.hairLod0, "헤어 LOD0");
  else if (file.slot === "top") limit("top", budgets.top, "상의");
  else if (file.slot === "bottom") limit("bottom", budgets.bottom, "하의");
  else if (file.slot === "shoes") limit("shoes", budgets.shoes, "신발");
  else if (file.slot === "accessory") limit("accessory", budgets.accessory, "액세서리");
  return roles;
}

/** V12: TS_Body/TS_Head UV 범위·겹침·늘어짐, 텍스처가 있는 메시의 UV 존재 */
function checkUvs(ctx, file, model) {
  const { report, options } = ctx;
  for (const meshNode of model.meshNodes) {
    const isBodyHead = BODY_AND_HEAD_NODES.has(meshNode.name) && file.kind === "base";
    for (const prim of primsOf(meshNode)) {
      const where = whereOf(file, meshNode.name);
      if (prim.uvs === null) {
        if (isBodyHead || prim.material?.getBaseColorTexture() != null) report.error("V12", where, "TEXCOORD_0(UVMap)이 없습니다.");
        continue;
      }
      if (!isBodyHead) continue;
      let outside = 0;
      for (let i = 0; i < prim.uvs.length; i += 1) {
        const value = prim.uvs[i];
        if (Number.isFinite(value) && (value < -LIMITS.uvRangeMargin || value > 1 + LIMITS.uvRangeMargin)) outside += 1;
      }
      if (outside > 0) report.error("V12", where, `UV 값 ${outside}개가 [${-LIMITS.uvRangeMargin}, ${1 + LIMITS.uvRangeMargin}] 밖입니다. 겹침 없는 0..1 단일 타일이어야 합니다.`);
      if (!allFinite(prim.uvs)) continue;
      const overlap = verifyUvOverlap(prim.uvs, prim.indices, options.uvRasterSize);
      report.metric(`${where}.uvOverlap`, { ratio: Number(overlap.overlapRatio.toFixed(6)), coveredPixels: overlap.coveredPixels, overlappedPixels: overlap.overlappedPixels });
      if (overlap.overlapRatio > LIMITS.uvOverlapMaxRatio) {
        report.error("V12", where, `UV 겹침 픽셀 비율 ${(overlap.overlapRatio * 100).toFixed(3)}%가 ${LIMITS.uvOverlapMaxRatio * 100}%를 넘습니다(UV 페인트가 어긋납니다).`);
      }
      const ratios = [];
      const tris = trianglesOf(prim);
      for (let t = 0; t < tris.length; t += 1) {
        const a = tris.at(t, 0);
        const b = tris.at(t, 1);
        const c = tris.at(t, 2);
        if (a >= prim.count || b >= prim.count || c >= prim.count) continue;
        const uvArea = 0.5 * Math.abs((prim.uvs[b * 2] - prim.uvs[a * 2]) * (prim.uvs[c * 2 + 1] - prim.uvs[a * 2 + 1]) - (prim.uvs[b * 2 + 1] - prim.uvs[a * 2 + 1]) * (prim.uvs[c * 2] - prim.uvs[a * 2]));
        const ux = prim.positions[b * 3] - prim.positions[a * 3];
        const uy = prim.positions[b * 3 + 1] - prim.positions[a * 3 + 1];
        const uz = prim.positions[b * 3 + 2] - prim.positions[a * 3 + 2];
        const vx = prim.positions[c * 3] - prim.positions[a * 3];
        const vy = prim.positions[c * 3 + 1] - prim.positions[a * 3 + 1];
        const vz = prim.positions[c * 3 + 2] - prim.positions[a * 3 + 2];
        const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        if (area > LIMITS.degenerateAreaM2 && uvArea > 1e-12) ratios.push(uvArea / area);
      }
      if (ratios.length > 10) {
        const median = quantileOf(ratios, 0.5);
        const p99 = quantileOf(ratios, 0.99);
        if (median > 0 && p99 > median * LIMITS.uvStretchP99Ratio) {
          report.warn("V12", where, `UV 늘어짐: 면적비 99백분위(${p99.toExponential(2)})가 중앙값(${median.toExponential(2)})의 ${LIMITS.uvStretchP99Ratio}배를 넘습니다.`);
        }
      }
    }
  }
}

function textureLimit(nodeNames) {
  return nodeNames.some((name) => BODY_AND_HEAD_NODES.has(name)) ? KIT_BUDGET.textureMaxSize.bodyAndHead : KIT_BUDGET.textureMaxSize.other;
}

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

/** V13: 한 (파츠, 역할)에 재질 하나, 선언 일치, 텍스처 형식·크기·알파·ORM 금지·recolor 휘도 */
function checkMaterials(ctx, file, model) {
  const { report, manifest, imageCache } = ctx;
  const roleMaterial = new Map();
  const usage = new Map();
  for (const declaration of file.declared) {
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const roles = roleList(declaration);
    const names = materialList(declaration);
    const prims = primsOf(meshNode);
    const where = whereOf(file, declaration.node);
    if (roles.length > 1 && prims.length !== roles.length) {
      report.error("V13", where, `프리미티브가 ${prims.length}개인데 선언은 ${roles.length}개 역할입니다.`);
      continue;
    }
    prims.forEach((prim, index) => {
      const role = roles.length > 1 ? roles[index] : roles[0];
      const declaredName = roles.length > 1 ? names[index] : names[0];
      const material = prim.material;
      if (material === null) {
        report.error("V13", where, `프리미티브 ${index}에 재질이 없습니다.`);
        return;
      }
      if (material.getName() !== declaredName) report.error("V13", where, `재질 이름 '${material.getName()}'이 선언 '${declaredName}'와 다릅니다.`);
      // v1: (파츠, 역할)당 재질 1. 키트 v2: (파일, 역할, 채널)당 재질 1 — v1 재질에는 채널이 없어 키가 역할과 같다
      const channel = manifest.materials[declaredName]?.channel;
      const slotKey = channel === undefined ? role : `${role}|${channel}`;
      const previous = roleMaterial.get(slotKey);
      if (previous !== undefined && previous !== material) {
        report.error("V13", where, `역할 ${role}${channel === undefined ? "" : `·채널 ${channel}`}에 재질이 둘 이상입니다('${previous.getName()}', '${material.getName()}', kit-material-multiple).`);
      }
      roleMaterial.set(slotKey, material);
      const entry = usage.get(material) ?? { nodes: new Set(), roles: new Set() };
      entry.nodes.add(declaration.node);
      entry.roles.add(role);
      usage.set(material, entry);
    });
  }
  for (const [material, entry] of usage) {
    const name = material.getName();
    const where = `${file.path}:${name}`;
    const declared = manifest.materials[name];
    if (declared === undefined) continue;
    if (material.getDoubleSided() !== declared.doubleSided) report.error("V13", where, `doubleSided(${material.getDoubleSided()})가 선언(${declared.doubleSided})과 다릅니다.`);
    if (material.getMetallicRoughnessTexture() !== null || material.getOcclusionTexture() !== null) {
      report.error("V13", where, "ORM(metallicRoughness/occlusion) 텍스처는 금지입니다. 앱 재질 프리셋이 metallic/roughness를 덮어씁니다.");
    }
    if (material.getEmissiveTexture() !== null) report.error("V13", where, "emissive 텍스처는 허용되지 않습니다(baseColor와 normal만).");
    if (declared.role === "eye-highlight" && declared.tint.mode === "fixed" && hexLuminance(declared.tint.hex) < HIGHLIGHT_MIN_LUMINANCE) {
      report.warn("V13", where, `eye-highlight 재질의 고정색 ${declared.tint.hex}가 흰색이 아닙니다. 캐치라이트는 고정 흰색이어야 합니다(리드 결정 A-1).`);
    }
    const factor = material.getBaseColorFactor();
    if (declared.tint.mode === "recolor" && factor.some((value) => Math.abs(value - 1) > 1e-3)) {
      report.error("V13", where, `recolor 재질의 baseColorFactor가 [1,1,1,1]이 아닙니다([${factor.map((v) => fmt(v, 3)).join(",")}]). 틴트는 런타임이 곱합니다.`);
    }
    const texture = material.getBaseColorTexture();
    if (texture === null) {
      if (declared.tint.mode === "recolor") report.error("V13", where, "recolor 재질에는 baseColor 텍스처가 필요합니다.");
      else report.warn("V13", where, "고정색 재질에 baseColor 텍스처가 없습니다(단색 재질로 취급).");
      continue;
    }
    const image = texture.getImage();
    if (image === null) {
      report.error("V13", where, "baseColor 텍스처에 이미지가 없습니다.");
      continue;
    }
    let info = imageCache.get(texture);
    if (info === undefined) {
      info = decodeImageInfo(image);
      imageCache.set(texture, info);
    }
    const alphaMode = material.getAlphaMode();
    const needsAlpha = alphaMode !== "OPAQUE";
    const limit = textureLimit([...entry.nodes]);
    ctx.textures.push({ file: file.path, material: name, format: info.format, width: info.width, height: info.height, bytes: image.length, hasAlpha: info.hasAlpha, meanLuminance: info.meanLuminance === null ? null : Number(info.meanLuminance.toFixed(4)) });
    if (info.format === null) {
      report.error("V13", where, `baseColor 이미지가 PNG/JPEG가 아닙니다(${texture.getMimeType()}).`);
      continue;
    }
    const mime = info.format === "png" ? "image/png" : "image/jpeg";
    if (texture.getMimeType() !== mime) report.error("V13", where, `이미지 mimeType(${texture.getMimeType()})이 실제 형식(${mime})과 다릅니다.`);
    if (!isPowerOfTwo(info.width) || !isPowerOfTwo(info.height)) report.error("V13", where, `텍스처 크기 ${info.width}×${info.height}가 2의 거듭제곱이 아닙니다.`);
    if (info.width > limit || info.height > limit) report.error("V13", where, `텍스처 크기 ${info.width}×${info.height}가 상한 ${limit}²를 넘습니다.`);
    if (info.format === "png" && !info.hasAlpha) report.error("V13", where, "알파 채널이 없는 PNG입니다. 알파가 필요 없는 텍스처는 JPEG로 저장하세요.");
    if (info.format === "png" && info.hasAlpha && !needsAlpha) report.warn("V13", where, "알파가 있는 PNG인데 재질 alphaMode가 OPAQUE입니다.");
    if (info.format === "jpeg" && needsAlpha) report.error("V13", where, `재질 alphaMode가 ${alphaMode}인데 텍스처가 알파 없는 JPEG입니다. 알파가 필요한 텍스처는 PNG여야 합니다.`);
    if (declared.tint.mode === "recolor") {
      const minimum = entry.roles.has("iris") ? IRIS_RECOLOR_MIN_MEAN_LUMINANCE : RECOLOR_MIN_MEAN_LUMINANCE;
      if (info.meanLuminance === null) report.warn("V13", where, `recolor 텍스처 평균 휘도를 측정하지 못했습니다: ${info.note ?? "알 수 없음"}`);
      else if (info.meanLuminance < minimum) {
        report.error("V13", where, `recolor 텍스처 평균 휘도 ${info.meanLuminance.toFixed(3)}가 하한 ${minimum}보다 어둡습니다. 틴트가 곱해져 의도보다 어둡게 나옵니다.`);
      }
    }
  }
}

/** V14: 헤어 LOD 연속·단조, 모든 메시의 COLOR_0 회색 AO·COLOR_1 금지 */
function checkHairAndColors(ctx, file, model) {
  const { report } = ctx;
  if (file.slot === "hair") {
    const lods = [];
    for (const meshNode of model.meshNodes) {
      const match = AUTHORED_HAIR_MESH_PATTERN.exec(meshNode.name);
      if (match?.groups === undefined) continue;
      lods.push({ lod: Number.parseInt(match.groups.lod, 10), triangles: primsOf(meshNode).reduce((sum, prim) => sum + triangleCountOf(prim), 0), name: meshNode.name });
    }
    lods.sort((a, b) => a.lod - b.lod);
    lods.forEach((entry, index) => {
      if (entry.lod !== index) report.error("V14", file.path, `헤어 LOD 번호가 0부터 연속이 아닙니다(${lods.map((l) => l.lod).join(",")}).`);
    });
    for (let i = 1; i < lods.length; i += 1) {
      if (!(lods[i].triangles < lods[i - 1].triangles)) {
        report.error("V14", file.path, `헤어 삼각형이 LOD가 올라가도 줄지 않습니다(${lods[i - 1].name} ${lods[i - 1].triangles} → ${lods[i].name} ${lods[i].triangles}).`);
      }
    }
  }
  for (const meshNode of model.meshNodes) {
    const where = whereOf(file, meshNode.name);
    for (const prim of primsOf(meshNode)) {
      if (prim.hasColor1) report.error("V14", where, "COLOR_1은 금지입니다(런타임이 읽지 않습니다).");
      if (prim.color0 === null) continue;
      const { data, size } = prim.color0;
      let notGray = 0;
      let badAlpha = 0;
      for (let v = 0; v < data.length / size; v += 1) {
        const r = data[v * size];
        const g = data[v * size + 1];
        const b = data[v * size + 2];
        if (Math.abs(r - g) > LIMITS.grayTolerance || Math.abs(g - b) > LIMITS.grayTolerance) notGray += 1;
        if (size === 4 && Math.abs(data[v * size + 3] - 1) > LIMITS.grayTolerance) badAlpha += 1;
      }
      if (notGray > 0) report.error("V14", where, `COLOR_0이 회색(R=G=B)이 아닌 정점이 ${notGray}개 있습니다. COLOR_0은 회색 AO 곱만 허용합니다.`);
      if (badAlpha > 0) report.error("V14", where, `COLOR_0 알파가 1이 아닌 정점이 ${badAlpha}개 있습니다.`);
    }
  }
}

/** V15: `_Outline` 접미 메시 금지 */
function checkOutline(ctx, file, model) {
  for (const meshNode of model.meshNodes) {
    if (meshNode.name.endsWith(OUTLINE_MESH_SUFFIX)) {
      ctx.report.error("V15", whereOf(file, meshNode.name), "_Outline 셸 메시는 v1에서 금지입니다(엔진 hull 외곽선과 이중 렌더, kit-outline-shell-forbidden).");
    }
  }
}

/** V20: NaN/Inf, 인덱스 범위, 빈 프리미티브, 삼각형 모드, 법선 길이 */
function checkIntegrity(ctx, file, model) {
  const { report } = ctx;
  for (const meshNode of model.meshNodes) {
    const where = whereOf(file, meshNode.name);
    primsOf(meshNode).forEach((prim, index) => {
      const label = `${where}#${index}`;
      const indexCount = prim.indices === null ? prim.count : prim.indices.length;
      if (prim.count === 0 || indexCount === 0) {
        report.error("V20", label, "비어 있는 프리미티브입니다.");
        return;
      }
      if (prim.mode !== 4) report.error("V20", label, `프리미티브 모드가 TRIANGLES(4)가 아닙니다(${prim.mode}).`);
      const arrays = [["POSITION", prim.positions], ["NORMAL", prim.normals], ["TEXCOORD_0", prim.uvs], ["WEIGHTS_0", prim.weights]];
      if (ctx.v2) arrays.push(["TEXCOORD_1", prim.uvs1]); // 키트 v2는 UV1(패턴·헤어 흐름)을 커스텀에 쓴다
      prim.targets.forEach((target, t) => {
        arrays.push([`morph[${t}].POSITION`, target.position]);
        arrays.push([`morph[${t}].NORMAL`, target.normal]);
      });
      for (const [name, array] of arrays) {
        if (array === null) continue;
        const bad = firstNonFinite(array);
        if (bad >= 0) report.error("V20", label, `${name}에 NaN/Inf가 있습니다(요소 ${bad}).`);
      }
      if (prim.indices !== null) {
        let outOfRange = 0;
        for (let i = 0; i < prim.indices.length; i += 1) if (prim.indices[i] >= prim.count) outOfRange += 1;
        if (outOfRange > 0) report.error("V20", label, `정점 수(${prim.count})를 넘는 인덱스가 ${outOfRange}개 있습니다.`);
      }
      if (prim.normals === null) {
        report.error("V20", label, "NORMAL이 없습니다.");
      } else {
        let bad = 0;
        for (let v = 0; v < prim.count; v += 1) {
          const length = Math.hypot(prim.normals[v * 3], prim.normals[v * 3 + 1], prim.normals[v * 3 + 2]);
          if (!(Math.abs(length - 1) <= LIMITS.normalLengthTolerance)) bad += 1;
        }
        if (bad / prim.count > 1 - LIMITS.normalLengthFraction) {
          report.error("V20", label, `노멀 길이가 1±${LIMITS.normalLengthTolerance}를 벗어난 정점이 ${bad}개(${((bad / prim.count) * 100).toFixed(2)}%)입니다.`);
        }
      }
    });
  }
}

// ---------------------------------------------------------------- manifest 수준 검사

function checkSkeletonContract(manifest, report) {
  const { joints, parents, boneMap, endBones } = manifest.skeleton;
  const where = "kit.json:skeleton";
  const jointSet = new Set(joints);
  const bones = Object.values(boneMap);
  const missing = HUMANOID_BONE_NAMES.filter((name) => !bones.includes(name));
  const duplicated = bones.filter((name, index) => bones.indexOf(name) !== index);
  if (bones.length !== HUMANOID_BONE_NAMES.length || missing.length > 0 || duplicated.length > 0) {
    report.error("V6", where, `boneMap이 계약 ${HUMANOID_BONE_NAMES.length}본을 정확히 1회씩 덮지 않습니다(${bones.length}개). 없음: [${listFew(missing)}], 중복: [${listFew(duplicated)}]`);
  }
  for (const node of Object.keys(boneMap)) if (!jointSet.has(node)) report.error("V6", where, `boneMap의 노드 ${node}가 joints에 없습니다.`);
  for (const [node, bone] of Object.entries(boneMap)) {
    let cursor = parents[node];
    let parentBone = null;
    let guard = 0;
    while (cursor !== null && cursor !== undefined && guard < 200) {
      if (boneMap[cursor] !== undefined) {
        parentBone = boneMap[cursor];
        break;
      }
      cursor = parents[cursor];
      guard += 1;
    }
    if (HUMANOID_BONE_PARENTS[bone] !== parentBone) {
      report.error("V6", where, `${node}(${bone})의 부모 본이 ${String(parentBone)}입니다. 계약 HUMANOID_BONE_PARENTS는 ${String(HUMANOID_BONE_PARENTS[bone])}입니다.`);
    }
  }
  const classification = classifyBoneNames(joints, boneMap);
  if (classification.all.missing.length > 0) {
    report.error("V6", where, `classifyBoneNames가 ${classification.all.covered.length}/${HUMANOID_BONE_NAMES.length}본만 덮습니다. 없음: ${listFew(classification.all.missing)}`);
  }
  const unmappedNames = classification.unmapped.map((entry) => entry.name).sort();
  if (stableStringify(unmappedNames) !== stableStringify([...endBones].sort())) {
    report.error("V6", where, `의도되지 않은 미매핑 joint가 있습니다: 미매핑 [${listFew(unmappedNames)}], endBones [${listFew([...endBones].sort())}]`);
  }
  if (stableStringify(endBones.slice().sort()) !== stableStringify([...KIT_END_BONES].sort())) {
    report.error("V6", where, "endBones가 계약의 끝 본 13개와 다릅니다.");
  }
  if (stableStringify(boneMap) !== stableStringify(KIT_BONE_MAP)) {
    report.error("V6", where, "boneMap이 계약 상수 KIT_BONE_MAP과 다릅니다.");
  }
}

function checkProvenance(manifest, report, source) {
  const { sources, noticeFile } = manifest.provenance;
  if (sources.length === 0) report.error("V4", "kit.json:provenance", "sources가 비어 있습니다.");
  sources.forEach((entry, index) => {
    const where = `kit.json:provenance.sources[${index}]`;
    if (!KIT_ALLOWED_LICENSES.includes(entry.license)) report.error("V4", where, `라이선스 ${String(entry.license)}는 허용되지 않습니다(${KIT_ALLOWED_LICENSES.join(", ")}만).`);
    if (entry.license === "hyper3d-rodin-output") {
      // Hyper3D 산출물: 생성 id와 반입 기록 문서가 있어야 한다(기록 없이 반입하지 못하게 하는 것이 목적, docs/hyper3d-terms-record.md).
      if (entry.derivative !== true) report.error("V4", where, `${entry.id}: Hyper3D 산출물은 파생물이어야 합니다(derivative: true).`);
      if (typeof entry.generationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(entry.generationId)) {
        report.error("V4", where, `${entry.id}: Hyper3D 산출물은 generationId(uuid)가 필요합니다.`);
      }
      const evidence = entry.evidenceDoc;
      if (typeof evidence !== "string" || !evidence.startsWith(KIT_HYPER3D_EVIDENCE_PREFIX) || evidence.includes("..")) {
        report.error("V4", where, `${entry.id}: Hyper3D 산출물은 반입 기록 문서 경로(evidenceDoc, ${KIT_HYPER3D_EVIDENCE_PREFIX} 아래)가 필요합니다.`);
      } else if (!existsSync(path.join(REPO_ROOT, evidence))) {
        report.error("V4", where, `${entry.id}: 반입 기록 문서(${evidence})가 저장소에 없습니다.`);
      }
    }
    if (entry.license !== "original") {
      if (typeof entry.url !== "string" || !entry.url.startsWith("https://")) report.error("V4", where, `${entry.id}: 내려받은 소스는 https URL이 필요합니다.`);
      if (typeof entry.zipSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(entry.zipSha256)) report.error("V4", where, `${entry.id}: 내려받은 소스는 zipSha256(64자리 hex)이 필요합니다.`);
    } else if (typeof entry.url === "string" && !entry.url.startsWith("https://")) {
      report.error("V4", where, `${entry.id}: url은 https여야 합니다.`);
    }
    if (!HANGUL.test(entry.changesKo)) report.error("V4", where, `${entry.id}: changesKo에 한글 변경 내용이 필요합니다.`);
  });
  const notice = source.read(noticeFile);
  if (notice === null) report.error("V4", noticeFile, `NOTICE 파일(${noticeFile})이 없습니다.`);
  else if (notice.length === 0) report.error("V4", noticeFile, "NOTICE 파일이 비어 있습니다.");
}

function checkPresets(manifest, baseIds, report) {
  for (const part of manifest.parts) {
    const slash = part.id.indexOf("/");
    const slot = part.id.slice(0, slash);
    const name = part.id.slice(slash + 1);
    const vocabulary = SLOT_PRESET_IDS[slot];
    if (vocabulary === undefined || !vocabulary.includes(name)) report.error("V16", `kit.json:parts[${part.id}]`, `파츠 id ${part.id}가 프리셋 어휘 SLOT_PRESET_IDS 밖입니다(어휘를 늘리지 않는다).`);
  }
  for (const baseId of baseIds) {
    for (const id of KIT_REQUIRED_PRESETS) {
      const part = manifest.parts.find((candidate) => candidate.id === id);
      if (part?.variants[baseId] === undefined) report.error("V16", `kit.json:${baseId}`, `필수 파츠 ${id}의 ${baseId} 변형이 없습니다. 하나라도 없으면 키트 전체가 invalid입니다(kit-part-missing).`);
    }
    for (const slot of KIT_PART_SLOTS) {
      for (const name of SLOT_PRESET_IDS[slot]) {
        const id = `${slot}/${name}`;
        const part = manifest.parts.find((candidate) => candidate.id === id);
        const reason = part?.unavailable[baseId];
        if (part?.variants[baseId] !== undefined) continue;
        if (typeof reason !== "string" || reason.trim().length === 0 || !HANGUL.test(reason)) {
          report.error("V16", `kit.json:${baseId}`, `${id}: ${baseId} 변형이 없으면 unavailable.${baseId}에 비어 있지 않은 한글 사유가 필요합니다.`);
        }
      }
    }
  }
}

function checkCapabilities(manifest, baseIds, report) {
  for (const baseId of baseIds) {
    const declared = manifest.slotCapabilities[baseId];
    if (declared === undefined) {
      report.error("V17", `kit.json:slotCapabilities.${baseId}`, "선언이 없습니다.");
      continue;
    }
    let derived;
    try {
      derived = deriveKitCapabilities(manifest, baseId);
    } catch (error) {
      report.error("V17", `kit.json:slotCapabilities.${baseId}`, `능력 규칙 계산에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const slots = [...new Set([...Object.keys(derived), ...Object.keys(declared)])];
    const different = slots.filter((slot) => stableStringify(derived[slot]) !== stableStringify(declared[slot]));
    if (different.length > 0) {
      report.error("V17", `kit.json:slotCapabilities.${baseId}`, `선언이 규칙 계산(deriveKitCapabilities)과 다른 슬롯: ${listFew(different, 8)} (kit-capabilities-mismatch)`);
    }
  }
}

function checkPhysics(raw, report) {
  const physics = raw?.physics;
  const ok = physics !== null && typeof physics === "object" && physics.mode === "static" && Array.isArray(physics.chains) && physics.chains.length === 0 && Array.isArray(physics.colliders) && physics.colliders.length === 0;
  if (!ok) report.error("V19", "kit.json:physics", `physics는 { mode: "static", chains: [], colliders: [] } 이어야 합니다(v1은 물리 없음).`);
}

function checkManifestConstants(manifest, report) {
  if (manifest.kitId !== KIT_DEFAULT_ID) report.error("V1", "kit.json", `kitId가 ${KIT_DEFAULT_ID}가 아닙니다(${manifest.kitId}).`);
  if (manifest.kitVersion !== KIT_CURRENT_VERSION) report.error("V1", "kit.json", `kitVersion이 계약 상수 KIT_CURRENT_VERSION(${KIT_CURRENT_VERSION})과 다릅니다(${manifest.kitVersion}).`);
  if (manifest.defaults.base !== KIT_DEFAULT_BASE_ID) report.error("V1", "kit.json:defaults", `defaults.base가 ${KIT_DEFAULT_BASE_ID}가 아닙니다.`);
  if (stableStringify(manifest.defaults.slots) !== stableStringify(KIT_DEFAULT_SLOTS)) report.error("V1", "kit.json:defaults.slots", "defaults.slots가 계약 상수 KIT_DEFAULT_SLOTS와 다릅니다.");
  if (stableStringify(manifest.defaults.colors) !== stableStringify(DEFAULT_RECIPE_COLORS)) report.error("V1", "kit.json:defaults.colors", "defaults.colors가 DEFAULT_RECIPE_COLORS와 다릅니다.");
}

function collectFileSpecs(manifest, baseIds) {
  const specs = new Map();
  const add = (spec) => {
    const existing = specs.get(spec.path);
    if (existing === undefined) {
      specs.set(spec.path, { ...spec, baseIds: new Set([spec.baseId]), labels: [spec.label] });
      return;
    }
    existing.baseIds.add(spec.baseId);
    existing.labels.push(spec.label);
    if (stableStringify(existing.declared) !== stableStringify(spec.declared)) existing.conflict = true;
  };
  for (const baseId of baseIds) {
    const base = manifest.bases[baseId];
    if (base === undefined) continue;
    add({ path: base.file.path, bytes: base.file.bytes, sha256: base.file.sha256, kind: "base", baseId, declared: base.meshes, label: `bases.${baseId}`, slot: null, name: null, partId: null, hides: [], shapes: [], layer: null });
  }
  // 키트 v2 메타(shapes·layer·anchor)는 사양에 함께 싣는다. v1 변형에는 없어 빈 값이다.
  const partSpec = (part, baseId, variant, layer) => ({ path: variant.file.path, bytes: variant.file.bytes, sha256: variant.file.sha256, kind: "part", baseId, declared: variant.meshes, label: `${part.id}@${baseId}${layer === null ? "" : `#${layer}`}`, slot: part.slot, name: part.id.slice(part.id.indexOf("/") + 1), partId: part.id, hides: variant.hides, shapes: variant.shapes ?? [], layer, anchor: variant.anchor ?? null });
  for (const part of manifest.parts) {
    for (const baseId of baseIds) {
      const variant = part.variants[baseId];
      if (variant === undefined) continue;
      add(partSpec(part, baseId, variant, null));
    }
  }
  for (const part of manifest.parts) for (const baseId of baseIds) for (const [layer, variant] of Object.entries(part.layerVariants?.[baseId] ?? {})) if (variant !== undefined) add(partSpec(part, baseId, variant, layer));
  return [...specs.values()];
}

function allReferencedPaths(manifest) {
  const paths = new Set();
  for (const baseId of KIT_BASE_IDS) {
    const base = manifest.bases[baseId];
    if (base !== undefined) paths.add(base.file.path);
    if (base?.headRegionMask !== undefined) paths.add(base.headRegionMask.file.path);
  }
  for (const part of manifest.parts) for (const baseId of KIT_BASE_IDS) {
    const variant = part.variants[baseId];
    if (variant !== undefined) paths.add(variant.file.path);
    for (const layered of Object.values(part.layerVariants?.[baseId] ?? {})) if (layered !== undefined) paths.add(layered.file.path);
  }
  return paths;
}

// ---------------------------------------------------------------- 진입점

/**
 * 키트 폴더 하나를 검증한다.
 * @param {{source: ReturnType<typeof createDiskSource>, base?: "female" | "male" | "all", only?: string[] | null, strict?: boolean, followQuantile?: number, uvRasterSize?: number}} input
 */
export async function verifyKit(input) {
  const { source } = input;
  const only = input.only ?? null;
  const report = new Report(only === null ? CHECK_IDS : only);
  if (only !== null && only.some((id) => NEEDS_GLB_IDS.has(id))) report.selected.add("V5");
  const options = { followQuantile: input.followQuantile ?? 1, uvRasterSize: input.uvRasterSize ?? LIMITS.uvRasterSize };
  const strict = input.strict === true;
  const finish = (baseIds) => {
    const summary = report.summary();
    return {
      ok: summary.errors === 0 && (!strict || summary.warnings === 0),
      root: source.label,
      bases: baseIds,
      strict,
      errors: summary.errors,
      warnings: summary.warnings,
      checks: summary.checks,
      findings: report.findings,
      metrics: report.metrics,
    };
  };

  const manifestBytes = source.read(KIT_MANIFEST_FILENAME);
  if (manifestBytes === null) {
    report.require("V1");
    report.error("V1", KIT_MANIFEST_FILENAME, `${KIT_MANIFEST_FILENAME}이 없습니다.`);
    return finish([]);
  }
  let raw;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  } catch (error) {
    report.require("V1");
    report.error("V1", KIT_MANIFEST_FILENAME, `JSON을 해석하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    return finish([]);
  }
  report.begin("V1");
  // 키트 v2(`toonstudio.character-kit/2`): v2 계약 스키마로 읽고 V21~V24와 v2 확장 규칙을 더 돈다. v1은 예전과 같다.
  const isV2 = raw !== null && typeof raw === "object" && raw.schema === KIT_V2_SCHEMA_ID;
  if (isV2 || V2_CHECK_IDS.some((id) => report.wants(id))) report.checks = ALL_CHECKS;
  if (isV2) {
    if (only === null) for (const id of V2_CHECK_IDS) report.selected.add(id);
  } else {
    for (const id of V2_CHECK_IDS) report.skip(id, "키트 v1 manifest에는 형태 키·층·UV1 메타가 없어 해당하지 않습니다");
  }
  if (report.wants("V19")) {
    report.begin("V19");
    checkPhysics(raw, report);
  }
  const full = (isV2 ? kitManifestV2Schema : kitManifestSchema).safeParse(raw);
  let manifest = full.success ? full.data : null;
  if (!full.success) {
    const lenient = (isV2 ? kitManifestV2ObjectSchema : kitManifestObjectSchema).safeParse(raw);
    manifest = lenient.success ? lenient.data : null;
    if (report.wants("V1") || manifest === null) {
      report.require("V1");
      for (const issue of (lenient.success ? full : lenient).error.issues.slice(0, 40)) {
        report.error("V1", `${KIT_MANIFEST_FILENAME}:${issue.path.map(String).join(".") || "(root)"}`, issue.message);
      }
    }
  }
  if (manifest === null) {
    for (const check of report.checks) report.skip(check.id, "kit.json 구조를 해석할 수 없어 건너뜀");
    return finish([]);
  }
  if (report.wants("V1")) checkManifestConstants(manifest, report);

  const requested = input.base ?? "all";
  const baseIds = KIT_BASE_IDS.filter((id) => manifest.bases[id] !== undefined && (requested === "all" || requested === id));
  if (requested !== "all" && manifest.bases[requested] === undefined) {
    report.require("V1");
    report.error("V1", KIT_MANIFEST_FILENAME, `요청한 베이스 ${requested}가 kit.json에 없습니다.`);
    return finish(baseIds);
  }

  const cache = new Map();
  const bytesOf = (relative) => {
    if (!cache.has(relative)) cache.set(relative, source.read(relative));
    return cache.get(relative);
  };
  const specs = collectFileSpecs(manifest, baseIds);

  // V2·V3: 파일
  report.begin("V2");
  report.begin("V3");
  const fileMetrics = [];
  let totalBytes = 0;
  for (const spec of specs) {
    const bytes = bytesOf(spec.path);
    if (bytes === null) {
      report.error("V2", spec.path, `파일이 없습니다(${spec.labels.join(", ")}) (kit-file-fetch-failed).`);
      continue;
    }
    if (bytes.length !== spec.bytes) report.error("V2", spec.path, `파일 크기 ${bytes.length} B가 kit.json 선언 ${spec.bytes} B와 다릅니다(kit-bytes-mismatch).`);
    const digest = sha256Hex(bytes);
    if (digest !== spec.sha256) report.error("V2", spec.path, `SHA-256이 kit.json 선언과 다릅니다(실제 ${digest.slice(0, 12)}…, kit-sha-mismatch).`);
    totalBytes += bytes.length;
    fileMetrics.push({ path: spec.path, bytes: bytes.length, kind: spec.kind });
    const limit = spec.kind === "base" ? KIT_BUDGET.baseGlbMaxBytes : KIT_BUDGET.partGlbMaxBytes;
    if (bytes.length > limit) report.error("V3", spec.path, `${spec.kind === "base" ? "베이스" : "파츠"} GLB ${(bytes.length / 1048576).toFixed(2)} MiB가 한도 ${(limit / 1048576).toFixed(1)} MiB를 넘습니다.`);
  }
  if (isV2) {
    v2.checkHeadRegionMasksV2(manifest, baseIds, bytesOf, report, decodeImageInfo);
    const maskPaths = new Set(baseIds.map((baseId) => manifest.bases[baseId].headRegionMask?.file.path).filter((value) => value !== undefined));
    for (const maskPath of maskPaths) totalBytes += bytesOf(maskPath)?.length ?? 0; // 마스크 PNG도 키트 총량에 든다(계약 manifestV2Issues와 같은 집계)
    if (report.wants("V3")) v2.checkShapeCapacityV2(manifest, baseIds, report);
  }
  report.metric("files", fileMetrics);
  report.metric("totalBytes", totalBytes);
  if (totalBytes > KIT_BUDGET.totalMaxBytes) report.error("V3", KIT_MANIFEST_FILENAME, `키트 고유 파일 합계 ${(totalBytes / 1048576).toFixed(2)} MiB가 한도 ${(KIT_BUDGET.totalMaxBytes / 1048576).toFixed(0)} MiB를 넘습니다.`);
  for (const spec of specs) if (spec.conflict === true) report.error("V6", spec.path, `같은 파일을 서로 다른 메시 선언으로 참조합니다(${spec.labels.join(", ")}).`);
  if (report.wants("V2")) {
    const referenced = allReferencedPaths(manifest);
    const known = new Set([KIT_MANIFEST_FILENAME, manifest.provenance.noticeFile]);
    const lower = new Map();
    for (const relative of source.list()) {
      if (!referenced.has(relative) && !known.has(relative)) report.error("V2", relative, "kit.json이 모르는 파일입니다(kit.json과 NOTICE.md 외에는 선언되지 않은 파일을 둘 수 없습니다).");
      const key = relative.toLowerCase();
      if (lower.has(key)) report.error("V2", relative, `대소문자만 다른 중복 경로입니다(${lower.get(key)}).`);
      lower.set(key, relative);
    }
  }
  if (report.wants("V4")) {
    report.begin("V4");
    checkProvenance(manifest, report, { read: bytesOf });
  }
  if (report.wants("V6")) {
    report.begin("V6");
    checkSkeletonContract(manifest, report);
  }
  if (report.wants("V16")) {
    report.begin("V16");
    checkPresets(manifest, baseIds, report);
    if (isV2) v2.checkLayersV2(manifest, baseIds, report);
  }
  if (report.wants("V17")) {
    report.begin("V17");
    checkCapabilities(manifest, baseIds, report);
    if (isV2) v2.checkCustomConsistencyV2(manifest, baseIds, report);
  }
  if (report.wants("V18")) {
    report.begin("V18");
    const missing = KIT_REQUIRED_JOINT_OFFSET_MORPHS.filter((name) => manifest.jointOffsets[name] === undefined || Object.keys(manifest.jointOffsets[name]).length === 0);
    if (missing.length > 0) report.error("V18", "kit.json:jointOffsets", `필수 관절 오프셋 morph ${missing.length}개가 비어 있습니다: ${listFew(missing, 6)}`);
    for (const [morph, table] of Object.entries(manifest.jointOffsets)) {
      for (const [joint, offset] of Object.entries(table)) {
        if (!offset.every(Number.isFinite)) report.error("V18", `kit.json:jointOffsets.${morph}.${joint}`, "오프셋에 NaN/Inf가 있습니다.");
        else if (Math.hypot(...offset) > KIT_BUDGET.maxJointOffsetM) report.error("V18", `kit.json:jointOffsets.${morph}.${joint}`, `오프셋 크기가 ${KIT_BUDGET.maxJointOffsetM} m를 넘습니다.`);
        if (!manifest.skeleton.joints.includes(joint)) report.error("V18", `kit.json:jointOffsets.${morph}.${joint}`, "joints에 없는 본입니다.");
      }
      if (!isMorphTargetName(morph)) report.error("V18", `kit.json:jointOffsets.${morph}`, "morph 어휘에 없는 키입니다.");
    }
  }

  const needsGlb = [...NEEDS_GLB_IDS].some((id) => report.wants(id));
  if (!needsGlb) return finish(baseIds);

  // GLB 열기
  const models = new Map();
  for (const spec of specs) {
    const bytes = bytesOf(spec.path);
    models.set(spec.path, bytes === null ? null : await loadGlbModel(bytes, spec.path, report));
  }
  const ctx = { report, manifest, options, imageCache: new Map(), textures: [], meshes: [], v2: isV2 };
  const statsByPath = new Map();
  const perFileChecks = [["V6", checkNamesAndSkeleton], ["V7", checkTransforms], ["V8", checkSkin], ["V10", checkRegions], ["V12", checkUvs], ["V13", checkMaterials], ["V14", checkHairAndColors], ["V15", checkOutline], ["V20", checkIntegrity]];
  if (isV2) perFileChecks.push(["V14", v2.checkHairFlowV2], ["V23", v2.checkHairUv0V2], ["V24", v2.checkPatternUvV2]);
  for (const spec of specs) {
    const model = models.get(spec.path);
    if (model === null || model === undefined) continue;
    for (const [id, check] of perFileChecks) {
      if (!report.wants(id)) continue;
      report.begin(id);
      check(ctx, spec, model);
    }
    if (report.wants("V9")) {
      report.begin("V9");
      for (const declaration of spec.declared) {
        const meshNode = model.meshNodeByName.get(declaration.node);
        if (meshNode !== undefined) checkMeshMorphs(ctx, spec, declaration, meshNode);
      }
      if (isV2) v2.checkShapeMorphsV2(ctx, spec, model);
      if (spec.kind === "base") checkSeam(ctx, spec, model);
    }
    report.begin("V11");
    statsByPath.set(spec.path, report.wants("V11") ? checkTriangles(ctx, spec, model) : roleStatsOf(spec, model));
  }
  report.metric("textures", ctx.textures);
  report.metric("meshes", ctx.meshes);

  // 베이스를 기준으로 하는 교차 검사
  for (const baseId of baseIds) {
    const base = manifest.bases[baseId];
    const baseModel = models.get(base.file.path);
    if (baseModel === null || baseModel === undefined) continue;
    const baseSpec = specs.find((spec) => spec.path === base.file.path);
    if (report.wants("V9")) {
      checkFollow(ctx, baseSpec, baseModel, baseModel, baseId);
      for (const spec of specs) {
        const model = models.get(spec.path);
        if (spec.kind !== "part" || !spec.baseIds.has(baseId) || model === null || model === undefined) continue;
        checkFollow(ctx, spec, model, baseModel, baseId);
      }
    }
    if (report.wants("V10")) {
      const ranges = new Set(base.bodyRegions.map((range) => range.id));
      for (const part of manifest.parts) {
        // 키트 v2 층 변형의 hides도 같은 영역 표로 본다(층 몸 숨김 = 착용 층 hides의 합집합)
        for (const [layer, variant] of [[null, part.variants[baseId]], ...Object.entries(part.layerVariants?.[baseId] ?? {})]) {
          for (const id of variant?.hides ?? []) if (!ranges.has(id)) report.error("V10", `kit.json:${part.id}@${baseId}${layer === null ? "" : `#${layer}`}`, `hides의 영역 ${id}가 bodyRegions에 없습니다.`);
        }
      }
    }
    if (isV2 && ["V14", "V21", "V22"].some((id) => report.wants(id))) {
      for (const id of ["V21", "V22"]) report.begin(id);
      const surfaces = v2.baseSurfacesOf(ctx, baseModel, baseId);
      for (const spec of specs) {
        const model = models.get(spec.path);
        if (spec.kind !== "part" || !spec.baseIds.has(baseId) || model === null || model === undefined) continue;
        if (report.wants("V14")) v2.checkHairFlowDirectionV2(ctx, spec, model, surfaces, baseId);
        if (report.wants("V21")) v2.checkShapePenetrationV2(ctx, spec, model, surfaces, baseId);
        if (report.wants("V22")) v2.checkLayerGapV2(ctx, spec, model, surfaces, baseId);
      }
    }
    if (report.wants("V18")) {
      const skeleton = manifest.skeleton;
      const headWorld = new Map();
      const parentWorldMatrix = new Map();
      for (const node of baseModel.jointNodes) {
        const matrix = node.getWorldMatrix();
        headWorld.set(node.getName(), [matrix[12], matrix[13], matrix[14]]);
        const parent = node.getParentNode();
        if (parent !== null) parentWorldMatrix.set(node.getName(), parent.getWorldMatrix());
      }
      const views = [KIT_BODY_NODE, KIT_HEAD_NODE].map((name) => baseModel.meshNodeByName.get(name)).filter((node) => node !== undefined).map((node) => viewOf(node));
      const morphs = Object.keys(manifest.jointOffsets).filter((name) => isMorphTargetName(name));
      const result = verifyJointOffsets({ jointOffsets: manifest.jointOffsets, joints: baseModel.joints, parents: skeleton.parents, headWorld, parentWorldMatrix, views, morphs });
      report.metric(`${base.file.path}.jointOffsets`, { compared: result.compared, skipped: result.skippedJoints, worstM: result.worst === null ? 0 : Number(result.worst.diffM.toFixed(5)), worst: result.worst === null ? null : `${result.worst.morph}|${result.worst.joint}` });
      if (result.compared === 0 && morphs.length > 0) {
        report.warn("V18", base.file.path, "관절 근처에서 비교할 몸 정점을 찾지 못해 독립 대조를 하지 못했습니다.");
      } else if (result.worst !== null && result.worst.diffM > LIMITS.jointOffsetErrorM) {
        report.error("V18", base.file.path, `${result.worst.morph}의 ${result.worst.joint} 관절 오프셋이 몸 정점 변위와 ${fmt(result.worst.diffM * 1000, 1)} mm 어긋납니다(오류 ${LIMITS.jointOffsetErrorM * 1000} mm 초과, 부모 로컬 프레임을 확인하세요).`);
      } else if (result.worst !== null && result.worst.diffM > LIMITS.jointOffsetWarnM) {
        report.warn("V18", base.file.path, `${result.worst.morph}의 ${result.worst.joint} 관절 오프셋이 몸 정점 변위와 ${fmt(result.worst.diffM * 1000, 1)} mm 어긋납니다(경고 ${LIMITS.jointOffsetWarnM * 1000} mm 초과).`);
      }
    }
  }

  // V11: 활성 최악 합계·얼굴 파츠 예산
  if (report.wants("V11")) {
    const worstCase = {};
    const sumRoles = (roles) => [...roles.values()].reduce((sum, value) => sum + value, 0);
    for (const baseId of baseIds) {
      const base = manifest.bases[baseId];
      const baseRoles = statsByPath.get(base.file.path);
      if (baseRoles === undefined) continue;
      let total = sumRoles(baseRoles);
      const picks = {};
      for (const slot of KIT_PART_SLOTS) {
        let best = { id: null, triangles: 0 };
        for (const part of manifest.parts) {
          if (part.slot !== slot) continue;
          const variant = part.variants[baseId];
          const roles = variant === undefined ? undefined : statsByPath.get(variant.file.path);
          if (roles === undefined) continue;
          const triangles = sumRoles(roles);
          if (slot === "irises") {
            const face = FACE_ROLES.reduce((sum, role) => sum + (baseRoles.get(role) ?? 0), 0) + IRIS_ROLES.reduce((sum, role) => sum + (roles.get(role) ?? 0), 0);
            if (face > KIT_BUDGET.triangles.faceParts) report.error("V11", `kit.json:${part.id}@${baseId}`, `눈·홍채·입·속눈썹·눈썹 삼각형 합 ${face}개가 예산 ${KIT_BUDGET.triangles.faceParts}개를 넘습니다.`);
          }
          if (triangles > best.triangles) best = { id: part.id, triangles };
        }
        picks[slot] = best;
        total += best.triangles;
      }
      worstCase[baseId] = { baseTriangles: sumRoles(baseRoles), picks, totalTriangles: total };
      if (!isV2 && total > KIT_BUDGET.triangles.activeWorst) report.error("V11", base.file.path, `활성 최악 합계 ${total} 삼각형이 예산 ${KIT_BUDGET.triangles.activeWorst}를 넘습니다(${Object.entries(picks).map(([slot, pick]) => `${slot}=${pick.id ?? "-"}:${pick.triangles}`).join(", ")}).`);
      if (isV2) {
        // 키트 v2: 겹쳐 입기 층(이너·아우터·레그웨어)을 더하고, 소품 11개 추가(같은 소품 반복 포함)는 따로 경고한다(O3 예산 상향은 소유자 결정)
        const layerPicks = {};
        for (const part of manifest.parts) for (const [layer, variant] of Object.entries(part.layerVariants?.[baseId] ?? {})) {
          const triangles = variant === undefined ? 0 : sumRoles(statsByPath.get(variant.file.path) ?? new Map());
          if (triangles > (layerPicks[layer]?.triangles ?? 0)) layerPicks[layer] = { id: part.id, triangles };
        }
        const result = v2.activeWorstV2({ baseTriangles: sumRoles(baseRoles), slotWorst: Object.fromEntries(Object.entries(picks).map(([slot, pick]) => [slot, pick.triangles])), layerWorst: Object.fromEntries(Object.entries(layerPicks).map(([layer, pick]) => [layer, pick.triangles])), accessoryMax: picks.accessory?.triangles ?? 0 });
        Object.assign(worstCase[baseId], { layers: layerPicks, totalWithLayers: result.withLayers, totalWithExtraAccessories: result.withAccessories });
        const listed = [...Object.entries(picks), ...Object.entries(layerPicks)].map(([key, pick]) => `${key}=${pick.id ?? "-"}:${pick.triangles}`).join(", ");
        if (result.withLayers > result.budget) report.error("V11", base.file.path, `활성 최악 합계(층 포함) ${result.withLayers} 삼각형이 예산 ${result.budget}를 넘습니다(${listed}).`);
        else if (result.withAccessories > result.budget) report.warn("V11", base.file.path, `소품 12개(가장 큰 소품 반복)까지 얹으면 ${result.withAccessories} 삼각형으로 예산 ${result.budget}를 넘습니다(설계 O3 — 예산 상향 또는 소품 수 제한은 소유자 결정).`);
      }
    }
    report.metric("worstCase", worstCase);
  }
  return finish(baseIds);
}

/** 매니페스트·파일 수준 검사만(V1~V4, V16, V17, V19) */
export const MANIFEST_CHECK_IDS = Object.freeze(["V1", "V2", "V3", "V4", "V16", "V17", "V19"]);

/** manifest 수준 검사만 실행한다(GLB를 열지 않는다). */
export function verifyKitManifest(input) {
  return verifyKit({ ...input, only: [...MANIFEST_CHECK_IDS] });
}

/** GLB 검사(V5~V15, V18, V20)만 실행한다. manifest는 파일 목록을 얻기 위해 읽는다. */
export function verifyGlb(input) {
  return verifyKit({ ...input, only: [...GLB_CHECK_IDS] });
}

// ---------------------------------------------------------------- CLI

export const HELP_TEXT = `캐릭터 키트 검증기 (docs/authored-kit-spec.md 9절)

사용법:
  pnpm exec tsx scripts/verify-character-kit.mjs [옵션]

옵션:
  --root <폴더>        키트 폴더(기본: apps/character-lab/public/assets/characters/toonstudio-kit-v1)
  --base <id>          검사할 베이스: female | male | all (기본 all)
  --json <파일>        항목별 결과·수치를 JSON으로 기록
  --strict             경고도 오류로 센다
  --only <V1,V6,…>     지정한 검사만 실행(GLB 검사를 고르면 V5 컨테이너 검사가 함께 돈다)
  --follow-quantile <q> V9 따라가기 편차에 쓰는 분위수(기본 1 = 최댓값)
  -h, --help           이 도움말

검사 항목:
${CHECKS.map((check) => `  ${check.id.padEnd(4)} ${check.title}`).join("\n")}
${v2.V2_CHECKS.map((check) => `  ${check.id.padEnd(4)} ${check.title} (키트 v2 전용)`).join("\n")}

kit.json의 schema가 toonstudio.character-kit/2이면 v2 계약으로 읽고 V21~V24와 v2 확장 규칙(형태 키·층·강체 소품·채널 재질·UV1)을 더 돈다.

종료 코드: 0 = 오류 없음, 1 = 오류 있음(--strict면 경고 포함), 2 = 사용법 오류`;

/** @returns {{help: boolean, root: string, base: string, json: string | null, strict: boolean, only: string[] | null, followQuantile: number, error: string | null}} */
export function parseCliArgs(argv) {
  const result = { help: false, root: DEFAULT_KIT_ROOT, base: "all", json: null, strict: false, only: null, followQuantile: 1, error: null };
  const takeValue = (index, flag) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      result.error = `${flag}에 값이 필요합니다.`;
      return null;
    }
    return value;
  };
  for (let i = 0; i < argv.length && result.error === null; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue; // `pnpm run verify:character-kit -- <옵션>` 형태의 구분자
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--strict") result.strict = true;
    else if (arg === "--root" || arg === "--base" || arg === "--json" || arg === "--only" || arg === "--follow-quantile") {
      const value = takeValue(i, arg);
      if (value === null) break;
      i += 1;
      if (arg === "--root") result.root = path.resolve(value);
      else if (arg === "--json") result.json = path.resolve(value);
      else if (arg === "--base") {
        if (value !== "female" && value !== "male" && value !== "all") result.error = `--base는 female, male, all 중 하나여야 합니다(${value}).`;
        else result.base = value;
      } else if (arg === "--only") {
        const ids = value.split(",").map((id) => id.trim().toUpperCase()).filter((id) => id.length > 0);
        const unknown = ids.filter((id) => !ALL_CHECK_IDS.includes(id));
        if (ids.length === 0 || unknown.length > 0) result.error = `--only에 알 수 없는 검사 id가 있습니다: ${unknown.join(", ") || "(비어 있음)"}`;
        else result.only = ids;
      } else {
        const q = Number(value);
        if (!(q > 0 && q <= 1)) result.error = "--follow-quantile은 0 초과 1 이하여야 합니다.";
        else result.followQuantile = q;
      }
    } else {
      result.error = `알 수 없는 인자입니다: ${arg}`;
    }
  }
  return result;
}

function formatReport(result) {
  const lines = [`키트 검증: ${result.root} (베이스: ${result.bases.join(", ") || "-"})`];
  const mark = { pass: "통과", warn: "경고", fail: "실패", skipped: "건너뜀" };
  for (const [id, check] of Object.entries(result.checks)) {
    lines.push(`  [${mark[check.status]}] ${id} ${check.title}${check.errors + check.warnings > 0 ? ` (오류 ${check.errors}, 경고 ${check.warnings})` : ""}${check.skippedReason === undefined ? "" : ` - ${check.skippedReason}`}`);
    for (const finding of result.findings.filter((entry) => entry.id === id).slice(0, 12)) {
      lines.push(`      ${finding.level === "error" ? "오류" : "경고"} ${finding.where}: ${finding.message}`);
    }
    const hidden = result.findings.filter((entry) => entry.id === id).length - 12;
    if (hidden > 0) lines.push(`      … 외 ${hidden}건(--json으로 전체 확인)`);
  }
  if (typeof result.metrics.totalBytes === "number") lines.push(`  용량 합계: ${(result.metrics.totalBytes / 1048576).toFixed(2)} MiB`);
  lines.push(`결과: 오류 ${result.errors}, 경고 ${result.warnings}${result.ok ? " - 통과" : " - 실패"}`);
  return lines.join("\n");
}

/** CLI 본체. 종료 코드를 돌려준다(프로세스를 끝내지 않는다). */
export async function runCli(argv, output = { log: console.log, error: console.error }) {
  const args = parseCliArgs(argv);
  if (args.help) {
    output.log(HELP_TEXT);
    return 0;
  }
  if (args.error !== null) {
    output.error(`${args.error}\n--help로 사용법을 확인하세요.`);
    return 2;
  }
  const result = await verifyKit({ source: createDiskSource(args.root), base: args.base, only: args.only, strict: args.strict, followQuantile: args.followQuantile });
  output.log(formatReport(result));
  if (args.json !== null) {
    mkdirSync(path.dirname(args.json), { recursive: true });
    writeFileSync(args.json, `${JSON.stringify({ schema: "toonstudio.character-kit-verify/1", ...result }, null, 2)}\n`);
    output.log(`JSON 결과: ${args.json}`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`검증기가 예기치 않게 실패했습니다: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      process.exitCode = 1;
    },
  );
}
