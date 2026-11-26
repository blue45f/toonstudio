# 키트 프리뷰 뷰어 (kit-preview)

상태: **current (2026-10-08)**. 이 문서는 지금 디스크에 있는 구현을 설명한다. 개발 전용 도구이며 운영 배포 대상이 아니다.
키트 계약은 [`authored-kit-spec.md`](./authored-kit-spec.md)(정본)이다. 이 도구는 키트 규약 GLB를 **앱 엔진의 키트 소스 경로**(`loadSource({ kind: "kit" })` → `loadKitRig`)로
올려 앱과 같은 정책(§4.3 스켈레톤 재바인딩·`kit-*` 실패, §4.9 틴트, 눈·머리 외곽선 제외, 정점색 AO, 알파 컷오프)으로 그리고, 키트 규약 밖 GLB는 기존 병합 경로(`package` 소스)로 올린다(5절).

## 1. 무엇을 하는 도구인가

Blender에서 내보낸 GLB(베이스 바디 + 파츠)를 **앱의 실제 렌더러**(`BabylonCharacterEngine`: 툰/PBR 재질·조명·IBL·외곽선·후처리)로
렌더해 PNG, 접촉 시트, JSON 요약을 만든다. Blender EEVEE는 이 컨테이너에서 장당 약 3분이지만 이 도구는 장당 1~4초다.
렌더 로직을 복제하지 않는다: 엔진의 공개 메서드(`loadSource`·`applyPlan`·`setShading`·`setCamera`·`renderFrame`·`readBone`·`inspectRig`)만 쓴다.
**어느 소스 경로로 렌더했는지는 요약 JSON의 `sourceKind`(`"kit"` | `"package"`)에 남는다** — 심사할 때 먼저 확인할 것(5절).

```text
Blender GLB들 ──▶ scripts/kit-preview.mjs ──▶ 임시 정적 서버(GLB, CORS) + Vite dev 서버(kit-preview.html)
                      │                            │
                      │  Playwright Chromium(WebGL2 SwiftShader)이 window.__kitPreview 호출
                      ▼                            ▼
   PNG(뷰 × 셰이딩) · 접촉 시트 · <이름>__summary.json(= stdout)
```

## 2. 빠른 시작

저장소 루트에서 실행한다. 필요한 것: Node 22.18 이상(권장 24.16+), 저장소의 `playwright`(`pnpm install` 후), Playwright Chromium,
접촉 시트용 ImageMagick `montage`(없으면 시트만 건너뛴다).

```sh
# 베이스 단독, 기본 8뷰 × 툰·PBR = 16장 + 접촉 시트
node apps/character-lab/scripts/kit-preview.mjs --glb bases/female.glb --out /tmp/kit-out

# 베이스 + 파츠(스킨은 베이스 스켈레톤에 본 이름으로 재바인딩), 색 틴트와 포즈
node apps/character-lab/scripts/kit-preview.mjs \
  --glb bases/female.glb --glb parts/female/hair/soft-bob.glb --glb parts/female/top/tee.glb \
  --out /tmp/kit-out --color hair=#6b3f1d,top=#c0392b --pose arms-up --views front,q3,side --shading toon

# 표정·체형 morph 확인(이름은 GLB의 morph 이름 그대로), 얼굴 근접, 투명 배경, 큰 해상도
node apps/character-lab/scripts/kit-preview.mjs --glb bases/female.glb --out /tmp/kit-out \
  --morph facs:jawOpen=1 --morph param:height=-0.5 --views face,face-q3 --size 1024 --transparent

# 툰 램프·림 덮어쓰기(키트 기본은 램프 2단·림 끔), 외곽선 방식 지정
node apps/character-lab/scripts/kit-preview.mjs --glb bases/female.glb --out /tmp/kit-out --shading toon --ramp-steps 3 --rim on --outline edge

# 키트 이름이 있어도 기존 병합 경로로 강제(비교용: 눈이 hull 외곽선에 덮이는 옛 모습)
node apps/character-lab/scripts/kit-preview.mjs --glb bases/female.glb --out /tmp/kit-out --legacy-merge

# 엔진 없이 정적 검사만(3초): 메시·morph·본·경고 JSON
node apps/character-lab/scripts/kit-preview.mjs --glb bases/female.glb --out /tmp/kit-out --inspect-only
```

stdout에는 **JSON 요약만** 나오고 진행 로그는 stderr로 간다(`--quiet`로 끈다). 같은 JSON이 `<out>/<이름>__summary.json`에도 저장된다.
이미지는 `<out>/<이름>__<뷰>__<셰이딩>.png`, 접촉 시트는 `<out>/<이름>__sheet.png`다(`--name` 생략 시 이름 = 베이스 GLB 파일명).

## 3. 옵션

