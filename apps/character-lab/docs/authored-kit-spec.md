# 모듈식 캐릭터 키트 계약·통합 설계 (authored-kit-spec)

상태: **v1 계약 정본 — 리드 승인 2026-10-08, 앱 통합 KT-01~09·KT-V·FIX-A1 반영** (작성 2026-10-08, A1 키트 계약 설계자). 최초 작성 시에는 설계만 담고 코드를 바꾸지 않았다.
**정정 2026-10-08 (KT-12)**: 구현이 끝난 뒤 코드와 어긋난 곳을 코드 기준으로 맞췄다. 정정한 곳에는 "정정 2026-10-08" 표식을 달았고, 코드와 문서가 다르면 **코드가 기준**이다.
`경로:줄` 인용 중 4~8절의 엔진·셸 줄 번호는 2026-10-08 코드 기준으로 다시 맞췄다. 2절(현재 코드 제약)·12~15절은 **작성 시점(KT-01 이전) 기준**이라 줄 번호가 밀렸을 수 있으니 심볼 이름으로 찾는다.
읽는 사람은 이 대화를 몰라도 구현할 수 있어야 하므로, 모든 주장에 `경로:줄` 또는 심볼 근거를 붙였다. 확인하지 못한 것은 "열린 질문"(13절)과
"위험"(14절)에 적었고, 내가 직접 돌려 본 확인은 15절에 명령과 결과를 남겼다.

문서 상태 구분(AGENTS.md 2절): 이 문서의 3~12절은 모두 **목표 상태(target)** 이다. 2절만 **현재 상태(current, 2026-10-08 소스 기준)** 이다.
기존 `authored-asset-pipeline.md`(current, Orion 패키지 레인)는 건드리지 않으며 키트는 그 옆에 놓이는 새 레인이다.

## 목차

1. 결론 요약
2. 현재 코드가 정하는 설계 제약 (근거 표)
3. 결정 1 — 패키지 레이아웃과 `kit.json`
4. 결정 2 — 런타임 조립 (Babylon)
5. 결정 3 — 15슬롯 능력표와 프리셋 매핑
6. 결정 4 — 기본 소스 전환
7. 결정 5 — 레시피 v2와 마이그레이션
8. 결정 6 — 내보내기·페인트·물리
9. 결정 7 — 검증기 `scripts/verify-character-kit.mjs`
10. 결정 8 — TS 계약 변경 목록
11. 결정 9 — 통합 작업 분해
12. 결정 10 — Blender 쪽 요구사항과 네이밍 불일치 표
13. 열린 질문
14. 위험
15. 부록 — 내가 실행해 확인한 것
16. 부록 B — KT-04 엔진 통합 결과

---

## 1. 결론 요약

목표: `apps/character-lab`이 **리깅된 베이스 바디(여/남) + 교체 가능한 헤어·의상·신발·액세서리 파츠 + 셰이프 키**로 이루어진 모듈식 키트를
기본 캐릭터 소스로 쓴다. 절차 휴머노이드는 사용자가 명시 선택할 때만 쓰는 대체 소스로 남는다.

핵심 결정(근거는 각 절):

| # | 결정 | 이유 한 줄 |
| --- | --- | --- |
| D1 | 키트는 `public/assets/characters/toonstudio-kit-v1/`에 **베이스 GLB 2개 + 파츠별 GLB** + `kit.json`으로 둔다. 슬롯 번들이 아니라 **프리셋 1개 = GLB 1개**다. | 한 번에 한 프리셋만 쓰므로 선택한 것만 받는다(헤어 7종을 다 받으면 10 MB 이상). 40 MB 예산과 로드 시간 둘 다에 유리 |
| D2 | 모든 GLB가 **같은 68 joint 스켈레톤**(Mixamo 65 + `TS_Jaw` + `TS_Eye.L/R`)을 싣고, 로더는 베이스의 스켈레톤 하나에 파츠 메시를 **재바인딩**하며 파츠 쪽 스켈레톤은 버린다. joint 이름 배열이 다르면 로드를 실패시킨다. | Babylon 로더가 `Bone._index = skin.joints.indexOf(...)`로 만들므로(`glTFLoader.pure.js:1277`) 이름 배열 동일성만 검증하면 JOINTS 인덱스가 호환된다 |
| D3 | morph는 **계약 이름 그대로**(`param:<키>:±`, `facs:<유닛>`) 모든 메시가 가진다. 엔진이 이미 "이름 → 타깃 배열"로 모아 같은 influence를 주므로(`package-loader.ts:114`, `character-rig.ts:179`) 전파 코드는 새로 필요 없고 **누락 검출**만 추가한다. | 기존 패널·프리셋·플래너가 한 줄도 안 바뀐다 |
| D4 | 체형 morph의 관절 이동은 `kit.json.jointOffsets`로 싣고 기존 `createJointOffsetRig`를 재사용한다. | 이미 절차 소스용으로 구현·테스트됨(`joint-offset-rig.ts`). 패키지 소스는 지금 이게 없다(`character-engine.ts:1002`) |
| D5 | 파츠 그룹핑·partId는 **역할 고정**(`rolePartId`)이다. 같은 역할 메시(눈 L/R 등)는 한 `RigPart`의 `meshes[]`다. 기존 패키지 로더의 "baseName 정렬 순번" 방식은 쓰지 않는다. | 기본 플래너 레이아웃(`DEFAULT_PART_LAYOUT`)과 일치해야 plan이 올바른 파츠에 적용된다. 기존 패키지 로더는 불일치(2절 C3) |
| D6 | 몸 가림은 **오프셋 셸(기본) + 파츠가 선언한 영역의 인덱스 범위 숨김(보조)** 이다. 영역 단위로 몸 삼각형 순서를 정렬해 두고 `SubMesh` 범위로 숨긴다. | 메시 분할·마스크 셰이더보다 변경 범위가 작고 morph·스킨과 충돌하지 않는다 |
| D7 | 색 변형은 `baseColorFactor` 곱(틴트)이다. 엔진에 `RigPart.tint`(recolor 또는 fixed)를 추가해 "텍스처 있으면 틴트 안 함" 규칙(`character-engine.ts:809`)을 키트 파츠에서 푼다. | 베이스 스킨 텍스처가 "상대색"(A3a 스펙)이라 스킨톤을 곱해야 한다 |
| D8 | 헤어 `COLOR_0`은 **회색 AO 곱(R=G=B)** 로만 쓴다. 뿌리→끝 그라데이션·하이라이트 밴드는 UV 램프 텍스처에 굽는다. LEAD_BRIEF v0의 R/G/B 채널 의미는 폐기를 제안한다. | PBR은 `COLOR_0`을 알베도에 그대로 곱하고(`pbrBlockAlbedoOpacity.js:47`) 툰 셰이더는 아예 못 읽는다(`shader-sources.ts:19`; **정정 2026-10-08**: KT-04가 `TS_VERTEX_COLOR` define으로 툰·밑색 패스에 곱하도록 구현했다 — 4.10) |
| D9 | 키트 소스는 `CharacterSource`/레시피 `source`의 세 번째 종류 `kit`이다. 레시피는 **v2**로 올리고 v1→v2 명시 마이그레이션을 둔다. 키트 부팅 레시피는 `createKitDefaultRecipe()`이고 `createDefaultRecipe()`(절차)는 유지한다. **정정 2026-10-08**: 앱 부팅 기본 소스는 키트 에셋이 안착하기 전까지 `DEFAULT_BOOT_SOURCE = "procedural"`(6절 1항)이다. | 구버전 앱이 새 파일을 "지원하지 않는 버전"으로 정직하게 거부 |
| D10 | 프리셋별 가용성(키트가 제공하지 않는 헤어 등)은 `SlotCapability.unavailablePresets`(프리셋 id → 한글 사유)로 능력 맵 한 곳에 싣는다. | 능력 맵이 엔진 → 스토어 → 패널로 흐르는 유일한 소스별 채널이다 |
| D11 | 새 PartRole `underwear`를 `PART_ROLES` **끝에** 추가한다. | 속옷은 항상 표시·피부색 비적용인데 기존 15 역할 어디에도 맞지 않는다 |
| D12 | v1 키트에서는 얼굴 SDF 툰 그림자, 입 안 마스크, `_Outline` 셸, `ext:*` morph, 헤어/천 물리를 쓰지 않는다. 훅 위치만 정의한다. | 각각 절차 UV·절차 소스 전제이거나 소비자가 없다(2절 C8, C9) |

네이밍 불일치 중 **차단급**: ① joint 수는 67이 아니라 **68**(리드 브리프·A3b 스펙 오기), ② `TS_Jaw`는 최초 작성 시점의 본 매핑에서 **매핑되지 않았다**(54/55; **정정 2026-10-08**: FIX-A1이 `CENTER_TOKENS`에 `tsjaw: "jaw"`를 추가해 지금은 55/55),
③ `TS_Mouth`·`TS_Underwear`·`TS_Acc_headphones`는 이름 규칙으로 역할이 안 잡힌다. 모두 `kit.json`의 **명시 선언**으로 해결한다(12절).

---

## 2. 현재 코드가 정하는 설계 제약 (current, 2026-10-08)

설계가 기댄 사실만 모았다. 각 행의 근거는 직접 읽은 코드이며, "확인 방법"이 있는 것은 15절 부록에 실행 결과가 있다.

| ID | 사실 | 근거 | 설계에 주는 의미 |
| --- | --- | --- | --- |
| C1 | `CharacterSource`는 `procedural`·`package` 두 종류다. 소스 종류로 분기하는 곳은 `apply-loop.ts:88,115,267`, `lab-runtime.ts:128,145,170,205`, `character-engine.ts:379,1002`, `rig-inspection.ts:50`, `character-rig.ts:95`, `PackagePanel.tsx`, `ParamPanel.tsx:226`, `recipe-reducer.ts:259`, `testing/mock-engine.ts:156~158`, `composition.ts:120`이다 | `contracts/engine.ts:52-54`, grep | `kit`을 더하면 이 분기점이 전부 바뀐다(11절 작업 분해의 근거) |
| C2 | 플래너는 소스의 파츠 레이아웃을 모른다. 기본 `DEFAULT_PART_LAYOUT`은 `PART_ROLES` 순서 + 1이고, `createApplyPlanner`로 레이아웃을 주입하는 곳은 **어디에도 없다**(`composition.ts`는 `planApply`만 쓴다) | `state/apply-plan.ts:59,266,344` | 키트는 역할 고정 partId여야 플래너를 안 바꾼다 |
| C3 | 제작 패키지 로더는 파츠를 baseName 사전순으로 정렬해 `partId = index + 1`을 준다 | `render/babylon/package-loader.ts:108,122` | 플래너의 역할 인덱스 + 1과 **다르다**. 예: Orion은 `partId 2`가 헤어인데 플래너는 `partId 2`를 `head`(피부색)로 계획한다. 코드만 읽고 낸 결론이며 **브라우저 미검증**이다. 키트는 이 방식을 쓰지 않는다(D5). 기존 패키지 로더 수정은 이 문서 범위 밖(열린 질문 Q9) |
| C4 | 적용 루프의 소스 키: 절차는 `geometryKeyOf(recipe)`, 패키지는 `characterId + glb sha256`. 키가 바뀌면 `engine.loadSource`를 다시 부른다 | `apply-loop.ts:88-89,113-119` | 키트 파츠 교체도 같은 경로(`loadSource`)로 흘려보내고 엔진이 증분 처리한다 |
| C5 | 엔진 `loadSource`는 항상 `unloadRig()` 후 `buildRig()` 전체 재구성이다 | `character-engine.ts:338-343` | 파츠 교체마다 8 MB 베이스를 다시 파싱하지 않으려면 키트 전용 증분 경로가 필요 |
| C6 | PBR 재색: `hasAlbedoTexture`이면 `setMaterialAlbedo`를 건너뛴다. 툰은 `baseColor × albedoTex`로 항상 곱한다 | `character-engine.ts:809`, `shader-sources.ts:125,178` | 같은 파츠가 모드에 따라 다르게 보인다. 키트는 `tint` 필드로 명시 분리(D7) |
| C7 | 버텍스 컬러: glTF 로더는 `COLOR_0`만 읽는다. PBR은 `mesh.useVertexColors && color 속성 있음`이면 `surfaceAlbedo *= vColor.rgb`. 툰 ShaderMaterial의 attribute는 `position, normal, uv`뿐 | `glTFLoader.pure.js:1000,1116`, `materialHelper.functions.js:1036-1040`, `pbrBaseMaterial.pure.js:1444`, `pbrBlockAlbedoOpacity.js:47`, `shader-sources.ts:19` | `COLOR_1`은 버려지고, `COLOR_0`의 R/G/B를 "의미 채널"로 쓰면 PBR에서 색이 틀어진다(D8) |
| C8 | 얼굴 SDF 그림자는 정면 대칭 UV를 전제로 한 해석 맵이고 `head` 역할이면 무조건 쓴다. 입 안 마스크는 `rig.kind === "procedural"`일 때만 | `face-sdf.ts:1-30`, `character-engine.ts:586,555-556` | 키트 머리 UV(HBM 재전개)에 SDF를 쓰면 음영이 무의미해진다. v1은 끈다 |
| C9 | 툰 hull 외곽선은 모든 파츠 메시에 `mesh.renderOutline = true`로 그리고, 동시에 `_Outline` 셸 메시도 보이게 한다 | `character-engine.ts:480-483,498` | 키트 파츠에 `_Outline` 셸이 있으면 외곽선이 **이중**으로 그려진다. v1은 셸 금지, 있으면 해당 파츠의 `renderOutline`을 끈다 |
| C10 | 본 이름 매핑은 Mixamo(`mixamorig:*`)·`TS_*Eye.L/R`을 추정한다. `TS_Jaw`는 추정 불가 | `bone-name-mapping.ts:20-41,226` + 15절 실행 결과(68개 중 54개 매핑, `jaw` 누락) | 키트는 `skeleton.boneMap`을 명시 override로 싣는다(`classifyBoneNames`의 override가 우선). **정정 2026-10-08**: 이 행은 작성 시점의 제약이다 — FIX-A1이 `tsjaw: "jaw"`를 추가해 추정만으로도 55/55이다(`kit-name-rules.test.ts`가 55/55 매핑·`jaw` 누락 없음·미매핑은 끝 본 13개를 고정). 명시 override는 그대로 유효하다 |
| C11 | `render/**`는 `contracts`·`shared`만 import하고 `domains/*`는 못 쓴다. 도메인끼리도 교차 import 금지 | `AGENTS.md` 3절, `architecture.test.ts:40-60` | `KitPlan` 타입·`kit.json` zod 스키마는 `contracts/`에 둔다(10절) |
| C12 | morph 전파 기구가 이미 있다: 로더가 모든 메시의 `MorphTargetManager` 타깃을 **이름 → `MorphTarget[]`** 로 모으고, `applyRigPlan`이 같은 이름의 모든 타깃에 같은 influence를 준다 | `package-loader.ts:112-136`, `character-rig.ts:179-188` | 몸·머리·의상에 같은 이름의 타깃이 있으면 자동 전파. 빠진 메시가 문제 |
| C13 | 관절 오프셋 인프라(`createJointOffsetRig`)는 절차 소스만 쓴다. 패키지 소스는 "관절 오프셋 없음"으로 보고한다 | `mesh-binding.ts:202`, `character-engine.ts:1002` | 키트 로더가 같은 포트를 채우면 된다(D4) |
| C14 | 레시피는 strict zod, `RECIPE_VERSION = 1`, 다른 버전은 `recipe-unsupported-version`으로 거부한다 | `contracts/recipe.ts:22,83,182-191` | v2 + 명시 마이그레이션(7절) |
| C15 | 프리셋 카드의 비활성은 슬롯 능력(`unavailable`)만으로 정해진다. 프리셋 단위 비활성은 없다. 플래너의 `features`(morph/bone 요구 검사)는 아무도 주입하지 않아 **검사가 꺼져 있다** | `SlotPanel.tsx` PresetCard, `state/apply-plan.ts:74-82` | 프리셋 단위 가용성을 능력 맵에 싣는다(D10) |
| C16 | 페인트 레이어와 데칼 텍스처는 **역할 단위** 하나다(`PaintLayer.part`). 같은 역할의 모든 메시에 같은 UV로 붙는다 | `contracts/paint.ts`, `pick-and-paint.ts:92-121` | 의상 변형마다 UV가 다르므로 의상 역할 페인트는 변형 교체 시 어긋난다(8절) |
| C17 | 썸네일: `ThumbnailRequest.source`가 있으면 엔진이 **임시 리그**를 만들어 그린 뒤 해제한다. 지오메트리 프리셋 카드가 이 경로다 | `contracts/capture.ts:80-92`, `character-engine.ts:711-733` | 키트도 같은 경로를 쓰되 임시 리그 비용을 줄여야 한다(4.11) |
| C18 | glTF 로더는 JOINTS 인덱스를 `skin.joints` 순서 그대로 쓰고 `Bone`에 그 순서를 `_index`로 준다 | `glTFLoader.pure.js:1277-1278,1298-1300` | 파츠 GLB의 `skin.joints` **이름 배열이 베이스와 같으면** 인덱스 재매핑 없이 재바인딩 가능 |
| C19 | Orion의 `skin.joints`는 67개 = Mixamo 65 + `TS_OrionEye.L/R`(턱 본 없음) | `avatar-orion-authored/manifest.json` `skeleton.skins[0].joints` | 키트는 `TS_Jaw`가 더해져 **68개** |

---

## 3. 결정 1 — 패키지 레이아웃과 `kit.json`

### 3.1 디렉터리

```text
apps/character-lab/public/assets/characters/toonstudio-kit-v1/
  kit.json                         # 키트 manifest (schema "toonstudio.character-kit/1")
  NOTICE.md                        # 출처·라이선스 사람용 요약 (provenance와 같은 내용)
  bases/
    female.glb                     # 스켈레톤 + TS_Body/TS_Head/눈/입/속눈썹/눈썹/속옷, 전체 morph
    male.glb
  parts/
    female/
      hair/<style>.glb             # <style> = SLOT_PRESET_IDS.hair 이름 (예: soft-bob)
      top/<name>.glb  bottom/<name>.glb  shoes/<name>.glb  accessory/<name>.glb
      irises/<name>.glb            # 홍채 디스크(TS_Iris_L/R) + 캐치라이트(TS_Highlight_L/R) 변형 (정정 2026-10-08, A-1)
    male/ ... (같은 구조)
```

- 텍스처는 **GLB 안에 임베드**한다(별도 파일 없음). 이유: 로더가 `LoadAssetContainerAsync(bytes, …)`로 바이트만 받아 열기 때문에 상대 URI를 풀 방법이 없고
  (`package-loader.ts:67`), SHA-256 검증 단위가 파일 하나로 끝난다.
- 두 베이스가 같은 파츠 파일을 공유해도 된다(`variants.female.file.path === variants.male.file.path`). 용량 집계는 **고유 파일**만 센다.
- `index.json`(기존 제작 패키지 목록)에는 키트를 넣지 않는다. 키트 위치는 상수 `KIT_ASSET_ROOT`(10절)이다. 기존 `real-packages.test.ts`·`PackagePanel` 목록과 섞이지 않는다.

### 3.2 번들 단위: 파츠별 GLB로 정한 근거

| 안 | 장점 | 단점 | 판정 |
| --- | --- | --- | --- |
| 슬롯별 번들(헤어 7종을 한 GLB) | 파일 수 적음 | 선택 안 한 6종을 같이 받는다(헤어 LOD 3단 × 7종 ≈ 10 MB 이상). 교체 1회에도 전체 재파싱 | 기각 |
| **프리셋별 GLB** | 필요한 것만 받음. 교체 = 파츠 1개 파싱. 검증·해시 단위가 작다 | 파일 수 많음(베이스당 약 32개). 각 GLB가 스켈레톤·IBM 68개를 중복 보유(약 5 KB) | **채택** |
| 모든 것을 베이스 GLB 하나에 넣고 가시성만 토글 | 교체 즉시 | 베이스 8 MB 한도 초과 확실, 로드 시간 | 기각 |

정적 호스팅이라 HTTP/2 병렬 요청 비용은 작다. 로더는 한 번에 최대 4개를 병렬로 받는다(4.2).

