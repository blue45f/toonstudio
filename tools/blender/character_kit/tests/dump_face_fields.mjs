/**
 * 얼굴 필드 TS 원본(`face-fields.ts`)을 평가해 JSON으로 덤프한다 (파이썬 이식본 `face_fields.py`와의 수치 일치 시험용).
 *
 * 실행(저장소 루트): pnpm exec tsx tools/blender/character_kit/tests/dump_face_fields.mjs <입력.json> <출력.json>
 *
 * 입력:  {"points": [[x, y, z], ...], "scopes": [0..4, ...]}   (scopes 길이 = points 길이)
 *        스코프 코드: 0=surface, 1=eye-left, 2=eye-right, 3=teeth, 4=tongue
 * 출력:  {"names": [...], "deltas": {"<이름>": [[dx, dy, dz], ...]}, ...}
 *        이름은 `param:<키>:+`(얼굴 파라미터 15종의 "+" 방향)와 `facs:<유닛>`(16종) 31개이고, 각 점은 자기 스코프로 평가한다.
 *        시험이 상수·순서까지 비교하도록 `faceParamKeys`·`facsUnits`·`scopeNames`·`landmarks`와 점별 `jawMask`도 함께 쓴다.
 *
 * 변위가 유한하지 않으면(NaN·무한대는 JSON에서 null이 되어 조용히 사라진다) 종료 코드 1로 실패한다. 입력 오류는 종료 코드 2다.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { FACE_PARAM_KEYS, FACS_UNITS } from "../../../../apps/character-lab/src/contracts/index.ts";
import { FACE_PARAM_FIELDS, FACS_FIELDS, jawMaskLocal } from "../../../../apps/character-lab/src/domains/humanoid/morph/face-fields.ts";
import { HEAD_LANDMARKS } from "../../../../apps/character-lab/src/domains/humanoid/proportions.ts";


/** 스코프 코드(인덱스) → TS 스코프 문자열 */
const SCOPE_BY_CODE = ["surface", "eye-left", "eye-right", "teeth", "tongue"];


function fail(message, exitCode = 2) {
  console.error(message);
  process.exit(exitCode);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return fail(`입력 JSON을 읽지 못했습니다: ${file} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function parsePoint(value, index) {
  if (Array.isArray(value) && value.length === 3) {
    const [x, y, z] = value;
    if (isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(z)) return [x, y, z];
  }
  return fail(`points[${index}]는 유한한 숫자 3개의 배열이어야 합니다.`);
}

function parseScope(value, index) {
  const scope = SCOPE_BY_CODE.find((_, code) => code === value);
  return scope ?? fail(`scopes[${index}]는 0..${SCOPE_BY_CODE.length - 1} 범위의 정수여야 합니다.`);
}

function parseSamples(raw) {
  if (!isRecord(raw) || !Array.isArray(raw.points) || !Array.isArray(raw.scopes)) {
    return fail('입력은 {"points": [[x, y, z], ...], "scopes": [0..4, ...]} 형식이어야 합니다.');
  }
  const points = raw.points;
  const scopes = raw.scopes;
  if (points.length !== scopes.length) {
    return fail(`points(${points.length})와 scopes(${scopes.length})의 길이가 같아야 합니다.`);
  }
  return points.map((point, index) => ({ point: parsePoint(point, index), scope: parseScope(scopes[index], index) }));
}

/** 모든 점을 자기 스코프로 평가한다. */
function evaluate(name, field, samples) {
  return samples.map(({ point, scope }, index) => {
    const delta = field(point, scope);
    if (!delta.every((component) => Number.isFinite(component))) {
      return fail(`${name}: 점 #${index}(${point.join(", ")}, 스코프 ${scope})의 변위가 유한하지 않습니다: ${delta.join(", ")}`, 1);
    }
    return [...delta];
  });
}

function main(argv) {
  const [inputPath, outputPath, ...extra] = argv;
  if (inputPath === undefined || outputPath === undefined || extra.length > 0) {
    fail("사용법: pnpm exec tsx tools/blender/character_kit/tests/dump_face_fields.mjs <입력.json> <출력.json>");
  }
  const samples = parseSamples(readJson(inputPath));

  const names = [];
  const deltas = {};
  for (const key of FACE_PARAM_KEYS) {
    const name = `param:${key}:+`;
    names.push(name);
    deltas[name] = evaluate(name, FACE_PARAM_FIELDS[key], samples);
  }
  for (const unit of FACS_UNITS) {
    const name = `facs:${unit}`;
    names.push(name);
    deltas[name] = evaluate(name, FACS_FIELDS[unit], samples);
  }

  const output = {
    names,
    deltas,
    jawMask: samples.map(({ point }) => jawMaskLocal(point)),
    faceParamKeys: [...FACE_PARAM_KEYS],
    facsUnits: [...FACS_UNITS],
    scopeNames: [...SCOPE_BY_CODE],
    landmarks: HEAD_LANDMARKS,
  };
  const out = path.resolve(outputPath);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(output), "utf8");
  console.log(`${samples.length}점 × ${names.length}이름을 ${out}에 썼습니다.`);
}

main(process.argv.slice(2));