| 옵션 | 기본 | 설명 |
| --- | --- | --- |
| `--glb <경로>` | (필수, 반복) | 첫 번째 = 베이스(스켈레톤 기준), 나머지 = 파츠. 베이스에 키트 이름 메시(`TS_Body`·`TS_Head`)가 있으면 키트 소스 경로, 없으면 병합 경로(5절) |
| `--out <dir>` | (필수) | 출력 폴더(없으면 만든다. 같은 이름의 기존 파일은 덮어쓴다) |
| `--name <접두>` | 베이스 파일명 | 출력 파일 이름 접두 |
| `--views <목록>` | `front,q3,side,back,face,face-q3,hands,feet` | 쉼표 구분. `bust`·`hands-palm`·`all`도 가능 |
| `--shading <목록>` | `toon,pbr` | `both`도 허용 |
| `--size <px>` | 768 | 한 변 64~4096 |
| `--bg <#rrggbb>` | `#30343f` | 배경색. 툰 외곽선이 거의 검정이라 너무 어두운 배경은 외곽선이 안 보인다 |
| `--transparent` | 꺼짐 | 배경을 투명으로 저장(접촉 시트는 어두운 바탕에 얹는다) |
| `--quality <id>` | `standard` | `preview`(그림자 1캐스케이드·후처리 끔) · `standard`(앱 기본) · `hero`(그림자 4캐스케이드·PCF·접촉 경화·FXAA·bloom·sharpen·IBL 1.2) |
| `--morph <이름=값>` | 없음 | 반복 가능. 모든 메시의 morph 타깃에 **이름으로** 적용. 값은 0~1. 부호 약식 `param:<키>=<−1~1>`은 `:+`/`:-`로 나눈다. 키트 경로는 계약 어휘(`param:<키>:±`·`facs:<유닛>`)만 구동한다(5절) |
| `--pose <id\|JSON\|파일>` | 없음 | 4절. 내장 프리셋 또는 본 회전 JSON |
| `--color <키=#hex,…>` | 앱 기본 팔레트 | `skin,iris,hair,brow,top,bottom,shoes,accessory`. recolor 재질에만 곱해진다(6절) |
| `--hair-lod <n>` | 0 | 표시할 헤어 LOD(`…_LOD<n>`) |
| `--role <메시=역할>` | 없음 | 키트 이름 규칙 밖 메시의 역할 강제(예: `--role TS_ReferenceBust=top`). 키트 경로에서도 같은 규칙으로 선언에 쓴다 |
| `--ramp-steps <2\|3\|4>` | 키트 **2** · 병합 3 | 툰 램프 단수. 키트 기본은 앱의 `createKitDefaultRecipe()`(리드 결정 A-10) |
| `--rim <on\|off>` | 키트 **off** · 병합 on | 툰 림 라이트 |
| `--outline <none\|hull\|edge>` | `hull` | 툰 외곽선 방식. 키트 소스는 엔진 정책으로 눈·눈썹·속눈썹·입 안·머리(A-5·A-9)에는 hull을 켜지 않는다 |
| `--legacy-merge` | 꺼짐 | 키트 이름 자동 감지를 끄고 기존 병합(`package`) 경로로 강제 |
| `--inspect-only` | 꺼짐 | 엔진을 만들지 않고 정적 검사·병합 점검만 |
| `--no-sheet`, `--sheet-tile <px>` | 시트 켜짐, 256 | 접촉 시트. 칸 폭 = tile이라 4칸 × 256 = 1024px |
| `--timeout-sec <초>` | 240 | 로드·셰이더 준비 대기 상한 |
| `--renderer <id>` | `swiftshader` | `default`는 브라우저 기본 GPU |
| `--chromium <경로>` | 자동 | `CHARACTER_LAB_CHROMIUM_PATH` → `/opt/pw-browsers/chromium-1194/…` → Playwright 기본 |
| `--dev-url <주소>` | 임시 서버 | 이미 떠 있는 Vite dev 서버를 쓴다(그 서버가 `kit-preview.html`을 서빙해야 한다) |
| `--quiet` | 꺼짐 | stderr 진행 로그 끔 |

`--morph` 값을 `name=value`로 나눌 때는 **마지막 `=`** 를 쓴다(이름에 `:`·`+`·`-`가 들어간다). 계약 어휘(`param:<키>:±`, `facs:<유닛>`)와
레거시 원본 이름(Orion의 `blendShape2.vrc_v_aa` 등)을 모두 쓸 수 있다. GLB에 없는 이름은 버리지 않고 `morph-unknown` 경고에 비슷한 이름 후보와 함께 적는다.

## 4. 뷰와 포즈

좌표는 우수 좌표계·Y-up, 캐릭터 정면 +Z, 캐릭터 왼쪽 +X다. 전신·얼굴·상반신은 앱 뷰포트와 같은 프레이밍(`resolveFraming`)을 엔진의 `setCamera`로 쓴다.

| 뷰 | 설명 |
| --- | --- |
| `front` | 정면 전신 |
| `q3` | 3/4 전신(캐릭터 왼쪽 35°, 위 8°) |
| `side` | 측면 전신(캐릭터 왼쪽에서) |
| `back` | 후면 전신 |
| `face`, `face-q3` | 얼굴 정면 / 3/4(왼쪽 30°) |
| `bust` | 상반신 |
| `hands`, `hands-palm` | 왼손 등쪽(위에서) / 손바닥쪽(아래에서). `leftHand` 본이 필요하다 |
| `feet` | 두 발(앞·위에서). 발 본이 없으면 바운딩 박스 바닥으로 대신한다 |

스켈레톤이 없는 GLB(예: `reference-character.glb`)는 `hands` 뷰를 만들 수 없어 **건너뛰고** `view-skipped` 경고를 남긴다(실패가 아니다).
장면은 캐릭터 바운딩으로 자동 프레이밍되며 포즈 프리셋은 팔을 올릴 때 등 거리 배율을 곱해 잘리지 않게 한다.

`--pose`는 앱의 포즈 저작 규약과 같은 **T-포즈 참조 스켈레톤의 본 로컬 회전**(`model-space`)이다. 키트의 레스트가 T-포즈이므로 `t-pose`는 변형 없음이다.

| 프리셋 | 내용 |
| --- | --- |
| `t-pose` | 레스트(모든 델타 항등) |
| `a-pose` | 팔 45° 내림 |
| `arms-up` | 팔 올림 |
| `elbows-bent` | 팔꿈치 112° 굽힘 |
| `squat` | 쪼그려 앉기(허벅지·무릎·발목·척추) |
| `sit` | 앉기 |
| `twist` | 허리 비틀기(척추·가슴) |
| `neck-turn` | 목 돌림 |
| `fist` | 주먹(손가락 30본) |

