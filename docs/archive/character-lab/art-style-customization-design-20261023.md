# 화풍 다양성 × 커스터마이즈 우선 — 캐릭터 계약·레시피 v3 설계 (P1)

작성 2026-10-23 · 상태: 설계 제안(target). 코드·계약은 바꾸지 않았다.
경로 약어: `C/`=apps/character-lab/src/, `CL/`=apps/character-lab/, `W/`=apps/web/src/domains/creator/, `BJS/`=node_modules/@babylonjs/core/(9.31.0), 접두 없음=저장소 루트. 근거 없는 수치는 **[제안]**이다.

## 0. 핵심 결정

| # | 결정 | 근거 |
| --- | --- | --- |
| K1 | 다양성은 완성품 개수가 아니라 **구성 공간 크기**다. 화풍 팩은 슬라이더 초기값 묶음이고, 적용하면 값을 레시피에 복사한다(copy-on-apply). `style.packId`는 출처·되돌리기 기준일 뿐이라 팩 정의가 바뀌어도 저장본 그림은 같다 | 프리셋 patch 관례 `C/contracts/recipe.ts:149-159` |
| K2 | 화풍·커스텀은 레시피 v3·ShadingProfile v3(`look`)에 저장한다. 베타 토글식 엔진 세션 상태 우회는 쓰지 않고 **능력 보고만** 구조적 포트로 한다 | `C/render/beta-features.ts:9-10`, `CL/AGENTS.md:69` |
| K3 | v3 기본값은 v2와 픽셀 항등이다(shadeTint 상수·림 0.55/0.65·hull 4 mm·외곽선 색을 기본값으로 박음) | `C/render/material-presets.ts:124-137`, `C/render/toon-reference.ts:37-41`, `C/render/babylon/character-engine.ts:122,674` |
| K4 | 렌더러 중립 계약 `contracts/art-style.ts`·`character-look.ts`는 zod만 import한다(승격 단위). Studio는 어댑터만 만든다 | `AGENTS.md:87`, `docs/adr/0026-…:47-48` |
| K5 | 새 domains 영역은 만들지 않는다. 계약(core)+프리셋 데이터(presets)+영역별 어댑터로 나누고 architecture 규칙 1-a·2-a·3-a를 신설한다 | `C/architecture.test.ts:40,152-160` |
| K6 | 외곽선은 클론 메시 inverted hull(style-hull, 폭 = mm×깊이·곡률·역할·정점 가중)이다. 톤은 툰 프래그먼트 안에서 NDC·머리 높이로 정규화한 화면 패턴이다 | `BJS/Meshes/mesh.pure.js:464-465,492`, `C/render/babylon/postprocess.ts:1-4` |
| K7 | 색은 26채널 역할 키 맵 + OKLab 상속이다. 다채널 파츠는 (파츠, 역할, 채널)당 재질 1개다 | `C/contracts/mesh-data.ts:76`, `CL/docs/authored-kit-spec.md:240` |
| K8 | 레이어는 같은 슬롯 프리셋을 inner/outer/legwear 층에 추가로 입히는 방식이다(SlotKind 불변). 소품은 앵커 14 × 최대 12개 | `C/contracts/recipe.ts:108`, `C/contracts/slots.ts:7-23` |
| K9 | SD는 절차 소스가 지오메트리 비례로 만든다. 키트는 SD 전용 베이스(품질 경로) 또는 본 균일 배율 근사(partial 표기) | `C/domains/humanoid/proportions.ts:98-123`, `C/contracts/character-kit.ts:45` |
| K10 | character-engine.ts를 6단계로 추출(약 −340줄)해 화풍 진입점을 `setShading→ToonLook` 하나로 모은다. 기준선 `--tighten`은 통합 담당이 같은 PR에서 한다 | `scripts/source-file-size-baseline.json:58`, `CL/AGENTS.md:88` |

## 1. 현재 사실(설계 제약)

| 항목 | 사실 | 근거 |
| --- | --- | --- |
| 셰이딩 계약 | strict. 툰은 rampSteps·faceSdfShadow·outline·rim 4필드뿐 | `C/contracts/shading.ts:13-51` |
| 레시피 | v2 strict, 무음 마이그레이션 금지, v3는 "지원하지 않는 버전" 거부 | `recipe.ts:1-5,28-31,254-263` |
| 색·틴트 | 8키. 키트는 (파츠, 역할)당 재질·틴트 1(R8) | `mesh-data.ts:76`, `authored-kit-spec.md:240,856` |
| 슬롯·partId | 슬롯당 프리셋 1. partId는 역할 고정이라 같은 역할 둘이면 덮어쓴다 | `recipe.ts:108`, `mesh-data.ts:263-277` |
| morph 어휘 | 64개(체형 18·얼굴 30·FACS 16), `ext:*` 금지 | `character-kit.ts:215-219` |
| 툰 식 | 그림자 = albedo×shadeTint, 림 경계 고정 | `C/render/shader-sources.ts:158-178` |
| 외곽선 | Babylon hull 4 mm 균일, 색 고정. step2가 부풀린 깊이를 다시 써서 키트 머리 hull을 뺐다 | `character-engine.ts:668-675`, `BJS/Rendering/outlineRenderer.pure.js:336-342`, `C/render/outline-policy.ts:8-9,20` |
| 후처리 | 뷰포트 카메라 전용. 캡처에는 들어가지 않는다 | `postprocess.ts:1-4` |
| 캡처·PSD | 패스 6종. PSD는 밑색/음영/하이라이트/페인트/주선(CPU) | `C/contracts/passes.ts:4`, `C/export/psd-plan.ts:4-12` |
| 800줄 래칫 | character-engine 1278, character-kit 1119, kit-loader 898, humanoid-model 885 모두 헤드룸 0. 기준선 파일은 통합 담당 소유 | `scripts/source-file-size-baseline.json:3,56-59`, `scripts/lib/source-file-size-ratchet.mjs:4-8` |
| 경계 | 도메인 10개, render는 contracts·shared·render만 import | `architecture.test.ts:40,344-366` |
| 경계 구멍 | 허용 목록 밖 최상위 디렉터리 파일은 `domainOf`가 null이라 교차 import 검사를 받지 않는다 | `architecture.test.ts:152-160,196-198` |
| 필수 CI | character-lab 시험은 4파일만 필수 | `scripts/ci-required-vitest-targets.txt:79-82` |
| 프로브 레인 | browser-probe 기본은 channel 없는 번들 headless, kit-preview 기본은 swiftshader | `CL/scripts/browser-probe.mjs:206-210,227-230`, `C/render/kit-preview/cli-args.ts:582` |
| 헤어 흐름 | UV v = 뿌리→끝(키트 규약, 절차 생성 둘 다) | `authored-kit-spec.md:439`, `C/domains/outfit/geometry.ts:196,228` |
| Studio | MToon 프리셋 7(외곽선 world/screen 폭·색, shade·shift·toony, rim), 마네킹 headCount 3~9·chibi3 3.2·anime7 7.5·재질 9, LT 톤 dot/line/crosshatch/noise | `W/vrm/studio-vrm-mtoon-controls.ts:26-66`, `W/vrm/studio-vrm-mtoon-presets.ts:46`, `W/scene-3d/studio-mannequin-model.ts:150,305-316,377-388,616-630`, `W/bg3d/studio-bg3d-scene-document-types.ts:385-393` |

## 2. 데이터 모델 v3 (계약 후보)