### 3.3 `kit.json` 스키마

zod 정의는 `contracts/character-kit.ts`(10절)가 단일 기준이고 아래 표는 그 설명이다. 전체가 `strict`(알 수 없는 키는 오류)이다. 구버전 호환이 아니라 **키트 버전(`kitVersion`)이 바뀌면 같이 바뀐다**.

최상위

| 필드 | 형식 | 설명 |
| --- | --- | --- |
| `schema` | `"toonstudio.character-kit/1"` | 스키마 식별자(`KIT_SCHEMA_ID`) |
| `kitId` | `^[a-z0-9][a-z0-9._-]{1,62}$` | 예 `toonstudio-kit-v1`. 레시피 `source.kitId`와 일치해야 함 |
| `kitVersion` | 정수 ≥ 1 | 이름·구조가 호환되지 않게 바뀌면 올린다. 레시피 `source.kitVersion`과 다르면 `kit-version-mismatch` |
| `displayName`, `generatedAt` | 문자열, `YYYY-MM-DD` | |
| `generator` | `{ tool, blender, command[], commit? }` | 재현용. `tool`은 `tools/blender/character_kit` |
| `coordinateSystem` | `{ up:"+Y", forward:"+Z", unit:"m", handedness:"right", rest:"T-pose", rootScale:1 }` | 상수 검증용(값이 다르면 스키마 오류) |
| `provenance` | `{ sources[], noticeFile, summaryKo }` | 3.8 |
| `skeleton` | `{ root, joints[68], parents, boneMap, endBones[13] }` | 3.4. `joints` 순서는 모든 GLB `skin.joints`와 동일해야 함 |
| `materials` | `{ [name]: { role, tint, doubleSided } }` | 3.6 |
| `jointOffsets` | `{ [morphName]: { [jointNode]: [dx,dy,dz] } }` | 체형 morph의 관절 이동(4.4). 값은 **glTF 노드 로컬 평행이동에 더하는 양**(m) |
| `bases` | `{ female?, male? }` | 3.4 |
| `parts` | `KitPart[]` | 3.5 |
| `defaults` | `{ base, slots, colors }` | 3.9 |
| `slotCapabilities` | `{ [baseId]: SlotCapabilityMap }` | 선언값. 로더가 규칙으로 다시 계산해 **불일치면 실패**(검증기도 대조) |
| `physics` | `{ mode:"static", chains:[], colliders:[] }` | v1은 항상 비어 있음(8.4) |
| `budgets` | 3.7 | 투명성용 사본. 강제는 계약 상수가 한다 |

`skeleton`

| 필드 | 설명 |
| --- | --- |
| `root` | `"Armature"` |
| `joints` | 68개 노드 이름. Mixamo 65 = `mixamorig:{Hips,Spine,Spine1,Spine2,Neck,Head,HeadTop_End}` + 좌우 각 29(`{Shoulder,Arm,ForeArm,Hand}` 4 + `Hand{Thumb,Index,Middle,Ring,Pinky}{1..4}` 20 + `{UpLeg,Leg,Foot,ToeBase,Toe_End}` 5), 추가 `TS_Jaw`, `TS_Eye.L`, `TS_Eye.R` |
| `parents` | `{ [joint]: 부모 joint 또는 null }`. `mixamorig:Hips`만 null. `TS_Jaw`·`TS_Eye.*`·`mixamorig:HeadTop_End`의 부모는 `mixamorig:Head`. 계약 `HUMANOID_BONE_PARENTS`와 `boneMap`으로 대조 |
| `boneMap` | `{ [joint]: HumanoidBoneName }` **정확히 55개**(계약 어휘 전부 1회씩). 예: `mixamorig:Spine1 → chest`, `mixamorig:Spine2 → upperChest`, `mixamorig:LeftHandThumb1 → leftThumbMetacarpal`, `mixamorig:LeftToeBase → leftToes`, `TS_Jaw → jaw`, `TS_Eye.L → leftEye` |
| `endBones` | 매핑하지 않는 끝 본 13개: `HeadTop_End`, 좌우 `Toe_End`, 좌우 손가락 `…4` 10개 |

### 3.4 `bases`

```jsonc
"bases": {
  "female": {
    "file": { "path": "bases/female.glb", "bytes": 7421133, "sha256": "…64hex…" },
    "heightM": 1.64,
    "boundsM": { "min": [-0.86, 0.0, -0.12], "max": [0.86, 1.64, 0.13] },
    "meshes": [
      { "node": "TS_Body",      "role": "skin",      "material": "ts_skin_body", "triangles": 52000, "vertices": 26500, "skinned": true, "morphs": ["param:height:+", "…18개…"] },
      { "node": "TS_Head",      "role": "head",      "material": "ts_skin_head", "triangles": 33000, "vertices": 16800, "skinned": true, "morphs": ["…8 + 30 + 16 = 54개…"] },
      { "node": "TS_Eye_L",     "role": "eyeball",   "material": "ts_eye",  "triangles": 1000, "vertices": 546, "skinned": true, "morphs": ["…"] },
      { "node": "TS_Eye_R",     "role": "eyeball",   "material": "ts_eye",  "…": "…" },
      { "node": "TS_Mouth",     "primitiveRoles": ["teeth", "tongue"], "primitiveMaterials": ["ts_teeth", "ts_tongue"], "…": "…" },
      { "node": "TS_Lashes",    "role": "lash",      "material": "ts_lashes", "…": "…" },
      { "node": "TS_Brow_L",    "role": "brow",      "material": "ts_brow", "…": "…" },
      { "node": "TS_Brow_R",    "role": "brow",      "material": "ts_brow", "…": "…" },
      { "node": "TS_Underwear", "role": "underwear", "material": "ts_underwear", "…": "…" }
    ],
    "bodyRegions": [
      { "id": "torso", "mesh": "TS_Body", "indexStart": 0, "indexCount": 21000 },
      { "id": "neck",  "mesh": "TS_Body", "indexStart": 21000, "indexCount": 1800 }
      // … 15개(head 제외)가 인덱스 버퍼를 빈틈·겹침 없이 분할
    ]
  },
  "male": { "…": "…" }
}
```

규칙

- **한 베이스 GLB의 메시 노드 이름 집합 = `meshes[].node` 집합**(검증기가 대조). 선언 안 된 메시는 `kit-mesh-undeclared`로 로드 실패 — 규약 밖 메시를 조용히 숨기던 `package-loader.ts:90-98`의 동작을 키트는 쓰지 않는다.
- **같은 역할의 메시는 같은 재질 이름 하나만** 쓴다(C3의 `mesh.material = pbr`가 역할 파츠 전체에 재질 하나를 덮어씌우기 때문, `package-loader.ts:128`, `character-engine.ts:497`). 그래서 리드 브리프의 `ts_eye_L/R`은 `ts_eye` 하나로 합친다(12절 표).
- 다중 프리미티브 메시(`TS_Mouth`)는 `primitiveRoles[]`로 프리미티브 번호별 역할을 선언한다. Babylon은 이를 `TS_Mouth_primitive0/1` 서브메시로 쪼개므로(`authored-asset-pipeline.md` 4절 실측) 로더가 `_primitive<i>` 접미로 역할을 찾는다. 치아+잇몸이 `teeth`, 혀+구강 안쪽 어두운 포켓이 `tongue`다(둘 다 해당 재질 텍스처의 별도 UV 섬).
- 눈 `TS_Eye_L/R`은 **공막+각막만**(역할 `eyeball`, 흰색 고정). 홍채·동공은 `irises` 파츠의 `TS_Iris_L/R`(역할 `iris`, 틴트)이다. **정정 2026-10-08 (리드 결정 A-1)**: 캐치라이트는 곱셈 틴트로 낼 수 없어 별도 고정색(흰색) 메시 `TS_Highlight_L/R`(역할 `eye-highlight`)이며 모든 `irises` 변형이 `TS_Iris_L/R` + `TS_Highlight_L/R`을 필수로 가진다. 동공은 홍채 텍스처에 굽는 것이 기본(어두운 색은 곱셈 틴트에 안전)이고, 별도 `TS_Pupil_L/R`(역할 `pupil`)은 선택이다. 기본 홍채 `irises/round-large`는 필수 파츠다(3.9).
- `bodyRegions`는 `TS_Body`의 인덱스 버퍼를 영역별로 **연속 범위**로 나눈 표다. Blender 쪽이 삼각형을 영역 순서로 정렬해 내보낸다(12.3).
  영역 id 16개 = `head, neck, torso, pelvis, upperArm.L/R, forearm.L/R, hand.L/R, thigh.L/R, calf.L/R, foot.L/R`(리드 브리프 `region.*`와 동일). 이 중 `TS_Body` 인덱스 범위로 나뉘는 것은 `head`를 뺀 15개이고, `head` 영역은 `TS_Head`에만 있다.
  또 `TS_Body`·`TS_Head`는 정점 속성 `_REGION`(UNSIGNED_BYTE 스칼라, 값은 `KIT_REGION_IDS` 인덱스)을 싣는다 — glTF에는 정점 그룹이 없어서 검증용 증거로 쓴다. Babylon 로더는 모르는 `_` 속성을 무시한다.

### 3.5 `parts`

```jsonc
"parts": [
  {
    "id": "hair/soft-bob",                 // = 앱 프리셋 id (<슬롯>/<이름>, SLOT_PRESET_IDS 어휘 안)
    "slot": "hair",
    "variants": {
      "female": {
        "file": { "path": "parts/female/hair/soft-bob.glb", "bytes": 911842, "sha256": "…" },
        "meshes": [
          { "node": "TS_AuthoredHair_soft-bob_LOD0", "role": "hair", "material": "ts_hair_soft-bob", "lod": 0, "triangles": 14820, "vertices": 7600, "morphs": ["param:headSize:+", "param:headSize:-", "…8개"] },
          { "node": "TS_AuthoredHair_soft-bob_LOD1", "role": "hair", "lod": 1, "…": "…" },
          { "node": "TS_AuthoredHair_soft-bob_LOD2", "role": "hair", "lod": 2, "…": "…" }
        ],
        "hides": []                          // 몸에서 숨길 영역(KIT_HIDEABLE_REGION_IDS 부분집합)
      },
      "male": { "…": "…" }
    },
    "unavailable": {}                        // 베이스별 미제공 사유 { male: "남성 핏 미제작" }
  },
  { "id": "top/tee", "slot": "top",
    "variants": { "female": { "file": { "…": "…" }, "meshes": [ { "node": "TS_Top_tee", "role": "top", "material": "ts_top_tee", "…": "…" } ], "hides": ["torso", "upperArm.L", "upperArm.R"] } } }
]
```

- `id`는 반드시 `SLOT_PRESET_IDS`(어휘)에 있는 `<슬롯>/<이름>`이다. 키트 전용 새 프리셋 id가 필요하면 어휘를 먼저 늘려야 한다(core, 열린 질문 Q4).
- 슬롯별 허용 역할: `hair`→`hair`, `top`→`top`, `bottom`→`bottom`, `shoes`→`shoes`, `accessory`→`accessory`, `irises`→`iris`·`eye-highlight`(+`pupil` 선택) (**정정 2026-10-08**, A-1: `KIT_PART_SLOT_ROLES`·`KIT_PART_SLOT_REQUIRED_ROLES`, 각 역할은 좌/우 2메시, 노드 이름 `TS_Iris_*`·`TS_Highlight_*`·`TS_Pupil_*`).
- 헤어 메시 이름은 기존 정규식 `^TS_AuthoredHair_(?<style>[a-z0-9-]+)_LOD(?<lod>\d+)$`(`package-manifest.ts:41`)를 **그대로** 따르고 `style`은 `id`의 이름과 같아야 한다. 의상은 `TS_Top_<name>`, `TS_Bottom_<name>`, `TS_Shoes_<name>`, **`TS_Accessory_<name>`**(리드 브리프의 `TS_Acc_`에서 변경 제안, 12절), 홍채는 `TS_Iris_L/R`.
- 모든 파츠 메시는 **베이스 스켈레톤에 스키닝**한다. 리드 브리프 v0과 Orion 헤어는 헤드 본에 노드 부착이었으나(`manifest.json` `parentNode: mixamorig:Head`), 키트는 전부 스키닝으로 통일한다. 이유: 한 스켈레톤에 바인딩하는 코드 경로가 하나로 끝나고, 관절 오프셋·GLB 내보내기·IK 포즈가 같은 방식으로 따라온다.
- 같은 역할의 메시가 여럿(헤어 LOD0/1/2)이면 로더는 선택 LOD만 남기고 나머지는 즉시 해제한다(4.7).

### 3.6 재질·텍스처 규약

`materials[name] = { role, tint, doubleSided }`, `tint` 두 종류:

| tint | 의미 | 엔진 동작 |
| --- | --- | --- |
| `{ "mode": "recolor", "colorKey": "skin" }` | 레시피 `colors[colorKey]`를 **알베도 텍스처에 곱한다** | PBR `albedoColor = 색`, 툰 `baseColor = 색`. 텍스처가 있어도 적용(D7). GLB `baseColorFactor`는 `[1,1,1,1]`이어야 함(어기면 검증기 오류) |
| `{ "mode": "fixed", "hex": "#f4f4f6" }` | 항상 이 색(텍스처 × 고정색). 레시피 색 무시 | PBR `albedoColor = hex`, 툰 `baseColor = hex`. `RigPart.colorHex = hex` |

역할별 기본: `skin`/`head`→recolor `skin`, `iris`→recolor `iris`, `brow`/`lash`→recolor `brow`, `hair`→recolor `hair`, `top`/`bottom`/`shoes`/`accessory`→recolor 같은 이름 키, `eyeball`·`teeth`·`tongue`·`underwear`·`eye-highlight`→fixed(캐치라이트는 흰색, A-1). `pupil`은 제약하지 않는다(홍채 텍스처에 굽는 것이 기본). **정정 2026-10-08**: `eye-highlight`·`pupil` 추가.

- **recolor 텍스처는 "상대색"** 이다: 밝은 중립(평균 휘도 ≥ 0.75), 틴트가 곱해져 최종색이 된다(A3a 스펙 10항이 스킨에 이미 이 방식). 헤어 램프는 0.55~1.0 회색이며 **레시피 헤어색 = 하이라이트 밴드의 색**, 뿌리·그늘은 램프가 더 어둡게 만든다(곱셈은 어둡게만 만들기 때문).
- **한 (파츠, 역할)에 재질 하나**. 다색 의상은 텍스처에 구우면 되고 전체가 같은 틴트를 곱한다(세일러복의 네이비 칼라는 틴트에 따라 같이 변한다 — v1 한계, 14절 R8).
- **ORM(AO/거칠기/금속) 텍스처는 쓰지 않는다**. 앱의 재질 프리셋이 파츠 교체·역할 기본에 따라 `metallic`·`roughness`·시인·클리어코트를 **덮어쓴다**(`material-factory.ts:applyPresetParams`, `material-presets.ts`). 쓰면 프리셋과 곱해져 의도와 달라진다. 허용 텍스처: `baseColor`(필수), `normal`(선택).
- 형식: 불투명은 JPEG, **알파가 필요한 것만 PNG**(속눈썹·눈썹 컷아웃). 안경 렌즈용 BLEND 알파는 v1에서 쓰지 않는다(아래 A-8). 검증기는 PNG IHDR의 색 유형에 알파가 없으면 오류(JPEG로 바꿀 것).
- **알파 BLEND 미지원 — 안경은 프레임만(리드 결정 A-8, 정정 2026-10-08)**: 앱 툰 셰이더는 알파 BLEND를 지원하지 않아(KT-04 확인) 렌즈 메시가 **불투명**으로 그려진다. 그래서 `TS_Accessory_glasses`는 프레임만 만들고 렌즈 메시·BLEND 재질·알파 컷아웃 렌즈를 넣지 않는다. 알파는 `MASK`(속눈썹·눈썹 컷아웃, 4.9-3의 `alphaCutoff`)까지만 쓴다. 검증기는 BLEND를 막지 않는다(V13은 `alphaMode`가 `OPAQUE`가 아니면 알파 PNG를 요구할 뿐이다) — **에셋 작업자가 지킬 규칙**이며 후속 과제는 BLEND 지원(정렬·깊이 쓰기·툰 합성) 뒤에 렌즈를 되살리는 것이다.
- 크기: `TS_Body`·`TS_Head` 2048², 그 외 ≤ 1024², 2의 거듭제곱. 노멀맵 JPEG q90 허용. 압축 텍스처(KTX2/Basis)·WebP는 v1에서 쓰지 않는다(Basis는 외부 트랜스코더 로드가 필요, `KHR_texture_basisu` 금지 목록).
- 허용 glTF 확장: `KHR_materials_clearcoat`, `KHR_materials_sheen`, `KHR_materials_specular`, `KHR_materials_ior`, `KHR_materials_emissive_strength`, `KHR_texture_transform`, `KHR_mesh_quantization`. **금지**: `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu`, `EXT_texture_webp`(외부 디코더/CDN 의존, 무음 실패 위험).

### 3.7 예산

모든 용량은 MiB(1024²)로 센다.

| 항목 | 한도 | 근거 |
| --- | --- | --- |
| 베이스 GLB | ≤ 16 MiB (성별당; 정정 2026-10-08: 체형 morph만으로 12.2 MB — 목표 ≤ 12 MiB) | 리드 결정(B3 실측) |
| 파츠 GLB | ≤ 1.5 MiB | 같음 |
| 키트 전체(고유 파일 합) | ≤ 64 MiB (정정 2026-10-08) | 같음 |
| 파츠당 평균(참고) | 베이스 2×8 = 16 MiB를 빼면 24 MiB를 파츠 약 64개(헤어 7·상의 5·하의 5·신발 4·액세서리 6·홍채 5 = 32개/베이스)로 나눠 **평균 0.375 MiB** | 계산. 홍채·액세서리는 ≤ 0.1 MiB로 만들어야 의상·헤어에 여유가 생긴다 |
| 삼각형 | `TS_Body+TS_Head` ≤ 90,000, `TS_Underwear` ≤ 8,000, 상의·하의 각 ≤ 25,000, 신발 ≤ 8,000, 액세서리 ≤ 6,000, 헤어 LOD0 ≤ 20,000, 눈·홍채·입·속눈썹·눈썹 합 ≤ 15,000 | 제안(열린 질문 Q7). `TS_Body+TS_Head` 90k는 A3a 스펙 3항 |
| **활성 최악 합계** | 베이스 + 속옷 + 슬롯별 최대 파츠 합 ≤ 200,000 tri (LOD0) | 제안. 절차 소스의 미리보기 예산은 140k(`composition.ts:SUBDIVISION_LEVELS` 주석)이나 키트는 의상이 별도 파츠라 더 크다 |
| joint | 정확히 68 | 3.3 |
| 정점당 스킨 영향 | ≤ 4, 가중치 합 1 ± 1e-3 | A3b 스펙 |
| 메시당 morph 타깃 | ≤ 96 | Babylon 텍스처 모드 층 한계 256(WebGL2 최소)·NullEngine 128보다 작게(`morph-limits.ts:1-12`) |
| morph 텍스처 메모리(참고) | `TS_Head` 정점 약 1.7만 × 타깃 54 × 위치(+법선) 16 B ≈ 15 MB(법선 포함 시 30 MB), `TS_Body` 약 2.7만 × 18 ≈ 8 MB(법선 포함 16 MB) | 계산. **법선 델타는 `TS_Head`·`TS_Body`만 내보내고 의상·헤어 등은 위치만**(열린 질문 Q8) |

### 3.8 출처·라이선스(`provenance`)

```jsonc
"provenance": {
  "summaryKo": "Blender Foundation Human Base Meshes Bundle v1.4.1(CC0)을 가공한 파생물과 이 저장소에서 새로 제작한 원본 디자인.",
  "noticeFile": "NOTICE.md",
  "sources": [
    {
      "id": "hbm-1.4.1",
      "name": "Blender Foundation Human Base Meshes Bundle",
      "version": "1.4.1",
      "url": "https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip",
      "zipSha256": "811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515",
      "license": "CC0-1.0",
      "derivative": true,
      "changesKo": "GEO-body_female_realistic/male_realistic 사용. 멀티레스 레벨 1 적용, 목에서 몸/머리 분할, 구강 내부·속눈썹·눈썹 추가, UV 재전개, 노멀 베이크, T-포즈 변환, 리깅."
    },
    { "id": "toonstudio-original", "name": "ToonStudio 원본 디자인(헤어·의상·액세서리·머티리얼)", "license": "original", "derivative": false, "changesKo": "tools/blender/character_kit 로 절차 생성" }
  ]
}
```

