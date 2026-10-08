/**
 * 키트 프리뷰 CLI 인자 파서(순수, leaf).
 *
 * `scripts/kit-preview.mjs`(Node)가 이 파일을 **그대로 import**한다(Node의 TypeScript 타입 제거 실행, 저장소 engines ≥ 24.16).
 * 그래서 이 모듈은 다른 로컬 모듈을 런타임 import하지 않는다(타입 import도 쓰지 않는다) — Node는 확장자 없는 형제 import를 풀지 못한다.
 * 뷰·셰이딩·포즈·색 키·역할·본 이름 어휘는 여기가 단일 정의이며, 계약(`contracts/`)과의 일치는 `cli-args.test.ts`가 대조한다.
 *
 * 오류 문구는 사람이 읽는 한글이다. 파일 존재 확인 같은 I/O는 하지 않는다(`readText`를 주입받는다).
 */

/** 카메라 뷰 id. front/q3/side/back은 전신, face/face-q3은 얼굴, hands/feet는 근접. */
export const KIT_PREVIEW_VIEW_IDS = ["front", "q3", "side", "back", "face", "face-q3", "bust", "hands", "hands-palm", "feet"] as const;
export type KitPreviewViewId = (typeof KIT_PREVIEW_VIEW_IDS)[number];

/** `--views`를 생략했을 때 만드는 뷰(스펙의 8종) */
export const KIT_PREVIEW_DEFAULT_VIEW_IDS: readonly KitPreviewViewId[] = ["front", "q3", "side", "back", "face", "face-q3", "hands", "feet"];

export const KIT_PREVIEW_SHADINGS = ["toon", "pbr"] as const;
export type KitPreviewShading = (typeof KIT_PREVIEW_SHADINGS)[number];

/** 내장 포즈 프리셋. `t-pose`는 레스트 포즈(모든 델타가 항등)다. */
export const KIT_PREVIEW_POSE_IDS = ["t-pose", "a-pose", "arms-up", "elbows-bent", "squat", "sit", "twist", "neck-turn", "fist"] as const;
export type KitPreviewPoseId = (typeof KIT_PREVIEW_POSE_IDS)[number];

/** 품질 프리셋(계약 `QUALITY_PRESETS`와 같은 id) */
export const KIT_PREVIEW_QUALITIES = ["preview", "standard", "hero"] as const;
export type KitPreviewQuality = (typeof KIT_PREVIEW_QUALITIES)[number];

/** 툰 외곽선 방식(계약 `ShadingProfile.toon.outline`과 같은 집합) */
export const KIT_PREVIEW_OUTLINES = ["none", "hull", "edge"] as const;
export type KitPreviewOutline = (typeof KIT_PREVIEW_OUTLINES)[number];

/** 툰 램프 단수(계약 `ShadingProfile.toon.rampSteps`와 같은 집합) */
export const KIT_PREVIEW_RAMP_STEPS = [2, 3, 4] as const;
export type KitPreviewRampSteps = (typeof KIT_PREVIEW_RAMP_STEPS)[number];

/**
 * 툰 셰이딩 덮어쓰기. 지정하지 않은 값은 소스 종류별 기본값을 따른다
 * (키트 소스 = 앱의 키트 기본 `createKitDefaultRecipe()`: 램프 2단·림 끔, 병합(package) 소스 = 기존 `DEFAULT_SHADING`: 램프 3단·림 켬).
 */
export interface KitPreviewToonOverrides {
  readonly rampSteps?: KitPreviewRampSteps;
  readonly rim?: boolean;
  readonly outline?: KitPreviewOutline;
}

/** 레시피 색 키(계약 `RECIPE_COLOR_KEYS`와 같은 집합) */
export const KIT_PREVIEW_COLOR_KEYS = ["skin", "iris", "hair", "brow", "top", "bottom", "shoes", "accessory"] as const;
export type KitPreviewColorKey = (typeof KIT_PREVIEW_COLOR_KEYS)[number];

