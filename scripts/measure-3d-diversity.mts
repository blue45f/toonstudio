/**
 * 3D 다양성 원장 측정기.
 *
 * 카탈로그(데이터 모듈)와 키트 manifest 를 직접 읽어 수량 지표를 JSON 원장으로 만든다. 문서 주장이 아니라
 * 코드가 실제로 가진 개수를 세므로 "색만 다른 변형"은 따로 구분하지 않는다(집계 규칙은
 * `docs/studio/3d-webtoon-diversity-program-20261023.md` 4절).
 *
 * 실행(저장소 루트, pnpm 없이):
 *   node_modules/.bin/tsx scripts/measure-3d-diversity.mts            # 표준 출력에 JSON
 *   node_modules/.bin/tsx scripts/measure-3d-diversity.mts --write    # docs/studio/3d-diversity-ledger.json 갱신
 *   node_modules/.bin/tsx scripts/measure-3d-diversity.mts --check    # 원장보다 줄어든 지표가 있으면 종료 코드 1
 *
 * 섹션마다 독립적으로 읽으며, 모듈을 불러오지 못하면 그 섹션에 `error` 를 남기고 나머지는 계속한다.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Metrics = Record<string, number>;
interface Section {
  readonly metrics: Metrics;
  readonly error?: string;
}
type Module = Record<string, unknown>;

const root = resolve(import.meta.dirname, "..");
const LEDGER_PATH = join(root, "docs/studio/3d-diversity-ledger.json");
const KIT_JSON = join(root, "apps/character-lab/public/assets/characters/toonstudio-kit-v1/kit.json");
const CREATOR = "apps/web/src/domains/creator";
const LAB_SRC = "apps/character-lab/src";

async function load(relative: string): Promise<Module> {
  return (await import(pathToFileURL(join(root, relative)).href)) as Module;
}

/** 배열이면 길이, 객체면 키 수, 그 밖은 0 */
function size(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === "object") return Object.keys(value).length;
  return 0;
}

/** 배열 항목을 키 값으로 묶어 개수를 센다(키가 없으면 "?") */
function countBy(items: unknown, key: string): Metrics {
  const result: Metrics = {};
  if (!Array.isArray(items)) return result;
  for (const item of items) {
    const record = (item ?? {}) as Record<string, unknown>;
    const label = String(record[key] ?? "?");
    result[label] = (result[label] ?? 0) + 1;
  }
  return result;
}

function prefixed(prefix: string, metrics: Metrics): Metrics {
  return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [`${prefix}.${key}`, value]));
}

async function section(read: () => Promise<Metrics>): Promise<Section> {
  try {
    return { metrics: await read() };
  } catch (error) {
    return { metrics: {}, error: error instanceof Error ? error.message.slice(0, 240) : String(error) };
  }
}

async function measureLabVocabulary(): Promise<Metrics> {
  const vocabulary = await load(`${LAB_SRC}/contracts/preset-vocabulary.ts`);
  const ids = vocabulary.SLOT_PRESET_IDS as Record<string, readonly string[]>;
  return Object.fromEntries(Object.entries(ids).map(([slot, names]) => [slot, names.length]));
}

async function measureLabPresets(): Promise<Metrics> {
  const appearance = await load(`${LAB_SRC}/presets/appearance-presets.ts`);
  const acting = await load(`${LAB_SRC}/animation/presets/index.ts`);
  const params = await load(`${LAB_SRC}/contracts/params.ts`);
  const pose = await load(`${LAB_SRC}/animation/presets/pose-presets.ts`);
  const expression = await load(`${LAB_SRC}/animation/presets/expression-presets.ts`);
  const hand = await load(`${LAB_SRC}/animation/presets/hand-pose-presets.ts`);
  return {
    appearancePresets: size(appearance.APPEARANCE_PRESETS),
    performancePresets: size(acting.PERFORMANCE_PRESETS),
    posePresets: size(pose.POSE_PRESETS),
    expressionPresets: size(expression.EXPRESSION_PRESETS),
    handPosePresets: size(hand.HAND_POSE_PRESETS),
    bodyParams: size(params.BODY_PARAM_KEYS),
    faceParams: size(params.FACE_PARAM_KEYS),
  };
}