- 허용 `license`: `CC0-1.0`, `original`. 그 외는 검증기 오류(상용 제품 에셋·불명확 라이선스 금지, 리드 브리프 2절).
- 새로 내려받는 소스는 `zipSha256`과 `url`(https)을 반드시 적는다. `original`은 `url`·`zipSha256` 생략 가능.
- `NOTICE.md`는 사람용 요약이다(자동 생성). CC0는 고지 의무가 없지만 출처 추적용이다.

### 3.9 기본 선택값

`defaults`는 **앱 코드의 상수와 같아야 한다**(레시피 부팅이 비동기 fetch를 기다리지 않도록 기본값의 단일 기준은 TS 상수 `KIT_DEFAULT_SLOTS`이고 `kit.json.defaults`는 검증기가 대조만 한다).

- `base`: `"female"`.
- `slots`: `createDefaultRecipe()`의 값과 같다 — `hair/soft-bob`, `top/tee`, `bottom/jeans`, `shoes/sneakers`, `accessory: null`, `eyes/almond`, `irises/round-large`, 표정 `expression/neutral`, 포즈 `pose/a-pose` 등. **필수 파츠 최소 집합**(`KIT_REQUIRED_PRESETS`): `hair/soft-bob`, `top/tee`, `bottom/jeans`, `shoes/sneakers`, `irises/round-large` — 각 베이스에 없으면 키트 전체가 invalid.
- `colors`: `DEFAULT_RECIPE_COLORS`와 같다.
- **키트 툰 기본 셰이딩(리드 결정 A-10, 정정 2026-10-08)**: 키트 소스의 부팅 레시피는 툰 `rampSteps: 2`, `rim: false`다(`contracts/recipe.ts`의 `KIT_DEFAULT_TOON`). 절차 소스 기본값(`DEFAULT_SHADING.toon` = 램프 3단·림 켬)은 바꾸지 않는다. 근거(실사 비례 몸에서 3단은 큰 불규칙 두 톤 패치를 만들고 — 몸 아랫부분 비조명 톤 비율 front 58 %·q3 37 % — 2단은 25 %·12 %로 형태를 따르는 경계 하나만 남는다. 림 기본 임계 0.55/0.65는 q3 실루엣에 흰 점선을 만든다)는 KT-04 점검 결과다. 적용 위치는 셋이며 `kit.json`에는 싣지 않는다(셰이딩은 레시피 소유).
  1. `createKitDefaultRecipe()`가 `applyKitToonDefaults(shading)`을 쓴다.
  2. `state/recipe-reducer.ts`의 `source/set`이 절차·패키지 → **키트**로 처음 옮길 때만 `applyKitToonDefaults`를 적용한다. 값이 아직 절차 기본값(3단·림 켬)인 항목만 바꾸고 사용자가 바꾼 값은 유지한다. 키트 안의 베이스 전환·같은 소스 재선택은 셰이딩을 건드리지 않는다(같은 소스는 같은 참조를 돌려준다).
  3. 뷰어(`scripts/kit-preview.mjs`, `docs/kit-preview.md`)도 같은 기본값을 쓰고 `--ramp-steps`·`--rim`·`--outline`으로 덮어쓴다.

---

## 4. 결정 2 — 런타임 조립 (Babylon)

### 4.1 데이터 흐름

```text
recipe.source = { kind:"kit", kitId, baseId, kitVersion }
  │  (apply-loop buildSource)
  ▼
KitPlanRegistry.ensure(source)          ← app/shell, kit.json fetch·zod·버전/베이스 검사 (캐시)
  │
  ▼
buildKitPlan(manifest, recipe)          ← domains/authored/kit-plan.ts (순수)
  │  베이스 + 선택 슬롯(hair/top/bottom/shoes/accessory/irises)의 파츠 목록, url·sha·bytes, 메시 선언, hides, 능력 맵
  ▼
CharacterSource { kind:"kit", plan: KitPlan }
  │
  ▼
engine.loadSource(source)               ← render/babylon/kit-loader.ts
  │  fetch(병렬 4) → sha/bytes 검증 → LoadAssetContainerAsync → 스켈레톤 재바인딩 → 역할 그룹핑 → morph 등록 → 몸 가림 → 재질/틴트
  ▼
SourceCapabilities { capabilities, morphNames, boneNames, partIdPalette }  → 스토어(source/capabilities) → 패널
```

### 4.2 로드 시퀀스(엔진 `loadSource`, 키트)

1. `plan.parts[0]`(베이스) 와 선택 파츠를 병렬(최대 4)로 `deps.fetchBytes(url)`. 같은 URL은 엔진의 **바이트 캐시**(`Map<url, Uint8Array>`, 합계 64 MiB 상한, 최근 사용 우선 제거)를 쓴다.
2. 각 파일의 `bytes`·SHA-256을 plan과 대조(`kit-bytes-mismatch`, `kit-sha-mismatch`). 기존 `verifyPackageSha` 옵션과 같은 기본 true.
3. 각 바이트를 `LoadAssetContainerAsync`(옵션은 `package-loader.ts`의 `LoadAssetContainerAsync` 호출(65행 부근)과 동일: `GLTFLoaderCoordinateSystemMode.AUTO`, 애니메이션 없음, `compileMaterials:false`)로 연다. 실패는 `kit-glb-load-failed`.
4. 베이스에서 스켈레톤·본 TransformNode 트리를 만든다(4.3). 파츠마다 스켈레톤 호환 검사(4.3) 후 메시를 베이스 스켈레톤에 재바인딩한다.
5. 메시를 **plan의 `meshes[]` 선언**과 대조한다 — 선언에 없는 메시, 선언했는데 없는 메시, 선언한 morph 이름이 타깃에 없는 경우는 모두 LabFailure로 실패(무음 숨김 금지).
6. 메시를 **역할로** 묶어 `RigPart`를 만든다(4.5). 재질을 `adaptLoadedMaterial`로 보강하고 `RigPart.tint`를 채운다(4.9).
7. morph 타깃을 이름으로 `rig.morphs`에 등록한다(4.4). 체형 morph 관절 오프셋 포트를 만든다(`createJointOffsetRig`).
8. 몸 가림(4.6)을 적용한다.
9. `rig.capabilities = plan.capabilities`, `poseConvention: "model-space"`, `partIdPalette = allocatePartIdsByRole(parts)`, `chains: []`, `colliders: []`를 돌려준다.

### 4.3 하나의 스켈레톤에 바인딩 (fail-visible)

**원리**: 모든 파일이 같은 68 joint를 같은 순서로 싣고, 파츠 메시의 `JOINTS_0`은 그 순서의 인덱스다. Babylon 로더는 `Bone._index = skin.joints.indexOf(node.index)`로 만들고 스킨 행렬을 `_index`로 조회한다(C18). 그래서:

1. 파츠 컨테이너의 `container.skeletons[0].bones`를 `bone.getIndex()` 순서로 정렬해 joint 이름 배열 `J_part`를 얻는다(GLB JSON을 따로 파싱하지 않는다 — `domains/authored/glb-json-chunk.ts`는 render에서 import할 수 없다). 기준은 `plan.skeleton.joints`.
2. `J_part`가 `plan.skeleton.joints`와 **원소별로 같으면**: 파츠의 스킨 메시에 `mesh.skeleton = baseSkeleton`만 지정한다. 재매핑 없음(일반 경로).
3. 이름 집합은 같고 순서만 다르면: 파츠 인덱스 → 베이스 인덱스 표를 만들어 `VertexBuffer.MatricesIndicesKind`(그리고 있으면 `MatricesIndicesExtraKind`)를 다시 쓴다. (키트 빌더는 순서를 같게 만들므로 정상 경로가 아니라 **방어용**이고, 발생하면 `notes`에 한글로 남긴다.)
4. 집합이 다르면(누락·여분 joint, 부모 불일치) `kit-joint-mismatch` LabFailure로 **로드 전체를 실패**시킨다. 사유에 어긋난 이름 최대 5개를 넣는다.
5. 스키닝이 아닌 메시(JOINTS 없음)는 키트에서 금지(`kit-skin-invalid`). 가중치 합·영향 수는 로드 시 정점 샘플(최대 2,000개 균등 추출)로 점검하고 전수 검사는 검증기가 한다.
6. 재바인딩 후 파츠 컨테이너의 **스켈레톤과 그 본 TransformNode를 해제**한다(메시는 `character-root`로 reparent, 노드 변환은 항등이어야 하며 어기면 `kit-transform-invalid`). 파츠 컨테이너의 나머지(텍스처·재질·메시)는 파츠 수명 동안 유지한다.

`TS_Eye.L/R`·`TS_Jaw`는 정규 joint이므로 홍채·치아·혀가 같은 방식으로 따라온다. **턱 규칙**: 입 벌림은 `facs:jawOpen` morph로만 구동한다. 포즈 스코프 `full`/`upper`가 `jaw` 본 회전을 줄 수 있으나 표정 플랜은 그 본을 건드리지 않는다. 둘을 동시에 쓰면 이중 변형이므로 `facs:jawOpen`의 모양은 "`TS_Jaw` 약 20° 회전 + 입술 모핑"을 구운 것이어서는 **안 되고**, 본 회전 0 상태에서 완결되어야 한다(12.3).

### 4.4 morph 전파와 관절 오프셋

- 이름은 계약 그대로다: 체형 `param:{height,shoulderWidth,chestDepth,waist,hip,armLength,legLength,headSize,neckLength}:±`(18), 얼굴 `param:{faceShape,jawWidth,chinLength,cheekVolume,forehead,eyeSize,eyeSpacing,eyeTilt,noseHeight,noseWidth,noseDepth,mouthWidth,lipFullness,earSize,earAngle}:±`(30), 표정 `facs:{16유닛}`(16). 합계 어휘 **64개**, 밖의 이름은 v1에서 금지한다(`ext:*` 포함, 소비자가 없고 `parseMorphTargetName`이 null을 돌려준다: `morph-names.ts`). 이름이 계약 이름이면 `shape-key-mapping.ts:77`의 `isMorphTargetName` 경로로 별칭 변환 없이 통과한다.
- Blender glTF 내보내기는 shape key 이름을 `mesh.extras.targetNames`에 쓰고 Babylon이 그것을 `MorphTarget.name`으로 쓴다(Orion 실측 흐름과 같음). 키 이름에 `:`·`+`·`-`가 들어가는 것은 문제 없다.
- 전파: 로더는 모든 메시의 매니저를 순회해 `registerMorph(name, target)`로 `Map<string, MorphTarget[]>`에 모은다. 플랜의 `morphWeights`가 이름 하나를 가리키면 **몸·머리·눈·입·속눈썹·눈썹·속옷·헤어·의상·신발·액세서리의 같은 이름 타깃 전부**가 같은 influence를 받는다. 새 코드는 필요 없다(C12).
- **필수 커버리지**(최소 요구, 정적 표 `KIT_MORPH_COVERAGE`, 10절):

  | 메시 역할 | 반드시 가져야 하는 타깃 |
  | --- | --- |
  | `skin`(TS_Body), `underwear`, `top`, `bottom`, `shoes` | 체형 18개 전부 |
  | `head`(TS_Head) | 머리에 붙는 체형 8개(`height`, `legLength`, `neckLength`, `headSize` 각 ±) + 얼굴 30 + FACS 16 = 54개 |
  | `eyeball`, `iris` | 머리 체형 8 + `eyeSize`, `eyeSpacing`, `eyeTilt`, `faceShape` ± |
  | `lash`, `brow` | 머리 체형 8 + 눈·이마·얼굴형 계열 + FACS 중 눈썹·눈 계열(`browInnerUp`, `browOuterUp`, `browDown`, `eyeBlinkLeft/Right`, `eyeWide`, `eyeSquint`) |
  | `teeth`, `tongue` | 머리 체형 8 + `mouthWidth`, `jawWidth` ± + FACS 입 계열(`jawOpen`, `mouthSmile`, `mouthFrown`, `mouthPucker`, `mouthFunnel`, `mouthPress`, `tongueOut`, `cheekPuff`) |
  | `hair`, `accessory` | 머리 체형 8(`accessory`는 목에 거는 초커도 같음) |

  왜 머리 체형이 `height, legLength, neckLength, headSize` 넷인가: 절차 소스의 `resolveProportions`에서 머리 중심 높이는 `scale(height)`, 다리 길이, 목 길이, 머리 크기에 의존한다(`proportions.ts:resolveProportions` — `scale = 1 + 0.08*height`, `legFactor = 1 + 0.1*legLength`, `neckLen = 0.06*(1 + 0.4*neckLength)`, `headScale = 0.105*(1 + 0.12*headSize)`). 허리·엉덩이·팔 길이는 머리 위치를 못 바꾼다.
  이 표는 **최소**이고, 의미 검증은 검증기의 "따라가기 검사"(9절 V9)가 한다: 의상·속눈썹·눈썹 정점이 ±1 morph에서 가장 가까운 몸/머리 정점과 비슷하게 움직이는지 본다.
- **체형 `+`/`−` 크기의 정량 기준**(Blender 쪽 목표, `proportions.ts:resolveProportions`와 같은 의미): `height ±1 = 전신 ±8 %`, `legLength ±1 = 다리 길이 ±10 %`, `armLength ±1 = 팔 ±12 %`, `shoulderWidth ±1 = 어깨 반폭 ±20 %`, `hip ±1 = 엉덩이 반폭 ±20 %·깊이 ±15 %`, `waist ±1 = 허리 반폭·깊이 ±20 %`, `chestDepth ±1 = 가슴 깊이 ±25 %·폭 ±10 %`, `headSize ±1 = 머리 ±12 %`, `neckLength ±1 = 목 길이 ±40 %`. 허용 오차 ±25 %(상대).
- **관절 오프셋**: `kit.json.jointOffsets[morphName][jointNode] = [dx,dy,dz]`. `createJointOffsetRig({ table, bones, skeleton, morphAvailable })`가 그대로 소비한다(`joint-offset-rig.ts`). 키트는 `bones` 맵이 **노드 이름(`mixamorig:*`)** 으로 키가 잡혀 있으므로 표의 본 키도 노드 이름이다.
  **프레임 주의**: 값은 `node.position`(부모 기준 **로컬 프레임**)에 더하는 양이다. Mixamo식 본은 롤 때문에 로컬 축이 월드 축과 다르므로 `Δlocal = R_parent_world⁻¹ · (Δhead_world(child) − Δhead_world(parent))`로 계산해야 한다(12.3). 틀리면 팔다리가 엉뚱한 방향으로 이동한다. 검증기 V18이 몸 정점 평균 이동과 대조해 잡는다.
  표가 비면(`jointOffsets` 키 없음) 관절은 안 움직이고 정점만 움직인다(= 현재 패키지 소스 동작). 키트는 `height`, `legLength`, `armLength`, `shoulderWidth`, `neckLength`, `headSize`, `hip`의 ±를 반드시 채운다(`waist`·`chestDepth`는 관절이 안 움직여도 되나 척추 본 이동이 있으면 적는다).

### 4.5 파츠 그룹핑과 partId

- 그룹 키는 **역할**이다. `RigPart.partId = rolePartId(role)`(`mesh-data.ts:263`), `materialId = PART_ROLES.indexOf(role)`(절차 소스와 같은 규칙, `humanoid-model.ts` 주석 8~10행), `partIdPalette = allocatePartIdsByRole(parts)`(희소 팔레트, `mesh-data.ts:271`).
  덕분에 `DEFAULT_PART_LAYOUT`(`apply-plan.ts:59`)을 쓰는 기본 플래너가 그대로 맞고, PSD ID 마스크(`psd-plan.ts:133` 역할 순회)와 페인트(역할 단위)도 맞는다.
- `TS_Eye_L/R`, `TS_Iris_L/R`, `TS_Brow_L/R`은 각각 한 `RigPart`의 `meshes[]`다. `TS_Mouth`의 두 프리미티브는 역할이 달라 두 `RigPart`(teeth, tongue)이다.
- 로더는 `RigPart.id = "<role>"`로 부여한다(절차 소스의 파츠 id와 같은 단순 이름). 디버깅용 `meshNames`는 `inspectRig`가 보고한다.
- 기존 `RigPart.forceHidden`(파츠 전체 숨김)은 키트에서 쓰지 않는다. 선택되지 않은 LOD는 메시를 해제한다(4.7).

### 4.6 몸 가림 정책: 오프셋 + 선언된 영역 숨김

선택지 비교

| 안 | 비용 | 결함 |
| --- | --- | --- |
| 오프셋만(의상을 몸에서 2~4 mm 띄움) | 런타임 비용 0, 구현 0 | 팔꿈치·무릎·어깨의 포즈 변형에서 스킨이 의상을 뚫고 나옴(스키닝 차이) |
| 메시 분할(영역별 별도 메시) | 숨김 즉시 | 영역 수만큼 `MorphTargetManager`가 생겨 morph 텍스처가 영역 수 × 18배, 이음매 음영 분리 |
| 마스크(정점 알파/셰이더 discard) | 셰이더 수정 | 툰·PBR·ID·depth 4종 패스 재질 전부 고쳐야 함 |
| **오프셋 + 인덱스 범위 숨김(채택)** | `TS_Body`의 인덱스 버퍼를 영역 순으로 정렬해 두면 `SubMesh`를 영역별로 만들고 숨길 영역의 서브메시만 빼면 된다. 스킨·morph·재질·UV 무관 | 영역 경계 삼각형이 반쯤 사라질 수 있음 → 의상이 경계를 ≥ 1 cm 넘어 덮도록 제작 |

규칙

1. 모든 의상·속옷 셸은 `TS_Body` 표면에서 **2~4 mm 바깥**으로 제작한다(오프셋 정책, 12.3).
2. 파츠가 `hides`에 영역을 선언하면(그 영역을 **전부** 덮는 경우에만 선언 — 부분만 덮으면 구멍이 보인다) 로더가 `TS_Body`의 서브메시를 `bodyRegions` 범위로 쪼개 **선언된 영역들의 합집합**만 제외한다. 여러 파츠(상의+하의)가 숨기는 영역은 합집합.
3. 지원 영역은 `KIT_HIDEABLE_REGION_IDS`(15개). 선언 없으면 아무것도 숨기지 않는다. `hides` 대상은 항상 `TS_Body`이고 `TS_Head`는 숨기지 않는다.
4. `bodyRegions`가 없거나 범위가 어긋나면(검증기가 막지만 방어) 숨김을 적용하지 않고 `notes`에 한글 사유를 남긴다 — 의상은 보이고 스킨이 비칠 수 있다는 사실을 숨기지 않는다.
5. **검증 결과(KT-04, 2026-10-08, NullEngine)**: (a) Babylon `GLTF2Export`는 SubMesh 범위를 존중해 숨긴 삼각형을 뺀다(몸이 구간 수만큼 프리미티브로 나간다) — `babylon-glb-sparse-export.test.ts`. (b) 스키닝 pick은 SubMesh를 무시해 숨긴 삼각형도 맞았다(`skinned-pick.ts`가 `mesh.getIndices()` 전체를 썼다) → **수정**: pick 후보 인덱스를 SubMesh가 덮는 구간으로 제한하고 구간 배치가 바뀌면 캐시를 다시 만든다 — `babylon-kit-engine.test.ts`(수정 전에는 실패하는 것을 확인했다). (c) 엔진은 로더가 둔 `alwaysSelectAsActiveMesh`를 덮어쓰지 않는다(플랜 적용·셰이딩 전환·카메라·리사이즈 뒤에도 유지) — 같은 파일.

### 4.7 LOD