/** `--role`에 쓸 수 있는 파츠 역할(계약 `PART_ROLES`와 같은 어휘 — 키트용 `underwear` 포함, 순서도 같다) */
export const KIT_PREVIEW_ROLE_NAMES = [
  "skin",
  "head",
  "eyeball",
  "iris",
  "pupil",
  "eye-highlight",
  "brow",
  "lash",
  "teeth",
  "tongue",
  "hair",
  "top",
  "bottom",
  "shoes",
  "accessory",
  "underwear",
] as const;
export type KitPreviewRoleName = (typeof KIT_PREVIEW_ROLE_NAMES)[number];

/** 포즈 JSON의 키로 허용하는 VRM 휴머노이드 본 이름 55개(계약 `HUMANOID_BONE_NAMES`와 같은 순서) */
export const KIT_PREVIEW_BONE_NAMES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftEye",
  "rightEye",
  "jaw",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
] as const;

/** 포즈 JSON의 본 하나에 대한 회전 표기 */
export type PoseRotationSpec =
  | { readonly kind: "quat"; readonly value: readonly [number, number, number, number] }
  | { readonly kind: "axis-angle"; readonly axis: readonly [number, number, number]; readonly deg: number }
  | { readonly kind: "euler"; readonly degXyz: readonly [number, number, number] };

export type KitPreviewPoseRequest =
  | { readonly kind: "none" }
  | { readonly kind: "preset"; readonly id: KitPreviewPoseId }
  | { readonly kind: "custom"; readonly rotations: Readonly<Record<string, PoseRotationSpec>> };

export interface KitPreviewMorphAssignment {
  /** morph 이름 그대로(`param:height:+`, `facs:jawOpen`, Blender 원본 이름 등) 또는 부호 약식 `param:height` */
  readonly name: string;
  readonly value: number;
}

/** CLI가 정규화한 요청. 브라우저 페이지에도 이 값(JSON)이 그대로 건네진다. */
export interface KitPreviewRequest {
  /** 첫 번째 = 베이스, 나머지 = 파츠(CLI 입력 경로 그대로) */
  readonly glbPaths: readonly string[];
  readonly outDir: string;
  readonly name: string | null;
  readonly views: readonly KitPreviewViewId[];
  readonly shadings: readonly KitPreviewShading[];
  readonly morphs: readonly KitPreviewMorphAssignment[];
  readonly pose: KitPreviewPoseRequest;
  readonly size: number;
  readonly transparent: boolean;
  /** `#rrggbb`(소문자). 투명 출력이 아닐 때 장면 배경색 */
  readonly background: string;
  readonly colors: Readonly<Partial<Record<KitPreviewColorKey, string>>>;
  readonly roleOverrides: Readonly<Record<string, KitPreviewRoleName>>;
  readonly hairLod: number;
  readonly quality: KitPreviewQuality;
  /** 툰 셰이딩 덮어쓰기(`--ramp-steps`·`--rim`·`--outline`). 없는 값은 소스 종류별 기본값. */
  readonly toon: KitPreviewToonOverrides;
  /** true면 키트 이름 자동 감지를 건너뛰고 기존 병합(package) 경로로 올린다(`--legacy-merge`). */
  readonly legacyMerge: boolean;
  /** 접촉 시트 칸 크기(px). 0이면 시트를 만들지 않는다. */
  readonly sheetTile: number;
  /** true면 엔진을 만들지 않고 GLB 검사·병합 점검만 한다. */
  readonly inspectOnly: boolean;
  readonly timeoutSec: number;
  readonly chromiumPath: string | null;
  readonly renderer: "swiftshader" | "default";
  /** 이미 떠 있는 Vite dev 서버 주소(없으면 스크립트가 띄운다) */
  readonly devUrl: string | null;
  readonly quiet: boolean;
}

export type ParseArgsResult =
  | { readonly ok: true; readonly help: false; readonly request: KitPreviewRequest }
  | { readonly ok: true; readonly help: true }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface ParseArgsOptions {
  /** `--pose <파일 경로>`를 읽는다. 파일이 없으면 null(또는 throw)을 돌려준다. 생략하면 파일 경로 포즈를 거부한다. */
  readonly readText?: (path: string) => string | null;
}

