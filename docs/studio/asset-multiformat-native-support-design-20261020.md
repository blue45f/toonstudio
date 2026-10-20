# 3D 에셋 다포맷 네이티브 지원 설계 (2026-10-20)

## 0. 결정과 목적

사용자 결정 (2026-10-20): **"변환하지 않아도 최대한 많은 포맷을 사용 가능하게."**

지금까지 Creator Bundle 에셋의 투입 경로는 "전부 GLB로 변환"이 게이트였다
(인제스션 v1: GLB만 복사, FBX/blend는 Blender가 있을 때만 GLB 변환, glTF는 보고만).
변환 산출 GLB 28,945개는 그대로 유효한 자산으로 유지하되, 앞으로는 **원본 포맷을
각 표면의 엔진이 네이티브로 읽는 것**을 기본 경로로 한다. 이 문서는 감사 실측
(웹 감사 `audit-web`, Unity·인제스션 감사 `audit-unity-ingest`, 2026-10-20)에
기반해 포맷×표면 능력 행렬, 매니페스트 v2 스키마, 구현 범위를 확정한다.

## 1. 현황 실측 요약

- **웹 bg3d 임포트**는 이미 다포맷이다: 1차 포맷 9종(glb/gltf/obj/fbx/dae/stl/ply/3ds/skp)
  + 동반 6종을 받아 포맷별 three.js 로더로 파싱한다
  (`bg3d/studio-bg3d-model-import.ts:135-153`, FBX `FBXLoader.parse :1445`,
  DAE `ColladaLoader.parse :1468`, glTF `GLTFLoader :1113`). 단, 저장·렌더는
  `GLTFExporter`로 재출력한 **GLB 단일 포맷**이 "sole trusted persistence format"이다
  (`:1806-1813`, `:1883-1885`).
- **웹 bg3d 런타임 렌더**는 검증된 GLB 바이트만 받는다
  (`studio-background-3d-model.ts:1183` `loadVerifiedStudioBg3dGlbWithThree`,
  저장 타입 `format:"glb"` 고정 `bg3d-model-library.ts:1610`). 레거시 직접 로더
  `loadBg3dCustomModelFromBlob`(`:210`)는 obj 직접 + glb/gltf만 분기한다.
- **OBJ**는 Worker 파싱(진짜 `OBJLoader`는 워커 안 `studio-bg3d-obj-worker-runtime.ts:760`)
  → canonical IR → hydrator 재구성이라는 전용 파이프라인이 있고, MTL은 자체 파서를 쓴다.
- **DRACOLoader는 감사 범위에 존재하지 않는다** (0건). Draco 필수 확장은 임포트·검증·
  Unity 배경 검증 전부에서 거부 목록이다. Meshopt는 전 렌더 경로에 `setMeshoptDecoder`로
  배선돼 있고, KTX2는 조건부(자체 transcoder 경로)로 지원된다.
- **Unity 무대 배경**은 `GltfImport.Load(url)`(glTFast 6.9.0) 단일 경로이며 확장자 검사가
  없어 `.gltf` URL도 구조적으로 통과한다 (`BackgroundLoader.cs:63-65`). 성립 조건은
  의존 파일(`.bin`·텍스처)이 **원본 상대 폴더 구조 그대로** 서빙되는 것이다.
- **Unity 소품**은 런타임 파일 로딩이 없다 — 에디터에서 만든 prefab(빌드 내장) 또는
  프리미티브뿐이다 (`PropFactory.cs`, `SpaceDefinition.cs`에 모델 URL 필드 없음).
- **Unity 업로드 배경(API)**은 DB bytea 단일 파일 저장이 전제라 GLB 바이너리 검증이
  경계에 있다 (`apps/api studio-unity-background-glb.ts`). 폴더 트리를 담을 수 없어
  이 경로는 GLB 전용이 설계상 맞다.
- **인벤토리 실물** (`bundle-ingest/combined/`, 실측): glb 14,044 · gltf 3,676 ·
  fbx 14,024 · blend 45 · obj 0 · dae 0. glTF 외부 buffer 참조 3,672건 중 누락 0,
  이미지 URI 3,506개 전부 외부 파일이며 `../Textures/`·`textures/` 등 폴더 구조에 의존한다.