### 2.1 ArtStylePack — 렌더러 중립 (`C/contracts/art-style.ts` 신규)

```ts
import { z } from "zod";                                   // 유일한 import(규칙 1-a)
const u = z.number().min(0).max(1); const rgb = z.tuple([u, u, u]);
export const ART_STYLE_IDS = ["jp-anime-cel","jp-shounen-ink","jp-shoujo-soft","jp-seinen-real",
  "kr-webtoon-romance","kr-webtoon-action","sd-chibi","ink-wash"] as const;               // T1
export const ART_STYLE_RESERVED_IDS = ["watercolor-tale","us-comic-halftone","retro-90s-cel","lowpoly-flat"] as const; // T2 예약
export const EYE_FAMILIES = ["anime-round","webtoon-almond","shounen-sharp","shoujo-sparkle","realistic","sd-dot","ink-narrow"] as const;
const tint = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("multiply"), rgb }).strict(),                    // v2 항등 표현
  z.object({ kind: z.literal("oklab"), dL: z.number().min(-0.6).max(0.1),
    dHueDeg: z.number().min(-60).max(60), chroma: z.number().min(0).max(2) }).strict()]);
export const proportionSchema = z.object({ headsTall: z.number().min(2.5).max(10),
  legRatio: z.number().min(0.28).max(0.58), armRatio: z.number().min(0.3).max(0.48),
  shoulderHeads: z.number().min(1).max(2.6), headWidthRatio: z.number().min(0.6).max(1.15),
  handScale: z.number().min(0.6).max(1.4) }).strict();
export const lookSchema = z.object({
  ramp: z.object({ softness: u, secondShade: tint.nullable() }).strict(),
  shade: z.object({ skin: tint, hair: tint, other: tint }).strict(),
  rim: z.object({ edge0: u, edge1: u, strength: z.number().min(0).max(2), color: rgb }).strict(),
  specular: z.object({ size: u, strength: u, hairBand: z.enum(["none","band","ring"]), center: u, width: u }).strict(),
  line: z.object({ method: z.enum(["engine-hull","style-hull"]), widthMm: z.number().min(0).max(20),
    depthGain: u, curvatureGain: z.number().min(-1).max(1),
    color: z.discriminatedUnion("mode", [z.object({ mode: z.literal("fixed"), rgb }).strict(),
      z.object({ mode: z.literal("darken-albedo"), dL: u, chroma: u }).strict()]),
    inner: z.object({ enabled: z.boolean(), creaseDeg: z.number().min(5).max(90),
      partBoundary: z.boolean(), widthPx: z.number().int().min(1).max(6) }).strict() }).strict(),
  tone: z.object({ kind: z.enum(["none","halftone","hatch","crosshatch","dots"]),
    cellPerHead: z.number().min(8).max(120), angleDeg: z.number().min(-90).max(90),
    bands: z.tuple([u, u, u]), strength: u, ink: z.enum(["shade","line"]) }).strict(),
  paper: z.object({ kind: z.enum(["none","watercolor","ink-wash","print"]), strength: u,
    grainPx1080: z.number().min(0.5).max(8), bleedPx1080: z.number().min(0).max(12), seed: z.number().int().min(0) }).strict(),
  grade: z.object({ saturation: z.number().min(0).max(1.5), lightness: z.number().min(-0.2).max(0.2),
    accentChannels: z.array(z.string()).max(4) }).strict() }).strict();
export const artStylePackSchema = z.object({ id: z.enum(ART_STYLE_IDS), revision: z.number().int().positive(),
  labelKo: z.string().min(1), labelEn: z.string().min(1),
  proportion: z.object({ feminine: proportionSchema, masculine: proportionSchema }).strict(),
  face: z.object({ eyeFamily: z.enum(EYE_FAMILIES), eyeWidthToFace: z.number().min(0.14).max(0.36),
    eyeOpenRatio: z.number().min(0.25).max(0.9), irisToEye: z.number().min(0.35).max(0.75),
    eyeLine: z.number().min(0.42).max(0.62), lash: z.enum(["liner","strands","none"]) }).strict(),
  toon: z.object({ rampSteps: z.union([z.literal(2), z.literal(3), z.literal(4)]), rim: z.boolean(),
    outline: z.enum(["none","hull","edge"]) }).strict(),
  look: lookSchema,
  palette: z.object({ skin: z.array(z.string().regex(/^#[0-9a-f]{6}$/u)).min(1).max(6),
    hair: z.array(z.string().regex(/^#[0-9a-f]{6}$/u)).max(6), saturation: z.number().min(0).max(1.5) }).strict() }).strict();
```

- 얼굴·비례는 **측정 목표**(두신, 눈 너비/얼굴 높이 등 `CL/docs/webtoon-style-guide.md:12-18`의 지표 형식)다. 소스별 매핑(얼굴 파라미터 오프셋·눈/홍채 프리셋·중립 FACS·체형 오프셋)은 `C/presets/art-style-lab-bindings.ts`(데이터)에 둔다. Blender `LookStyle`(`tools/blender/character_kit/webtoon_style.py:52-86`)이 같은 목표를 세 번째 소비자로 읽는다.
- `LOOK_V2_IDENTITY`: shade = `multiply`(피부 [0.86,0.6,0.58]·헤어 [0.62,0.58,0.72]·그 외 [0.68,0.68,0.78], `material-presets.ts:129-135`), rim = 0.55/0.65·[0.35,0.35,0.4] (`C/render/babylon/character-engine.ts` 790행), line = engine-hull 4 mm·fixed(0.05,0.04,0.06), tone·paper = none, grade = 1/0.

### 2.2 레시피 v3 (`C/contracts/recipe.ts`)

```ts
export const RECIPE_VERSION = 3 as const;           // 지원 [1,2,3]. v1→v2→v3 명시 체인
const recipeBodyShapeV3 = { ...recipeBodyShape,     // slots·body·face·expression·pose·handPose·physics·paint 그대로
  colors: channelColorsSchema,                      // 26채널 부분 맵, 기본 8키 필수(superRefine)
  shading: shadingProfileSchemaV3,                  // + look
  style: z.object({ packId: z.enum(ART_STYLE_IDS).nullable(), packRevision: z.number().int().min(0),
    proportion: proportionSchema.nullable(), neutralFacs: expressionWeightsSchema }).strict(),
  wardrobe: z.object({ inner: presetIdSchema.nullable(), outer: presetIdSchema.nullable(),   // top/* 프리셋
    legwear: presetIdSchema.nullable(),                                                      // bottom/* 프리셋
    accessories: z.array(accessoryInstanceSchema).max(11) }).strict(),                     // slots.accessory 외 추가분
  partParams: z.partialRecord(partScopeSchema, z.record(shapeNameSchema, z.number().min(-1).max(1))),
  surfaces: z.partialRecord(channelKeySchema, surfaceSchema),
  hairColor: z.object({ gradient: z.tuple([unit, unit]), tipMix: unit, accent: z.enum(["none","streak","inner"]) }).strict() };
// accessoryInstance = { id: /^acc-\d{1,2}$/, presetId: accessory/*, anchor: ACCESSORY_ANCHORS(14),
//                       offset: { tMm: [±60]×3, rDeg: [±180]×3, scale: 0.5~1.5 } }
// surface = { material: MATERIAL_PRESET_IDS ∪ "cloth-knit", pattern: null | { kind: stripe|check|gingham|dot|plaid|flower,
//             scaleCm: 0.3~30, angleDeg: ±90, ratio: 0.05~0.95, inkChannel: ChannelKey } }
// partScope = hair|top|inner|outer|bottom|legwear|shoes|accessory|acc-<n>;  shapeName = /^[a-z][a-z0-9-]{0,23}$/
// ACCESSORY_ANCHORS = head-top, hair, face, ear-l, ear-r, neck, wrist-l, wrist-r, waist, back, hand-l, hand-r, foot-l, foot-r
```