- 베이스·의상·신발·액세서리·홍채: LOD 없음(LOD0 하나).
- 헤어: 파일 안에 `…_LOD0/1/2` 메시를 둘 수 있다(기존 규약). 로더는 `KitPlan.hairLodPolicy.preferredLod`(기본 0, 썸네일 임시 리그는 1)에 맞는 LOD 하나만 남기고 나머지 메시는 로드 직후 해제한다(`selectHairLod`와 같은 규칙, `mesh-role-mapping.ts`가 `domains/`라서 render에는 `chooseHairLod`의 동일 로직을 쓴다 — `package-loader.ts:47`).
- LOD 교체는 파츠 재로드다(v1에는 카메라 거리 기반 자동 LOD 없음).

### 4.8 외곽선(`_Outline`)

- 기본: Babylon `renderOutline`(hull)이 모든 파츠 메시에 켜진다(`character-engine.ts:660`). 외곽선 폭은 `TOON_OUTLINE_WIDTH = 0.004` m 균일.
- 키트 v1은 `_Outline` 셸 메시를 **싣지 않는다**(`kit-outline-shell-forbidden`, 검증기 오류). `OUTLINE_MESH_SUFFIX = "_Outline"`는 예약만 한다.
- v2 후보(가변 폭 외곽선): 셸 메시를 허용하되 그 파츠의 `mesh.renderOutline`을 끄는 분기가 `applyMaterialsForMode`에 필요하다(C9). 지금은 구현하지 않는다.
- **키트 hull 정책(리드 결정 A-5·A-9, KT-04 구현, 정정 2026-10-08)**: 키트 리그에서는 역할 **`head`**, `eyeball`, `iris`, `pupil`, `eye-highlight`, `lash`, `brow`, `teeth`, `tongue` 메시에 hull을 켜지 않는다(`render/outline-policy.ts`의 `KIT_OUTLINE_EXEMPT_ROLES`와 `hullOutlineAllowed(kind, role)`, 표를 바꾸면 `outline-policy.test.ts`가 알린다). 절차 소스·제작 패키지는 모든 파츠에 hull을 켠다(기존 거동 유지).
  - **A-5(눈·입 안 계열)**: 반지름 약 12 mm 눈 메시에 4 mm hull(`TOON_OUTLINE_WIDTH`)이 붙으면 눈이 검은 고리로 덮여 공막·홍채가 안 보인다(리드가 뷰어로 확인).
  - **A-9(머리, 리드 결정)**: Babylon 외곽선 렌더러는 메시를 그린 뒤 부풀린 껍질의 **깊이만** 다시 쓴다(`outlineRenderer.pure.js` 단계 2). 그래서 머리 표면보다 4 mm 앞의 깊이가 이후에 그려지는 눈·눈썹·속눈썹·치아를 깊이 테스트에서 떨어뜨린다(머리 hull 폭을 0.5 mm로 줄여도 같다, SwiftShader 실측). 최초 설계는 이 결정을 리드 몫(16절)으로 남겼으나 **머리 hull 제외로 확정**됐다.
  - **알려진 한계**: 키트 머리의 실루엣 선이 없다(몸·헤어·의상·신발·액세서리·속옷은 hull 유지). 엣지·후처리 방식의 머리 윤곽은 후속 과제다. 에셋 쪽에서 눈 메시를 키우거나 외곽선용 우회 지오메트리를 넣어 해결하려 하지 않는다(위 `_Outline` 셸 금지).
  - `edge`(EdgesRenderer) 외곽선은 이 정책의 대상이 아니다 — 부드러운 눈 구면에는 각도 임계(cos 0.95)를 넘는 모서리가 거의 없어 고리가 생기지 않는다.
  - 브라우저 미검증: 앱 뷰포트(실GPU)에서 머리 윤곽 소실과 눈·눈썹 가림 해소는 SwiftShader 뷰어에서만 확인했다.

### 4.9 재질 매핑 (앱의 툰/PBR이 키트 재질을 받는 방법)

1. 로더가 만든 `PBRMaterial`을 `adaptLoadedMaterial`로 보강한다(역할 기본 프리셋의 시인·클리어코트·이방성·SSS만 켬, 알베도 텍스처·노멀맵 보존). 파츠마다 재질이 하나이므로 `RigPart.pbr`이 그것이다.
2. `RigPart`에 `tint?: { readonly mode: "recolor" } | { readonly mode: "fixed"; readonly hex: string }`을 추가한다(`character-rig.ts`). 키트 로더만 채운다.
   - `applyRigPlan`의 색 결정(`character-rig.ts:239`): `part.tint?.mode === "fixed"`이면 `hex`, 아니면 기존 `resolvePartColorHex`.
   - 엔진 `materialHooks.applyColor`(`character-engine.ts:809`): `part.hasAlbedoTexture && part.tint?.mode !== "recolor"`일 때만 건너뛴다. 즉 키트의 recolor 파츠는 텍스처가 있어도 `setMaterialAlbedo`를 호출한다.
   - 툰: `toonValues.baseColor = srgb(part.colorHex)`는 그대로(이미 곱셈).
3. 재질 프리셋(`PRESET_MATERIALS`, 예 `shoes/sneakers → cloth-cotton`)이 바뀌면 `applyPresetParams`가 `metallic`, `roughness`, `backFaceCulling`, `emissive`를 덮어쓴다(`material-factory.ts`). 키트 재질은 그 점을 전제로 만든다(ORM 금지, 3.6). `doubleSided`는 `kit.json.materials[].doubleSided`와 GLB가 일치해야 한다.
   **KT-04 구현 메모**: (a) 파츠가 올라온 직후 엔진이 역할 기본 프리셋을 한 번 적용한다(첫 플랜 전에도 PBR이 GLB의 baseColorFactor·metallic·roughness가 아니라 프리셋·틴트 값이 되게). (b) 틴트가 있는 파츠(recolor·**fixed 모두**)는 알베도 텍스처가 있어도 PBR `albedoColor`에 색을 곱한다 — 4.9-2의 `tint?.mode !== "recolor"` 조건은 fixed 파츠를 PBR에서만 건너뛰어 툰(`baseColor × 알베도`)과 어긋나므로 "tint가 있으면 곱한다"로 통일했다(`fixed`는 레시피·플랜 색을 무시하고 고정 hex만 곱한다). (c) 알베도 텍스처의 알파가 `alphaMode: MASK`(눈썹·속눈썹)이면 툰·밑색 패스도 같은 `alphaCutoff`로 텍셀을 버린다(`alphaParams.x`, 기본 0 = 끔). 실측(SwiftShader): 끄면 눈썹이 불투명한 덩어리로 그려지고 켜면 깃털진 획이 된다. BLEND는 툰이 지원하지 않아 렌즈가 불투명으로 그려진다 — 그래서 안경은 프레임만 만든다(리드 결정 A-8, 3.6). 법선·ID·깊이 패스와 NodeMaterial 툰(베타)은 알파를 읽지 않는다.
4. `eyeball`의 `eye-wet`(클리어코트)·`iris`(`emissiveScale 0.08`)·`hair-aniso`(이방성)·`skin-sss`(PrePass 가능할 때만)는 기존 역할 프리셋을 그대로 쓴다.

### 4.10 버텍스 컬러(`COLOR_0`) 해석

| 항목 | 결정 |
| --- | --- |
| 허용 | 헤어(필수 아님), 의상(선택) |
| 의미 | **R=G=B=AO×음영 곱**(1=밝음, 0.6=안쪽 그늘), 알파 1. 그 외 채널 의미 금지 |
| 근거 | PBR이 `COLOR_0.rgb`를 알베도에 곱하므로(C7) 의미 채널을 쓰면 색이 틀어진다. 글TF 정석과도 같다 |
| 그라데이션·하이라이트 밴드 | **UV 램프 텍스처**에 굽는다(헤어 UV: u=스트랜드 폭, v=뿌리→끝). 램프는 0.55~1.0 회색이고 헤어색이 곱해진다(3.6) |
| `COLOR_1` | 금지(Babylon 로더가 읽지 않는다: `glTFLoader.pure.js:1000`에 `COLOR_0`뿐) |
| 툰 모드 | 툰 ShaderMaterial은 `color` attribute가 없어 AO를 못 쓴다 → **KT-04에서 `CHARACTER_SHADER_ATTRIBUTES`에 `color`를 추가**하고 툰/flat 프래그먼트에서 곱한다(없는 메시는 기본 1). 이 작업이 늦어지면 툰 모드에서는 AO가 빠지는 것을 한계로 문서화한다. **구현(KT-04)**: "없는 메시는 기본 1"은 attribute를 항상 선언해서는 지켜지지 않는다(색 버퍼가 없는 메시에 선언한 attribute는 0으로 읽혀 알베도가 검게 곱해진다). 그래서 정점 셰이더가 `#ifdef TS_VERTEX_COLOR`일 때만 `color`를 읽고 아니면 `vColor = vec4(1.0)`을 내보내며, **파츠의 모든 메시가 색 버퍼를 가질 때만** 그 파츠의 툰·밑색 재질에 define을 켠다(`createPassMaterial`의 `vertexColor`). NodeMaterial 툰(베타)과 CPU 기준 구현(`toon-reference.ts`)은 AO를 쓰지 않는다 |

### 4.11 증분 교체·해제·썸네일

**증분 교체**: 같은 키트(`kitId`+`baseId`+베이스 파일 SHA)의 `loadSource`가 다시 오면(헤어/의상 슬롯 변경) 엔진은 `unloadRig()` 대신 **키트 diff 경로**를 탄다.

1. 현재 리그의 파츠 id 집합 vs `plan.parts`를 비교한다. 같으면 아무것도 안 한다.
2. 빠진 파츠: 메시·재질·텍스처·morph 타깃을 해제하고 `rig.morphs`에서 제거한다.
3. 새 파츠: 바이트 확보 → 4.2의 3~7단계를 그 파츠만 수행해 리그에 합친다.
4. `hides`를 재계산해 `TS_Body` 서브메시를 다시 만든다.
5. 그림자 캐스터(`addShadowCasters`)·물리 바인딩·페인트 데칼(`reattachPaint`)·베타 재질(`beta.reconcile`)·`partIdPalette`·`morphNames`를 갱신한다.
6. 실패하면 **그 시점의 리그를 유지하지 않고** 키트 전체를 해제하고 실패를 던진다(앱 루프가 `failedSource`로 기억, `apply-loop.ts`). 반쯤 바뀐 리그를 남기지 않는다.

`CharacterEngine` 포트 시그니처는 바뀌지 않는다(`loadSource(source)`). 베이스가 다르면(성별 변경) 전체 재구성이다.

**해제**: 파츠 컨테이너의 `container.dispose()`는 텍스처·재질·메시를 정리한다. 스켈레톤·본 노드는 4.3-6에서 이미 정리한다. 엔진은 `loadSource`마다 `renderTemporaryThumbnail`처럼 `finally`로 임시 리그를 해제한다(`character-engine.ts:910`).

**썸네일**: 파라미터 슬롯(얼굴형·눈·코·입·귀·체형·표정·포즈·손)은 현재 리그에 플랜을 일시 적용하는 기존 경로(`renderCurrentThumbnail`)를 그대로 쓴다 — 키트 코드 변경 없음. 지오메트리 슬롯(헤어·의상·신발·액세서리·홍채)은 `ThumbnailRequest.source = { kind:"kit", plan }`로 **임시 리그**(`renderTemporaryThumbnail`, C17)를 만든다. 임시 리그 비용(베이스 8 MiB 재파싱 × 카드 32장)이 문제이므로: ① 바이트 캐시(4.2) 사용, ② 임시 리그는 **LOD1·그림자 없음**(기존), ③ 최적화 후보: 베이스 컨테이너를 `instantiateModelsToScene`로 복제(미검증, 위험 R5), ④ 대안: 키트가 정적 PNG 썸네일을 제공(`parts[].thumbnail`)하는 경로 — 현재 색·체형을 반영하지 못해 v1 기본안은 아니다. 측정 전까지 ①~②를 기본으로 하고, 카드 1장 > 1.5 s이면 ③을 한다.

### 4.12 실패 코드(모두 `LabFailure{code, reasonKo}`, 한글 사유 필수)

| 코드 | 상황 |
| --- | --- |
| `kit-manifest-fetch-failed` | `kit.json`을 못 받음(HTTP/네트워크) |
| `kit-manifest-invalid` | zod 스키마 위반(첫 5개 이슈를 사유에 포함) |
| `kit-version-mismatch` | 레시피 `kitVersion` ≠ `kit.json.kitVersion`, 또는 `kitId` 불일치 |
| `kit-manifest-sha-mismatch` | 레시피에 `manifestSha256`이 있는데 `kit.json` 바이트의 SHA-256과 다름 |
| `kit-base-missing` | 레시피 `baseId`의 베이스가 `kit.json`에 없음 |
| `kit-capabilities-mismatch` | 선언된 `slotCapabilities`가 규칙 계산과 다름 |
| `kit-part-missing` | 선택 프리셋에 대한 파츠 변형이 없음(필수 파츠 포함). 사유에 프리셋 id·베이스 |
| `kit-file-fetch-failed` | GLB를 못 받음 |
| `kit-bytes-mismatch`, `kit-sha-mismatch` | 크기·해시 불일치 |
| `kit-glb-load-failed` | Babylon 로더 실패 |
| `kit-joint-mismatch` | joint 이름 집합·부모 불일치(4.3) |
| `kit-skin-invalid` | 스킨 없는 메시, 영향 5개 이상, 가중치 합 이상 |
| `kit-transform-invalid` | 스킨 메시 노드 변환이 항등이 아님 |
| `kit-mesh-undeclared`, `kit-mesh-missing` | 선언과 GLB 메시 불일치 |
| `kit-material-multiple` | 한 역할에 재질이 둘 이상 |
| `kit-morph-missing` | 선언한 morph 타깃이 GLB에 없음 |
| `kit-region-range-invalid` | `bodyRegions`가 인덱스 버퍼를 분할하지 않음 |
| `kit-unsupported-extension` | 금지된 glTF 확장 사용 |

### 4.13 키트 소스에서 끄는 기능(v1)

- 얼굴 SDF 툰 그림자: `toonValues`의 `useFaceSdf`(`character-engine.ts:767`)에 `rig.kind !== "kit"` 조건을 더한다. 키트 머리는 N·L 램프로 음영한다. v2 후보: 머리에 `TEXCOORD_1`(정면 대칭 SDF용 UV)과 셰이더의 `uv2` attribute. **구현됨(KT-04)**: 리그 종류가 아직 모르는 호출(썸네일 임시 리그의 재질 훅)에서도 틀리지 않도록 파츠의 `tint` 유무로도 판별한다.
- 입 안 마스크: 이미 절차 소스 전용(`character-engine.ts`의 `mouthMask`·`maskedParts`(227행~))이라 변경 없음. 키트의 구강은 `tongue` 재질의 어두운 포켓 UV로 해결한다.
- `rig.kind` 유니온은 `"procedural" | "package" | "kit"`로 넓힌다(`character-rig.ts:104`, `rig-inspection.ts:62`).

---

## 5. 결정 3 — 15슬롯 능력표와 프리셋 매핑

기존 외형 12슬롯×64 프리셋(`presets/appearance-presets.ts`)과 연기 30 프리셋은 **한 줄도 바꾸지 않고** 재사용한다. 플래너는 이미 `param:*` / `facs:*` morph 가중치를 만들고(`apply-plan.ts` `paramToMorphWeights`, `expressionToMorphWeights`), 키트가 같은 이름의 타깃을 모든 메시에 싣기 때문에 ParamPanel·ExpressionPanel·SlotPanel 슬라이더와 카드가 그대로 키트 셰이프 키를 구동한다. 패치와 레시피가 키트에서 하는 일은 네 가지다:

- (a) **morph 가중치**: `patch.body`/`patch.face`/`patch.expression` → `morphWeights`.
- (b) **파츠 선택**: `patch.parts.<슬롯>` + 레시피 `slots.<슬롯>` → 지오메트리 슬롯 변경 → `kitGeometryKey` 변경 → `loadSource` → 증분 교체.
- (c) **재질 파라미터**: `patch.colors`(틴트) + `PRESET_MATERIALS`(재질 프리셋). 새 필드 없음.
- (d) **본 회전**: 포즈·손 포즈 → `boneRotations`(VRM 이름) → `boneMap`으로 노드에 적용.

| 슬롯 | v1 목표 상태 | 프리셋 수 | 패치가 하는 일 | 키트가 제공해야 하는 것 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `face-shape` | available | 6 | (a) `faceShape, jawWidth, chinLength, cheekVolume, forehead` | `TS_Head` 해당 5축 ± 10타깃 | |
| `eyes` | available | 6 | (a) `eyeSize, eyeSpacing, eyeTilt`. `parts.eyes`는 **무시**(눈 지오메트리 변형 없음) | `TS_Head`·`eyeball`·`iris`·`lash`·`brow`의 눈 계열 6타깃 | 6개 프리셋의 차이는 morph 값뿐임을 `reasonKo` 없이 available로 둔다(모양 차이가 morph로 구현되므로). 눈 지오메트리 변형은 후속 |
| `irises` | available (5/5) 또는 partial | 5 | (b) `parts.irises` → 홍채 디스크 파츠 교체, (c) `colors.iris` | `parts/<base>/irises/<name>.glb` 5종 | 홍채 크기·동공 모양은 변형 GLB에 구워짐 |
| `nose` | available | 5 | (a) `noseHeight, noseWidth, noseDepth` | `TS_Head` 6타깃 | |
| `mouth` | available | 5 | (a) `mouthWidth, lipFullness` | `TS_Head`·`teeth`·`tongue` | |
| `ears` | available | 4 | (a) `earSize, earAngle` | `TS_Head` 4타깃 | `earAngle`은 기존 Blender 별칭 24종에 없다(12절). 계약 15축은 전부 필요 |
| `hair` | available (7/7), 일부면 partial | 7 | (b) 헤어 파츠 교체, (c) `colors.hair` | 헤어 파츠 N≤7(`twin-tail` 포함 여부는 Blender 레인 결정) | 없는 스타일은 `unavailablePresets`로 카드 비활성+사유 |
| `body` | available | 6 | (a) 체형 9축 ±, + 관절 오프셋 | `TS_Body`·`TS_Head`·모든 몸 파츠 18타깃, `jointOffsets` | |
| `top` | available (5/5) 또는 partial | 5 | (b), (c) `colors.top`(프리셋 기본색 포함) | 상의 파츠 | 베이스별 핏이 다르므로 `fits`는 `variants` 키로 표현 |
| `bottom` | 〃 | 5 | (b), (c) `colors.bottom` | 하의 파츠 | |
| `shoes` | 〃 | 4 | (b), (c) `colors.shoes` | 신발 파츠 | |
| `accessory` | 〃 | 6 (+ 없음) | (b), (c) `colors.accessory` | 액세서리 파츠 | 유일하게 비울 수 있는 슬롯(`NULLABLE_SLOTS`) |
| `expression` | available | 12 | (a) FACS 16 | `TS_Head` 등에 16타깃 | 12 프리셋은 `animation/presets`가 이미 가짐 |
| `pose` | available | 10 | (d) | `boneMap` 55본 | `model-space` 포즈 규약(C: `character-rig.ts:poseLocalRotation`)에 T-포즈 레스트 전제 |
| `hand-pose` | available | 8 | (d) | 손가락 30본 | Mixamo `…1~3`이 근위/중간/원위로 매핑, `…4`는 끝 본 |

**능력 판정은 규칙으로 계산한다** — `domains/authored/kit-capability.ts`의 `deriveKitCapabilities(manifest, baseId)`:

- identity 슬롯: 슬롯 축(`KIT_SLOT_AXES`, 10절)의 모든 ± 타깃이 `TS_Head`에 있으면 `available`, 일부면 `partial`(없는 축을 한글로), 전혀 없으면 `unavailable`. (기존 `IDENTITY_SLOT_AXES`는 축이 더 좁다 — `face-shape` 3축, `ears` 1축 — 키트는 계약 15축 전체를 쓴다.)
- 파츠 슬롯: 어휘 크기 대비 베이스의 변형 수. 전부면 `available`, 일부면 `partial`+`reasonKo`("제공 5/7종, 미제공: twin-tail, …")+`unavailablePresets`, 0이면 `unavailable`.
- `body`: `TS_Body` 18타깃 + `jointOffsets` 비어 있지 않음 + 55본 → `available`, 일부면 `partial`.
- `expression`: FACS 16 전부면 `available`, 8~15면 `partial`(기존 임계 `EXPRESSION_AVAILABLE_MIN_UNITS = 8`), 그 미만 `unavailable`.
- `pose`: 필수 15본, `hand-pose`: 손가락 30본. 모두 `boneMap`으로 판정.
- 선언(`kit.json.slotCapabilities`)과 다르면 `kit-capabilities-mismatch`. 선언은 사람이 읽는 증거이고 기준은 규칙이다.