- **비표준 glTF 58건** (PixelDrift Metro Free, Godot 익스포터의 실수형 정수 표기)은
  Blender 파싱에 실패한 실측이 있다. glTFast·GLTFLoader 수용 여부는 미검증 — 행렬에서
  "조건부"로 표기한다.

## 2. 포맷 × 표면 능력 행렬 (확정)

표면: ① 웹 bg3d 런타임(통합 로더 경유, 신규) ② 웹 bg3d 임포트(기존 변환기)
③ Unity 무대 배경(런타임) ④ Unity 소품(에디터 prefab) ⑤ 오프라인 렌더(드로잉 소재)
⑥ character-lab(Babylon)

| 포맷 | ① 웹 런타임 | ② 웹 임포트 | ③ Unity 배경 | ④ Unity 소품 | ⑤ 오프라인 | ⑥ character-lab |
|---|---|---|---|---|---|---|
| glb | ✓ (기존 검증 경로 + 통합 로더) | ✓ 통과 | ✓ (현행) | ✓ 에디터 임포트→prefab | ✓ Blender | ✓ (LoadAssetContainerAsync 실측) |
| gltf (다파일) | ✓ 통합 로더 (GLTFLoader + 의존 파일 URL 해석) | ✓ 파싱 후 GLB화 | ✓ **조건부** — 의존 파일을 상대 구조 그대로 서빙할 때. 비표준 58건은 파싱 리스크 | ✓ 에디터 임포트 (glTFast 에디터 임포트 포함) | ✓ Blender | ✓ Babylon glTF 로더 (플러그인) |
| fbx | ✓ 통합 로더 (FBXLoader) — 신뢰 에셋(번들) 경로 한정, 워커 예산 검증 없음 | ✓ 파싱 후 GLB화 | ✗ **런타임 임포터 없음** (glTFast는 glTF 전용) | ✓ **Unity 에디터 네이티브 임포트** → prefab (정식 우회 경로) | ✓ Blender | ✗ Babylon에 FBX 로더 없음 |
| obj (+mtl) | ✓ 통합 로더 (OBJLoader+MTLLoader 직접) — 단, 사용자 업로드의 정본은 기존 Worker IR 파이프라인 유지 | ✓ Worker IR → GLB화 | ✗ ③과 동일 | ✓ 에디터 네이티브 임포트(.obj/.mtl) → prefab | ✓ Blender | △ Babylon OBJ 로더 플러그인 존재, character-lab 배선은 미확인 |
| dae | ✓ 통합 로더 (ColladaLoader) — 번들 실물 0개, 향후 소스 대비 | ✓ 파싱 후 GLB화 | ✗ | ✓ 에디터 임포트 → prefab | ✓ Blender | ✗ |
| blend | ✗ **브라우저 로더가 존재하지 않음** — source-only | ✗ (accept 목록에 없음) | ✗ | △ Unity 에디터가 Blender 설치 시 .blend를 임포트 (FBX 경유 자동 변환) — Blender 없는 환경에선 FBX/glTF 변형 사용 | ✓ Blender 원본 그대로 | ✗ |

행렬의 원칙:
- ✗인 조합은 우회 경로를 함께 확정한다: 웹·Unity 런타임에서 못 읽는 포맷은
  **에디터 임포트(Unity)·오프라인 변환(Blender)** 이 정식 경로이며, 변환은 "게이트"가
  아니라 "그 표면이 요구하는 입고 절차"로 위치가 바뀐다.
- DRACO는 이번 작업에서도 **도입하지 않는다**. 현행 거부 정책을 유지한다
  (도입 시 임포트 preflight·canonical 허용목록·렌더 로더 4곳·디코더 배포를 함께
  바꿔야 하는 별도 과제 — 웹 감사 §8-6).

## 3. 경계 — 바꾸지 않는 것

1. **bg3d 사용자 업로드의 저장·검증·admission 층**: GLB 전제(저장 타입, GLB 컨테이너
   검증기, 검증 스냅샷 렌더)는 그대로 둔다. 이 층은 예산·보안 검증이 GLB 모양으로
   짜여 있어, 원본 포맷 저장은 별도 프로젝트다. 다포맷 네이티브는 **번들/배포 에셋
   (매니페스트 v2) 소비 경로**에 먼저 입힌다.
2. **Unity 업로드 배경(API, DB bytea)**: GLB 전용 유지 (위 §1).
3. **OBJ 사용자 업로드 정본**: Worker IR 파이프라인 유지. 통합 로더의 OBJ 직접 경로는
   매니페스트로 서빙되는 신뢰 에셋 전용이다.