사용자 포즈는 JSON 문자열(`{`로 시작) 또는 JSON 파일 경로다. 키는 VRM 휴머노이드 본 이름 55개이고 값은 `[x,y,z,w]` | `{"axis":[x,y,z],"deg":n}` | `{"euler":[xDeg,yDeg,zDeg]}`다:

```sh
--pose '{"leftUpperArm":{"axis":[0,0,1],"deg":-45},"head":{"euler":[0,30,0]},"neck":[0,0.2588,0,0.9659]}'
```

휴머노이드 매핑에 없는 본은 건너뛰고 `pose-bone-skipped` 경고에 이름을 적는다.

## 5. 소스 경로 두 가지: 키트 소스(`kit`)와 병합(`package`)

뷰어는 입력을 **두 경로 중 하나**로 엔진에 올리며, 어느 쪽인지는 요약 JSON의 `sourceKind`와 `sourceKindReasonKo`, 로그의 `소스 경로: …`, 경고 `source-kind`(info)로 남는다.

| 경로 | 언제 | 엔진 입력 |
| --- | --- | --- |
| `kit` | 첫 번째 GLB(베이스)에 키트 이름 메시 `TS_Body` 또는 `TS_Head`가 있다 | `loadSource({ kind: "kit", plan })` — `plan`은 입력 GLB에서 즉석 생성한 `KitPlan` |
| `package` | 위가 없다(제작 패키지 Orion·reference 등 키트 규약 밖), 또는 `--legacy-merge` | `loadSource({ kind: "package", plan })` — 여러 GLB를 순수 TS로 한 GLB로 병합 |

감지는 베이스 메시 이름만 본다(`kit-plan-adapter.decideSourceKind`). 저장소의 Orion 패키지는 `TS_AuthoredHair_*` 같은 키트식 이름을 일부 갖지만 `TS_Body`·`TS_Head`가 없어 `package`로 간다.
감지가 틀리면 `--legacy-merge`로 강제한다(반대 방향의 강제 플래그는 없다 — 키트 이름이 없는 입력은 키트 로더가 거부한다).

### 5.1 `kit` 경로(키트 규약 GLB의 기본 경로)

`kit-plan-adapter.ts`가 `kit.json` 없이 GLB들에서 `KitPlan`(계약 `character-kit.ts` 타입)을 만든다. 계약 상수를 재사용하고 중복 정의하지 않는다.

| 항목 | 만드는 방법 |
| --- | --- |
| 파츠 | 첫 GLB = 베이스(`base/<female\|male>`, 파일명에 `male`이 있고 `female`이 아니면 남성), 나머지 = 파츠. 슬롯은 메시 역할에서(`KIT_PART_SLOT_ROLES`), 파츠 id는 `<슬롯>/<파일명>` |
| 메시 선언 | GLB의 메시 노드마다 이름·삼각형·정점·스킨 유무·**morph 이름**. 역할은 `kit-roles.resolveMeshRole`(키트 이름 → `--role` → 이름 추정). `TS_Mouth`(프리미티브 2개)는 `primitiveRoles [teeth, tongue]` |
| 재질 | GLB 재질 이름 → `{ role, tint, doubleSided }`. 틴트는 `KIT_ROLE_TINT_RULES`(recolor 색 키 / fixed 고정색 — GLB `baseColorFactor`가 흰색이면 `#ffffff`) |
| 스켈레톤 | 계약 상수(`KIT_SKELETON_JOINTS` 등). GLB의 joint가 다르면 엔진이 `kit-joint-mismatch`로 거부한다 |
| 선언 검증 | `kitMeshSchema`·`kitMaterialSchema`로 점검하고 어긋나면 `kit-declaration-invalid` 경고(렌더는 막지 않는다) |
| 무결성 | CLI가 디스크의 원본에서 **바이트 수·SHA-256을 계산해 요청에 실어** 플랜의 파츠에 넣는다. 엔진(`loadKitRig`)이 받은 바이트를 이 값으로 검증한다(`kit-bytes-mismatch`·`kit-sha-mismatch`) — **검증을 끄지 않는다**(`runtime.source.integrityVerified: true`) |

효과: 앱의 키트 정책이 렌더에 그대로 걸린다 — 눈·눈썹·속눈썹·입 안·머리에 hull 외곽선 없음(A-5·A-9), 키트 틴트(`RigPart.tint`), 정점색 AO, 알파 컷오프, 얼굴 SDF 끔.
기본 셰이딩은 `createKitDefaultRecipe()`의 키트 기본(툰 램프 2단·림 끔, A-10)이다(`--ramp-steps`·`--rim`으로 덮어쓴다).

**경고·실패는 엔진의 것을 그대로 보인다.** 조인트 이름·부모 불일치(`kit-joint-mismatch`), 메시 선언 불일치(`kit-mesh-undeclared`·`kit-mesh-missing`), 스킨 속성 누락(`kit-skin-invalid`),
변환 비항등(`kit-transform-invalid`), 선언된 morph 없음(`kit-morph-missing`), 금지 확장·외곽선 셸 등은 엔진 `LabFailure`의 코드·한글 사유가 `failure`에 그대로 나오고
종료 코드는 3이다. 조인트 **순서**만 다르면 엔진 메모(`engine-note`, info)다. 실패한 경우 병합 경로로 대신 렌더하지 않는다(무음 대체 금지) —
`kit-path-hint`(info)가 `--legacy-merge`라는 우회 방법만 알려 준다. 키트 필수 메시(`KIT_BASE_MESH_SPECS`) 누락은 `kit-base-mesh-missing`(error),
파츠 슬롯의 필수·허용 역할 위반은 `kit-part-role-missing`·`kit-part-role-invalid`, 한 파츠 파일이 여러 슬롯에 걸치면 `kit-part-mixed-slots` 경고다.