**프리셋 단위 가용성(D10)**: `SlotCapability`에 선택 필드 `unavailablePresets?: Readonly<Record<string, string>>`(프리셋 id → 한글 사유)를 더한다.

- 플래너(`createApplyPlanner`): 슬롯 능력이 `available`/`partial`이라도 `recipe.slots[slot]`이 `unavailablePresets`에 있으면 그 슬롯을 `unsupported`(사유 = 맵 값)로 계획하고 **다른 프리셋으로 바꾸지 않는다**(AGENTS 3절 9항).
- `SlotPanel`: 카드를 `unavailablePresets`에 있으면 비활성 + 사유(툴팁·카드 텍스트). 슬롯 `unavailable`은 기존대로.
- 레시피가 이미 미제공 프리셋을 가리키면(예: 다른 베이스로 바꿨는데 `hair/twin-tail`이 없음) 로더가 `kit-part-missing`으로 **실패**하고 UI는 사유를 보인다. 자동으로 다른 헤어로 바꾸지 않는다.

**색 변형 표현**: 스킨톤·홍채색·헤어색·눈썹색·상의/하의/신발/액세서리 색은 레시피 `colors`(8키) → 플랜 `parts[].color` → `RigPart.colorHex` → 재질 `albedoColor`/툰 `baseColor`(곱, 4.9). 프리셋의 기본색(`patch.colors`, 예 `top/tee → #f1f1f4`)은 기존대로 reducer가 레시피 색에 병합한다. 속옷·공막·치아·혀는 `fixed`라 레시피 색을 받지 않는다. 별도 "스킨톤 프리셋"은 만들지 않는다(ParamPanel 팔레트가 `color/set`을 쓴다).

---

## 6. 결정 4 — 기본 소스 전환

원칙(AGENTS 3절 9항): 무음 대체 금지. 키트 로드가 실패하면 `LabFailure`로 **보이게** 하고 절차 소스로 자동 전환하지 않는다. 절차 소스는 사용자가 고를 때만 쓴다.

1. **부팅 레시피**: `composeCharacterLab()`가 `LabRuntimeDeps.initialRecipe`로 `defaultSource`에 따라 `createKitDefaultRecipe()`(7절) 또는 `createDefaultRecipe()`(절차)를 넘긴다. `createDefaultRecipe()`는 그대로 두어 기존 테스트(`MockLabProvider` 등)가 안 흔들린다.
   - **정정 2026-10-08 (FIX-A1, 리드 결정)**: 최초 설계는 `defaultSource` 기본값을 `"kit"`으로 두고 기존 테스트가 `"procedural"`을 명시하는 구조였다. 구현은 반대다 — `app/composition.ts`의 `BootSource = "procedural" | "kit"`과 `DEFAULT_BOOT_SOURCE = "procedural"`이 기본값이다. 키트 에셋이 아직 안착하지 않아 기본을 키트로 두면 실앱이 `kit-manifest-fetch-failed` 배너로 시작하기 때문이다. 에셋 안착(KT-11) 때 상수를 `"kit"`로 바꾸고 테스트를 갱신한다(상수 주석에 같은 지시). 키트가 필요한 테스트는 `defaultSource: "kit"`를 명시한다. 상수를 임시로 `"kit"`로 바꿔 `src/app`·`src/state`·`babylon-character-engine.test.ts`(48파일 488 테스트)가 통과함을 FIX-A1이 확인했다.
   - 키트 소스로 **처음** 옮길 때(`source/set`이 절차·패키지 → 키트) reducer가 `applyKitToonDefaults`로 툰 램프·림을 키트 기본값으로 바꾼다(3.9의 A-10 정정 참조).
2. **초기 능력**: `lab-runtime.ts:157`은 소스가 `procedural`이 아니면 `ALL_UNAVAILABLE_CAPABILITIES`("캐릭터 소스가 아직 로드되지 않았습니다")로 시작한다 — 키트도 같다. 엔진이 소스를 올리면 적용 루프가 `source/capabilities` 이벤트로 키트 능력 맵을 채운다(`apply-loop.ts` `sameCapabilities`).
3. **엔진은 사용자가 고른 뒤**: 엔진 선택은 지금처럼 TopBar에서 사용자 클릭이다. 소스 로드는 엔진이 `ready`가 된 뒤 적용 루프가 한다. 따라서 키트 fetch는 엔진 선택 이후에 시작한다(첫 화면은 빈 뷰포트 + 안내).
4. **실패 노출**: `buildSource`가 던진 `LabFailure`는 `apply-loop.ts`의 `report("source-build-failed", …)`가 `isLabFailure(error)`이면 그대로 failure 이벤트로 올린다(FailureBanner). 같은 키는 값이 바뀌기 전에는 재시도하지 않는다. **재시도 수단**을 위해 `ApplyLoop.retrySource()`(실패 기억 `failedSource` 제거 + 재스케줄)를 추가하고 PackagePanel의 "키트 다시 불러오기" 버튼이 호출한다.
5. **소스 고르기 UI**: PackagePanel의 "현재 소스" 영역을 세 갈래로 넓힌다 — 키트(여/남 선택), 제작 패키지(기존 목록), **절차 소스(대체)**. 절차는 버튼 문구와 안내에 "키트가 아닌 대체 휴머노이드"임을 명시한다. 어느 쪽이든 `source/set`(능력 맵 포함, undo/redo 가능)이다.
6. **키트 plan 레지스트리**: `app/shell/kit-plan-registry.ts`는 `package-plan-registry.ts`와 같은 역할이다. `ensure(source)`가 `kit.json`을 fetch·검증·캐시하고, `resolve(recipe)`가 `buildKitPlan`을 돌려준다. `lab-runtime.ts`의 `buildSource`(174행)에 `recipe.source.kind === "kit"` 분기를 더한다(이 함수가 이미 `Promise<CharacterSource>`를 허용한다).
7. **재생성 키**: 적용 루프에 `kitGeometryKey?: (recipe) => string` 의존을 더하고 `recipeSourceKey`(`apply-loop.ts:148`)가 `kind === "kit"`이면 `{kind:"kit", kitId, baseId, geometry: kitGeometryKey(recipe)}`를 쓴다. `kitGeometryKey`는 계약 `contracts/character-kit.ts`의 순수 함수로 `baseId`, `slots.hair/top/bottom/shoes/accessory/irises`만 포함한다(`patch.parts`는 레시피에 저장되지 않고 플래너가 카탈로그에서 다시 읽는다, `recipe-reducer.ts` 머리 주석). 색·morph·포즈 변경은 키를 바꾸지 않아 플랜 재적용만 한다(C4와 같은 정책).
8. `sourceKeyOf(source)`(`apply-loop.ts:120`)도 `kit` 분기를 갖는다: `{kind:"kit", kitId, baseId, geometry}`를 `KitPlan`에서 읽는다.
9. 레시피 파일에서 `source.kind === "kit"`를 불러왔는데 `kitVersion`이 다르면 `kit-version-mismatch`로 실패하고 사용자가 레시피를 고치거나 다른 소스를 고르게 한다.

---

## 7. 결정 5 — 레시피 v2와 마이그레이션

**권고: `RECIPE_VERSION`을 2로 올린다.** 이유: 키트 소스가 있는 파일을 구버전 앱이 열면 zod가 "source 형식 오류"라는 모호한 사유를 내는데(`recipe.ts:194-200`), 버전을 올리면 "지원하지 않는 레시피 버전: 2"로 정직하게 거부한다. 대안(v1에 `source` 유니온 멤버만 추가)은 열린 질문 Q1에 둔다.

스키마(`contracts/recipe.ts`)

```ts
export const RECIPE_VERSION = 2 as const;
export const RECIPE_MIN_SUPPORTED_VERSION = 1 as const;

export const recipeSourceSchemaV1 = z.discriminatedUnion("kind", [ /* 현재 procedural, package 그대로 */ ]);
export const recipeSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("procedural") }).strict(),
  z.object({ kind: z.literal("package"), characterId: …, sha256: … }).strict(),
  z
    .object({
      kind: z.literal("kit"),
      kitId: z.string().regex(CHARACTER_ID_PATTERN),
      baseId: z.enum(KIT_BASE_IDS),
      kitVersion: z.number().int().positive(),
      /** 선택: kit.json 바이트의 SHA-256. 있으면 로더가 대조한다(엄격 재현). 기본 레시피는 생략. */
      manifestSha256: z.string().regex(SHA256_PATTERN).optional(),
    })
    .strict(),
]);

export const characterRecipeSchema = z.object({ version: z.literal(2), source: recipeSourceSchema, /* 나머지 현행과 동일 */ }).strict();
export const characterRecipeSchemaV1 = z.object({ version: z.literal(1), source: recipeSourceSchemaV1, /* 현행 그대로 */ }).strict();
```

`parseRecipe(json, now)` 동작

| 입력 `version` | 결과 |
| --- | --- |
| `2` | `characterRecipeSchema`로 검증. 성공 시 `{ ok:true, recipe }` |
| `1` | `characterRecipeSchemaV1`로 검증 → **명시 마이그레이션** `migrateRecipeV1ToV2(v1)`(= `{ ...v1, version: 2 }`, 다른 필드는 그대로) → `{ ok:true, recipe, migratedFrom: 1 }` |
| 그 외(0, 3, 문자열, 없음) | `recipe-unsupported-version` — "지원하지 않는 레시피 버전입니다: X (지원: 1, 2)" |

- `ParseRecipeResult`의 성공 변형에 선택 필드 `migratedFrom?: number`를 더한다. `recipe/load` 명령이 이를 `describeCommandKo`("레시피 불러오기(v1 → v2 변환)")에 반영한다. 변환은 사용자에게 보이지만 failure가 아니다.
- v1 레시피는 의미가 그대로다: `source`가 `procedural`이면 절차 소스로 열린다(키트로 바꿔치기하지 않음), `package`면 패키지로 열린다. `slots`의 프리셋 id는 어휘가 같으므로 변환이 필요 없다.
- 메모리의 레시피는 항상 v2이고 `serializeRecipe`는 `version: 2`를 쓴다(`recipe-io.ts:serializeRecipe` — `stableStringify`가 키 정렬이라 변경 없음). `recipeDigest`·파일 이름(`character-<digest8>.json`)은 v2 기준으로 달라진다. 이를 단언하는 테스트·골든이 있으면 갱신해야 한다(11절 KT-01·KT-05에 파일 목록).
- 새 팩토리 `createKitDefaultRecipe(baseId = "female")`: `createDefaultRecipe()`에서 `source`만 `{ kind:"kit", kitId: KIT_DEFAULT_ID, baseId, kitVersion: KIT_CURRENT_VERSION }`로 바꾼 것. `KIT_CURRENT_VERSION`은 계약 상수(키트 `kitVersion`이 오르면 같이 올린다).
- **페인트 레이어**: `paintLayerRecordSchema.part`는 `z.enum(PART_ROLES)`라 `underwear`가 추가되면 값 집합이 넓어질 뿐 기존 파일은 영향이 없다.
- **프리셋 참조**: 키트의 프리셋 선택은 기존 `slots.<슬롯> = "<슬롯>/<이름>"` 그대로다. 키트 전용 레시피 필드는 `source` 하나뿐이다(색·morph·포즈는 기존 필드). 따라서 키트 파츠 목록은 레시피에 중복 저장하지 않는다.
- 미래 `kit` 확장(예: 파츠별 텍스처 변형)은 `version: 3`으로 올린다. 무음 마이그레이션 금지는 유지된다(v1 → v2는 이 절의 명시 규칙).

---

## 8. 결정 6 — 내보내기·페인트·물리

### 8.1 PNG

변경 없음. `engine.renderPasses`가 조립된 장면을 투명 배경으로 그린다. 키트에서 달라지는 것은 밑색(flat) 패스가 재질 `baseColor × albedo`를 쓴다는 점뿐이며 recolor 파츠는 `setFlatUniforms(hasAlbedo)`에 `colorHex`가 이미 들어간다(`character-engine.ts:816`).

### 8.2 GLB (조립된 씬 + morph)

- **검증 결과(KT-04, NullEngine, `babylon-glb-sparse-export.test.ts`)**: 스켈레톤은 하나(68 joint)만 나가고 모든 스킨 메시가 그 skin을 참조한다. 숨긴 몸 삼각형은 내보낸 GLB에서 빠진다(필수 파츠 구성에서 몸 프리미티브 인덱스 `[6, 24, 12]`, 가림이 없으면 `[90]`). 현재 morph influence는 메시 `weights`로 `extras.targetNames` 순서대로 나간다. recolor 파츠의 `baseColorFactor`는 레시피 색(선형)이며 툰 모드에서 내보내도 같고 끝나면 툰 재질로 되돌아온다. 아래 "미검증" 문구들은 이 결과로 확정됐다(내보내기 직후 후처리 불필요).
- `exportGlb()`는 `rig.root` 아래 노드를 직렬화한다(`glb-exporter.ts:isRigNode`). 키트 리그는 베이스 스켈레톤 하나를 참조하는 여러 스킨 메시이므로 `skin`은 1개, 메시는 파츠 수만큼이다. 파츠 컨테이너의 스켈레톤은 4.3에서 해제했으므로 중복 `skin`이 없다.
- 재질: 내보내는 동안 PBR로 바꾼다(`character-engine.ts`의 `exportGlb`(1103행~) 기존 동작). recolor 파츠는 `albedoColor`(= 현재 틴트)가 `baseColorFactor`로 나가고 텍스처는 임베드된다. 즉 **내보낸 GLB는 현재 색을 반영한다**.
- morph: Babylon serializer가 dense accessor를 쓰므로 기존 `sparsifyGlbMorphTargets`(`glb-sparse-morph.ts`)가 내보내기 직후 sparse로 정리한다. 키트는 체형·얼굴 타깃이 국소적이라 이득이 크다. 현재 influence가 GLB `weights`로 나가는지는 serializer 동작에 달려 있고 **미검증**이다(KT-04 테스트에서 확인; 안 나가면 내보내기 직전 influence를 노드 `weights`로 기록하는 후처리를 더한다).
- `hides`로 숨긴 몸 삼각형: serializer가 서브메시 범위를 존중하는지 **미검증**. 존중하지 않으면 내보낸 GLB의 몸은 완전하다(의상과 겹침) — 해가 없는 방향이라 허용하되 "숨김 상태가 GLB에 반영되지 않음"을 `glbSparseState`처럼 보고한다. 존중하면 숨김이 반영된다. 어느 쪽인지 테스트로 확정한다.
- 용량: 내보낸 GLB는 선택 파츠 텍스처가 모두 포함되어 약 베이스 + 파츠 합(최대 10 MiB 내외)이다. 크기 상한을 두지는 않는다.

### 8.3 PSD (파츠 ID 마스크)

- `psd-plan.ts`가 `partIdPalette`의 역할로 마스크를 만든다(`buildIdMaskLayers`, 역할 순회). 키트의 partId가 역할 고정이므로 마스크 단위는 **역할**이다(눈 L/R이 한 레이어). 의상 변형이 달라도 같은 레이어 이름(상의 등)이다.
- 새 역할 `underwear`는 `PART_ROLE_LABELS_KO`에 "속옷"을 추가하면 자동으로 마스크 레이어 목록에 포함된다.
- `idMaskColor(role)`은 `PART_ROLES` 인덱스 기반 황금각이라 새 역할은 새 색을 받고 기존 색은 안 바뀐다.

### 8.4 UV 페인트

요구: 페인트가 올바르게 동작하려면 `TS_Body`·`TS_Head`의 UV가 **겹침 없는 0..1 단일 타일**이어야 한다(A3a 스펙 8항, 검증기 V12가 래스터 겹침 비율 ≤ 0.2 %로 확인). 페인트 레이어는 역할 단위(`PaintLayer.part`)이고 데칼은 같은 역할의 모든 메시에 같은 UV로 붙는다(C16).

- **v1 지원 범위**: `skin`, `head`. 두 역할은 변형이 없으므로 안전하다.
- `hair`/`top`/`bottom`/`shoes`/`accessory` 페인트는 변형마다 UV가 달라 **교체하면 그림이 어긋난다**. v1은 `PaintPanel`이 키트 소스일 때 이 역할 앞에 한글 경고("의상 변형을 바꾸면 UV가 달라져 그림이 어긋납니다")를 붙인다. 막지는 않는다(기존 패키지 소스에서도 동일). 정식 해결(레이어를 변형 id로 키잉하는 `paintLayerRecordSchema.variant`)은 v2 레시피(열린 질문 Q6).
- 페인트 텍스처 크기는 기존 기본 1024²(`PAINT_LAYER_DEFAULT_SIZE`)이고 베이스 텍스처 2048²와 독립이다.

### 8.5 물리 — v1 정적, 훅 위치

- v1: 헤어·천 물리 없음. `CharacterRig.chains = []`, `colliders = []`. `physics.bindRig`는 빈 체인을 받는 기존 경로를 쓴다(제작 패키지 소스와 같음, `package-loader.ts:220-221`). `kit.json.physics`는 `{ mode:"static", chains:[], colliders:[] }`이어야 한다(검증기가 강제).
- 후속 훅(구현하지 않음, 위치만 정의):
  1. 파츠 GLB의 `skin.joints`에 **보조 joint**(이름 `hair_<style>_<i>_<j>`, 절차 소스 규약과 같음: `outfit-port.ts` 헤더 주석)를 베이스 68개 **뒤에** 덧붙일 수 있게 한다. 그때 4.3의 "집합 동일" 검사는 "베이스 68개가 접두로 동일 + 추가분 이름 규약"으로 완화한다.
  2. 로더에 `bindKitAuxiliaryBones(partContainer, baseSkeleton)` 자리(`kit-skeleton-bind.ts`)를 비워 둔다.
  3. `kit.json.physics.chains[]`는 `ChainAnchor`(`mesh-data.ts`)와 같은 모양으로 확장하고 `colliders`는 `CapsuleCollider`와 같다. `CharacterRig.chains/colliders`에 그대로 채우면 `physics-bridge.ts`가 소비한다.

---

## 9. 결정 7 — 검증기 `scripts/verify-character-kit.mjs`

위치: 저장소 루트 `scripts/`(리드 브리프 지시). 루트 `scripts/*`와 `package.json` 스크립트 항목 `verify:character-kit`은 AGENTS(character-lab) 5절상 **통합 담당** 소유라서 KT-09가 통합 담당 작업이다.

**정정 2026-10-08 (KT-09 보고 반영 — 아래가 구현 사실이다)**

- 실행: 루트 `package.json`의 `"verify:character-kit": "tsx scripts/verify-character-kit.mjs"`. 즉 **`pnpm run verify:character-kit -- <옵션>`**(또는 `pnpm exec tsx scripts/verify-character-kit.mjs <옵션>`)으로 돌린다. 검증기가 `apps/character-lab/src/contracts/*`·`domains/authored/{kit-capability,bone-name-mapping}.ts`·`shared/stable-json.ts`를 **TS 그대로** import하므로(상수를 복제하지 않는 유일한 방법) **`tsx` 없이 `node scripts/verify-character-kit.mjs`로는 실행되지 않는다**(`.ts` 확장자 import 해석 불가). 인자는 `--root <폴더>`처럼 옵션 형태이며 **위치 인자(경로만)는 받지 않는다**(`알 수 없는 인자입니다`, 종료 코드 2). `--`는 pnpm 구분자로 무시한다.
- GLB 파싱은 저장소 루트 의존성 `@gltf-transform/core`·`@gltf-transform/extensions`(`ALL_EXTENSIONS`)를 쓴다. PNG는 IHDR + 직접 해독, JPEG는 8비트 베이스라인을 직접 해독해 평균 휘도를 잰다(프로그레시브 JPEG·인터레이스 PNG는 측정하지 않고 경고).
- 순수 함수(`verifyKit`, `verifyMorphSeam`, `verifyMorphFollow`, `verifyJointOffsets`, `parseCliArgs` …)를 export하고 CLI는 얇다.
- **단위 테스트**는 `scripts/verify-character-kit.test.mjs` 하나이며 `process.env.VITEST ? vitest : node:test` 이중 진입(기존 `scripts/validate-app-boundaries.test.mjs` 방식)이다. 두 방법 모두 쓴다.
  - `pnpm exec vitest run scripts/verify-character-kit.test.mjs` — vitest가 TS를 직접 읽는다.
  - `node --test scripts/verify-character-kit.test.mjs` — Node 단독으로는 TS import가 불가능하므로 테스트 파일이 `tsx/esm/api`의 **`tsImport`**로 검증기·계약을 읽는다(별도 `--import tsx` 플래그가 필요 없다). 합성 GLB 생성이 느려 vitest 쪽은 테스트당 제한을 180초로 늘려 두었다.