/** 키트가 실제로 제공하는 파츠(베이스별·슬롯별). `unavailable` 인 변형은 세지 않는다. */
async function measureLabKit(): Promise<Metrics> {
  if (!existsSync(KIT_JSON)) throw new Error("kit.json 없음");
  const kit = JSON.parse(readFileSync(KIT_JSON, "utf8")) as {
    readonly parts: readonly { readonly slot: string; readonly variants: Record<string, unknown> }[];
  };
  const result: Metrics = { parts: kit.parts.length };
  for (const base of ["female", "male"]) {
    let total = 0;
    for (const part of kit.parts) {
      if (part.variants[base] === undefined) continue;
      total += 1;
      const key = `${base}.${part.slot}`;
      result[key] = (result[key] ?? 0) + 1;
    }
    result[`${base}.provided`] = total;
  }
  return result;
}

/** 화풍 팩 데이터의 개수를 센다(T1 팩 데이터는 2026-10-23 S-1부터 `presets/art-style-packs.ts`). */
async function measureLabArtStyles(): Promise<Metrics> {
  const candidates = [`${LAB_SRC}/presets/art-style-packs.ts`, `${LAB_SRC}/contracts/art-style.ts`, `${LAB_SRC}/contracts/art-style-packs.ts`];
  for (const candidate of candidates) {
    if (!existsSync(join(root, candidate))) continue;
    const mod = await load(candidate);
    for (const name of ["ART_STYLE_PACKS", "ART_STYLE_PACK_IDS", "ART_STYLES"]) {
      if (mod[name] !== undefined) return { artStylePacks: size(mod[name]) };
    }
  }
  return { artStylePacks: 0 };
}

/**
 * 구성 공간(성공 지표 Q, 캐릭터 랩 설계 §11 — 2026-10-23 S-1). 측정은 `state/config-space.ts`가 하고 여기서는 입력만 고른다:
 * - `contract.*`: 레시피 v3 계약 상한(27채널·범위당 형태 8·층 3·앵커 14·패턴·헤어 흐름·비례·look) × 외형 카탈로그 × 15슬롯 available.
 * - `noCustom.*`: 커스터마이즈 능력을 보고하지 않는 소스(지금의 v2 엔진·v1 키트) — 실제로 그려지는 공간의 하한 기준.
 * - 데이터 지표: 코디 세트·장르 수, 화풍 얼굴 매핑 수(팩 × 소스, unavailable 제외), 내 룩 범위·섞기 잠금 그룹 수.
 */
async function measureLabCustomization(): Promise<Metrics> {
  const contracts = await load(`${LAB_SRC}/contracts/index.ts`);
  const space = await load(`${LAB_SRC}/state/config-space.ts`);
  const appearance = await load(`${LAB_SRC}/presets/appearance-presets.ts`);
  const packs = await load(`${LAB_SRC}/presets/art-style-packs.ts`);
  const bindings = await load(`${LAB_SRC}/presets/art-style-lab-bindings.ts`);
  const sets = await load(`${LAB_SRC}/presets/look-sets.ts`);
  const createPresetCatalog = contracts.createPresetCatalog as (entries: unknown) => unknown;
  const measureConfigSpace = space.measureConfigSpace as (input: { catalog: unknown; capabilities: unknown; custom: unknown }) => unknown;
  const configCapabilitiesFromCustom = space.configCapabilitiesFromCustom as (custom: undefined, options: { look: boolean }) => unknown;
  const ledgerMetrics = space.configSpaceLedgerMetrics as (report: unknown, prefix: string) => Metrics;
  const countStyleFaceBindings = bindings.countStyleFaceBindings as (packs: unknown) => number;
  const catalog = createPresetCatalog(appearance.APPEARANCE_PRESETS);
  const capabilities = contracts.ALL_AVAILABLE_CAPABILITIES;
  const contract = measureConfigSpace({ catalog, capabilities, custom: space.CONTRACT_MAX_CONFIG_CAPABILITIES });
  const noCustom = measureConfigSpace({ catalog, capabilities, custom: configCapabilitiesFromCustom(undefined, { look: false }) });
  return {
    ...ledgerMetrics(contract, "contract"),
    ...ledgerMetrics(noCustom, "noCustom"),
    lookSets: size(sets.LOOK_SETS),
    lookSetGenres: size(sets.LOOK_SET_GENRES),
    styleFaceBindings: countStyleFaceBindings(packs.ART_STYLE_PACKS),
    lookScopes: size(contracts.LOOK_SCOPES),
    mixerLockGroups: size(contracts.LOOK_LOCK_GROUPS),
  };
}