한계(12절): 플랜의 `bodyRegions`·`jointOffsets`·`hides`는 `kit.json`에만 있는 값이라 비어 있다. 그리고 키트 어휘 밖 morph 이름(`Key 1` 등)은 플랜에 선언할 수 없어
구동되지 않는다(`kit-morph-unknown-name` 경고; 이름이 임의인 GLB는 `--legacy-merge`).

### 5.2 `package` 경로(키트 규약 밖 GLB, `--legacy-merge`)

기존 동작 그대로다: 뷰어가 **순수 TS로 GLB들을 하나로 병합**한 뒤(`glb-merge.ts`) 엔진에 `package` 소스로 올린다. 병합 규칙은 계약 §4.3을 따른다:

| 상황 | 동작 |
| --- | --- |
| 파츠 `skin.joints`가 베이스와 원소별로 같음 | 파츠 메시의 `skin`만 베이스 스킨으로 바꾼다(재매핑 없음) |
| 이름 집합은 같고 **순서만 다름** | `JOINTS_0`을 베이스 인덱스로 재매핑하고 `kit-joint-order` 경고(키트 빌더는 순서를 같게 내보내야 한다) |
| 집합이 다르거나(누락·여분) **부모가 다름** | **`kit-joint-mismatch`로 실패**(종료 코드 3). 어긋난 관절 이름 최대 5개를 사유에 넣는다. 무음 대체 없음 |
| 레스트 포즈(`inverseBindMatrices`)가 베이스와 다름 | `kit-rest-mismatch` 경고(포즈에서 찢어지는 사탕 포장지 변형의 흔한 원인) |
| 메시 노드 이름이 이미 장면에 있음 | `kit-mesh-duplicate`로 실패(같은 슬롯 파츠를 둘 올렸거나 베이스가 이미 싣고 있음) |
| 스킨 없는 파츠 메시 | `kit-skin-invalid`(error) 경고. 월드 변환을 구워 장면 루트에 고정하므로 포즈를 따라가지 않는다 |
| `TS_Mouth`(프리미티브 2개) | `TS_Mouth_teeth`·`TS_Mouth_tongue` 두 노드로 분할(앱 패키지 로더는 `_primitive<i>`를 한 파츠로 묶어 재질 하나로 덮기 때문). 프리미티브가 1개뿐이면 teeth 한 파츠로 그리고 `kit-mouth-primitives` 경고 |

파츠 GLB의 스켈레톤·관절 노드는 가져오지 않고 필요한 bufferView만 BIN에 덧붙인다. 입력이 GLB 하나이고 병합·분할·틴트 굽기가 아무것도 바꾸지 않으면
**원본 바이트를 그대로** 엔진에 올린다(`merge.passthrough: true`).

병합 경로의 무결성: 병합하지 않은 원본이면 CLI가 계산한 SHA-256을, 병합했으면 병합 GLB 바이트의 SHA-256(브라우저 계산)을 `AuthoredPackagePlan.glbSha256`에 넣어 엔진의 `package-sha-mismatch` 검증을 켜 둔다.
이 경로의 기본 셰이딩은 기존 `DEFAULT_SHADING`(툰 램프 3단·림 켬)이라 이전 렌더와 같다(2026-10-08 Orion 6장을 이전 결과와 화소 비교해 동일함을 확인).

메시 역할은 `kit-roles.ts`의 키트 이름 규칙으로 정한다(`TS_Body→skin`, `TS_Head→head`, `TS_Eye_*→eyeball`, `TS_Iris_*→iris`, `TS_Highlight_*→eye-highlight`,
`TS_Mouth_teeth/tongue`, `TS_Lashes→lash`, `TS_Brow_*→brow`, `TS_Underwear`, `TS_AuthoredHair_<id>_LOD<n>→hair`, `TS_Top/Bottom/Shoes/Accessory_<id>`).
이 규칙 밖의 이름(Orion·reference 등 레거시)은 이름 부분 문자열로 **추정**하고 `roles-guessed`/`kit-mesh-undeclared` 경고로 어느 메시를 어떻게 추정했는지 알린다.
`--role`로 덮어쓸 수 있다. 본 매핑은 키트 68관절(Mixamo 65 + `TS_Jaw`·`TS_Eye.L/R`)을 명시 표로 휴머노이드 55본에 대응시키며 Orion의 `TS_OrionEye.*` 별칭도 받는다.


## 6. 재질·틴트 해석(계약 §4.9)

키트의 recolor 재질(스킨·홍채·헤어·의상)은 텍스처가 거의 흰색(상대색)이고 GLB `baseColorFactor`는 `[1,1,1,1]`이다. **최종색 = 텍스처 × 틴트**다.
틴트의 기본값은 앱의 `DEFAULT_RECIPE_COLORS`(skin `#f3d3bd`, iris `#5a3a2a`, hair·brow `#2b1d16`, top `#e8e8ee`, bottom `#3b4a6b`, shoes `#f5f5f5`, accessory `#c94f6b`)이고
`--color`로 덮어쓴다.

| 분류 | 판정 | 틴트 | 대상 |
| --- | --- | --- | --- |
| recolor | 키트 이름 + 틴트 가능 역할 | `--color` 값을 곱한다 | skin·head·iris·pupil·brow·lash·hair·top·bottom·shoes·accessory |
| fixed | 키트 이름 + 고정색 역할 | **무시**. 흰색(또는 GLB factor) 고정 | eyeball·eye-highlight·teeth·tongue·underwear |
| legacy | 키트 이름 규칙 밖 | 건드리지 않음(앱이 지금 그리는 대로) | Orion·reference 등 |