| 필드 | v2 → v3 마이그레이션(`migrateRecipeV2ToV3`, 명시) |
| --- | --- |
| colors | 8키 그대로 복사. 나머지 18채널은 상속(§2.3)이라 시각 항등 |
| shading.look | `LOOK_V2_IDENTITY` |
| style | `{ packId: null, packRevision: 0, proportion: null, neutralFacs: {} }` |
| wardrobe | inner·outer·legwear null, accessories [] |
| partParams·surfaces | `{}` |
| hairColor | `{ gradient: [0.6, 1], tipMix: 0, accent: "none" }` (tipMix 0이라 항등) |

`parseRecipe`는 `migratedFrom`(1 또는 2)으로 알린다. 구버전 앱은 v3 파일을 정직하게 거부한다(`recipe.ts:254-263`). digest·파일 이름 골든은 KT-01 선례처럼 같은 WP에서 갱신한다(`authored-kit-spec.md:736,859`).

### 2.3 색 채널 26개와 상속 규칙(`C/contracts/color-channels.ts` 신규)

채널 키 = `<역할>` 또는 `<역할>-<하위>`. 저장은 사용자·화풍이 지정한 키만 하고, 유효색은 순수 함수 `resolveChannelColor(colors, key)`가 아래 규칙으로 상속한다. 규칙 수치는 [제안], 연산은 `C/shared/color.ts:67-109`의 OKLab을 쓴다.

| 키 | 부모 → 파생 | 키 | 부모 → 파생 |
| --- | --- | --- | --- |
| skin·iris·hair·brow·top·bottom·shoes·accessory | 기본(필수) | inner | top, L+0.10 |
| lip | skin, L−0.08·C×1.8 | inner-trim·top-trim·outer-trim·bottom-trim | 부모, L−0.15·C×0.85 |
| blush | skin, L−0.03·C×1.4 | top-accent·outer-accent·accessory-accent | accessory 그대로 |
| sclera | 고정 #f8f8fa(eye-wet 기본, `material-presets.ts:52`) | outer | top, L−0.10 |
| hair-tip | hair, L+0.08 | legwear | bottom, L−0.20 |
| hair-accent | hair, L−0.12·C×1.2 | shoes-sole | 고정 #f2f2f2 |
| hair-accessory | accessory 그대로 | shoes-lace | shoes, L+0.25 |

- 메시 쪽: `MeshPartData.colorKey`(`mesh-data.ts:95`)를 `ChannelKey`로 넓히고 `regionChannels?: ("lip"|"blush")[]`를 더한다(머리 UV 마스크로 칠하는 영역 채널).
- 키트 v2: 재질 `{ role, channel, tint, doubleSided }`. 규칙 "(파츠, 역할)당 재질 1"(V13)을 "(파츠, 역할, 채널)당 1"로 바꾼다. 채널 경계는 면 경계에 두므로 마스크 텍스처 없이 선명하다(R8 해소, `authored-kit-spec.md:856`).
- `PART_ROLES`는 끝에 `inner`·`outer`·`legwear`·`hair-accessory`를 붙인다(partId 보존 규칙 `mesh-data.ts:28`). 위 층에 입은 `top/*` 프리셋은 로드할 때 역할을 층 이름으로 바꾼다. 그러면 채널 이름도 `outer-*`로 따라간다.

### 2.4 그 밖의 계약 v3

| 계약 | 변경 |
| --- | --- |
| `shading.ts` | `look: lookSchema` 필수. `DEFAULT_SHADING.look = LOOK_V2_IDENTITY`. `mergeShadingProfile`(`shading.ts:96-105`)은 look 하위까지 병합 |
| `apply-plan.ts` | `partMorphWeights: Record<PartScope, Record<"shape:<n>:±", number>>`(해당 범위 메시에만 적용), `proportion: Proportion | null`(키트만), `channels: Record<ChannelKey, hex>`(유효색), `surfaces`, `hairColor`, `accessories: { instanceId, anchor, offset }[]`. Receipt에 `proportion?: { target, achieved, clamped }`·`skippedShapes` |
| `passes.ts` | 끝에 `lit-clean`·`tone`·`line`을 붙인다. `CharacterEngine.supportedPasses?`(선택)가 없으면 기존 6종만 지원하는 것으로 본다 |
| `capture.ts` | `ThumbnailRequest.shading?: ShadingProfile`(화풍 카드 썸네일) |
| `events.ts` | `style/apply {pack, scopes}`·`look/set`·`channel/set`·`surface/set`·`part-param/set {coalesceKey}`·`wardrobe/set`·`accessory/add·remove·set`·`look-preset/apply {look, locks, seed?}` |
| `morph-names.ts` | `shape:<name>:<±>` 문법 추가(현재 param·facs만, `C/contracts/morph-names.ts:13-51`). 체형 어휘 64에는 넣지 않는다 |
| `engine.ts` | 필수 메서드는 바꾸지 않는다. `SourceCapabilities.custom?`: 채널·형태 키(범위별 이름·라벨)·층·앵커·`patternUv`·`hairFlow`와 없는 항목의 한글 사유 |
| `character-kit-v2.ts`(신규) | `toonstudio.character-kit/2`: 재질 `channel`, 파츠 `shapes[] ≤ 8`, `layers` 호환 층, 강체 소품 `anchor`(스킨 없음), 의상 UV1 밀도 메타, 베이스 `headHeightM`, 머리 영역 마스크 파일, `eyeball` 틴트 recolor `sclera`. v1 매니페스트도 계속 읽는다 |
| `character-look.ts`(신규) | `toonstudio.character-lab.look/1`: `{ id, nameKo, scope: full·outfit·colors·face·style, payload(v3 레시피 부분), locks, seed? }` |

### 2.5 베타 토글 우회 선례와의 관계

- 베타 토글은 엔진 경로 실험이라 레시피에 저장하지 않았다(`beta-features.ts:9-10`). 화풍·커스텀은 사용자 산출물이라 같은 우회를 쓰면 저장·내보내기·썸네일 결정성이 깨진다. 그래서 v3 계약으로 저장한다.
- 선례에서 가져오는 것은 **능력 보고 방식**뿐이다. 엔진이 `sceneFeatures()` 확장 항목(`styleLine`·`styleTone`·`stylePaper`·`proportion`·`channels`·`patterns`)으로 지원 여부와 한글 사유를 낸다. 미지원은 사유만 보이고 대체하지 않는다(`CL/AGENTS.md:47`).
- NodeMaterial 툰(베타)은 look이 항등이 아니면 `unavailable`과 사유를 낸다. 기본 ShaderMaterial 경로로 바꿔치기하지 않는다.

## 3. 렌더 구현

### 3.1 기법 선택