async function measureMannequin(): Promise<Metrics> {
  const base = `${CREATOR}/scene-3d`;
  const model = await load(`${base}/studio-mannequin-model.ts`);
  const poses = await load(`${base}/studio-mannequin-poses.ts`);
  const hands = await load(`${base}/studio-mannequin-hand-presets.ts`);
  const duo = await load(`${base}/studio-mannequin-duo-composition.ts`);
  const poseList = poses.STUDIO_MANNEQUIN_POSE_PRESETS as readonly { readonly figures?: number }[];
  return {
    bodyPresets: size(model.STUDIO_MANNEQUIN_BODY_PRESETS),
    headPresets: size(model.STUDIO_MANNEQUIN_HEAD_PRESETS),
    archetypePresets: size(model.STUDIO_MANNEQUIN_ARCHETYPE_PRESETS),
    materialStyles: size(model.STUDIO_MANNEQUIN_MATERIAL_STYLES),
    joints: size(model.STUDIO_MANNEQUIN_JOINT_IDS),
    coreParams: size(model.STUDIO_MANNEQUIN_PARAM_RANGES),
    headParams: size(model.STUDIO_MANNEQUIN_HEAD_PARAM_RANGES),
    anatomyParams: size(model.STUDIO_MANNEQUIN_ANATOMY_PARAM_RANGES),
    posePresets: poseList.length,
    twoFigurePoses: poseList.filter((pose) => (pose.figures ?? 1) === 2).length,
    handOnlyPoses: size(poses.STUDIO_MANNEQUIN_HAND_POSE_PRESETS),
    handPresets: size(hands.STUDIO_MANNEQUIN_HAND_PRESETS),
    duoCompositions: size(duo.STUDIO_MANNEQUIN_DUO_COMPOSITIONS),
  };
}

async function measureVrm(): Promise<Metrics> {
  const base = `${CREATOR}/vrm`;
  const props = await load(`${base}/studio-vrm-props.ts`);
  const poseUtils = await load(`${base}/studio-vrm-poser-utils.ts`);
  const catalogs = await load(`${base}/studio-vrm-poser-catalogs.ts`);
  const wardrobe = await load(`${base}/studio-vrm-wardrobe.ts`);
  const forge = await load(`${base}/studio-vrm-avatar-forge.ts`);
  const mtoon = await load(`${base}/studio-vrm-mtoon-presets.ts`);
  return {
    props: size(props.VRM_PROPS),
    posePresets: size(poseUtils.POSE_PRESETS),
    costumePresets: size(catalogs.COSTUME_PRESETS),
    handShapes: size(catalogs.HAND_SHAPE_PRESETS),
    expressions: size(catalogs.EXPRESSION_ORDER),
    cameraPresets: size(catalogs.CAMERA_PRESETS),
    wardrobeItems: size(wardrobe.WARDROBE_ITEMS),
    wardrobeSets: size(wardrobe.WARDROBE_SETS),
    wardrobeFabrics: size(wardrobe.WARDROBE_FABRICS),
    forgeHairStyles: size(forge.AVATAR_FORGE_HAIR_STYLE_OPTIONS),
    forgeBangStyles: size(forge.AVATAR_FORGE_BANG_STYLE_OPTIONS),
    mtoonPresets: size(mtoon.STUDIO_VRM_MTOON_PRESETS),
  };
}