**`kit` 경로**는 틴트를 엔진이 정한다: 플랜의 재질 선언(`recolor`/`fixed`)이 `RigPart.tint`가 되고, recolor는 적용 플랜의 `colors`(= 기본 팔레트 + `--color`)를, fixed는 선언의 고정색을 곱한다
(뷰어는 파츠 색 override를 주지 않는다).
**`package` 경로**는 엔진이 PBR에서 텍스처가 있는 파츠에 레시피 색을 적용하지 않으므로 뷰어가 병합 GLB의 `baseColorFactor`에 틴트를
**구워** PBR이 곱하게 하고, 툰은 플랜의 파츠 색으로 준다. 그래서 두 셰이딩이 같은 색을 낸다. recolor 재질의 factor가 흰색이 아니면 `kit-factor-not-white`
경고를 남기고 틴트로 덮어쓴다. 한 재질을 서로 다른 틴트의 메시가 같이 쓰면 `kit-material-shared` 경고(한 (파츠, 역할)에 재질 하나 규칙).

## 7. 출력과 JSON 요약

`<이름>__summary.json`(= stdout)의 최상위 키:

| 키 | 내용 |
| --- | --- |
| `schema`, `ok`, `exitCode`, `generatedAt`, `failure` | `toonstudio.kit-preview/1`, 성공 여부, 종료 코드, 실패 시 `{stage, code, reasonKo}` |
| `sourceKind`, `sourceKindReasonKo` | **`"kit"`(엔진 키트 소스) 또는 `"package"`(병합 경로)**와 판정 근거. 소스 경로를 정하기 전에 실패하면 `null` |
| `request` | 정규화된 요청(입력 파일 경로·크기·SHA-256, 뷰, 셰이딩, 크기, 포즈, morph, 색, `legacyMerge`, `toon` 덮어쓰기 등) |
| `environment` | Node·Playwright·Chromium 버전, 렌더러, 개발 서버 종류 |
| `inputs[]` | 입력 GLB별 크기·generator·메시 수·삼각형·정점·관절 수·이미지(이름·크기·MIME·바이트)·사용 확장 |
| `meshes[]` | **병합 뒤** 메시별: `name`, `origin`(입력 파일), `role`·`roleSource`(`kit-name`\|`legacy-name`\|`override`\|`fallback`), `tint`, `planColor`, `triangles`, `vertices`, `materials`, `skinned`, `hasUv`/`hasNormal`/`hasTangent`/`hasColor0`/`hasColor1`/`hasWeights`, `morphTargets`(개수), `parent` |
| `totals`, `morphTargetNames[]`, `boneNames[]` | 합계, 모든 메시의 morph 이름 합집합, 베이스 `skin.joints` 순서 그대로의 관절 이름 |
| `skeleton` | 관절 수, 휴머노이드 매핑 수, 미매핑 이름, `matchesKit68`, 누락·여분 관절 |
| `merge` | `passthrough`, 파츠별 `jointOrder`(`same`\|`reordered`\|`none`)·메시 수, `splits`, 병합 바이트(`kit` 경로는 병합하지 않으므로 `passthrough: true`·베이스 입력 바이트) |
| `kitPlan` | `kit` 경로의 즉석 생성 플랜 요약(`kitId`, `baseId`, 파츠별 id·슬롯·바이트·SHA-256·메시 수, 재질 수, 선언된 morph 수). `package`는 `null` |
| `runtime` | **`source`(소스 경로 + `integrityVerified`)**, **`toon`(툰 모드에 실제 쓴 램프 단수·림·외곽선·얼굴 SDF)**, 엔진 백엔드·버전·렌더러, 리그 요약, **파츠 표**(엔진이 실제로 만든 파츠: 역할·재질 프리셋·클래스·삼각형·morph 수·텍스처 유무·색·표시 여부), morph 적용 결과(`applied`·`expanded`·`unknown`), 포즈 적용 결과, 장면 기능 가용성, 단계별 시간(ms) |
| `outputs[]` | (뷰 × 셰이딩)마다 `status`(`ok`\|`skipped`\|`failed`), `file`, 크기, `coverage`(알파 기준 캐릭터 면적 0..1), `readyMs`, `renderMs`, `wallMs`, `hud`(드로 콜·삼각형), 실패 사유 |
| `contactSheets[]` | 만든 접촉 시트 파일 이름 |
| `timings` | `loadSec`, `perViewSec`(성공한 렌더 평균), `medianViewSec`, `maxViewSec`, 셰이딩별 첫 렌더와 이후 평균, `totalSec` |
| `warningCounts`, `warnings[]` | 심각도별 개수, 경고 목록(`{code, severity, source, messageKo}`, 심각도 → 코드 순 정렬·중복 제거) |

경고 `severity`: `error` = 앱 로더가 거부하거나 렌더가 틀릴 것, `warn` = 규약 위반·품질 위험, `info` = 알아 둘 사실.

## 8. 경고·실패 코드

정적 검사(GLB 파일 단위, `glb-inspect.ts`): `glb-no-normals`·`glb-no-uv`(텍스처가 샘플되지 않음)·`glb-no-tangent`(노멀맵인데 접선 없음, info)·`glb-no-material`·
`glb-color1`(앱은 `COLOR_0`만 읽음)·`glb-color0-not-gray`·`glb-primitive-mode`·`glb-weights-without-skin`·`glb-skin-attributes-missing`·`glb-influences-over-4`·
`glb-weights-sum`·`glb-joint-index-out-of-range`·`glb-skin-missing`·`glb-no-ibm`·`glb-morph-unnamed`·`glb-morph-over-budget`(타깃 96 초과)·
`glb-morph-outside-vocabulary`(계약 어휘 밖, info)·`glb-image-external`·`glb-image-unreadable`·`glb-texture-npot`·`glb-texture-large`·`glb-png-without-alpha`·
`kit-unsupported-extension`(Draco·meshopt·basisu·webp 금지).