| 요소 | 선택 | 기각한 대안 | 캡처·내보내기 일관성 |
| --- | --- | --- | --- |
| 외곽선 | **style-hull**: 파츠 메시를 `Mesh.clone`해 지오메트리·스켈레톤·morph 관리자를 공유하고(`mesh.pure.js:464-465,492`), 뒷면만 그리는 불투명 hull(깊이 쓰기 정상). step2 깊이 재기록이 없어 키트 머리 hull과 눈·눈썹이 공존할 것으로 본다(가설, Metal 검증) | `renderOutline`(메시당 균일 폭, `character-engine.ts:671-675`), 포스트 엣지(팽창 비용·MRT·캡처 밖) | `line` 패스로 단독 출력, `lit`에 포함 |
| 내부선 | 내보내기는 기존 CPU line-extract를 `lit-clean`으로 돌린다. 뷰포트 GPU 엣지 후처리는 선택 P2 | 상시 GPU 엣지(깊이·법선 프리패스 비용) | 같은 임계 상수 |
| 톤 | 툰 프래그먼트 안의 화면 정렬 패턴(점·평행선·교차선·스티플) | UV 공간(키트 UV 이음매·재전개, `authored-kit-spec.md:485`), 후처리(캡처 밖) | `tone` 패스(피복 α), `lit`에 포함 |
| 그림자 색 | CPU에서 OKLab 시프트를 파츠 기본색 기준 곱 배율로 바꾼다. 셰이더는 그대로(`shader-sources.ts:173`) | 셰이더 OKLab 변환 | 자동 |
| 림·스페큘러·헤어 밴드 | uniform `rimParams`·`specParams`. 헤어 흐름은 UV0.v | 텍스처 램프 | 자동 |
| 패턴·천 | 툰: 프래그먼트 함수(UV1). PBR: `MaterialPluginBase`(GLSL/WGSL 선택 지원, `BJS/Materials/materialPluginBase.pure.d.ts:52,115`) | 텍스처 자산(라이선스·용량) | 자동 |
| 종이 결 | `C/shared/paper-grain.ts`(mulberry32 결정적) 바이트를 뷰포트 후처리와 내보내기 CPU 곱에 함께 쓴다 | 외부 텍스처 | 같은 바이트 |
| 수묵 번짐 | 선 마스크 팽창 + 노이즈 변위 + 2 px 블러(GPU·CPU 같은 상수). 습식 확산은 T2 | 물리 확산 시뮬 | MAE 예산 |

### 3.2 핵심 식

```text
style-hull 폭: w = widthMm/1000 · mix(1, viewZ/refViewZ, depthGain) · clamp(1+2·curvatureGain·(κ−0.5), 0.25, 2) · roleWeight · vertexWeight
  pos' = pos + n̂_line·w   n̂_line = 같은 위치 정점의 평균 법선(로드 시 CPU) → finalWorld로 스킨, κ = 1-ring 곡률을 5~95 분위로 정규화
  정점 속성 tsLine(vec2: κ, vertexWeight) — 키트 v2는 vertexWeight를 TEXCOORD_2.x로 저작, 없으면 1
톤: ndc = vClip.xy / vClip.w(프래그먼트에서 나눠 원근 정확, 백엔드 Y 원점 무관)
  p = R(angle)·((ndc − headNdc)·(aspect, 1) / headNdcHeight)·cellPerHead
  cov = coverage(1−band, bands);  halftone: d = |fract(p)−½|, r = √(cov/π)
  fw = fwidth(p)(분기 전), mask = 1 − smoothstep(r−fw, r+fw, d), 주기 < 3 px이면 mask → cov로 페이드(썸네일 모아레 방지)
  toneFrame(headNdc, headNdcHeight) = ToonLook이 카메라별로 갱신(뷰포트 onBeforeCameraRender, 캡처 RTT 직전)
```

### 3.3 다채널·패턴·층·소품(엔진)

- 채널: 키트 v2는 채널마다 glTF 프리미티브가 갈린다. `RigPart`에 `channel`을 더하고, 패스 재질 캐시 키를 partId에서 (partId, materialId)로 바꾼다(지금 partId 키, `character-engine.ts:232-233,975-993`).
- 형태 슬라이더: `plan.partMorphWeights[scope]`를 그 범위 파츠 메시에만 적용해 이름 충돌을 막고 체형 morph와 더한다. 파츠당 타깃 = 체형 18 + 형태 ≤ 16(±8) ≤ 96(`character-kit.ts:309`). 절차 의상은 형태값을 ±1 morph로 굽는다(체형 param과 같은 방식, `CL/AGENTS.md:60`).
- 층: 렌더 순서는 inner→top→outer, bottom→legwear 아래. 층마다 깊이 오프셋 −1 unit [제안]. 몸 숨김 = ∪(착용 층의 `hides`)(`character-kit.ts:571-578` 확장). 아래 층 부분 숨김은 의상 영역 분할(V10 확장) 뒤에 한다.
- 소품: 강체 소품은 앵커 본 TransformNode의 자식으로 붙이고 레시피 offset을 노드 변환으로 준다. partId는 인스턴스마다 할당한다(역할당 1 가정 `mesh-data.ts:272-277` 해제).
- 비례(키트): `proportion-rig`가 머리(≤2.2)·팔다리(≥0.55)를 균일 배율하고 루트 접지를 보정한다. 균일 배율은 자식 회전과 교환 가능해 무릎을 굽혀도 전단이 없다.

### 3.4 백엔드·소스별 차이

| 항목 | 내용 | 근거·대응 |
| --- | --- | --- |
| 화면 원점 | WebGL(좌하)·WebGPU(좌상) 원점이 다르다 | NDC 바리잉 사용 |
| WGSL 균일성 | fwidth·textureSample은 분기 밖에서만 | 기존 규칙 `shader-sources.ts:128`, 시험 `shader-sources.test.ts:86` 확장 |
| MSAA | WebGPU는 1·4만 | `capture.ts:202` 그대로 |
| 스킨+hull SubMesh 결함 | ANGLE Metal에서 Babylon 외곽선 렌더러가 깨졌다. style-hull은 별도 메시라 재검증한다 | `outline-policy.ts:10-14` |
| attribute 예산 | NullEngine·attribute 모드는 morph 동시 수가 줄어든다 | `shader-sources.ts:22-24`. hull 재질에만 속성 추가 |
| NullEngine | 셰이더 컴파일·픽셀을 볼 수 없다 | 구조·uniform·CPU 기준식만(`CL/README.md:59`, `CL/AGENTS.md:87`) |
| 키트 | 얼굴 SDF 없음(`character-engine.ts:777-778`). 채널·UV1·형태 키·강체 소품은 v2 자산 필요 | 없으면 `custom` 사유 |
| 절차 | 비례·의상 형태는 재생성 키에 포함 | humanoid·outfit |
| 패키지(Orion) | `_Outline` 셸과 style-hull이 이중선이 된다 | style-hull일 때 셸 숨김 |

### 3.5 character-engine.ts 추출 순서(줄 증가 0)

| 순서 | 대상(현재 줄) | 새 모듈(`C/render/babylon/`) | 증감 |
| --- | --- | --- | --- |
| 1 | 보조 함수 172-205 | `engine-io.ts` | −30 |
| 2 | sceneFeatures·관절 오프셋·sparse 보고 1163-1208 | `scene-feature-report.ts` | −42 |
| 3 | captureDeps·passMaterials 948-1006 | `capture-session.ts` | −50 |
| 4 | 썸네일 869-936 | `thumbnail-session.ts` | −60 |
| 5 | 툰·재질 645-830(applyMaterialsForMode·toonValues·materialHooks 등) | `toon-look.ts`(ToonLook) | −150 |
| 6 | GLB 재질 교체 1124-1141 | `glb-exporter.ts` 도우미 | −14 |