export const DEFAULT_KIT_PREVIEW_SIZE = 768;
export const DEFAULT_KIT_PREVIEW_BACKGROUND = "#30343f";
export const DEFAULT_KIT_PREVIEW_SHEET_TILE = 256;
export const DEFAULT_KIT_PREVIEW_TIMEOUT_SEC = 240;
export const MIN_KIT_PREVIEW_SIZE = 64;
export const MAX_KIT_PREVIEW_SIZE = 4096;

const VALUE_FLAGS: ReadonlySet<string> = new Set([
  "--glb",
  "--out",
  "--name",
  "--views",
  "--shading",
  "--morph",
  "--pose",
  "--size",
  "--bg",
  "--color",
  "--role",
  "--hair-lod",
  "--quality",
  "--ramp-steps",
  "--rim",
  "--outline",
  "--sheet-tile",
  "--timeout-sec",
  "--chromium",
  "--renderer",
  "--dev-url",
]);
const BOOLEAN_FLAGS: ReadonlySet<string> = new Set(["--transparent", "--no-sheet", "--inspect-only", "--legacy-merge", "--quiet", "--help", "-h"]);

const HEX_PATTERN = /^#?([0-9a-fA-F]{6})$/u;
const SIGNED_PARAM_PATTERN = /^param:[A-Za-z]+$/u;

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

/** `#rrggbb`/`rrggbb`를 소문자 `#rrggbb`로. 형식이 틀리면 null. */
export function normalizeHexColor(value: string): string | null {
  const match = HEX_PATTERN.exec(value.trim());
  return match ? `#${(match[1] ?? "").toLowerCase()}` : null;
}

function parseInteger(label: string, raw: string, min: number, max: number, errors: string[]): number | null {
  if (!/^-?\d+$/u.test(raw.trim())) {
    errors.push(`${label}은(는) 정수여야 합니다: '${raw}'`);
    return null;
  }
  const value = Number(raw);
  if (value < min || value > max) {
    errors.push(`${label}은(는) ${min}~${max} 범위여야 합니다: ${value}`);
    return null;
  }
  return value;
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseViews(raw: string, errors: string[]): KitPreviewViewId[] {
  const result: KitPreviewViewId[] = [];
  for (const item of splitList(raw)) {
    if (item === "all") {
      for (const id of KIT_PREVIEW_VIEW_IDS) if (!result.includes(id)) result.push(id);
    } else if (includes(KIT_PREVIEW_VIEW_IDS, item)) {
      if (!result.includes(item)) result.push(item);
    } else {
      errors.push(`알 수 없는 뷰 '${item}'. 사용 가능: ${KIT_PREVIEW_VIEW_IDS.join(", ")}, all`);
    }
  }
  if (result.length === 0 && errors.length === 0) errors.push("--views에 뷰 이름이 없습니다.");
  return result;
}

function parseShadings(raw: string, errors: string[]): KitPreviewShading[] {
  const result: KitPreviewShading[] = [];
  for (const item of splitList(raw)) {
    if (item === "both" || item === "all") {
      for (const id of KIT_PREVIEW_SHADINGS) if (!result.includes(id)) result.push(id);
    } else if (includes(KIT_PREVIEW_SHADINGS, item)) {
      if (!result.includes(item)) result.push(item);
    } else {
      errors.push(`알 수 없는 셰이딩 '${item}'. 사용 가능: ${KIT_PREVIEW_SHADINGS.join(", ")}`);
    }
  }
  if (result.length === 0 && errors.length === 0) errors.push("--shading에 셰이딩 이름이 없습니다.");
  return result;
}

/** `name=value` 한 개. 이름에 `:`·`+`·`-`가 들어가므로 마지막 `=`로 나눈다. */
export function parseMorphAssignment(raw: string): { readonly ok: true; readonly value: KitPreviewMorphAssignment } | { readonly ok: false; readonly error: string } {
  const index = raw.lastIndexOf("=");
  if (index <= 0 || index === raw.length - 1) return { ok: false, error: `--morph는 이름=값 형식이어야 합니다: '${raw}'` };
  const name = raw.slice(0, index).trim();
  const text = raw.slice(index + 1).trim();
  const value = Number(text);
  if (name.length === 0 || text.length === 0 || !Number.isFinite(value)) return { ok: false, error: `--morph 값이 숫자가 아닙니다: '${raw}'` };
  const signed = SIGNED_PARAM_PATTERN.test(name);
  const min = signed ? -1 : 0;
  if (value < min || value > 1) {
    return { ok: false, error: `--morph '${name}' 값은 ${min}~1 범위여야 합니다(${signed ? "부호 약식 param:<키>는 −1~1" : "morph 가중치는 0~1"}): ${value}` };
  }
  return { ok: true, value: { name, value } };
}

function parseColors(raw: string, into: Partial<Record<KitPreviewColorKey, string>>, errors: string[]): void {
  for (const item of splitList(raw)) {
    const index = item.indexOf("=");
    const key = index > 0 ? item.slice(0, index).trim() : "";
    const hex = index > 0 ? normalizeHexColor(item.slice(index + 1)) : null;
    if (!includes(KIT_PREVIEW_COLOR_KEYS, key)) {
      errors.push(`--color 키 '${key || item}'를 알 수 없습니다. 사용 가능: ${KIT_PREVIEW_COLOR_KEYS.join(", ")}`);
    } else if (hex === null) {
      errors.push(`--color ${key}의 값이 #RRGGBB 형식이 아닙니다: '${item.slice(index + 1)}'`);
    } else {
      into[key] = hex;
    }
  }
}

function readNumbers(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const numbers: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    numbers.push(item);
  }
  return numbers;
}