키트 계약 점검(키트 이름을 가진 메시에만, `kit-checks.ts`): `kit-skeleton-mismatch`·`kit-skeleton-legacy`·`kit-bone-map`·`bone-map-duplicate`·`skeleton-missing`·
`kit-skin-invalid`·`kit-transform-invalid`·`kit-outline-shell-forbidden`(`_Outline` 셸 금지)·`kit-morph-missing`(계약 §4.4 최소 커버리지)·`kit-hair-lod`·
`kit-texture-slot-forbidden`(ORM·emissive 텍스처 금지)·`kit-texture-budget`·`kit-budget-bytes`·`kit-budget-triangles`(계약 §3.7 제안 예산)·`kit-mesh-undeclared`·`roles-guessed`.

키트 경로 플랜 생성(`kit-plan-adapter.ts`): `kit-plan-synthesized`(info: bodyRegions·jointOffsets·hides 비어 있음)·`kit-base-mesh-missing`(error)·`kit-part-slot-unknown`·`kit-part-mixed-slots`·
`kit-part-role-invalid`·`kit-part-role-missing`·`kit-material-shared-roles`·`kit-declaration-invalid`(계약 스키마 불일치)·`kit-morph-unknown-name`(키트 어휘 밖 morph)·`kit-no-material`·
`source-kind`(info: 소스 경로 판정)·`kit-path-hint`(info: 키트 경로 거부 시 `--legacy-merge` 안내).
키트 경로 엔진 실패(`failure.code`, 종료 코드 3): 계약 4.12의 `kit-joint-mismatch`·`kit-mesh-undeclared`·`kit-mesh-missing`·`kit-skin-invalid`·`kit-transform-invalid`·`kit-morph-missing`·
`kit-material-multiple`·`kit-unsupported-extension`·`kit-outline-shell-forbidden`·`kit-bytes-mismatch`·`kit-sha-mismatch`·`kit-glb-load-failed`·`kit-file-fetch-failed` 등 — 엔진의 한글 사유 그대로.

병합·준비(`package` 경로): `kit-joint-order`·`kit-rest-mismatch`·`kit-rest-unchecked`·`kit-part-empty`·`kit-mouth-primitives`·`kit-no-material`·`kit-factor-not-white`·`kit-material-shared`.
실패(종료 코드 3): `glb-invalid`·`kit-joint-mismatch`·`kit-mesh-duplicate`·`kit-no-base`.

런타임: `morph-unknown`·`pose-no-skeleton`·`pose-bone-skipped`·`engine-note`(엔진이 소스 로드 중 남긴 메모)·`texture-load-failed`·`texture-not-ready`·
`texture-upload-warning`(WebGL이 텍스처 업로드를 거부 — 손상되었거나 지원하지 않는 이미지)·`render-empty`(커버리지 0.1% 미만)·`transparent-lost`·`view-skipped`·
`contact-sheet-failed`·`browser-console-error`/`browser-console-warning`/`browser-page-error`/`browser-request-failed`/`browser-http-error`.
렌더 실패 코드: `kit-preview-shader-timeout`·`kit-preview-render-failed`·`kit-preview-render-hang`·`kit-preview-view-unavailable`(= 건너뜀).

## 9. 종료 코드와 프로세스 정리

| 코드 | 의미 |
| --- | --- |
| 0 | 성공(건너뛴 뷰는 실패가 아니다) |
| 1 | 인자·입력 파일 오류 |
| 2 | 브라우저·의존성·개발 서버·임시 폴더 문제(Playwright 없음, Chromium 실행 실패, Node가 `.ts`를 못 읽음 등) |
| 3 | 에셋 오류(GLB 해석 실패, `kit-joint-mismatch`, 파일 받기 실패, 키트 경로에서 엔진 로더가 에셋·선언을 거부한 `kit-*` 계약 코드) |
| 4 | 렌더 실패(엔진 생성·소스 로드·셰이더 타임아웃, 성공한 렌더가 하나도 없거나 실패한 뷰가 있음) |
| 130 | 신호(SIGINT·SIGTERM·SIGHUP)로 중단 |

실패해도 JSON 요약은 항상 stdout에 나온다(`ok:false`, `failure`). 개발 서버와 브라우저는 다음 규칙으로 정리한다:

- Vite dev 서버는 **detached 프로세스 그룹**으로 띄우고 종료 시 그룹 전체를 kill한다. 스크립트는 정리가 **끝난 뒤** `process.exit`로 끝난다.
- Chromium은 이 실행 전용 프로필 폴더로 띄우고, `context.close()` 뒤에도 남은 프로세스는 그 프로필 경로로만 찾아 kill한다(다른 브라우저는 건드리지 않는다).
- 이 스크립트가 SIGKILL 등으로 정리 없이 죽어도: Chromium은 디버깅 파이프가 닫혀 스스로 종료하고, Vite는 **부모 감시자**(`--import`로 주입)가 2초 안에 서버를 종료하고 임시 폴더를 지운다.
  추가로 서버는 `timeout`(coreutils)으로 감싸 최악의 실행 시간 뒤 그룹 전체가 종료된다.
- 신호를 받으면 같은 정리를 한 뒤 130으로 끝난다(2026-10-08 SIGTERM·SIGKILL을 실제로 보내 남은 프로세스 0·임시 폴더 0을 확인).

## 10. 구조