CLI

```text
pnpm run verify:character-kit -- [--root apps/character-lab/public/assets/characters/toonstudio-kit-v1]
                                 [--base female|male|all] [--json <out.json>] [--strict]
                                 [--only V1,V6,…] [--follow-quantile <q>] [-h|--help]
```

- 종료 코드: **0 = 오류 없음, 1 = 오류 있음(`--strict`면 경고도 오류), 2 = 사용법 오류**. `--json`은 항목별 결과·수치·findings를 기록한다.
- `--only`: 지정한 검사만 돈다. **GLB 검사(V5~V15·V18·V20)를 하나라도 고르면 V5(컨테이너·확장)가 자동으로 함께 돈다**(GLB를 열 수 있는지가 선행 조건). `kit.json`이 없거나 JSON·스키마를 해석할 수 없으면 **V1이 자동 포함**되어 오류를 보고하고 나머지는 "건너뜀"으로 표시한다.
- **`--follow-quantile <q>`(0 < q ≤ 1, 기본 1 = 최댓값)**: V9 따라가기 편차에 쓰는 분위수다. 의상 가장자리 몇 정점이 몸 morph를 정확히 따르지 못하는 **오탐**이면 `--follow-quantile 0.995`처럼 낮춰 확인한다(진짜 어긋남이면 Blender 쪽을 고친다 — 12.3·`LEAD_NOTES` 안착 절차). 값을 낮추면 검사가 느슨해지므로 안착 판정은 1(기본)을 기준으로 하고, 낮춘 값으로 통과시켰다면 보고에 적는다.
- 수치 정의(문서에 없던 것을 코드가 고정): **평균 휘도** = 0..1로 정규화한 sRGB 인코딩 값의 휘도. PNG는 `0.2126 R + 0.7152 G + 0.0722 B`를 알파 가중 평균, JPEG는 Y 성분 8×8 블록 DC 계수의 평균(가장자리 패딩 블록 포함)이다.

검사 항목

| ID | 수준 | 내용 |
| --- | --- | --- |
| V1 | 오류 | `kit.json`을 `kitManifestSchema`(strict)로 파싱(실패 시 느슨한 객체 스키마로 이슈를 40개까지 보고), `schema`·`kitId`·`kitVersion`(= `KIT_CURRENT_VERSION`)·`coordinateSystem` 상수 일치, `defaults.base`·`defaults.slots`·`defaults.colors`가 `KIT_DEFAULT_BASE_ID`/`KIT_DEFAULT_SLOTS`/`DEFAULT_RECIPE_COLORS`와 같음. **`kit.json` 없음·해석 불가는 `--only`와 무관하게 V1 오류로 보고한다(자동 포함)** |
| V2 | 오류 | 참조된 모든 파일 존재, `bytes`·`sha256` 재계산 일치, 경로 이탈(`..`·절대·역슬래시) 금지, 디렉터리에 `kit.json`이 모르는 파일(`NOTICE.md` 제외) 없음, 대소문자만 다른 중복 경로 금지 |
| V3 | 오류 | 용량: 베이스 ≤ 16 MiB, 파츠 ≤ 1.5 MiB, 키트 고유 파일 합 ≤ 64 MiB (수치 출력; 정정 2026-10-08) |
| V4 | 오류 | provenance: `sources[]` 비어 있지 않음, `license ∈ {CC0-1.0, original}`, 다운로드 소스는 `https` URL + `zipSha256` 64hex, `changesKo`에 한글 포함, `NOTICE.md` 존재 |
| V5 | 오류 | **(GLB 검사를 고르면 자동 포함)** 각 GLB가 glTF 2.0 컨테이너, `extensionsRequired`가 허용 목록(3.6)의 부분집합, 금지 확장(Draco·meshopt·basisu·webp) 없음, 외부 URI 이미지/버퍼 없음 |
| V6 | 오류 | 이름: 모든 GLB의 `skin.joints`가 `skeleton.joints`(68개)와 **원소별 동일**, 부모 관계가 `skeleton.parents`와 일치, `boneMap`이 계약 55본을 정확히 1회씩 덮고 부모가 `HUMANOID_BONE_PARENTS`와 일치, `classifyBoneNames(joints, boneMap)`이 55/55, 메시 노드 이름 집합 = 선언 `meshes[].node`, 헤어 이름 정규식·`style` = id 이름, 메시 노드 이름 중복 없음 |
| V7 | 오류 | 변환: Armature 루트 TRS 항등·스케일 1, 스킨 메시 노드 월드 변환 항등, 음수 스케일 없음, 베이스 높이 = `heightM` ± 2 %, 발바닥 `min y` ∈ ±5 mm, 얼굴 방향 +Z(눈 중심 z > 머리 bbox 중심 z) |
| V8 | 오류 | 스킨: 모든 메시에 `JOINTS_0`·`WEIGHTS_0`, `JOINTS_1` 없음(영향 ≤ 4), 가중치 합 1 ± 1e-3(전수), joint 인덱스 < 68, NaN/Inf 없음, `inverseBindMatrices` 수 = 68, 가중치 0인 슬롯의 인덱스는 0 |
| V9 | 오류 | morph: 이름이 어휘 64개 안(`ext:*` 금지), 메시별 타깃 수 ≤ 96, `KIT_MORPH_COVERAGE` 최소 요구 충족, `+`/`−` 델타가 서로 다름, 델타 크기 상한(체형 ≤ 0.15 m, 얼굴 ≤ 0.05 m)과 비영(≥ 1e-5; **정정 2026-10-08 — 심각도 차등**: 델타가 사실상 0일 때 `param:*` 타깃이거나 `TS_Body`·`TS_Head` 메시이면 **오류**, 그 밖의 메시의 FACS 표정 타깃이면 **경고**(그 메시에서 움직이지 않는 표정일 수 있음)), 선언 `morphs[]`와 GLB `targetNames` 일치, 한 메시 안의 법선 델타 유무 일관 + **심 일치**: `TS_Body`·`TS_Head`의 같은 위치 정점(1e-6)에서 공유 체형 타깃 델타가 1e-5 이내로 같음(**정정 2026-10-08: 같은 위치 정점 쌍이 0쌍이면 오류** — 분할 루프가 다르거나 목에 틈이 있다는 뜻이고, 공유 체형 morph가 없어도 오류) + **따라가기 검사**: 의상·속옷·신발·속눈썹·눈썹 정점마다 가장 가까운 몸/머리 정점(공간 해시)을 찾아 모든 체형·얼굴 ±1 타깃에서의 변위 차가 경고 5 mm / 오류 15 mm(기준 정점 탐색 반경 6 cm, 반경 밖 정점은 비교하지 않고 개수만 경고; 대상은 top·bottom·shoes·underwear → 몸, lash·brow → 머리; 통계량은 `--follow-quantile`) |
| V10 | 오류 | 영역: `bodyRegions`가 해당 메시 인덱스 버퍼를 빈틈·겹침 없이 분할(길이 3의 배수, 합 = 전체), 15개 영역 id 전부, `_REGION` 속성이 있고 16개 영역 전부 정점이 1개 이상, `hides` ⊆ 15 |
| V11 | 오류 | 삼각형: 메시별·역할별 예산(3.7), 선언 `triangles`/`vertices`와 일치, 최악 활성 합계 ≤ 200,000, 퇴화 삼각형 0, 인덱스 범위 |
| V12 | 오류 | UV: `TS_Body`·`TS_Head`가 [−0.001, 1.001] 안, 1024² 삼각형 래스터에서 겹침 픽셀 비율 ≤ 0.2 %(공유 엣지 1픽셀 제외), 늘어짐(UV 면적/3D 면적 비)의 99백분위가 중앙값의 4배 이하(경고) |
| V13 | 오류 | 재질·텍스처: 한 (파츠, 역할)에 재질 하나, `materials[].role`·`tint` 선언과 일치, recolor 재질은 `baseColorFactor ≈ [1,1,1,1]`과 **텍스처 평균 휘도 ≥ 0.75(역할 `iris`는 ≥ 0.55 — 리드 결정 A-2, 동공·윤부 링이 어둡다; 측정 못 하면 경고)**, 역할 `eye-highlight`의 고정색은 흰색(휘도 ≥ 0.85, A-1; 아니면 경고), 임베드 이미지만, 크기·2의 거듭제곱·상한(3.6), 불투명은 JPEG·알파 필요(속눈썹·눈썹·렌즈)만 PNG(IHDR 색 유형으로 판정), ORM 텍스처 없음 |
| V14 | 오류 | 헤어: LOD 번호 연속(0부터), 삼각형 단조 감소, `COLOR_0`이 있으면 R=G=B(±1/255)·A=1, `COLOR_1` 없음 |
| V15 | 오류 | 외곽선: `_Outline` 접미 메시 없음(4.8) |
| V16 | 오류 | 프리셋: 모든 `parts[].id`가 `SLOT_PRESET_IDS` 어휘 안, 필수 프리셋(`KIT_REQUIRED_PRESETS`)이 각 베이스에 있음, 어휘의 헤어/상의/하의/신발/액세서리/홍채 각 항목이 베이스마다 "변형 있음" 또는 `unavailable[base]`에 비어 있지 않은 한글 사유 |
| V17 | 오류 | 능력: `deriveKitCapabilities(manifest, base)` 결과가 선언 `slotCapabilities[base]`와 같음(`unavailablePresets` 포함) |
| V18 | 경고/오류 | 관절 오프셋: 필수 관절 오프셋 morph(`KIT_REQUIRED_JOINT_OFFSET_MORPHS`)가 비어 있지 않음, 키가 morph 어휘 안, 본 이름이 joint 안, 크기 ≤ 0.3 m(`KIT_BUDGET.maxJointOffsetM`), 유한(위반은 오류). **독립 대조(정정 2026-10-08, 구현 정의)**: 선언 오프셋(부모 로컬 프레임)을 레스트 월드 회전으로 월드화해 관절 머리의 이동을 부모→자식으로 누적하고, 관절마다 **스킨 가중치 > 0.5이면서 관절 머리 반경 안**(자식까지 거리의 0.4배를 1~6 cm로 자른 값, 끝 본은 3 cm)인 몸 정점들의 평균 변위와 비교한다. 차이 10 mm 경고 / 25 mm 오류. 비교할 정점이 없으면 경고. **알려진 공백**: 파츠 GLB의 bind pose(IBM 값·rest)가 베이스와 같은지는 로더도 검증기도 비교하지 않는다(V6은 joint 이름·부모, V8은 IBM 개수만 본다) — 리드 후속 목록에 있으며 필요하면 V7/V18에 추가한다 |
| V19 | 오류 | physics: `{ mode:"static", chains:[], colliders:[] }` |
| V20 | 오류 | 메시 무결성: NaN/Inf 없음, 인덱스 범위, 비어 있는 프리미티브 없음, 노멀 길이 ≈ 1(±0.05, 99.9 %) |

수치 보고: 항목별 통과/실패, 메시별 삼각형, 파일별 바이트, 텍스처 목록(이름·크기·형식·바이트), 최악 활성 삼각형 조합, UV 겹침 비율, 따라가기 최대 편차. `--json`에 같은 내용.

성능 목표: 한 베이스(베이스 + 파츠 약 32개)를 60초 안에. V9 따라가기와 V12 UV 래스터가 가장 비싸므로 `--only`로 나눌 수 있게 한다.

---

## 10. 결정 8 — TS 계약 변경 목록

아키텍처 테스트 제약(`AGENTS.md` 3절): `contracts/`는 순수 TS + `zod`만 import, 상대 경로는 `contracts`·`shared`만. 아래 변경은 모두 이를 지킨다. 계약은 core가 바꾼다.

### 10.1 새 파일 `src/contracts/character-kit.ts` (+ `character-kit.test.ts`)

- 상수: `KIT_SCHEMA_ID`, `KIT_DEFAULT_ID = "toonstudio-kit-v1"`, `KIT_ASSET_ROOT = "/assets/characters/toonstudio-kit-v1"`, `KIT_MANIFEST_FILENAME = "kit.json"`, `KIT_CURRENT_VERSION = 1`, `KIT_BASE_IDS = ["female","male"]`, `KitBaseId`.
- `KIT_SKELETON_JOINTS`(68 이름 상수, 3.3 규칙으로 생성), `KIT_END_BONES`(13), `KIT_BONE_MAP`(기대 매핑 55), `KIT_ROOT_JOINT = "Armature"`.
- `KIT_REGION_IDS`(16), `KIT_HIDEABLE_REGION_IDS`(15), `KIT_REGION_TO_BODY_REGION`(`BODY_REGIONS` 12개로의 매핑: `pelvis→hips`, `upperArm.L/forearm.L→leftArm`, …).
- `KIT_MORPH_NAMES`(64 = `allParamMorphNames([...BODY_PARAM_KEYS, ...FACE_PARAM_KEYS])` + `ALL_FACS_MORPH_NAMES`), `KIT_HEAD_ATTACHED_BODY_KEYS = ["height","legLength","neckLength","headSize"]`, `KIT_MORPH_COVERAGE`(4.4 표), `KIT_SLOT_AXES`(identity 슬롯별 계약 축).
- `KIT_BUDGET`(3.7), `KIT_ALLOWED_EXTENSIONS`, `KIT_FORBIDDEN_EXTENSIONS`, `KIT_ALLOWED_LICENSES`, `KIT_REQUIRED_PRESETS`, `KIT_DEFAULT_SLOTS`.
- zod: `kitFileSchema`, `kitMeshSchema`, `kitMaterialSchema`, `kitRegionRangeSchema`, `kitBaseSchema`, `kitPartVariantSchema`, `kitPartSchema`, `kitSourceSchema`(provenance), `kitManifestSchema`, 타입 `KitManifest` 등. `parseKitManifest(json, now?)`는 `failVisible("kit-manifest-invalid", …)`를 돌려준다(`parseCharacterPackageManifest`와 같은 형태).
- 런타임 계획 타입: `KitPartPlan`(파일 url·sha·bytes, 메시 선언, hides), `KitPlan`(kitId, kitVersion, baseId, skeleton, parts[], `morphNames`, `jointOffsets`, `bodyRegions`, `capabilities`, `hairLodPolicy`, `licenseNote`, `materials`), `kitGeometryKey(recipe)`(순수 함수).
- 실패 코드 상수 목록 `KIT_FAILURE_CODES`(4.12).

### 10.2 기존 계약 수정

| 파일 | 심볼 | 변경 |
| --- | --- | --- |
| `contracts/index.ts` | barrel | `export * from "./character-kit"` 추가 |
| `contracts/engine.ts` | `CharacterSource` (52~54행) | `| { readonly kind: "kit"; readonly plan: KitPlan }` 추가. `SourceCapabilities`·`CharacterEngine`는 그대로 |
| `contracts/slots.ts` | `SlotCapability` (66행) | 선택 필드 `unavailablePresets?: Readonly<Record<string, string>>` 추가. `capabilityMap`은 그대로 |
| `contracts/package-manifest.ts` | `slotCapabilitySchema` (37행) | `.strict()` 객체에 `unavailablePresets: z.record(z.string(), z.string()).optional()` 추가(키는 `isPresetId` refine). 기존 JSON은 그대로 통과 |
| `contracts/mesh-data.ts` | `PART_ROLES` (12행), `PART_ROLE_LABELS_KO` (32행) | **끝에** `"underwear"` / `"속옷"` 추가 → `rolePartId` 16. `PAINTABLE_PART_ROLES`·`RECIPE_COLOR_KEYS` 변경 없음(속옷 색 키 없음). `MATERIAL_PRESET_IDS`는 그대로(속옷은 `cloth-cotton` 기본) |
| `contracts/recipe.ts` | `RECIPE_VERSION`(22), `recipeSourceSchema`(60), `characterRecipeSchema`(83), `parseRecipe`(178), `ParseRecipeResult` | 7절 전부. `createKitDefaultRecipe` 추가. `migrateRecipeV1ToV2` export |
| `contracts/package-manifest.ts` | `meshRoles: z.record(…, z.enum(PART_ROLES))` | 자동으로 `underwear` 허용(변경 없음, 테스트만 갱신) |
| `contracts/state.ts`, `events.ts`, `catalog.ts`, `outfit-port.ts` 등 | — | **변경 없음** |

### 10.3 계약을 따라 바뀌는 비계약 파일(컴파일 연쇄, KT-01에 포함)

`Record<PartRole, …>` 완전성 때문에 `underwear`를 한 줄씩 더해야 한다.

- `state/apply-plan.ts:134` `ROLE_MATERIAL_DEFAULTS`: `underwear: "cloth-cotton"`.
- `render/material-presets.ts` `ROLE_DEFAULT_PRESET`: `underwear: "cloth-cotton"`. (`ROLE_COLOR_KEY`는 `Partial`이라 생략.)
- `domains/authored/mesh-role-mapping.ts` `KEYWORD_ROLES`: `[/underwear/u, "underwear"]` 추가(+ 12절의 접두 규칙).
- `domains/authored/authored-character-manifest.ts` `PART_FIELD_ROLES`: `underwear: "underwear"` 추가(선택).
- 테스트: `contracts/mesh-data.test.ts`(역할 수 단언), `contracts/recipe.test.ts`, `contracts/slots.test.ts`, `contracts/package-manifest.test.ts`, `state/recipe-io.test.ts`, `export/recipe-file.test.ts`, `app/recipe-file-interop.test.ts`, `testing/recipe-fixtures.ts`, `export/psd-plan.test.ts`(역할 수가 하드코딩되어 있다면).
- **정정 2026-10-08 (KT-01 보고)**: 컴파일·테스트 연쇄로 실제 함께 바뀐 테스트가 위 목록보다 넓다. 추가 목록 — `state/recipe-reducer.test.ts`(`source/set`의 kit 소스·재선택 참조 유지), `app/shell/procedural-source.test.ts`(`underwear` 제외 등 역할 수 단언), `app/shell/panels/ExportPanel.test.tsx`(레시피 v2 파일명·변환 안내), `app/humanoid-outfit.integration.test.ts`(부팅 레시피·역할 수). (FIX-A1에서 `domains/humanoid/humanoid-model.test.ts`도 절차 소스에는 `underwear`가 없어 그 역할을 제외하도록 고쳤다.)

### 10.4 `domains/authored`에 추가(계약 아님, 순수)

`kit-plan.ts`(`buildKitPlan`), `kit-capability.ts`(`deriveKitCapabilities`), `kit-load-flow.ts`(`kit.json` fetch 포트 주입 흐름: `loadKitManifestFlow`), `kit-loader.browser.ts`(fetch 바인딩). `domains/authored/`는 이미 허용 영역이라 `architecture.test.ts` 수정이 필요 없다(새 도메인 디렉터리 `domains/kit`을 만들면 `DOMAIN_DIRS`·`DOMAIN_EXTERNALS`를 core가 바꿔야 해서 피했다).

---

## 11. 결정 9 — 통합 작업 분해

선행 규칙: **KT-01(계약)이 먼저 병합**되어야 나머지가 컴파일된다. 이후 KT-02/03/05/08/09/10은 서로 다른 경로를 소유하므로 병렬이다. 각 작업의 소유 경로는 겹치지 않는다(겹칠 수 있는 `state/apply-plan.ts`·`render/material-presets.ts`의 한 줄 연쇄 수정은 KT-01만 한다).