- 결과는 약 935줄이다. 화풍 진입점은 `setShading`(611-618)의 `this.look.setProfile(profile)` **한 곳**뿐이다. `supportedPasses` 게터(+2)는 이 WP가 미리 넣는다. 이후 화풍 WP는 엔진 파일을 건드리지 않는다.
- 절차: 추출 → `node scripts/check-source-file-size.mjs` 통과 → 통합 담당이 `--tighten --dry-run`, 이어서 `--tighten`(같은 PR) → render 도메인 **전체** vitest(두 설정)와 kit-preview 시험을 돌린다.
- [제안] 7단계로 키트 증분 교체(420-533)를 `kit-session.ts`로 빼면 800줄 아래로 내려가 기준선에서 빠진다.
- 같은 방식: character-kit.ts(v2 스키마는 새 파일, 역할 추가분은 추출로 상쇄), kit-loader.ts(v2 확장은 `kit-loader-v2.ts`, 기존 파일은 호출 1줄과 상쇄 추출), humanoid-model.ts(`geometryKeyOf`·`GEOMETRY_SLOT_KINDS`를 `geometry-key.ts`로 먼저 뺌).

## 4. 아키텍처 규칙

- 결정: domains 허용 목록(`architecture.test.ts:40`)·외부 허용 표(:44-55)는 바꾸지 않는다. 화풍·커스텀은 리듀서(state)·지오메트리(humanoid·outfit)·렌더(render)·내보내기(export)에 걸쳐 있다. 별도 도메인을 만들면 교차 import 금지 때문에 DI 배관만 늘고, 팩 적용 함수는 리듀서가 직접 불러야 해서 contracts에 둔다(`applyQualityPreset` 선례 `shading.ts:90-93`).
- 규칙 1-a(신설, §3 규칙 1 보강): `contracts/art-style.ts`·`character-look.ts`·`color-channels.ts`는 `zod` 외 import 금지(상대 import 포함). 승격 단위가 자기완결이어야 한다.
- 규칙 2-a(신설, 규칙 2 보강): `src` 최상위 디렉터리는 {app, contracts, shared, testing, render, domains, state, presets, animation, paint, export}만 허용한다. 지금은 목록 밖 디렉터리가 경계 검사를 받지 않는다(`architecture.test.ts:152-160,196-198`).
- 규칙 3-a(신설, 규칙 3·5 보강): `render/style/**`는 `@babylonjs` import 금지(순수 CPU 기준식·셰이더 문자열, Node 시험).
- 규칙 5 문서화: `app/shell/panels/<Name>.tsx`는 core 소유 얇은 호스트, 영역 뷰는 `app/shell/panels/<area>/**`에 둔다. 현 정규식(`architecture.test.ts:285`)은 하위 폴더를 패널로 세지 않는다.

## 5. 비례·얼굴 매핑

### 5.1 T1 화풍 표(초기값 — 전부 슬라이더로 조절)

| id·라벨 | 두신 여/남 | 다리비 | 눈폭/얼굴 | 램프·그림자 | 선 | 톤·종이 | 팔레트 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| jp-anime-cel 일본 애니 셀 | 7.0/7.5 | 0.48 | 0.25 | 2단 경계 0.05, oklab ΔL−0.22·Δh−20° | style 3 mm, darken | 없음 | 채도 1.05 |
| jp-shounen-ink 소년 잉크 | 7.5/8.0 | 0.49 | 0.20 | 2단, ΔL−0.30·C0.6 | 6.5 mm 흑(`W/vrm/studio-vrm-mtoon-presets.ts:92`), 곡률 +0.5, 내부선 30° | 하프톤 45°·머리당 22셀·밴드 [0, .55, .85], print 0.15 | 0.9 |
| jp-shoujo-soft 소녀 반짝 | 7.8/8.5 | 0.51 | 0.28 | 3단 부드럽게 0.35, Δh+25°, 림 0.5~0.7 | 1.2 mm darken 0.35(헤어라인 계열 `presets.ts:111`) | dots 60셀 0.25, print 0.1 | 파스텔 0.65 |
| jp-seinen-real 청년·극화 | 7.2/7.6 | 0.47 | 0.18 | 4단, ΔL−0.35 | 3.5 mm, 깊이 0.6, 곡률 +0.8, 내부선 25° | 교차선 40셀 [.35, .6, .85], print 0.2 | 0.75 |
| kr-webtoon-romance 웹툰 로맨스 | **7.8/9.0**(실측 7.7~7.9/8.7~9.5) | 0.52 | **0.22**(실측 0.21~0.23) | 2단 0.2, 피부 붉은 그림자(`webtoon-style-guide.md:18`), 림 끔(`recipe.ts:195-199`) | 4 mm(실측 동등, `webtoon-style-guide.md:17`) | 없음 | 0.9 |
| kr-webtoon-action 웹툰 액션 | 7.8/8.6 | 0.50 | 0.20 | 3단 0.6(그라데이션), 차가운 림 | 3.5 mm darken, 깊이 0.5 | 없음 | 1.0 |
| sd-chibi SD | 3.0/3.2(`studio-mannequin-model.ts:305-316`) | 0.30 | 0.32 | 2단 0.1 | 3 mm darken | 없음 | 1.15 |
| ink-wash 수묵 | 7.2/7.6 | 0.47 | 0.17 | 2단 0.5, 회색 ΔL−0.25·C0.2 | 3 mm 먹색, 곡률 +1.0 | ink-wash 0.6·번짐 3 px | 채도 0.12 + accent 1채널 |

굵게 표시한 값만 실측(`CL/docs/webtoon-style-guide.md:12-13`)이고 나머지는 [제안]이다. T2 4종은 예약 id만 둔다. 수채는 법무 검토 뒤, 미국 코믹은 하프톤 15셀 + 굵은 선, 90년대는 3단 + 하드 스페큘러, 로우폴리는 flat 셰이딩 정의다.

### 5.2 소스별 비례

| 두신 범위 | 절차 | 키트 | 패키지 | Studio 마네킹 |
| --- | --- | --- | --- | --- |
| 6.5~9.5 | 체형 morph를 상대 적용(headSize ±1 ≈ 7.1~8.9두신. `ParamPanel.tsx:242`, `proportions.ts:112` 계산) | 같은 morph + 관절 오프셋(`character-kit.ts:282-290`) | 매핑된 셰이프 키만 | `headCount`(`studio-mannequin-model.ts:150`) |
| < 6.5(SD) | `resolveProportions(values, proportion)`로 머리·몸통·팔다리를 다시 만든다(재생성 키 포함) | ①SD 전용 베이스(LookStyle `sd`, `KIT_BASE_IDS` 확장 — 품질 경로, O1) ②없으면 본 균일 배율 근사 + `partial` 사유 + 영수증 achieved | 미지원 사유 | 같음 |

### 5.3 눈 계열(구현 = morph + 홍채·눈 파츠 교체. 텍스처 눈은 기각)