| 경로 | 역할 |
| --- | --- |
| `kit-preview.html` | 루트의 개발 전용 진입점(`main.browser.ts` 로드, 조작 UI 없음). **프로덕션 빌드에 들어가지 않는다**(13절 검증) |
| `scripts/kit-preview.mjs` | CLI: 임시 정적 서버·Vite 서버·Playwright 구동, PNG 저장, `montage`, JSON 요약, 프로세스 정리 |
| `src/render/kit-preview/cli-args.ts`, `cli-output.ts`, `warnings.ts` | CLI가 Node의 타입 제거 실행으로 직접 import하는 leaf 모듈(형제 런타임 import 없음): 인자 파서·어휘, 출력 이름·접촉 시트 인자·종료 코드·보고서 조립, 경고 형식 |
| `glb-io.ts`, `glb-inspect.ts`, `glb-merge.ts`, `kit-roles.ts`, `kit-checks.ts`, `tint.ts`, `prepare.ts` | 순수 GLB 처리: 파싱·정적 검사·병합·역할/본 매핑·계약 점검·틴트·파이프라인(`package` 경로) |
| `kit-plan-adapter.ts` | 순수: 소스 경로 감지(`decideSourceKind`)와 GLB → `KitPlan` 즉석 생성(`buildKitPlan`, `kit` 경로) |
| `kit-shading.ts` | 순수: 소스 종류별 기본 셰이딩(키트 = `createKitDefaultRecipe()`) + `--ramp-steps`·`--rim`·`--outline` 덮어쓰기 + 품질 프리셋 |
| `poses.ts`, `views.ts`, `plan.ts`, `summary.ts`, `raster-stats.ts`, `protocol.ts` | 포즈 프리셋, 카메라 뷰, 엔진 입력 조립, 요약, 래스터 통계(빈 프레임 판정), 페이지↔CLI 요청·응답 형식 |
| `session.browser.ts`, `main.browser.ts` | 브라우저 전용: 엔진 생성·로드·렌더, `window.__kitPreview` |

경계 규칙(`AGENTS.md` 3절)을 따른다: `@babylonjs/*`는 `src/render/**`에만 있고, 브라우저 전용 코드는 `*.browser.ts` 접미이며 테스트가 import하지 않는다.
페이지 API는 `window.__kitPreview.load(request)` / `render(request)` / `dispose()`이고 요청·응답은 JSON으로 왕복 가능하다(`protocol.ts`) — 다른 자동화도 같은 페이지를 쓸 수 있다.

## 11. 측정 성능(2026-10-08, 이 컨테이너: 4코어, 소프트웨어 WebGL2)

Vite 기동 0.6초, Chromium 기동·페이지 준비 약 1.5초는 모든 실행에 더해진다. 장당 시간은 `render()` 왕복 전체(셰이더 준비 대기 + 프레임 + PNG 인코딩 + 전송)다.

| 입력 | 설정 | 장수 | 전체 | 로드 | 셰이딩별 첫 렌더 | 이후 평균 |
| --- | --- | --- | --- | --- | --- | --- |
| Orion(4.0 MB, 14.6k tri) | 512px, standard | 16 | 9.5초 | 1.1초 | 툰 1.35초 · PBR 1.14초 | 0.21초 · 0.23초 |
| reference-character(0.9 MB) | 512px, standard | 14(+2 건너뜀) | 9.2초 | 0.5초 | 0.73초 · 1.26초 | 0.21초 · 0.32초 |
| A3a 베이스 1단계(3.3 MB, 93.6k tri, 2K 텍스처) | 768px, standard | 14(+2 건너뜀) | 11.6~13.8초(2회) | 0.7~0.85초 | 1.2~1.6초 | 0.37~0.7초 |
| 같은 베이스 | 1024px, **hero** | 4 | 16.2초 | 0.8초 | 2.83초 · 3.64초 | 1.49초 · 3.77초 |
| Orion + 합성 자켓 파츠(2 GLB), `arms-up` | 512px | 6 | 6.9초 | 0.9초 | 1.0초 · 1.2초 | 0.2초 |

모두 장당 5초 이하다(최대 3.8초: 1024px hero PBR). 같은 입력도 실행마다 달라진다(위 베이스는 두 번 재서 11.6초와 13.8초). 접촉 시트 한 장 생성은 1초 안팎이다.

## 12. 한계와 알아 둘 점

- **키트 경로의 플랜은 즉석 생성이라 `kit.json`의 값이 없다.** `bodyRegions`·`jointOffsets`·`hides`가 비어 있어 ① 몸 영역 가림(파츠가 몸 일부를 숨기는 것)은 적용되지 않고(몸이 의상 밑에 그대로 그려진다),
  ② 체형 morph(`param:height` 등)의 관절 이동이 없어 정점만 움직인다. 실제 앱은 `kit.json`의 값을 쓰므로 이 둘은 앱과 다르게 보일 수 있다. 키트 어휘 밖 morph 이름은 구동되지 않는다(5.1).
  증분 교체는 엔진이 가진 기능이지만 뷰어는 한 번만 로드하므로 증분 경로를 시험하지 않는다.
- **병합(`package`) 경로는 앱의 키트 정책을 받지 않는다.** 눈이 hull 외곽선에 덮이거나 램프 3단 패치가 보이는 것은 이 경로의 알려진 모습이다(키트 입력은 `kit` 경로가 맞다).
  키트 규약 GLB를 `--legacy-merge`로 올린 결과를 결함 근거로 쓰지 말 것.