async function measureShaper(): Promise<Metrics> {
  const catalog = await load(`${CREATOR}/character-shaper/character-shaper-catalog.ts`);
  const entries = (catalog.CHARACTER_SLOT_CATALOG as { readonly entries: readonly unknown[] }).entries;
  return { entries: entries.length, ...prefixed("slot", countBy(entries, "slot")) };
}

async function measureBg3d(): Promise<Metrics> {
  const base = `${CREATOR}/bg3d`;
  const environment = await load(`${base}/studio-bg3d-environment-catalog.ts`);
  const starter = await load(`${base}/studio-bg3d-procedural-starter-pack.ts`);
  const cinematic = await load(`${base}/studio-bg3d-cinematic-asset-blueprints.ts`);
  const webtoon = await load(`${base}/studio-bg3d-webtoon-background-templates.ts`);
  const room = await load(`${base}/studio-bg3d-room-builder.ts`);
  const furniture = await load(`${base}/studio-bg3d-room-furniture.ts`);
  const assets = environment.STUDIO_BG3D_ENVIRONMENT_ASSETS;
  return {
    environments: size(assets),
    starterAssets: size(starter.STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS),
    cinematicBlueprints: size(cinematic.STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS),
    webtoonBackgrounds: size(webtoon.STUDIO_BG3D_WEBTOON_BACKGROUNDS),
    roomPresets: size(room.STUDIO_BG3D_ROOM_PRESETS),
    roomFurnitureKinds: size(furniture.STUDIO_BG3D_ROOM_FURNITURE_KINDS),
    ...prefixed("environmentTheme", countBy(assets, "theme")),
  };
}

async function measure(): Promise<Record<string, Section>> {
  const [vocabulary, presets, kit, artStyles, customization, mannequin, vrm, shaper, bg3d] = await Promise.all([
    section(measureLabVocabulary),
    section(measureLabPresets),
    section(measureLabKit),
    section(measureLabArtStyles),
    section(measureLabCustomization),
    section(measureMannequin),
    section(measureVrm),
    section(measureShaper),
    section(measureBg3d),
  ]);
  return {
    "characterLab.vocabulary": vocabulary,
    "characterLab.presets": presets,
    "characterLab.kit": kit,
    "characterLab.artStyles": artStyles,
    "characterLab.customization": customization,
    "studio.mannequin": mannequin,
    "studio.vrm": vrm,
    "studio.shaper": shaper,
    "studio.bg3d": bg3d,
  };
}

interface Ledger {
  readonly schema: "toonstudio.3d-diversity-ledger/1";
  readonly sections: Record<string, Section>;
}

function compare(previous: Ledger, current: Record<string, Section>): readonly string[] {
  const regressions: string[] = [];
  for (const [name, before] of Object.entries(previous.sections)) {
    const after = current[name];
    if (after === undefined) {
      regressions.push(`${name}: 섹션이 사라졌다`);
      continue;
    }
    for (const [metric, value] of Object.entries(before.metrics)) {
      const next = after.metrics[metric];
      if (next === undefined) regressions.push(`${name}.${metric}: 지표가 사라졌다(이전 ${value})`);
      else if (next < value) regressions.push(`${name}.${metric}: ${value} → ${next}`);
    }
  }
  return regressions;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const sections = await measure();
  const ledger: Ledger = { schema: "toonstudio.3d-diversity-ledger/1", sections };
  const text = `${JSON.stringify(ledger, null, 2)}\n`;
  if (args.has("--check")) {
    if (!existsSync(LEDGER_PATH)) throw new Error(`원장 파일이 없다: ${LEDGER_PATH}`);
    const regressions = compare(JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Ledger, sections);
    if (regressions.length > 0) {
      console.error(`3D 다양성 지표가 원장보다 줄었다 (${regressions.length}건):`);
      for (const line of regressions) console.error(`- ${line}`);
      process.exitCode = 1;
      return;
    }
    console.log("3D 다양성 지표 회귀 없음");
    return;
  }
  if (args.has("--write")) {
    writeFileSync(LEDGER_PATH, text);
    console.log(`원장 갱신: ${LEDGER_PATH}`);
    return;
  }
  process.stdout.write(text);
}

await main();