/** 포즈 JSON 한 본의 값. 형식: `[x,y,z,w]` | `{"axis":[x,y,z],"deg":n}` | `{"euler":[xDeg,yDeg,zDeg]}` */
export function parsePoseRotationSpec(bone: string, value: unknown): { readonly ok: true; readonly value: PoseRotationSpec } | { readonly ok: false; readonly error: string } {
  const quat = readNumbers(value, 4);
  if (quat) {
    const length = Math.hypot(quat[0] ?? 0, quat[1] ?? 0, quat[2] ?? 0, quat[3] ?? 0);
    if (length < 1e-6) return { ok: false, error: `포즈 '${bone}'의 쿼터니언 길이가 0입니다.` };
    return { ok: true, value: { kind: "quat", value: [quat[0] ?? 0, quat[1] ?? 0, quat[2] ?? 0, quat[3] ?? 1] } };
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const axis = readNumbers(record.axis, 3);
    if (axis && typeof record.deg === "number" && Number.isFinite(record.deg)) {
      if (Math.hypot(axis[0] ?? 0, axis[1] ?? 0, axis[2] ?? 0) < 1e-6) return { ok: false, error: `포즈 '${bone}'의 회전축 길이가 0입니다.` };
      return { ok: true, value: { kind: "axis-angle", axis: [axis[0] ?? 0, axis[1] ?? 0, axis[2] ?? 0], deg: record.deg } };
    }
    const euler = readNumbers(record.euler, 3);
    if (euler) return { ok: true, value: { kind: "euler", degXyz: [euler[0] ?? 0, euler[1] ?? 0, euler[2] ?? 0] } };
  }
  return { ok: false, error: `포즈 '${bone}'의 값 형식이 올바르지 않습니다. [x,y,z,w] | {"axis":[x,y,z],"deg":n} | {"euler":[x,y,z]}(도)` };
}