| 계열 | 절차(eyes·irises + 얼굴 파라미터) | 키트 |
| --- | --- | --- |
| anime-round | round·round-large, eyeSize +0.6 | irises/round-large + 같은 morph |
| webtoon-almond | almond·soft-gradient, eyeSize +0.3, eyeTilt +0.15 | 베이스 자체(LookStyle webtoon) |
| shounen-sharp | narrow·round-small, eyeTilt +0.5, eyeSize −0.2, 중립 browDown 0.2 | morph |
| shoujo-sparkle | wide·star-highlight, eyeSize +0.9 | irises/star-highlight |
| realistic / ink-narrow | almond·round-small −0.4 / narrow·round-small −0.3 | morph |
| sd-dot | round·round-large, eyeSize +1, eyeSpacing +0.3 | SD 베이스 필요 |

- 어휘는 `C/contracts/preset-vocabulary.ts:12-13`, 형상은 `C/domains/humanoid/geometry/eye-builder.ts:28-35,51-66`이다.
- 텍스처 눈을 기각한 이유: 키트 눈은 3D 공막 + 홍채 디스크다(`authored-kit-spec.md:191`).
- 속눈썹 liner/strands는 키트 베이스에 구워져 있다(`webtoon_style.py:73`). 그래서 키트에서는 `partial`이다.

## 6. UI

- 탭 2개를 신설한다(`C/app/shell/InspectorTabs.tsx:12-22`에 추가).
  - **화풍**(StyleView): 팩 카드 radiogroup(화살표 키). 카드 = 현재 캐릭터에 그 팩의 셰이딩을 입힌 실시간 썸네일(`ThumbnailRequest.shading`) + 코드로 그린 두신 SVG 글리프 + 한글 라벨 + 능력 배지(사유는 `aria-describedby`).
  - 적용 범위 체크: 룩·비례·얼굴·팔레트. 팔레트는 기본 끔이다(사용자 색을 덮어쓰지 않는다).
  - 오버라이드 슬라이더 7그룹(선·톤·그림자·림/스페큘러·종이·비례·얼굴): ParamPanel 패턴(`aria-valuetext` `ParamPanel.tsx:113`, `coalesceKey`로 되돌리기 1단계 `:6-7`), 행별 "팩 값으로", 수정 개수 배지.
  - **커스텀**(WardrobeView): 층 6줄(이너·상의·아우터·하의·레그웨어·신발), 소품 목록(앵커 14 선택, 위치·회전·크기 미세 조정), 채널 색(상속이면 "상의에서 파생" 표시 + 고정 버튼), 패턴(종류·크기·각도·비율·두 번째 색), 재질 5종, 파츠 형태 슬라이더(선언된 shapes, 최대 8).
  - **내 룩** 섹션: 범위 선택 저장·불러오기, `.look.json` 파일, 섞기(시드 표시, 잠금: 얼굴·몸·색·옷·소품·화풍), 코디 세트.
- 기존 패널과의 관계: RenderPanel은 모드·품질·그림자·후처리·IBL·베타를 그대로 두고, 툰 4필드(`RenderPanel.tsx:313-366`)에 값의 출처("화풍: …")를 표시한다. ParamPanel은 화풍 적용으로 슬라이더가 움직인 것을 그대로 보여 준다.
- 접근성: 한글 라벨, 키보드 radiogroup, 포커스 링, 색 견본에 hex 텍스트 병기, 상태는 `role=status aria-live=polite`(`RenderPanel.tsx:412` 관례), 대상 크기 24 px 이상.
- 소유: 영역 뷰는 `panels/style/**`·`panels/wardrobe/**`, 호스트·탭·CSS(`cl-style-*`·`cl-wardrobe-*`)는 core가 갖는다(§9 U-1).

## 7. 내보내기

- PSD v3 순서(bottom→top): 참조[숨김] · 부위 ID[숨김] · 밑색(flat) · 음영(multiply, `splitTones(flat, lit-clean)`) · 하이라이트(screen) · **톤**(normal, `tone` α) · 페인트[숨김] · **주선-외곽**(`line`) · **주선-내부**(CPU, `lit-clean`·depth·normal·part-id, 실루엣 채널 끔) · **종이**(multiply, 기본 숨김). composite = `lit`.
- 지금은 `["flat","lit","normal","depth","part-id"]`를 캡처한다(`C/export/export-session.ts:156`).
- 일관성:
  - 톤이 `lit`에 있으면 휘도 Sobel이 점을 선으로 잡는다(`C/export/line-extract.ts:1-10`). 그래서 내부선·음영 분해는 `lit-clean`을 쓴다.
  - 재합성 MAE는 기존 ≤ 2/255(`psd-plan.ts:248-249`)를 유지하고, 전층 합성 대 `lit`은 ≤ 3/255(AA 가장자리 제외) [제안]으로 둔다.
- PNG는 `lit`이다(`export-session.ts:124`). 종이가 있으면 알파 안쪽만 CPU 곱. **선화 단독 PNG** = (`line` ∪ 내부선) 선색, 투명 배경(`line-extract.ts:266`).
- 엔진에 `supportedPasses`가 없으면 "엔진이 톤·선 패스를 지원하지 않습니다"로 실패를 보인다(대체 없음).

## 8. 검증 계획

- 두려운 실패:
  - 선이 끊기거나 이중선(hull + CPU 실루엣)이 된다.
  - 톤 각도·방향이 백엔드나 뷰포트/RTT 사이에서 뒤집힌다.
  - 채널이 다른 채널 색을 받는다.
  - 층이 z-fight하거나 아래 층이 비친다.
  - 두신 목표를 벗어난다.
  - 눈·눈썹이 hull 깊이에 가린다(A-9 재발).
  - v2 레시피의 그림이 바뀐다.
- 허용 잡음: MSAA 가장자리 1 px, 하프톤 AA 경계 ±1 LSB, GPU 래스터 순서 차.

| 층 | 내용 | 오라클 |
| --- | --- | --- |
| 단위(Node) | 팩·레시피 v3 스키마, v1/v2→v3 왕복, `LOOK_V2_IDENTITY`의 `evaluateToon`이 v2와 같음(`toon-reference.ts:110-131`), 톤 평균 피복 ≤ 1 %, 선 폭 함수 단조, OKLab 틴트, 채널 상속, 섞기 결정성(같은 시드·잠금 → 같은 레시피, `Math.random` 금지 `CL/AGENTS.md:45`), 구성 공간 측정기 | 정확 비교·1e-6 |
| 셰이더 문자열 | GLSL·WGSL 상수 = CPU 기준식, 균일성 규칙 | 기존 방식(`toon-reference.test.ts:37`) |
| NullEngine | hull 클론의 지오메트리·스켈레톤·morph 공유와 해제, 패스 구성(`lit-clean`은 hull·톤 끔), 범위별 형태 가중치, 키트 v2 채널 RigPart, 베타 사유 | 구조 단언 |
| Metal 실브라우저 | kit-preview `--style all`·`--look`·`--sweep channels/shapes/layers` 접촉 시트. 고정 시드(`C/app/composition.ts:62`)·프레이밍·조명·a-pose | 아래 |

- Metal 레인 고정:
  - `CHARACTER_LAB_CHROMIUM_PATH`=설치 Chrome + `--renderer default`로 띄운다.
  - 어댑터 지문(WebGL `UNMASKED_RENDERER_WEBGL` /Apple|Metal/, WebGPU `apple/metal-3`, `isFallbackAdapter=false`)을 단언하고 provenance JSON에 기록한다.
  - 번들 headless·swiftshader 결과는 Metal 증거로 쓰지 않는다.