4. **권리 구조**: 매니페스트 v2도 `inServiceOnly:true, downloadable:false`를 강제하고,
   파서는 다운로드 필드를 가진 항목을 거부한다 (asset-delivery v1의 기존 규약 승계).

## 4. 매니페스트 v2 스키마

`kind: "toonstudio.asset-bundle.v2"`, 파일명 `manifest-v2.json`. v1(GLB 전용,
`bundle-ingest/output/manifest.json`)과 **공존**한다 — v1은 변환 자산의 정본으로 남고,
v2는 원본 포맷 자산을 기술한다. 소비자는 표면에 맞는 쪽을 고른다.

```jsonc
{
  "version": 2,
  "kind": "toonstudio.asset-bundle.v2",
  "generatedAt": "ISO-8601",
  "source": { "store": "itch.io", "bundle": "Creator Bundle: Volume 1",
              "creators": ["EmaceArt", "RG Poly"] },   // v1과 동일
  "rights": { "holder": "…", "inServiceOnly": true, "downloadable": false,
              "statement": "…" },                        // v1과 동일
  "inServiceOnly": true,
  "downloadable": false,
  "basePath": "",            // files[].path 의 기준 (매니페스트 위치 상대)
  "totals": {
    "packs": 0, "assets": 0, "files": 0, "bytes": 0,
    "byFormat": {              // 포맷별: 에셋 수, 파일 수, 의존 완결 에셋 수
      "glb":  { "assets": 0, "files": 0, "complete": 0 },
      "gltf": { "assets": 0, "files": 0, "complete": 0 },
      "fbx":  { "assets": 0, "files": 0, "complete": 0 },
      "obj":  { "assets": 0, "files": 0, "complete": 0 },
      "dae":  { "assets": 0, "files": 0, "complete": 0 },
      "blend":{ "assets": 0, "files": 0, "complete": 0 }
    },
    "runtimeUsable": 0         // role=runtime 이고 의존 완결인 에셋 수
  },
  "assets": [
    {
      "id": "cbv1-ingest-001-001-city-m001",   // v1과 같은 내부 ID 규칙
      "packId": "cbv1-ingest-001-001-city",
      "format": "gltf",                       // glb|gltf|fbx|obj|dae|blend
      "role": "runtime",                      // runtime | source-only (blend는 source-only)
      "primary": "cbv1-ingest-001-…/native/…/model.gltf",  // 매니페스트 기준 상대 경로
      "sourcePath": "001-city/…/model.gltf",  // 인제스션 입력(combined) 기준 원본 상대 경로
      "files": [
        { "path": "…/model.gltf", "kind": "primary",  "bytes": 0, "sha256": "…" },
        { "path": "…/model.bin",  "kind": "buffer",   "bytes": 0, "sha256": "…" },
        { "path": "…/tex.png",    "kind": "texture",  "bytes": 0, "sha256": "…" }
      ],
      "missingDependencies": [],              // 참조했으나 입력에 없는 상대 경로 (있으면 complete=false)
      "convertedGlb": "cbv1-ingest-001-…/….glb" | null  // 구조 대응 변환본이 있을 때만 (추측 금지)
    }
  ]
}
```

규칙:
- **상대 경로 보존**: 다파일 에셋은 입력 폴더 구조를 `native/` 아래에 그대로 복사한다
  (하드링크 우선, 실패 시 복사). `.gltf`의 `../Textures/` 같은 상위 참조가 깨지지 않게
  복사 단위는 에셋 파일이 아니라 **참조 그래프가 닿는 파일 전부**다.
- **의존 수집은 참조 기반**: gltf는 JSON의 `buffers[].uri`·`images[].uri`(data: 제외),
  obj는 `mtllib` + MTL의 `map_*` 참조를 파싱해 수집한다. 무차별 폴더 복사는 하지 않는다.