| ID | 제목 | 소유 경로 | 선행 | 검증 |
| --- | --- | --- | --- | --- |
| KT-01 | 계약: 키트 스키마·상수, `kit` 소스, `underwear` 역할, `unavailablePresets`, 레시피 v2 | `apps/character-lab/src/contracts/**`, 그리고 연쇄 한 줄: `src/state/apply-plan.ts`(ROLE_MATERIAL_DEFAULTS 1줄), `src/render/material-presets.ts`(ROLE_DEFAULT_PRESET 1줄), `src/domains/authored/mesh-role-mapping.ts`·`authored-character-manifest.ts`(역할 1줄), `src/testing/recipe-fixtures.ts`, **(정정 2026-10-08, KT-01 보고) `CharacterSource` 유니온 확장으로 닫힌 switch/분기가 컴파일되지 않아 최소 `kit` 분기를 넣은 `src/app/shell/apply-loop.ts`(`recipeSourceKey`·`sourceKeyOf`), `src/render/babylon/character-engine.ts`(`loadSource` 분기), `src/testing/mock-engine.ts`(키트 소스의 능력·morph·partId 보고)** — 이 세 파일은 이후 KT-06(apply-loop)·KT-04(character-engine)·KT-06(mock-engine)이 본 구현으로 확장했다 | — | `pnpm --filter @toonstudio/character-lab typecheck`; `pnpm exec vitest run apps/character-lab/src/contracts apps/character-lab/src/architecture.test.ts apps/character-lab/src/state/recipe-io.test.ts apps/character-lab/src/export/recipe-file.test.ts`; `pnpm exec eslint --max-warnings=0 apps/character-lab/src/contracts` |
| KT-02 | authored 도메인: `buildKitPlan`, `deriveKitCapabilities`, `kit.json` 로드 흐름, 이름 규칙 보강(`TS_Accessory_` 접두·`TS_Mouth`·`TS_Underwear`) | `src/domains/authored/kit-*.ts`, `src/domains/authored/kit-*.test.ts`, `src/domains/authored/mesh-role-mapping.ts`(KT-01의 1줄 이후 접두 규칙 추가), `src/domains/authored/mesh-role-mapping.test.ts` | KT-01 | `pnpm exec vitest run apps/character-lab/src/domains/authored`; `pnpm --filter @toonstudio/character-lab typecheck`; eslint (같은 경로). 합성 키트 fixture(`src/testing/kit-fixtures.ts`, KT-06 소유)를 쓰지 않고 테스트 내부에서 `kit.json` 객체를 직접 만든다 |
| KT-03 | 렌더: 키트 로더(스켈레톤 재바인딩·역할 그룹핑·몸 가림·morph 등록·관절 오프셋 연결) — **새 파일만** | `src/render/babylon/kit-loader.ts`, `kit-skeleton-bind.ts`, `kit-region-mask.ts`, `src/render/babylon-kit-load.test.ts`, `src/render/kit-region-mask.test.ts`(순수 범위 계산) | KT-01 | `pnpm exec vitest run apps/character-lab/src/render/babylon-kit-load.test.ts apps/character-lab/src/render/kit-region-mask.test.ts`(NullEngine, 합성 키트 GLB는 `src/render/testing/kit-glb-fixture.ts`에 KT-03이 만든다: 스킨 68 joint·메시 2~3개·morph 타깃·`extras.targetNames`·sparse 없는 단순 버전); typecheck; eslint |
| KT-04 | 렌더: 엔진 통합·셰이딩 (증분 교체, `RigPart.tint`, 얼굴 SDF 끔, 툰 `color` attribute, 이중 외곽선 방지, GLB/pick 서브메시 확인) | `src/render/babylon/character-engine.ts`, `character-rig.ts`, `materials/material-factory.ts`, `materials/toon-shader.ts`, `src/render/shader-sources.ts`, `src/render/rig-inspection.ts`, `src/render/babylon-character-engine.test.ts`, `src/render/shader-sources.test.ts`, `src/render/babylon-render-integrations.test.ts`, `src/render/babylon-glb-sparse-export.test.ts`(키트 케이스 추가) | KT-03 | 위 테스트 + `pnpm exec vitest run apps/character-lab/src/render`; typecheck; eslint. 브라우저(GPU)에서만 확인되는 것은 "브라우저 미검증"으로 표기 |
| KT-05 | state: 프리셋 단위 비활성(`unavailablePresets`)·`describeCommandKo`·v1→v2 불러오기 알림·썸네일 캐시 키 | `src/state/apply-plan.ts`(KT-01의 1줄 이후), `src/state/recipe-reducer.ts`, `src/state/recipe-io.ts`, `src/state/thumbnail-cache.ts`, 각 `.test.ts` | KT-01 | `pnpm exec vitest run apps/character-lab/src/state`; typecheck; eslint |
| KT-06 | 셸·조립: `KitPlanRegistry`, `buildSource` 키트 분기, 초기 레시피·`defaultSource`, 적용 루프 소스 키·`retrySource`, 썸네일 소스, 모의 엔진/픽스처 | `src/app/shell/kit-plan-registry.ts`(+test), `src/app/shell/lab-runtime.ts`, `src/app/shell/apply-loop.ts`, `src/app/composition.ts`, `src/app/composition.test.ts`, `src/app/shell/lab-runtime.test.ts`, `src/app/shell/apply-loop.test.ts`, `src/testing/mock-engine.ts`, `src/testing/kit-fixtures.ts`(합성 `kit.json` + 플랜) | KT-01, KT-02, KT-05 | `pnpm exec vitest run apps/character-lab/src/app apps/character-lab/src/testing`; `pnpm test:character-lab`(두 vitest 설정 모두 통과); typecheck; eslint |
| KT-07 | 패널: PackagePanel 키트 UI(베이스 선택·다시 불러오기·절차 소스 명시 버튼·출처/라이선스), SlotPanel 프리셋 비활성, ParamPanel/PaintPanel 안내 | `src/app/shell/panels/PackagePanel.tsx`(+test), `SlotPanel.tsx`(+test), `ParamPanel.tsx`(+test), `PaintPanel.tsx`(+test), CSS는 core가 `src/app/styles/character-lab.css`에 `cl-package-kit-*`·`cl-slot-card--preset-unavailable`을 추가 | KT-01, KT-05, KT-06 | `pnpm exec vitest run apps/character-lab/src/app/shell/panels`(jsdom); typecheck; eslint. 각 패널 소유자가 자기 파일만 수정 |
| KT-08 | export/paint: 새 역할 라벨 반영 확인, 키트 GLB 내보내기 단위 테스트, 페인트 키트 경고 | `src/export/psd-plan.ts`(+test), `src/export/export-session.ts`(+test), `src/paint/**`(+test) | KT-01 | `pnpm exec vitest run apps/character-lab/src/export apps/character-lab/src/paint`; typecheck; eslint |
| KT-09 | 검증기 스크립트와 단위 테스트, `verify:character-kit` 스크립트 등록 | `scripts/verify-character-kit.mjs`, `scripts/verify-character-kit.test.mjs`, 루트 `package.json`의 `verify:character-kit` 한 줄(통합 담당) | KT-01 | `pnpm exec tsx scripts/verify-character-kit.mjs --help`; `pnpm exec vitest run scripts/verify-character-kit.test.mjs` 와 `node --test scripts/verify-character-kit.test.mjs` 둘 다(루트 vitest의 수집 루트에 `scripts`가 있고, 기존 `scripts/validate-app-boundaries.test.mjs`가 `process.env.VITEST ? vitest : node:test` 이중 진입을 쓰는 방식을 따른다; **정정 2026-10-08**: node:test 경로는 TS 계약을 `tsx/esm/api`의 `tsImport`로 읽는다 — 9절); `pnpm harness:verify` |
| KT-10 | Blender: 키트 내보내기 스테이지(`kit.json` 작성기·GLB 내보내기 규약·`_REGION` 속성·영역 정렬·관절 오프셋 계산·`TS_Accessory_` 이름), 12.3 체크리스트 | `tools/blender/character_kit/export/**`, `scripts/blender/build_character_kit.py`(`--stage export-kit`), `tools/blender/character_kit/README.md`의 내보내기 절 | — (이 문서만 필요) | Blender 실행 후 `pnpm exec tsx scripts/verify-character-kit.mjs --root <산출 폴더>`가 통과; 재현 명령 README |
| KT-11 | 에셋 안착: 산출물 복사, 실제 키트 테스트 | `apps/character-lab/public/assets/characters/toonstudio-kit-v1/**`, `src/domains/authored/real-kit.test.ts`, `src/render/babylon-real-kit.test.ts`, `src/app/shell/panels/PackagePanel.test.tsx`의 실제 키트 케이스(KT-07 병합 뒤에만 수정) | KT-02, KT-04, KT-06, KT-07, KT-09, KT-10 | 검증기 통과; `pnpm exec vitest run apps/character-lab/src/domains/authored/real-kit.test.ts apps/character-lab/src/render/babylon-real-kit.test.ts`; `pnpm test:character-lab`; `pnpm build:character-lab`; `pnpm harness:verify`. 실제 키트 테스트는 "에셋이 있으면 돌린다" 식의 조건부 스킵을 두지 않는다 — 에셋이 안착한 시점에 추가한다 |
| KT-12 | 문서·프로브: 브라우저 프로브 키트 시나리오, 패리티 문서, README | `apps/character-lab/scripts/browser-probe.mjs`, `apps/character-lab/README.md`, `apps/character-lab/docs/shaper-parity-checklist.md`, `apps/character-lab/docs/parity/*.md`(각 영역 행), `apps/character-lab/docs/authored-asset-pipeline.md`(키트 링크 한 단락) | KT-06, KT-07, KT-11 | `pnpm harness:check`; 문서 Secretlint; `pnpm build:character-lab` 후 `CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/browser-probe.mjs`(가능한 경우, 불가하면 "브라우저 미검증" 기재) |

의존 그래프(요약): `KT-01 → {KT-02, KT-03, KT-05, KT-08, KT-09}`; `KT-03 → KT-04`; `{KT-02, KT-05} → KT-06 → KT-07`; `{KT-02, KT-04, KT-06, KT-07, KT-09, KT-10} → KT-11 → KT-12`. KT-10은 처음부터 병렬이다.

공통 완료 조건(모든 작업): AGENTS 5절 — 변경한 디렉터리의 vitest + typecheck + eslint, `pnpm harness:verify`. 실행하지 못한 검증은 실행한 것처럼 쓰지 않는다. 커밋·푸시는 리드가 한다.

---

## 12. 결정 10 — Blender 쪽 요구사항과 네이밍 불일치 표

### 12.1 리드 브리프 3절 v0 ↔ 실제 코드 대조 (리드 승인 필요)

| # | 항목 | v0(브리프/A3 스펙) | 코드가 말하는 사실 | 제안 |
| --- | --- | --- | --- | --- |
| N1 | joint 수 | "본 이름 67개", A3b "joint 67개" | Orion 67 = Mixamo 65 + 눈 2(턱 없음). 키트는 `TS_Jaw`가 더해져 Mixamo 65 + `TS_Jaw` + `TS_Eye.L/R` = **68** | 68로 확정. 검증기 V6이 이름 배열 전체를 대조. A3b 합격 기준을 "joint 68개"로 정정 |
| N2 | `TS_Jaw` 매핑 | 앱 매핑에 영향 없는지 확인하라 | `guessHumanoidBone("TS_Jaw")`는 null(토큰 `tsjaw`가 `CENTER_TOKENS`에 없음, `bone-name-mapping.ts:20-41`). 실행 결과 68개 중 **54개** 매핑·`jaw` 누락. `TS_Eye.L/R`은 `token.endsWith("eye")` 휴리스틱(`:226`)으로 우연히 매핑됨 | `kit.json.skeleton.boneMap`에 55본을 **명시 override**로 싣는다(`classifyBoneNames`의 override가 추정보다 우선). 코드 변경 불필요. 선택: `CENTER_TOKENS`에 `tsjaw: "jaw"` 추가(KT-02, 소유 `domains/authored`) — **정정 2026-10-08: FIX-A1에서 추가됨** |
| N3 | 눈 본 이름 | `TS_Eye.L`/`TS_Eye.R` | 위 N2 휴리스틱으로 `leftEye`/`rightEye`가 된다 | 이름 유지(`TS_Eye.L/R`). 명시 override로 휴리스틱 의존을 없앤다 |
| N4 | 끝 본 13개 | 언급 없음 | `HeadTop_End`, `Toe_End`×2, 손가락 `…4`×10은 `guess`가 null → 휴머노이드 어휘 밖(`rig bone.auxiliary = true`, `package-loader.ts:200`) | `skeleton.endBones`로 선언해 "의도된 미매핑"으로 구분. 물리 체인은 v1 없음이라 영향 없음 |
| N5 | `Spine1/Spine2` | 브리프에 설명 없음 | `Spine1→chest`, `Spine2→upperChest`로 매핑된다(`bone-name-mapping.ts:30`; Orion은 override로 `Spine2→chest`였다) | 키트는 `Spine/Spine1/Spine2 → spine/chest/upperChest`. `Neck`의 부모가 `Spine2`(=`upperChest`)여야 계약 `HUMANOID_BONE_PARENTS`와 맞는다 |
| N6 | 헤어 `COLOR_0` | R=뿌리→끝 그라데이션, G=하이라이트, B=AO; 필요 시 `COLOR_1` | PBR이 `COLOR_0.rgb`를 알베도에 곱하고, 툰은 못 읽고, 로더는 `COLOR_1`을 버린다(C7) | **`COLOR_0` = 회색 AO(R=G=B)**, 그라데이션·하이라이트는 UV 램프 텍스처, `COLOR_1` 금지 |
| N7 | 메시 이름 `TS_Acc_<id>` | 액세서리 | 이름 규칙 추정에서 `TS_Acc_headphones`가 `head` 역할로 잡힌다(`/head\|face/` 규칙이 먼저, 15절 실행 결과). `TS_Acc_glasses`·`ribbon`은 개별 키워드로 우연히 `accessory` | `TS_Accessory_<id>`로 변경. 그래도 `headphones`는 `head`가 되므로 **역할은 `kit.json`에서 명시**(우선), 보강으로 `mesh-role-mapping.ts`에 `^ts_(top\|bottom\|shoes\|accessory\|underwear\|iris\|mouth)_` 접두 규칙을 앞에 둔다(KT-02) |
| N8 | `TS_Mouth`, `TS_Underwear` | 이름만 정의 | 이름 규칙으로 역할 null("규약 밖 이름") | `TS_Underwear`→새 역할 `underwear`(D11), `TS_Mouth`는 `primitiveRoles: [teeth, tongue]`로 명시 |
| N9 | 재질 이름 | `ts_eye_L/R`, `ts_brow`, `ts_hair_<id>`, `ts_<garment-id>` | 같은 역할 메시는 재질 하나로 덮인다(`package-loader.ts:128`) | 눈은 `ts_eye` 하나(좌우 대칭 UV 또는 UV 공유), `ts_iris`, `ts_teeth`, `ts_tongue`, `ts_lashes`, `ts_brow`, `ts_underwear`로 정리. 나머지 이름 규칙 유지 |
| N10 | 눈 구성 | `TS_Eye_L/R`(홍채 텍스처를 구운 A3a) | 레시피 `colors.iris`와 홍채 교체(`irises` 5종)를 하려면 공막과 홍채가 **다른 역할**이어야 한다 | `TS_Eye_*`=공막+각막(`eyeball`, 흰색 고정), 홍채·동공=`irises` 파츠 `TS_Iris_L/R`(`iris`, 틴트). A3a 산출물 분리 필요 |
| N11 | 영역 정점 그룹 | `region.*` 16개 | 계약 `BODY_REGIONS`는 12개(`outfit-port.ts`) | 이름 유지(`region.*`는 Blender 쪽 이름). 계약으로의 대응은 `KIT_REGION_TO_BODY_REGION`에 둔다. glTF에는 정점 그룹이 없으므로 `_REGION` 정점 속성 + `bodyRegions` 인덱스 범위로 내보낸다 |
| N12 | 얼굴 15축 | 브리프가 14개 이름 + "나머지 1개" | `FACE_PARAM_KEYS`의 15번째는 **`earAngle`** (`params.ts`). 또 기존 Blender 별칭 24종(`BLENDER_SHAPE_KEY_ALIASES`)은 `faceShape`·`forehead`·`earAngle`을 **포함하지 않는다**(12축뿐) | 키트는 계약 이름으로 직접 내보내므로 별칭이 필요 없다. 15축 × ± = 30 전부 필수. 기존 별칭 표는 수정하지 않는다 |
| N13 | morph 이름 문자 | `param:<key>:+` 등 | `parseMorphTargetName`이 정확히 이 형태만 인정(`morph-names.ts`) | Blender shape key 이름을 그대로 쓴다. 대소문자 정확히 일치. `ext:*`는 v1 금지 |
| N14 | 좌표·스케일 | +Y up, +Z 얼굴, 루트 스케일 1.0, T-포즈 | 앱 장면이 우수 좌표(`scene-builder.ts:69`)라 `AUTO` 모드에서 변환 노드 없이 +Z 정면 유지(`package-loader.ts:7`). 포즈 규약은 `model-space`(레스트 항등 참조 스켈레톤 기준): `animation/reference-skeleton.ts`가 T-포즈·정면 +Z·캐릭터 왼쪽 +X | 일치. 레스트가 T-포즈(손바닥 아래, 엄지 앞)여야 포즈 프리셋 30개가 맞는다. 본 롤은 달라도 된다(`model-space`가 흡수) |
| N15 | 파츠 노드 부착 | 헤어는 헤드 본 자식(Orion) | 키트는 한 스켈레톤 바인딩 | **모든 파츠는 스키닝**(헤드 본 100 %라도). 노드 부착 금지 |
| N16 | 헤어 정규식 | `^TS_AuthoredHair_(?<style>[a-z0-9-]+)_LOD(?<lod>\d+)$` 유지 | `package-manifest.ts:41` 그대로 유효. 단 `BLENDER_HAIR_STYLE_IDS`(6종)에 `twin-tail`이 없다(절차 전용) | 키트 `parts[].id`는 어휘 7종 안이면 되고 `twin-tail`도 허용(`kit.json`은 별도 스키마) |
| N17 | `OUTLINE_MESH_SUFFIX` | `_Outline` | `"_Outline"` 일치. 단 hull 외곽선과 중복(C9) | v1은 셸 미제공 |
| N18 | `A3b` 웨이트 | "`TS_Eye.L/R` 100 %" | 눈 홍채·공막이 별도 메시가 되므로 둘 다 100 % | `TS_Eye_*`와 `TS_Iris_*` 모두 해당 눈 본 100 % |
| N19 | 몸/머리 분할 `TS_Body`/`TS_Head` | 목에서 분할 | 코드와 충돌 없음: 역할 `skin`/`head`(키워드 `body`, `head`로도 맞음). 얼굴 셰이프 키는 `TS_Head`에만, 체형 키는 양쪽에 필요(4.4 심 일치) | 일치. 단 `TS_Head`는 얼굴 30 + FACS 16 외에 **머리 체형 8타깃**을 가져야 목 이음매가 안 벌어진다 |

### 12.2 Blender가 알아야 하는 앱 동작 요약

1. 레스트는 T-포즈. 팔 수평, 손바닥 아래, 엄지 앞, 다리는 약간 벌림.
2. 모든 GLB는 같은 68 joint와 같은 `skin.joints` 순서를 쓴다(베이스에서 한 번 정하고 파츠 내보내기에 재사용).
3. `Armature` 루트와 스킨 메시 노드의 변환은 항등, 스케일 1.
4. glTF 내보내기 옵션: `export_yup=True`, 스킨 포함, `export_morph=True`, 법선 델타는 `TS_Head`·`TS_Body`만, sparse accessor 사용(`export_try_sparse_sk`), 모디파이어 적용, `export_leaf_bone=False`(끝 본은 이미 있다), 애니메이션 없음, 이미지 임베드, 확장은 허용 목록만, 압축 없음.
5. morph 타깃 이름은 shape key 이름 그대로(`extras.targetNames`).
6. 정점 속성 `_REGION`(`TS_Body`·`TS_Head`), 헤어 `COLOR_0`(회색 AO, 선택).
7. 재질 하나 = (파츠, 역할) 하나.
8. 텍스처: `baseColor` + 선택 `normal`만.