- 오라클 세 가지:
  1. 불변식: material-id 영역별 평균색 ΔE ≤ 3, 선 피복 0.5~6 %, 그림자 영역 톤 피복 목표 ±5 %, 실루엣 IoU(PBR 대 툰) ≥ 0.98, part-id로 잰 두신 ±0.15, 8방향 0.1° 지터에서 z-fight 화소 0.
  2. 픽셀 기준선: odiff `-t 0.1 --fail-on-layout --output-diff-cols`. 기준선은 백엔드별(metal-webgl2·metal-webgpu) 디렉터리에 두고, 빈 렌더 전제(blank 대비)를 먼저 확인한다.
  3. 접촉 시트 + 소유자 판정. 증거는 `docs/evidence/render-qa/<날짜>-art-style/`(선례 `2026-10-23-metal-baseline`).
- 필수 CI:
  - Node 단위·셰이더 문자열·NullEngine 시험은 통합 담당이 `scripts/ci-required-vitest-targets.txt`에 정렬해 넣는다(넣은 뒤 수집되는지 확인).
  - 브라우저 레인은 비필수다(CI에 GPU 없음, 벽시계 예산 금지).

## 9. 작업 분해

| WP | 목적·소유 파일 | 선행 | 완료 기준 | 줄(추정) | 시험 |
| --- | --- | --- | --- | --- | --- |
| CORE-1 계약 v3 | `C/contracts/**`(신규 art-style·color-channels·character-look·character-kit-v2, recipe·shading·mesh-data·apply-plan·passes·capture·events·morph-names·index, character-kit 상쇄 추출), `C/shared/paper-grain.ts`, `C/testing/**`, 연쇄: `C/state/recipe-reducer.ts`·`lab-store.ts`(새 명령 리듀서), `C/render/material-presets.ts`·`C/domains/authored/mesh-role-mapping.ts`·`authored-character-manifest.ts`(역할 표), `C/domains/vision/recommend.ts`, `C/app/shell/panels/VisionPanel.tsx`(라벨 상수, 줄 0), `C/architecture.test.ts`(1-a·2-a·3-a), `CL/AGENTS.md`, `CL/docs/authored-kit-spec.md` | — | typecheck·두 vitest·eslint 녹색, v2→v3 항등, character-kit.ts ≤ 1119 | +1,700 / 시험 +900 | contracts·state·architecture |
| R-0 엔진 슬림화 | `character-engine.ts`, 신규 engine-io·scene-feature-report·capture-session·thumbnail-session·toon-look, `glb-exporter.ts` | — | 동작 불변, ≤ 940줄, 통합 담당 tighten | −340 / +420 | render 도메인 전체 |
| R-1 순수 렌더 수학 | `C/render/style/**` 신규(tone·line-width·shade-tint·rim-spec·pattern·hair-flow·face-region-mask·proportion-bones·look-uniforms·style-shader-sources), `C/render/toon-reference.ts`, `C/render/outline-policy.ts` | CORE-1 | CPU 기준식·v2 항등 | +1,100 | render/style |
| S-1 상태·프리셋 | `C/state/apply-plan.ts`(CORE-1 연쇄 뒤 순차 인수)·`thumbnail-cache.ts`, 신규 look-library(.browser)·look-mixer·config-space, `C/presets/art-style-packs.ts`·`art-style-lab-bindings.ts`·`look-sets.ts` | CORE-1 | 플랜 v3 필드·상속·섞기 결정성 | +1,200 | state·presets |
| A-1 키트 v2 계획 | `C/domains/authored/kit-plan.ts`·`kit-capability.ts`·`package-capability.ts` | CORE-1 | v1·v2 매니페스트 모두 계획, custom 능력·사유 | +400 | authored |
| H-1 절차 비례·얼굴 | `C/domains/humanoid/**`(geometry-key 추출 선행, proportions SD, sclera·영역 채널) | CORE-1 | 두신 목표 ±0.1(절차), 885 미증가 | +350 | humanoid |
| O-1 절차 의상 | `C/domains/outfit/**`(채널 하위 파츠, UV1 균일 밀도, 형태 morph 굽기, 층 오프셋, 앵커 소품, hair-accent) | CORE-1 | 채널·형태·층 생성 | +900 | outfit |
| X-1 내보내기 | `C/export/psd-plan.ts`·`export-session.ts`, 신규 paper-composite·ink-bleed, `C/app/shell/panels/ExportPanel.tsx` | CORE-1 | PSD v3·선화 PNG·MAE | +600 | export·ExportPanel |
| B-1 Blender 키트 v2 | `tools/blender/character_kit/**`, `CL/public/assets/characters/**`, `CL/docs/webtoon-style-guide.md` | CORE-1, O1·O2·O3 | kit.json v2·V21~V24 통과 | 도구 +1,500 | 검증기 |
| R-2 셰이더·재질 | `C/render/shader-sources.ts`(+test), `C/render/babylon/materials/toon-shader.ts`, 신규 style-hull-material·pattern-plugin | R-1 | GLSL/WGSL 동치·균일성 | +700 | 셰이더 문자열 |
| R-3a 룩 통합 | `toon-look.ts`·`capture-session.ts`·`thumbnail-session.ts`·`scene-feature-report.ts`(R-0 산출), `capture.ts`·`beta-controller.ts`, 신규 style-hull·tone-frame | R-0, R-2 | 패스 9종·style-hull·능력 보고 | +800 | NullEngine |
| R-3b 커스텀 통합 | `kit-loader.ts`(상쇄 추출)·`character-rig.ts`, 신규 kit-loader-v2·channel-binding·accessory-attach·proportion-rig | R-0, R-2, A-1 | 채널·형태·층·소품·비례 | +900 | NullEngine·kit |
| U-2 화풍 뷰 | `C/app/shell/panels/style/**` | S-1 | 카드·슬라이더·a11y | +700 | jsdom |
| U-3 커스텀 뷰 | `C/app/shell/panels/wardrobe/**` | S-1 | 층·소품·채널·패턴·형태·내 룩 | +1,100 | jsdom |
| U-1 셸 조립(core) | `panels/StylePanel.tsx`·`WardrobePanel.tsx`(얇은 호스트), `ui-state.ts`·`InspectorTabs.tsx`·`lab-runtime.ts`·`composition.ts`·`thumbnail-scheduler.ts`·`styles/character-lab.css` | U-2, U-3, R-3a | 탭·화풍 썸네일·스모크 | +300 | composition·smoke |
| R-4 뷰포트 후처리(P2) | `C/render/babylon/postprocess.ts`, 신규 style-postprocess | R-1, R-3a | 종이·번짐·내부선(선택) | +400 | NullEngine |
| V-1 검증·증거 | `CL/scripts/kit-preview.mjs`·`browser-probe.mjs`, `C/render/kit-preview/**`, `C/app/null-engine.integration.test.ts`, `CL/docs/parity/**`·`shaper-parity-checklist.md`, `docs/evidence/render-qa/…` | R-3a, R-3b, X-1, U-1, B-1 | 어댑터 단언·시트·소유자 판정 | +600 | 통합·Metal |
| I-1 통합 담당 | `scripts/source-file-size-baseline.json`·`ci-required-vitest-targets.txt`·`verify-character-kit.mjs`(+test) | 각 WP 병합 | tighten 4회, 필수 편입, V21~V24 | +500 | node:test |