/** `--pose` JSON 본문 → 본별 회전 표기. 형식 오류는 errors에 모은다. */
export function parsePoseJson(text: string): { readonly ok: true; readonly rotations: Record<string, PoseRotationSpec> } | { readonly ok: false; readonly errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`--pose JSON을 해석하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ok: false, errors: ["--pose JSON은 {본이름: 회전} 객체여야 합니다."] };
  const errors: string[] = [];
  const rotations: Record<string, PoseRotationSpec> = {};
  for (const [bone, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!includes(KIT_PREVIEW_BONE_NAMES, bone)) {
      errors.push(`--pose의 본 '${bone}'은(는) VRM 휴머노이드 본 이름이 아닙니다(예: leftUpperArm, head, spine).`);
      continue;
    }
    const spec = parsePoseRotationSpec(bone, value);
    if (spec.ok) rotations[bone] = spec.value;
    else errors.push(spec.error);
  }
  if (errors.length === 0 && Object.keys(rotations).length === 0) errors.push("--pose JSON에 본이 하나도 없습니다.");
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rotations };
}

function parsePose(raw: string, options: ParseArgsOptions, errors: string[]): KitPreviewPoseRequest {
  const text = raw.trim();
  if (includes(KIT_PREVIEW_POSE_IDS, text)) return { kind: "preset", id: text };
  let jsonText: string | null = null;
  if (text.startsWith("{")) {
    jsonText = text;
  } else if (options.readText) {
    try {
      jsonText = options.readText(text);
    } catch (error) {
      errors.push(`--pose 파일을 읽지 못했습니다(${text}): ${error instanceof Error ? error.message : String(error)}`);
      return { kind: "none" };
    }
    if (jsonText === null) errors.push(`--pose '${text}'은(는) 내장 프리셋도 파일도 아닙니다. 프리셋: ${KIT_PREVIEW_POSE_IDS.join(", ")}`);
  } else {
    errors.push(`--pose '${text}'은(는) 알 수 없는 프리셋입니다. 프리셋: ${KIT_PREVIEW_POSE_IDS.join(", ")} 또는 JSON({...})`);
  }
  if (jsonText === null) return { kind: "none" };
  const result = parsePoseJson(jsonText);
  if (!result.ok) {
    errors.push(...result.errors);
    return { kind: "none" };
  }
  return { kind: "custom", rotations: result.rotations };
}

/** 사람이 읽는 사용법(`--help`) */
export function kitPreviewHelpText(): string {
  return [
    "키트 프리뷰 뷰어 — Blender GLB(베이스+파츠)를 앱의 실제 렌더러(툰/PBR)로 렌더해 PNG·접촉 시트·JSON 요약을 만든다(개발 전용).",
    "",
    "사용법:",
    "  node apps/character-lab/scripts/kit-preview.mjs --glb <base.glb> [--glb <part.glb> ...] --out <dir> [옵션]",
    "",
    "소스 경로(자동 감지, 요약 JSON의 sourceKind):",
    "  kit      베이스(첫 GLB)에 키트 이름 메시(TS_Body·TS_Head)가 있으면 kit.json 없이 GLB에서 KitPlan을 즉석 생성해 앱 엔진의 키트 소스 경로(loadSource kind \"kit\")로 올린다.",
    "           앱의 키트 정책(눈·머리 외곽선 제외, 키트 틴트, 알파 컷오프, 증분 교체, 얼굴 SDF 끔)과 키트 기본 셰이딩(툰 램프 2단·림 끔)이 그대로 적용된다.",
    "           바이트 수·SHA-256은 CLI가 계산해 플랜에 넣고 엔진이 검증한다. 조인트·메시 선언 불일치는 엔진의 LabFailure 사유(한글)로 실패한다.",
    "  package  키트 이름이 없는 GLB(제작 패키지 Orion 등)는 기존 병합 경로(여러 GLB를 하나로 합쳐 package 소스로 로드). --legacy-merge로 강제할 수 있다.",
    "",
    "입력:",
    "  --glb <경로>          GLB. 첫 번째가 베이스(스켈레톤 기준), 나머지는 파츠(베이스 스켈레톤에 본 이름으로 재바인딩). 반복 가능",
    "  --out <dir>           출력 폴더(없으면 만든다). <접두>__<뷰>__<셰이딩>.png · <접두>__sheet.png · <접두>__summary.json이 들어간다",
    "  --name <접두>         출력 파일 이름 접두(기본: 베이스 GLB 파일명)",
    "",
    "렌더:",
    `  --views <목록>        쉼표 구분. ${KIT_PREVIEW_VIEW_IDS.join(",")},all (기본 ${KIT_PREVIEW_DEFAULT_VIEW_IDS.join(",")})`,
    "  --shading <목록>      toon,pbr (기본 toon,pbr)",
    `  --size <px>           한 변 해상도 ${MIN_KIT_PREVIEW_SIZE}~${MAX_KIT_PREVIEW_SIZE} (기본 ${DEFAULT_KIT_PREVIEW_SIZE})`,
    `  --bg <#rrggbb>        배경색(기본 ${DEFAULT_KIT_PREVIEW_BACKGROUND})`,
    "  --transparent         배경을 투명으로 저장",
    `  --quality <id>        ${KIT_PREVIEW_QUALITIES.join("|")} (기본 standard: 그림자·후처리 품질 프리셋)`,
    `  --ramp-steps <n>      툰 램프 단수 ${KIT_PREVIEW_RAMP_STEPS.join("|")} (기본: kit 2 · package 3)`,
    "  --rim <on|off>        툰 림 라이트 (기본: kit off · package on)",
    `  --outline <방식>      툰 외곽선 ${KIT_PREVIEW_OUTLINES.join("|")} (기본 hull. kit 소스는 눈·머리 hull을 엔진 정책으로 제외)`,
    "",
    "변형 테스트:",
    "  --morph <이름=값>     morph 가중치(0~1). 모든 메시에 이름으로 적용. 반복 가능. 예: --morph facs:jawOpen=1 --morph param:height:+=0.5",
    "                        부호 약식 param:<키>=<-1~1>은 :+ / :- 로 나눠 적용한다(예: --morph param:height=-0.5)",
    `  --pose <프리셋|JSON>  ${KIT_PREVIEW_POSE_IDS.join(", ")} 또는 JSON/파일. JSON: {"leftUpperArm":{"axis":[0,0,1],"deg":-45},"head":[x,y,z,w],"neck":{"euler":[0,30,0]}}`,
    "                        포즈 회전은 T-포즈 참조 스켈레톤의 본 로컬 회전이다(앱의 model-space 규약)",
    `  --color <키=#hex,...> 틴트(recolor 재질에 곱함). 키: ${KIT_PREVIEW_COLOR_KEYS.join(", ")} (기본 팔레트는 앱의 DEFAULT_RECIPE_COLORS)`,
    "  --hair-lod <n>        표시할 헤어 LOD(기본 0)",
    `  --role <메시=역할>    메시 이름→파츠 역할 강제(키트 규약 밖 이름용). 역할: ${KIT_PREVIEW_ROLE_NAMES.join(", ")}`,
    "",
    "기타:",
    "  --legacy-merge        키트 이름 자동 감지를 끄고 기존 병합(package) 경로를 쓴다",
    "  --inspect-only        엔진을 만들지 않고 GLB 검사·병합 점검(JSON 요약)만 한다",
    "  --no-sheet            접촉 시트를 만들지 않는다",
    `  --sheet-tile <px>     접촉 시트 칸 크기(기본 ${DEFAULT_KIT_PREVIEW_SHEET_TILE})`,
    `  --timeout-sec <초>    로드·렌더 대기 상한(기본 ${DEFAULT_KIT_PREVIEW_TIMEOUT_SEC}). 소프트웨어 렌더러는 셰이더 컴파일이 오래 걸린다`,
    "  --renderer <id>       swiftshader(리눅스 기본, GPU 없는 컨테이너)|default(브라우저 기본 GPU)",
    "  --chromium <경로>     Chromium 실행 파일(기본: CHARACTER_LAB_CHROMIUM_PATH → /opt/pw-browsers/chromium-1194 → Playwright 기본)",
    "  --dev-url <주소>      이미 떠 있는 Vite dev 서버 사용(없으면 임시 서버를 띄우고 끝나면 종료한다)",
    "  --quiet               진행 로그(stderr)를 끈다",
    "  -h, --help            이 도움말",
    "",
    "stdout에는 JSON 요약(메시·morph·본·경고·타이밍·출력 파일)만 나온다. 진행 로그는 stderr.",
    "종료 코드: 0 성공 · 1 인자 오류 · 2 브라우저/의존성 없음 · 3 에셋 오류(조인트 불일치 등) · 4 렌더 실패",
  ].join("\n");
}