### 12.3 Blender 빌더 체크리스트(KT-10과 A3a/A3b/얼굴/헤어/의상 레인이 만족해야 할 것)

- **스켈레톤**: 3.3의 68 joint 이름·부모. 눈·턱 본은 `mixamorig:Head`의 자식. 손가락 `…4`·`HeadTop_End`·`Toe_End`는 끝 본(가중치 불필요하나 존재해야 함).
- **체형 morph(18)**: 4.4의 정량 기준. `+`와 `−`는 **별개의 shape key**로 만든다(Blender 슬라이더 음수 범위에 의존하지 않는다). 몸·속옷·모든 의상·신발·머리 부착물이 4.4의 최소 커버리지를 만족. 의상 쪽 타깃은 몸 타깃을 표면 근접 전달(Surface Deform 또는 Data Transfer 최근접 표면)로 만들고 겹침 방지를 위해 오프셋(2~4 mm)을 보존.
- **심 일치**: `TS_Body`와 `TS_Head`의 목 분할 루프 정점은 모든 공유 타깃에서 델타가 같아야 한다. 얼굴 타깃은 `seam.neck` 정점을 움직이지 않는다.
- **얼굴 morph(30) + FACS(16)**: 계약 어휘와 `domains/humanoid/morph/face-fields.ts`가 의미 기준 문서이다. `eyeBlinkLeft`/`eyeBlinkRight`는 좌우 비대칭(나머지는 대칭 또는 좌우 합성). `jawOpen`은 4.3의 턱 규칙을 따른다.
- **관절 오프셋**: 각 체형 타깃에 대해 변형 메시에서 같은 해부 지표 함수(A3b 2항의 관절 위치 계산)를 다시 돌려 얻은 관절 월드 변위를 **부모 로컬 프레임으로 변환**해 `jointOffsets`에 쓴다. 롤이 있으므로 월드 변위를 그대로 쓰면 안 된다.
- **영역**: `region.*` 16그룹(분할·합집합 = 전체). `TS_Body` 면을 영역 순서로 정렬해 내보내 `bodyRegions` 인덱스 범위를 만든다(경계 면은 다수결 영역). 정점 속성 `_REGION`을 쓴다.
- **오프셋 셸**: 의상·속옷은 `TS_Body`에서 2~4 mm 바깥. 영역 전체를 덮는 경우에만 `hides` 선언, 경계는 ≥ 1 cm 넘겨 덮는다.
- **헤어**: UV 램프(0.55~1.0 회색), `COLOR_0` 회색 AO(선택), LOD0 ≤ 20k tri, LOD1/2 삼각형 단조 감소, `param:headSize:±` 포함 머리 체형 8타깃, 머리 본(필요 시 목 본) 가중치. 램프 UV의 u/v 규약을 `kit.json`의 `parts[].meshes[].uvRamp`(선택 필드)가 아니라 `NOTICE.md`에 문서화.
- **재질**: recolor 텍스처는 평균 휘도 ≥ 0.75 상대색(역할 `iris`는 ≥ 0.55, A-2), `baseColorFactor` 흰색. 휘도 정의는 9절 V13.
- **액세서리(A-8)**: 안경은 프레임만. 렌즈·BLEND 재질·알파 컷아웃 렌즈를 넣지 않는다(3.6).
- **외곽선(A-5·A-9)**: 눈·속눈썹·눈썹·치아·혀·**머리**에는 앱이 hull 외곽선을 그리지 않는다(4.8). 이를 에셋으로 보완하려고 눈을 키우거나 외곽선용 지오메트리를 넣지 않는다.
- **파일 크기**: 4.7 예산(정정 2026-10-08: 베이스 한도 8 → **16 MiB**, 전체 40 → **64 MiB**, 목표 베이스 ≤ 12 MiB). 한도에 가까우면 순서대로 ① 법선 델타 제거(`TS_Head` 제외), ② **sparse accessor**(변위가 0이 아닌 정점만 저장 — 얼굴 키는 국소적이라 효과가 크다), ③ **morph 델타 양자화**(`KHR_mesh_quantization`, 허용 확장), ④ 텍스처 JPEG 품질/크기, ⑤ 메시 해상도. ②·③을 쓰면 반드시 로더(Babylon `loadKitRig`)·검증기(`verify-character-kit`)·뷰어에서 실제로 읽히는지 확인한다.
- 출력은 항상 `scripts/verify-character-kit.mjs` 통과.

---

## 13. 열린 질문 (리드 판단 필요, 기본 가정과 함께)

| ID | 질문 | 기본 가정 |
| --- | --- | --- |
| Q1 | 레시피를 v2로 올릴지, v1에 `kit` 유니온 멤버만 더할지 | v2(7절). v1 유지 시 `parseRecipe`·마이그레이션 코드가 줄지만 구버전 앱의 오류 메시지가 모호해진다 |
| Q2 | `TS_Eye_*`를 공막만으로 줄이고 홍채를 `irises` 파츠로 분리하는 N10에 동의하는지 | 동의. 거부하면 홍채 색(`colors.iris`)·홍채 5종 교체가 불가능해지고 `irises` 슬롯이 `partial`(색만 불가) |
| Q3 | 새 역할 `underwear`(D11) 대신 기존 역할에 얹을 수 있는지 | 새 역할. 대안은 `skin`에 합치는 것인데 속옷이 스킨색으로 칠해진다 |
| Q4 | 키트가 어휘에 없는 프리셋(예: 헤어 8번째)을 제공하려면 `SLOT_PRESET_IDS`를 늘려야 한다. 이번 범위에서 늘릴지 | 늘리지 않는다. 늘리면 `MIN_PRESETS_PER_SLOT`·외형 프리셋 64개·테스트·썸네일 카탈로그가 같이 늘어야 한다 |
| Q5 | 여성/남성 의상·헤어를 모두 이번에 만들지, 여성 먼저인지 | 여성 먼저. 남성은 `unavailable[male]`에 사유를 적고 `partial`로 시작해도 구조는 같다 |
| Q6 | 의상 역할 페인트를 정식 지원할지(레이어 키잉) | v1은 skin/head만 정식, 나머지는 경고(8.4). 정식 지원은 레시피 v3 |
| Q7 | 삼각형 예산 수치(3.7)와 활성 최악 200k | 제안값. A3a/A3b/헤어/의상 레인의 실제 수치가 나오면 조정 |
| Q8 | morph 법선 델타를 `TS_Head`·`TS_Body`에만 쓰는 정책 | 가정. 큰 변형(허리 −1 등)에서 음영이 어색하면 의상에도 법선을 더하고 용량을 다시 계산 |
| Q9 | 기존 패키지 로더의 partId 불일치(C3)를 고칠지 | 이 문서 범위 밖. 코드 읽기로 낸 결론이므로 먼저 브라우저에서 Orion의 헤어색이 스킨색으로 바뀌는지 확인해야 한다 |
| Q10 | 검증기를 루트 `scripts/`에 둘지 `apps/character-lab/scripts/`에 둘지 | 루트(리드 지시). 루트는 통합 담당 소유라 KT-09가 통합 담당 작업. 앱 쪽에 두면 소유 충돌이 없다(`@gltf-transform/core`는 상위 `node_modules`로 해석되나 앱 `package.json`에 선언이 없어 정책상 선언이 필요) |
| Q11 | 장기 계획: ARKit 52(`ext:*`) 확장, 얼굴 SDF용 `TEXCOORD_1`, 가변 폭 외곽선 셸, 헤어 스프링 본 | 모두 v2 후보. v1에서 이름·훅만 예약 |
| Q12 | 제3자 고지: HBM(CC0) 파생물을 `docs`/`THIRD_PARTY_NOTICES`에 올려야 하는지 | 키트 `NOTICE.md`와 `kit.json.provenance`로 충족한다고 가정. `scripts/generate-third-party-notices.mjs --check`는 npm 의존성 기준이라 확인하지 못했다 |
| Q13 | 정적 호스팅 용량: 키트 40 MiB가 `dist/`에 복사된다(`vite.config.ts` 정적 자산) | character-lab은 운영 배포 대상이 아님(`AGENTS.md` 1절). 저장소 용량 정책(예: LFS)이 있는지 확인 필요 — 현재 `.gitattributes`에는 없음 |

---

## 14. 위험

| ID | 위험 | 영향 | 완화 |
| --- | --- | --- | --- |
| R1 | 파츠별 `skin.joints` 순서가 달라도 로더가 동작하는 것처럼 보일 수 있다(같은 이름이 다른 인덱스) | 의상이 엉뚱한 본을 따라 찢어짐 | V6(전 GLB 원소별 동일) + 로더 `kit-joint-mismatch` + 합성 GLB 테스트 |
| R2 | 관절 오프셋 프레임 오류(월드 vs 로컬) | 체형 슬라이더에서 팔다리가 비틀어짐 | V18 독립 대조, KT-04에 오프셋 적용 후 관절 위치 단위 테스트 |
| R3 | morph 텍스처 메모리: `TS_Head` 54타깃 × 1.7만 정점 + 법선 | 소프트웨어 렌더러·모바일에서 느림/실패 | 법선 정책(Q8), 타깃 수 상한 96, `describeMorphTextureMode` 보고 |
| R4 | 인덱스 범위 숨김이 serializer·pick·패스 재질에서 기대대로 동작하는지 미검증(4.6-5, 8.2) | 숨긴 삼각형이 pick에 걸리거나 GLB에서 사라짐 | KT-04의 NullEngine 테스트 3종(서브메시 개수, pick, export). 실패 시 보정안 명시 |
| R5 | 지오메트리 슬롯 썸네일마다 임시 리그 = 베이스 재파싱(32카드) | 첫 화면 지연, 메모리 급증 | 바이트 캐시, LOD1, 측정 후 `instantiateModelsToScene` 복제 또는 정적 PNG 대안 |
| R6 | 툰 셰이더에 `color` attribute를 더하면 morph/skinning attribute 한도(WebGL2 16)에 영향 | 툰 컴파일 실패 | KT-04에서 attribute 개수 확인. 한도 초과 시 툰 AO 생략으로 한계 문서화 |
| R7 | 큰 텍스처 VRAM(2048² × 4장 + mip ≈ 90 MB) | 저사양 기기 | 문서에 명시. 압축 텍스처는 외부 디코더 필요라 v1 금지 |
| R8 | 단일 틴트가 다색 의상을 한 색조로 물들임 | 디자인 다양성 제한 | v1 한계로 명시. v2: 파츠별 `COLOR_0.a`를 틴트 마스크로 쓰는 셰이더 |
| R9 | 얼굴 SDF 비활성으로 툰 얼굴 음영이 절차 소스보다 단조 | SHAPER식 얼굴 그림자 품질 | v2 `TEXCOORD_1` SDF. v1은 N·L 램프 |
| R10 | `underwear` 역할 추가가 하드코딩된 역할 수를 쓰는 테스트·골든을 깨뜨림 | CI 실패 | KT-01에서 테스트 일괄 갱신, `Record<PartRole,…>`는 컴파일러가 잡는다 |
| R11 | 레시피 v2로 기존 digest 기반 파일명·테스트 기대값이 바뀜 | 테스트 실패 | KT-01/KT-05에 파일 목록(10.3) |
| R12 | Blender 레인(A3a/A3b)이 이미 `TS_Eye_*`·`ts_eye_L/R`·67 joint로 만든 산출물이 있으면 재작업 | 일정 | 12.1을 리드가 먼저 승인해 A3 계열에 전달 |
| R13 | HBM 파생 얼굴·몸의 "SHAPER급" 품질 자체(시각 품질)는 이 계약이 보장하지 않는다 | 합격 기준 미달 | 계약은 구조·정합만 다룬다. 시각 품질은 SHAPER-3D-VISUAL-RUBRIC v1로 별도 심사 |
| R14 | 기존 패키지 소스에서 plan partId 불일치 가능성(C3) | 기존 Orion 레인의 색·가시성 오적용 | 이 설계는 영향을 안 받음. Q9 확인 후 별도 수정 |
| R15 | 키트 로드는 네트워크 의존(수십 MB) — 실패/지연 시 빈 화면 | 첫 사용 경험 | 로딩 진행 상태를 PackagePanel/FailureBanner에 표시(KT-07), 실패는 사유+재시도 |

---

## 15. 부록 — 내가 실행해 확인한 것 (2026-10-08, 코드·에셋 수정 없음)

**정정 2026-10-08**: 이 부록은 구현 이전(작성 시점)의 코드 읽기·실행 기록이며, 이후 바뀐 곳(본 매핑 55/55 등)은 해당 항목에 정정 표식을 달았다. 구현 이후의 검증 사실은 16절과 `docs/parity/render.md`의 키트 행이 정본이다.

작업 폴더: 세션 scratchpad `a1/`. 실행은 `node_modules/.bin/tsx`로 저장소의 실제 모듈을 import했다.

1. **본 이름 매핑 (C10, N1~N5)**: 키트 68 joint 이름(위 3.3 규칙)을 `classifyBoneNames`에 넣었다.
   - 결과(작성 시점): `total 68, mapped 54, all covered 54, missing ['jaw']`. 미매핑 14개 = `HeadTop_End`, 좌우 `Toe_End`, 손가락 `…4` 10개, `TS_Jaw`. **정정 2026-10-08**: `tsjaw` 토큰 추가 뒤에는 `TS_Jaw`가 매핑되어 미매핑 13개(끝 본)뿐이다.
   - 확인: `TS_Eye.L → leftEye`, `TS_Eye.R → rightEye`, `Spine2 → upperChest`, `LeftHandThumb1 → leftThumbMetacarpal`, `LeftToeBase → leftToes`.
   - `{"TS_Jaw":"jaw"}` override를 주면 `55/55`, missing 없음.
2. **메시 이름 → 역할 추정 (N7, N8)**: `classifyMeshName`에 후보 이름 36개를 넣었다.
   - 올바름: `TS_Body→skin`, `TS_Head→head`, `TS_Eye_L→eyeball`, `TS_Iris_L→iris`, `TS_Lashes→lash`, `TS_Brow_L→brow`, 헤어 LOD 이름, `TS_Top_*`, `TS_Bottom_*`, `TS_Shoes_*`, `TS_Accessory_{glasses,cap,earrings,choker,ribbon}→accessory`, `TS_Acc_{glasses,ribbon}→accessory`, `TS_Top_tee_Outline→top(outline)`.
   - **틀림/미분류**: `TS_Mouth→null`, `TS_Mouth_primitive0→null`, `TS_Underwear→null`, `TS_Acc_headphones→head`, `TS_Accessory_headphones→head`.
     **정정 2026-10-08**: 이 오분류는 KT-02가 `mesh-role-mapping.ts`의 키트 접두 규칙(`KIT_PREFIX_ROLES`: `ts_top`·`ts_bottom`·`ts_shoes`·`ts_accessory`·`ts_underwear`·`ts_iris`)을 키워드 규칙 앞에 두어 해소했다 — `TS_Underwear`→`underwear`, `TS_Accessory_headphones`→`accessory`, `TS_Mouth_primitive0/1`→`teeth`/`tongue`(쪼개지지 않은 `TS_Mouth`는 unknown이라 `kit.json`이 역할을 명시).
3. **Orion 스켈레톤 (C19, N1)**: `avatar-orion-authored/manifest.json`의 `skeleton.skins[0].joints`는 67개이고 `TS_OrionEye.L/R` 2개를 빼면 Mixamo 65개다. 턱 본 없음.
4. **Babylon 사실 확인 (C7, C18)**: 로더 소스에서 `glTFLoader.pure.js:1000`(`COLOR_0`만), `:1277-1278`(`Bone` `_index = skin.joints.indexOf`), `pbrBaseMaterial.pure.js:1444`(`PrepareDefinesForAttributes(..., useVertexColor = true, ...)`), `materialHelper.functions.js:1036-1040`(`VERTEXCOLOR` 조건), `pbrBlockAlbedoOpacity.js:47-49`(`surfaceAlbedo *= vColor.rgb`)를 직접 읽었다.
5. **실행하지 않은 것**: 저장소 전체 vitest/tsc, 브라우저 렌더, Blender 실행, 합성 키트 로드. 이 문서의 런타임 동작(4절)은 코드 읽기와 위 4개 실행에 근거한 **설계**이며 구현 후 KT-03/04 테스트로 검증해야 한다. 특히 4.6-5(서브메시 숨김의 pick/export 거동), 4.11(`instantiateModelsToScene` 복제 비용), 4.10(툰 `color` attribute), 8.2(내보내기 morph weights)는 **미검증**이다.

---

## 16. 부록 B — KT-04 엔진 통합 결과(2026-10-08)

현재 상태(current). 구현은 `render/babylon/character-engine.ts`·`character-rig.ts`·`materials/toon-shader.ts`·`shader-sources.ts`·`skinned-pick.ts`와 새 순수 모듈 `render/outline-policy.ts`·`render/kit-bytes-cache.ts`다. 테스트는 `babylon-kit-engine.test.ts`(**정정 2026-10-08: 38개**, NullEngine), `outline-policy.test.ts`(3), `kit-bytes-cache.test.ts`(6), `shader-sources.test.ts`, `babylon-glb-sparse-export.test.ts`(키트 케이스)다. 로더는 `babylon-kit-load.test.ts`(69)·`kit-region-mask.test.ts`(17)가 NullEngine·순수 함수로 검증한다. 모든 항목의 상태 표는 `docs/parity/render.md`의 키트 행이 정본이다.

- **증분 교체**: 같은 키트·베이스·베이스 파일이면 `KitRigHandle.update`로 바뀐 파츠만 받아 합친다. 엔진은 그림자 캐스터·패스 재질(partId 키, 교체된 역할의 재질은 버려 다음 캡처에서 다시 만든다)·베타 재질·페인트 데칼·물리 바인딩·재질 프리셋/틴트·마지막 플랜을 새 구성에 맞춘다. 실패하면 키트 전체를 해제하고 `LabFailure`로 reject하며 그 키트의 바이트 캐시를 비운다.
- **바이트 캐시**: 키는 `URL | 플랜 SHA-256`이다(같은 URL의 파일이 키트 갱신으로 바뀌어도 옛 바이트를 돌려주지 않는다). 합계 64 MiB, 최근 사용 우선 제거.
- **썸네일 임시 리그**: `ThumbnailRequest.source = { kind: "kit", plan }`를 같은 로더로 만들고 끝나면 해제한다. 주 리그·플랜·장면 객체는 그대로이며 베이스는 바이트 캐시를 쓴다.
- **브라우저 미검증**: 셰이더 컴파일(WebGPU/WGSL의 `#ifdef` attribute·`discard`)은 실행하지 못했다. WebGL2(SwiftShader)에서는 키트 뷰어로 툰 렌더가 컴파일·동작함을 확인했다. NodeMaterial 툰·ID/깊이/법선 패스는 정점 색 AO·알파 컷오프를 지원하지 않는다.

**정정 2026-10-08 (KT-12)** — 이 부록 이후 확정된 사실:

- 외곽선 정책은 A-5(눈·입 안 계열)에 **A-9(머리)** 가 더해져 확정됐다(4.8). 위 "결정은 리드 몫"은 닫혔다.
- 안경은 프레임만(A-8, 3.6·4.9), 키트 툰 기본 셰이딩은 램프 2단·림 끔(A-10, 3.9), 부팅 기본 소스는 키트 에셋 안착 전까지 절차(6절 1항).
- 키트 소스에서 켜지는 기능 중 **브라우저에서만 확인되는 것**의 목록은 `docs/parity/render.md` §10.2(WGSL 컴파일, 앱 뷰포트의 머리 윤곽·가림, 썸네일 임시 리그 비용 R5, `instantiateModelsToScene` 복제, NodeMaterial 툰/toon-reference의 정점색 AO·알파 컷오프 미구현, BLEND 미지원)에 있다.