- 순차 소유 예외: `C/state/apply-plan.ts`·`C/render/material-presets.ts`는 CORE-1이 역할 표 몇 줄(KT-01 선례 `authored-kit-spec.md:750`)을 고친다. 이후에는 각각 S-1만, 아무도 고치지 않는다.
- 검증기 변경:
  - V1(스키마 v2), V3(형태 키 용량), V9(`shape:*`은 선언된 이름만, 델타 ≤ 0.08 m [제안]), V10(층 hides), V11(활성 삼각형), V13(채널 재질·휘도), V14(헤어 흐름), V16(층 호환), V17(custom 능력), V8(강체 소품 스킨 예외).
  - 신규: V21 형태 ±1 몸 관통, V22 층 간격 [제안 inner ≥ 1.5 mm·outer ≥ 4 mm], V23 UV0.v 뿌리→끝 단조, V24 UV1 밀도 균일.
- DAG와 병렬 묶음:

```text
G1 {CORE-1 ‖ R-0} → G2 {R-1, S-1, A-1, H-1, O-1, X-1, B-1} → G3 {R-2, U-2, U-3}
  → G4 {R-3a(R-0,R-2), R-3b(R-0,R-2,A-1)} → G5 {U-1(U-2,U-3,R-3a), R-4(R-1,R-3a)} → G6 {V-1}
I-1은 R-0·CORE-1·H-1·R-3b 병합 직후 tighten, 각 WP 시험 편입을 계속 맡는다.
```

## 10. 위험·미결정·예산

| 소유자 결정 | 내용 |
| --- | --- |
| O1 | SD 품질 경로: 키트 SD 베이스 제작(`KIT_BASE_IDS` 확장) 대 런타임 근사만 |
| O2 | 키트 v2 자산 레인 착수. Hyper3D 파생 의상·헤어가 빠져 콘텐츠 공급 경로가 없다(`CL/README.md:175`) |
| O3 | 예산 상향: activeWorst 200k(`character-kit.ts:323`)·총량 64 MiB(:305)는 층·소품·화풍 베이스로 초과 위험 |
| O4 | 레시피 v3 공개 시점(구버전 앱은 v3를 못 연다) |
| O5 | 팔레트 자동 적용 기본값(끔 제안) |
| O6 | 뷰포트 GPU 내부선(성능) 도입 |
| O7 | 탭 2개 구성·뷰 소유자 |
| O8 | T2 우선순위, 수채 법무 검토 |
| O9 | 라벨은 장르명만(작품·작가·경쟁 제품명 금지, `docs/adr/0026-…:97-98`) |

- 기술 위험:
  - style-hull이 A-9를 푼다는 가정(Metal 미검증).
  - PBR 패턴 플러그인의 WGSL 주입점 실측 필요.
  - NodeMaterial 베타의 패리티 부담.
  - 필수 CI 4파일 구조 때문에 새 시험이 필수 검사에서 안 돌 위험.
  - 프로브 레인 오인(§1).
- 라이선스:
  - 종이·수묵 결은 절차 생성이라 외부 텍스처가 0이다. 외부 자료는 CC0 등 허용 목록만(`docs/adr/0026-…:92`, `CL/AGENTS.md:71`).
  - 수채는 Adobe 절차 수채 특허를 쓰지 않는 방침(:99-100)에 따라 래스터 후처리로만 하고, 법무 검토 전에는 보류한다.
- 성능 예산:
  - 뷰포트 1080p p95 ≤ 33.3 ms(`CL/README.md:89`), 화풍 추가분 ≤ +4 ms [제안].
  - style-hull: 그리기 호출 + 파츠 수, 삼각형 ×2 이하.
  - PSD 2048: RTT +3패스, CPU 종이·번짐 ≤ 300 ms [제안]. 투명 PNG 2048 ≤ 500 ms.

## 11. 성공 지표 Q — 구성 공간 크기

| Q | 정의 | v2 실측 | v3 설계 상한 |
| --- | --- | --- | --- |
| Q1 | 독립 색 영역 | 8(`mesh-data.ts:76`), 파츠당 틴트 1 | 26채널 + 채널별 패턴 두 번째 색 |
| Q2 | 파츠당 형태 슬라이더 | 0(`morph-names.ts:13-17`) | ≤ 8(키트 v2 헤어·상의·아우터·하의 평균 ≥ 3 목표) |
| Q3 | 동시 착용 레이어·소품 | 헤어 + 상·하·신발 + 소품 1 = 5(`recipe.ts:108`). 키트 실제는 소품·홍채뿐(`README.md:175`) | 층 6 + 헤어 1 + 소품 12 = 19 |
| Q4 | 화풍 파라미터 | 툰 4(이산, `shading.ts:42-49`) | look 연속 41 + 이산 13, 비례 6, 얼굴 5 |
| Q5 | 이산 조합(log10) | 절차 외형 12슬롯 곱 4.5×10⁸ ≈ 8.7, 키트 1.4×10⁵ ≈ 5.2(`preset-vocabulary.ts:11-22`) | 측정기 `state/config-space.ts`가 카탈로그·능력으로 계산(패턴 7 × 재질 6 × 채널, 층·앵커 조합 포함) |
| Q6 | 연속 축 | 체형·얼굴 24 + 색 8×3 = 48(`params.ts:4-32`) | 24 + 비례 6 + 색 78 + 패턴 42 + 헤어 4 + look 41 + 형태 ≤ 48 + 소품 오프셋 84 ≈ 327 |
| QG | 품질 가드 | — | 무음 대체 0, 채널 스윕 인접 ΔE ≥ 10, 층 스윕 z-fight 0, Metal 시트 소유자 승인, p95 +4 ms 이내 |

## 12. 캐릭터 쪽 계약 확정안(배경은 별도 설계, 이 문서 범위 밖)

1. `contracts/art-style.ts`: `ART_STYLE_IDS`(T1 8)·예약 T2 4·`EYE_FAMILIES`·`proportionSchema`·`lookSchema`·`artStylePackSchema`·`LOOK_V2_IDENTITY`. zod만 import.
2. `contracts/color-channels.ts`: `CHANNEL_KEYS`(26)·상속 표·`resolveChannelColor`.
3. `contracts/recipe.ts` v3: `colors`(채널 맵)·`shading.look`·`style`·`wardrobe`(inner·outer·legwear·accessories ≤ 11, 앵커 14)·`partParams`·`surfaces`·`hairColor`, `migrateRecipeV2ToV3`, 지원 [1,2,3].
4. `contracts/shading.ts`: `look` 필수 + 깊은 병합.
5. `contracts/mesh-data.ts`: `PART_ROLES` 끝에 inner·outer·legwear·hair-accessory, `colorKey: ChannelKey`, `regionChannels`, 재질 `cloth-knit`.
6. `contracts/apply-plan.ts`: partMorphWeights·proportion·channels·surfaces·hairColor·accessories, Receipt proportion·skippedShapes.
7. `contracts/passes.ts`·`capture.ts`·`engine.ts`: `lit-clean`·`tone`·`line`, `supportedPasses?`, `ThumbnailRequest.shading?`, `SourceCapabilities.custom?`.
8. `contracts/events.ts`·`morph-names.ts`: §2.4의 명령, `shape:<name>:±`.
9. `contracts/character-kit-v2.ts`: kit/2 매니페스트(채널·shapes·layers·anchor·UV1·headHeightM·영역 마스크·sclera recolor), v1 병행.
10. `contracts/character-look.ts`: look/1(범위·잠금·시드).

배경(BG3D·장면) 계약은 건드리지 않는다.