- **`underwear` 역할**은 계약(`PART_ROLES`)에 있으므로 `kit-roles.ts`의 `UNDERWEAR_ROLE`이 그대로 `underwear`(고정색)다.
- **PBR 틴트는 `package` 경로에서만 GLB factor에 굽는다**(6절). `kit` 경로는 엔진의 `RigPart.tint`가 처리한다.
- 툰 머리 실루엣 선은 키트 소스에서 사라진다(A-9: 머리 hull이 눈·눈썹을 깊이 테스트로 지우므로 머리 hull을 켜지 않는다). 알려진 한계이며 결함으로 판정하지 않는다.
- 소프트웨어 렌더러(SwiftShader)는 **성능·실 GPU 렌더의 증거가 아니다.** 셰이더·IBL·SSS가 GPU에서 다르게 보일 수 있다. WebGPU는 앱 정책상 쓰지 않는다(WebGL2만).
- `--morph`는 이름만 본다. 체형 morph의 관절 이동(`jointOffsets`)을 적용하지 않으므로 `param:height` 등을 크게 줘도 스켈레톤은 그대로이고 정점만 움직인다.
- 얼굴 SDF 툰 그림자(키트 v1은 끔)·입 안 마스크 같은 앱 기능은 엔진이 소스 종류에 따라 결정한 그대로다(이 도구는 건드리지 않는다).
- 메시 이름·역할을 이름에서 추정하는 레거시 경로는 키트 이름 규칙 밖의 에셋을 위한 보조일 뿐이다. 키트 에셋은 항상 키트 이름 규칙을 따라야 한다.
- 접촉 시트는 건너뛴 뷰의 칸이 비는 대신 **성공한 이미지만** 순서대로 채운다.

## 13. 문제 해결과 알려진 함정

- **Chromium이 시작 직후 `SIGTRAP`으로 죽는다**(`Target page, context or browser has been closed`). Chromium은 프로필·`TMPDIR` 안에 UNIX 소켓을 만들고 그 경로가
  108바이트를 넘으면 죽는다. 긴 `TMPDIR`를 쓰는 샌드박스(2026-10-08 실측: 142자)에서 재현된다. 스크립트는 짧은 임시 폴더(`/tmp/kp-*`)를 고르고 Chromium에 그 `TMPDIR`를 넘기므로
  평소에는 신경 쓸 필요가 없다. 직접 Playwright를 쓸 때는 `TMPDIR`를 짧게 하라.
- **PNG 배경이 투명이다.** 엔진은 `scene.clearColor` 알파를 0으로 두고 프레임에도 반영하지 않는다(실측). 뷰어는 엔진 장면을 항상 투명으로 그린 뒤 불투명 출력일 때만 2D 캔버스에서
  배경색을 뒤에 깐다. 그래서 `coverage`는 배경색과 무관하게 알파로 잰다.
- **빈 프레임.** Babylon은 `isReady()`가 false인 재질의 메시를 그리지 않아 셰이더 컴파일 전에 읽으면 완전히 비어 있다. 뷰어는 장면이 준비될 때까지 기다린 뒤 읽고,
  커버리지가 0.1% 미만이면 최대 6번 다시 그린다(`render-empty` 경고로 알린다).
- **`browser-console-warning`에 WebGL 메시지가 보인다.** 손상된 텍스처는 `texImage2D: bad image data`로 나타나 `texture-upload-warning`으로 분류된다.
- **콜드 캐시.** `vite --force`로 의존성 캐시를 새로 만드는 상태에서도 새로고침 없이 끝까지 렌더됨을 확인했다(2026-10-08, `--dev-url` 사용, 6.9초). 만약 개발 서버가 실행 중 페이지를
  새로고침하면(관찰된 적 없음) 호출이 `kit-preview-load-hang`/`kit-preview-render-hang`으로 실패하므로 다시 실행하면 된다.
- 개발 서버 로그는 실행 중에만 임시 폴더에 있다. 서버가 안 뜨면 stderr에 마지막 로그가 나온다.

## 14. 검증(2026-10-08)

- 단위 테스트(`src/render/kit-preview/*.test.ts`)는 순수 모듈만 import한다(브라우저 전용 모듈은 테스트가 import하지 않는다): `pnpm exec vitest run apps/character-lab/src/render/kit-preview apps/character-lab/src/architecture.test.ts apps/character-lab/src/render/babylon-import-policy.test.ts`(루트 설정).
- 실브라우저로 확인한 것: Orion·reference-character·A3a 베이스 1단계 렌더, 합성 파츠(정상 병합·관절 순서 재매핑·관절 불일치 실패), 9개 포즈 프리셋, `--morph`·`--color`·`--role`·`--hair-lod`·`--transparent`,
  손상 텍스처 경고, 신호 중단 시 프로세스 정리. 렌더 결과 PNG는 작업 폴더 `kit/viewer/review/`에 있다(저장소에는 넣지 않는다).
- 키트 소스 경로 전환(KT-V, 2026-10-08, SwiftShader 확인): `base_female.glb` + `irises_round-large.female.glb`를 `kit` 경로로 렌더(front·face·face-q3 × toon·pbr, 6장 성공, 요약 `sourceKind: "kit"`)해
  툰에서 눈(공막·홍채·캐치라이트)과 눈썹이 보이고, 램프 2단 기본으로 몸의 큰 불규칙 두 톤 패치가 형태를 따르는 경계 하나로 줄었음을 확인했다. 같은 입력의 `--legacy-merge` 렌더는 눈이 검은 고리로 덮이고 램프 3단 패치가 보인다.
  Orion은 `package`로 감지돼 이전 렌더 6장과 **화소 비교가 동일**(`compare -metric AE` 0)했다. 조인트 이름을 바꾼 베이스는 엔진의 `kit-joint-mismatch` 사유 그대로 종료 코드 3으로 끝났고, `--ramp-steps 3 --rim on`은 `runtime.toon`에 반영됐다.
- 아직 **실제 키트 파츠**(의상·헤어 GLB 등 베이스+홍채 외)로는 확인하지 못했다. 빌더 산출물이 나오면 이 도구로 처음 보는 것이므로 `warnings`를 먼저 읽을 것.