/** argv(프로그램·스크립트 이름 제외)를 파싱한다. 오류는 모아서 한 번에 돌려준다. */
export function parseKitPreviewArgs(argv: readonly string[], options: ParseArgsOptions = {}): ParseArgsResult {
  const errors: string[] = [];
  const values = new Map<string, string[]>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    const eq = token.startsWith("--") ? token.indexOf("=") : -1;
    const flag = eq > 0 ? token.slice(0, eq) : token;
    if (BOOLEAN_FLAGS.has(flag)) {
      if (eq > 0) errors.push(`${flag}는 값을 받지 않습니다.`);
      flags.add(flag);
    } else if (VALUE_FLAGS.has(flag)) {
      let value: string | undefined;
      if (eq > 0) {
        value = token.slice(eq + 1);
      } else {
        // 다음 토큰이 다른 플래그면 값이 빠진 것으로 본다(그 토큰은 소비하지 않는다).
        const next = argv[index + 1];
        if (next !== undefined && !VALUE_FLAGS.has(next) && !BOOLEAN_FLAGS.has(next)) {
          value = next;
          index += 1;
        }
      }
      if (value === undefined) {
        errors.push(`${flag}에 값이 없습니다.`);
      } else {
        const list = values.get(flag) ?? [];
        list.push(value);
        values.set(flag, list);
      }
    } else {
      errors.push(`알 수 없는 인자: ${token}`);
    }
  }

  if (flags.has("--help") || flags.has("-h")) return { ok: true, help: true };

  const single = (flag: string): string | null => {
    const list = values.get(flag);
    if (!list || list.length === 0) return null;
    if (list.length > 1) errors.push(`${flag}는 한 번만 지정할 수 있습니다.`);
    return list[list.length - 1] ?? null;
  };

  const glbPaths = values.get("--glb") ?? [];
  if (glbPaths.length === 0) errors.push("--glb가 필요합니다(첫 번째가 베이스).");
  const outDir = single("--out");
  if (outDir === null && !errors.includes("--out에 값이 없습니다.")) errors.push("--out이 필요합니다.");

  const viewsRaw = single("--views");
  const views = viewsRaw === null ? [...KIT_PREVIEW_DEFAULT_VIEW_IDS] : parseViews(viewsRaw, errors);
  const shadingRaw = single("--shading");
  const shadings = shadingRaw === null ? [...KIT_PREVIEW_SHADINGS] : parseShadings(shadingRaw, errors);

  const morphs: KitPreviewMorphAssignment[] = [];
  for (const raw of values.get("--morph") ?? []) {
    const parsed = parseMorphAssignment(raw);
    if (parsed.ok) morphs.push(parsed.value);
    else errors.push(parsed.error);
  }

  const poseRaw = single("--pose");
  const pose: KitPreviewPoseRequest = poseRaw === null ? { kind: "none" } : parsePose(poseRaw, options, errors);

  const sizeRaw = single("--size");
  const size = sizeRaw === null ? DEFAULT_KIT_PREVIEW_SIZE : (parseInteger("--size", sizeRaw, MIN_KIT_PREVIEW_SIZE, MAX_KIT_PREVIEW_SIZE, errors) ?? DEFAULT_KIT_PREVIEW_SIZE);

  const bgRaw = single("--bg");
  let background = DEFAULT_KIT_PREVIEW_BACKGROUND;
  if (bgRaw !== null) {
    const normalized = normalizeHexColor(bgRaw);
    if (normalized === null) errors.push(`--bg가 #RRGGBB 형식이 아닙니다: '${bgRaw}'`);
    else background = normalized;
  }

  const colors: Partial<Record<KitPreviewColorKey, string>> = {};
  for (const raw of values.get("--color") ?? []) parseColors(raw, colors, errors);

  const roleOverrides: Record<string, KitPreviewRoleName> = {};
  for (const raw of values.get("--role") ?? []) {
    const index = raw.lastIndexOf("=");
    const mesh = index > 0 ? raw.slice(0, index).trim() : "";
    const role = index > 0 ? raw.slice(index + 1).trim() : "";
    if (mesh.length === 0 || !includes(KIT_PREVIEW_ROLE_NAMES, role)) errors.push(`--role은 메시이름=역할 형식이어야 합니다(역할: ${KIT_PREVIEW_ROLE_NAMES.join(", ")}): '${raw}'`);
    else roleOverrides[mesh] = role;
  }

  const hairLodRaw = single("--hair-lod");
  const hairLod = hairLodRaw === null ? 0 : (parseInteger("--hair-lod", hairLodRaw, 0, 9, errors) ?? 0);

  const qualityRaw = single("--quality");
  let quality: KitPreviewQuality = "standard";
  if (qualityRaw !== null) {
    if (includes(KIT_PREVIEW_QUALITIES, qualityRaw)) quality = qualityRaw;
    else errors.push(`알 수 없는 품질 '${qualityRaw}'. 사용 가능: ${KIT_PREVIEW_QUALITIES.join(", ")}`);
  }

  const toon: { rampSteps?: KitPreviewRampSteps; rim?: boolean; outline?: KitPreviewOutline } = {};
  const rampRaw = single("--ramp-steps");
  if (rampRaw !== null) {
    const steps = Number(rampRaw.trim());
    if (steps === 2 || steps === 3 || steps === 4) toon.rampSteps = steps;
    else errors.push(`--ramp-steps는 ${KIT_PREVIEW_RAMP_STEPS.join(", ")} 중 하나여야 합니다: '${rampRaw}'`);
  }
  const rimRaw = single("--rim");
  if (rimRaw !== null) {
    const lowered = rimRaw.trim().toLowerCase();
    if (lowered === "on" || lowered === "true") toon.rim = true;
    else if (lowered === "off" || lowered === "false") toon.rim = false;
    else errors.push(`--rim은 on 또는 off여야 합니다: '${rimRaw}'`);
  }
  const outlineRaw = single("--outline");
  if (outlineRaw !== null) {
    const outline = outlineRaw.trim();
    if (includes(KIT_PREVIEW_OUTLINES, outline)) toon.outline = outline;
    else errors.push(`알 수 없는 외곽선 '${outlineRaw}'. 사용 가능: ${KIT_PREVIEW_OUTLINES.join(", ")}`);
  }

  const sheetRaw = single("--sheet-tile");
  const sheetTile = flags.has("--no-sheet") ? 0 : sheetRaw === null ? DEFAULT_KIT_PREVIEW_SHEET_TILE : (parseInteger("--sheet-tile", sheetRaw, 64, 1024, errors) ?? DEFAULT_KIT_PREVIEW_SHEET_TILE);

  const timeoutRaw = single("--timeout-sec");
  const timeoutSec = timeoutRaw === null ? DEFAULT_KIT_PREVIEW_TIMEOUT_SEC : (parseInteger("--timeout-sec", timeoutRaw, 10, 3600, errors) ?? DEFAULT_KIT_PREVIEW_TIMEOUT_SEC);

  const rendererRaw = single("--renderer");
  let renderer: "swiftshader" | "default" = "swiftshader";
  if (rendererRaw !== null) {
    if (rendererRaw === "swiftshader" || rendererRaw === "default") renderer = rendererRaw;
    else errors.push(`알 수 없는 렌더러 '${rendererRaw}'. 사용 가능: swiftshader, default`);
  }

  const devUrl = single("--dev-url");
  if (devUrl !== null && !/^https?:\/\//u.test(devUrl)) errors.push(`--dev-url은 http(s):// 주소여야 합니다: '${devUrl}'`);

  if (errors.length > 0 || outDir === null) return { ok: false, errors };

  return {
    ok: true,
    help: false,
    request: {
      glbPaths,
      outDir,
      name: single("--name"),
      views,
      shadings,
      morphs,
      pose,
      size,
      transparent: flags.has("--transparent"),
      background,
      colors,
      roleOverrides,
      hairLod,
      quality,
      toon,
      legacyMerge: flags.has("--legacy-merge"),
      sheetTile,
      inspectOnly: flags.has("--inspect-only"),
      timeoutSec,
      chromiumPath: single("--chromium"),
      renderer,
      devUrl,
      quiet: flags.has("--quiet"),
    },
  };
}