- **중복 판정은 모델 단위**: 주 파일 sha256 + 의존 파일 해시 집합으로 판정한다 (v1의
  파일 단위 해시 방식은 다파일 모델에서 깨진다 — 감사 §2.1 #13).
- **role**: glb/gltf/fbx/obj/dae = `runtime`(읽는 표면이 하나라도 있음),
  blend = `source-only`(오프라인·에디터 전용). 표면별 상세 가능 여부는 §2 행렬이 정본이다.

## 5. 구현 범위 (이번 작업)

1. **인제스션 v2** (`scripts/ingest-creator-bundle.mjs` 확장): `--manifest-v2` 모드 추가.
   GLB 복사에 더해 gltf·fbx·obj·dae·blend 원본을 1급 에셋으로 등록하고 §4 스키마의
   `manifest-v2.json` + `ingest-report-v2.json`을 별도 출력 루트에 생성한다.
   `combined/` 대상으로 실제 실행해 포맷별 집계 수치를 남긴다. v1 모드·v1 산출은 불변.
2. **웹 통합 모델 로더** (`apps/web/src/domains/creator/bg3d/studio-bg3d-model-loader.ts` 신규):
   포맷 판정 + 포맷별 three.js 로더 동적 import(GLTF/FBX/OBJ+MTL/Collada) +
   Meshopt 디코더 재사용(`loadStudioBg3dMeshoptDecoder`) + 의존 파일 URL 해석
   (LoadingManager URL modifier). 로더 팩토리 주입이 가능해 단위 테스트가 three 없이 돈다.
3. **매니페스트 v2 소비** (`apps/web/src/domains/creator/studio-bundle-manifest-v2.ts` 신규):
   v2 파서(스키마·권리 검증) + 표면별 최적 에셋 선택(웹: glb>gltf>fbx>obj>dae,
   unity-stage: glb>gltf, offline: 전 포맷) + 로드 디스크립터 생성.
4. **배선**:
   - 레거시 뷰어 `loadBg3dCustomModelFromBlob`(`studio-background-3d-model.ts:210`)를
     통합 로더 위임으로 교체 — 기존 glb/gltf/obj 동작 유지 + fbx/dae 추가.
   - 번들 환경 로더(`studio-bg3d-bundled-environment-loader.ts`)에 v2 매니페스트 기반
     다포맷 환경 로드 경로를 추가 — 기존 GLB 검증 경로는 불변, 신규 경로는 §5-3의
     디스크립터를 통합 로더로 연다.
   - 범용 모델 매니페스트(`studio-generic-3d-model-mode.ts`)의 sourceFormat 열거에
     fbx/dae/stl/ply/3ds/skp를 추가해 임포트 결과가 `glb`로 뭉개지지 않게 한다.
5. **Unity 보강** (`tools/virtual-studio-unity`):
   - `SpaceBackgroundDef`에 선택 필드 `format` 추가 (없으면 확장자로 추론),
     `BackgroundLoader`가 glb/gltf만 허용하고 그 외는 상태를 `failed`로 정산하며
     즉시 거절하게 한다 (지금은 불투명하게 실패). `.gltf` 다파일은 현행
     `GltfImport.Load(url)` 경로를 그대로 쓰며, 서빙 요건(상대 구조 보존)을 명시한다.
   - 셸 TS 스키마(`studio-unity-space.ts`)의 background 정의에 `format` 선택 필드를 맞춘다.
   - README에 **FBX/OBJ/DAE/blend 에디터 임포트 → prefab 절차**를 정식 절차로 문서화하고
     "Unity WebGL 런타임은 FBX를 읽지 못한다"는 사실을 명시한다.
6. **검증**: 신규·수정 전 파일 esbuild 통과, 신규 단위 테스트 실행 수치,
   v2 매니페스트 집계 수치(포맷별 에셋·완결·runtime 사용 가능 수)를 보고에 포함한다.
   Unity C#은 이 환경에 에디터가 없어 컴파일 미검증임을 명시한다 (PR #2346과 동일 조건).

## 6. 서빙 요건 (후속 조립 시 필수)

- 다파일 gltf를 서빙하는 경로는 파일 1개가 아니라 **폴더 트리**를 그대로 노출해야 한다
  (`.gltf`→`model/gltf+json`, `.bin`→`application/octet-stream`, 텍스처 MIME 정상 매핑).
- DB bytea 업로드 경로(Unity 배경)는 이 요건과 무관하게 GLB 전용을 유지한다.
- 정적 카탈로그 복사 절차(Unity README의 `spaces/*.glb`)는 gltf 배경을 쓸 경우
  `spaces/<name>/` 폴더 트리 복사로 확장돼야 한다 — 후속 조립에서 README와 함께 갱신한다.
