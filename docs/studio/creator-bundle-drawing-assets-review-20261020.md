# Creator Bundle → 드로잉 페이지 소재 투입 검토

기준: 번들 페이지·기완료 카탈로그(`um-bundle-catalog`) 실측 + 레포 main 의 드로잉 표면 코드 실측.
원칙(사용자 확정): 모델 원본 파일은 유저에게 나가지 않고, 렌더된 결과물만 나가는 구조.

## 1. 기존 드로잉 에셋 표면 전수 (실측)

### 1-1. CC0 에셋 라이브러리 — 드로잉 소재의 정본 동선
- 패널: `apps/web/src/domains/creator/StudioCc0AssetLibraryPanel.tsx` — 종류 필터(3D 소품/2D 배경/2D 투명 소품/효과 마스크/표면 재질), 검색, 선택 시 `onUseAsset(StudioAsset)`로 캔버스에 삽입.
- 로더·모델: `apps/web/src/domains/creator/studio-cc0-asset-delivery.ts`
  - 배포 루트 `STUDIO_CC0_DELIVERY_ROOT = "/assets/studio/cc0-20260906/"`, 매니페스트(최대 4MB)를 fetch해 sha256·바이트·치수를 전수 검증한 뒤에만 삽입.
  - 종류 5종: `model | effect-mask | surface-texture | background | prop-image`.
  - 이미지 종류는 `createStudioCc0ImageRecord()`가 StudioAsset 레코드(kind "imported", rights 블록 포함)로 변환해 캔버스 레이어가 된다. `model`은 이 경로를 거부하고 GLB 가져오기 파이프라인으로 보낸다.
  - **라이선스 검증이 CC0 전용으로 고정**돼 있다: `licenseId: "CC0-1.0"` 타입 고정, CC0 deed URL 상수, 제공자 호스트 허용목록(Kenney·ambientCG·Poly Haven). 번들 에셋은 이 로더를 그대로 통과할 수 없다(§3 판정의 전제).
- 매니페스트: `apps/web/public/assets/studio/cc0-20260906/manifest.json` — 스키마 `toonstudio.asset-delivery.v1`, 에셋 1,427개. 엔트리 필드: id, name(한·영 병기), kind, category, style, selectionTerm, license{id,url,provider,sourceUrl,commercialUse,redistributionAllowed,checkedOn}, visualReviewed, studioRuntimeVerified, curationStatus, path, bytes, sha256, (이미지) width/height, (모델) geometrySha256·textureCount·technicalChecks·previewPath.
  - 종류 분포 실측: model 1,139 / effect-mask 96 / surface-texture 82 / **prop-image 71** / background 39.
  - 카테고리: nature 305, architecture 252, food 213, furniture 175, outdoor-prop 134 등 — **음식·가구가 이미 대량 수요 카테고리**다.
- 에셋별 출처 원장: 각 에셋 폴더의 `SOURCE.json` (license + download{url,resolvedUrl,bytes,sha256}).

### 1-2. prop-image — "모델 렌더 → 2D 소재" 선례 (이 검토의 핵심 근거)
CC0 매니페스트에 이미 `kind: "prop-image"`, category `rendered-prop`, style `pbr-rendered-derivative` 71개가 있다. 엔트리 관례(실측, `polyhaven-coffeecart-01-cutout`):
- id는 원본 모델 id + `-cutout`, `derivedFrom`(원본 모델 id), `sourceModelSha256`로 파생 관계를 고정.
- 산출물: 투명 WebP 1536×1536 (`renderResolution` 기록), 썸네일 384.
- technicalChecks: `source-GLB-checksum-bound`, `native-1536px-render`, `transparent-alpha`, `unclipped-silhouette`.
- contentNotice로 "3D 원본의 투명 렌더이며 별도 원본으로 집계하지 않음"을 명시.

즉 **모델을 오프라인 렌더해 투명 PNG/WebP 소재로 등록하는 파이프라인은 이 레포에 이미 존재하는 관례**이고, 번들은 같은 관례를 라이선스만 바꿔 따르면 된다.

### 1-3. 2D 장면(배경) 라이브러리
- `apps/web/src/domains/creator/studio-2d-cc0-scene-manifest.json` — 완성 이미지 배경을 2D 장면 라이브러리에 노출하는 별도 매니페스트. 필드: id, label, title, genre, src, sourceManifest(SOURCE.json 경로), width/height/bytes/sha256, tags, environment, timeOfDay, containsPeople/containsText, recommended, review{method,status,reviewedAt,notes}, provenance.
- 배경 사진(2048×1152)이 이 경로로 들어간다. 환경 렌더 완성본의 진입로가 이미 있다.

### 1-4. 레퍼런스 보드 (서브뷰 계열)
- `apps/web/src/domains/creator/StudioReferencePanel.tsx` + `studio-reference-board.ts` + `studio-reference-color-sampler.ts` — 보드 아이템은 StudioAsset 레코드 기반(업로드·라이브러리 에셋 공통), 팔레트 추출·스포이드·배치/회전/줌을 지원. 이미지 에셋으로 삽입된 것은 무엇이든 보드에 올릴 수 있는 구조다.

### 1-5. 비교 검수 소스 풀
- `apps/web/src/domains/creator/production-hub/compare-review-model.ts`·`CompareSourcePoolStrip.tsx`·`compare-review-seed-pool.ts` — 소스 풀은 이미지(내부 리비전·외부 파일/URL·레퍼런스 보드)를 모은다. 드로잉 페이지 본체가 아니라 제작 허브 검수 표면이지만, 렌더 이미지는 일반 이미지 소스로 들어갈 수 있다.

### 1-6. 패턴 채우기
- `apps/web/src/domains/creator/studio-pattern-fill.ts` + `StudioPatternFillPanel.tsx` — 패턴 카탈로그가 **코드 내 SVG 타일 문자열**로 정의되고 스펙은 patternId로 직렬화된다. 엔진은 로드된 타일 이미지를 Konva fillPatternImage로 반복할 수 있으나, 카탈로그 자체는 매니페스트 구동이 아니다.

### 1-7. 브러시 팁·재료 브러시
- 브러시 팁: `apps/web/src/domains/creator/brush/studio-brush-tip-stamp.ts`(알파 맵), `studio-brush-textured-stamp.ts`(풀해상도 알파 팁 래스터 캐시). 팁 이미지가 들어가는 경로는 실재한다 — 선례 `studio-cc0-krita-rgba-tip-import-v1.ts`는 외부 팁 이미지를 알파 맵으로 환원(감축 공식 문서화)해 등록했다.
- 재료 브러시: `apps/web/src/domains/creator/brush/studio-material-brush-catalog.ts` — "original material catalogue"로, 팁이 절차적 커널 프로그램(capillary-dendrite 등)이다. 외부 텍스처 이미지를 꽂는 자리가 카탈로그에 없다.

### 1-8. 라인 추출 (스타일 통일 장치)
- `apps/web/src/domains/creator/scene-3d/studio-3d-line-art-extractor.ts` — 3D 렌더 버퍼(RGB/Depth/Normal/ObjectID)에서 Sobel·Canny·DoG/XDoG·법선/깊이 불연속으로 툰 선화와 스크린톤을 추출하는 엔진. bg3d 파이프라인의 통일 장치이며, 오프라인 렌더 단계에서 동일 패스를 뽑으면 스탬프용 라인 변형본을 만들 수 있는 근거가 된다.

## 2. 번들 → 표면 매핑

| 번들 구성 (카탈로그 ID) | 표면 | 형태 | 판정 |
|---|---|---|---|
| 음식 팩 `cbv1-045-low-poly-food-packaging` (EmaceArt) | CC0 패널과 같은 에셋 라이브러리 | 모델 렌더 투명 소품(prop-image 관례) | **가능 (P1)** |
| 주방·가구 `cbv1-042-kitchen-restaurant-megapack` (RG Poly), Slavica·Cartoon City 소품군 | 에셋 라이브러리 | 투명 소품 렌더 | **가능 (P1)** |
| 자연물 `cbv1-028-lumagrove…`, `cbv1-030-nature-megapack-extended` | 에셋 라이브러리 | 투명 소품 렌더 (나무·바위·덤불) | **가능 (P1)** |
| 환경 팩 전반 (도시·중세·SF·늪 등) | 2D 장면 라이브러리 | 완성 배경 렌더 (scene manifest 관례) | **가능 (P2)** |
| 캐릭터 팩 (Cartoon Characters·Villagers·Citizens) | 레퍼런스 보드 | 포즈·의상 레퍼런스 렌더 | **가능 (P3)** |
| 환경 팩 전반 | 비교 검수 소스 풀 | 검수 레퍼런스 이미지 소스 | 가능 (P3, 허브 표면) |
| Plasticine 머티리얼 `cbv1-048`·`cbv1-072` | (직접 표면 없음) | 오프라인 렌더의 통일 재질로 사용 | **가능 (간접)** |
| 텍스처 원본 PNG 그 자체 | 패턴 채우기·표면 재질 | 원본 파일 서빙 | **불가** |
| 텍스처에서 환원한 알파 팁 | 브러시 팁 | 렌더/환원 파생 알파 맵 | 조건부 (P4) |
| 텍스처 기반 래스터 패턴 | 패턴 채우기 | 신규 패턴 종류(코드 카탈로그 확장) | 조건부 (P4) |
| 재료 브러시 카탈로그 | 재료 브러시 | 절차적 커널 전용 | **불가 (직접)** |

### 판정 근거 (핵심만)
- **소품 렌더 스탬프 (가능)**: prop-image 관례가 이미 있고(§1-2), 번들 소품군은 CC0 카탈로그의 상위 카테고리(food 213·furniture 175·nature 305)와 정확히 겹친다. 유저 동선·검증(sha256/치수/투명 알파)·큐레이션 상태값까지 재사용할 수 있다. 단, 로더가 CC0 고정이라 신규 배포 모듈이 필요하다(§3).
- **배경 렌더 (가능)**: 2D 장면 매니페스트 관례(§1-3)가 진입로다. bg3d와의 경계 — bg3d는 유저가 각도·배치를 조작하는 인터랙티브 3D 합성이고, 여기는 **완성 렌더를 평면 배경으로 깔고 그 위에 그리는** 동선이라 중복이 아니다. 오히려 bg3d를 열기 부담스러운 컷의 빠른 배경으로 상호 보완이다.
- **레퍼런스 렌더 (가능)**: 레퍼런스 보드는 StudioAsset이면 무엇이든 받는다(§1-4). 캐릭터 팩은 아바타·군중 검토와 별개로, 포즈/의상 레퍼런스 렌더가 드로잉 페이지에서 가장 마찰 없는 투입이다.
- **텍스처 원본 (불가)**: EmaceArt 상세 라이선스가 재판매·재배포·공유를 금지하는 대상에 소스 파일을 명시하고, 사용자 원칙도 "렌더 결과물만 나간다"이다. 텍스처 PNG를 패턴/표면 재질로 그대로 서빙하면 원본 파일이 브라우저로 나간다. CC0 팩의 surface-texture 종류를 번들에 그대로 적용할 수 없는 이유다.
- **Plasticine (간접 가능)**: 텍스처 파일 자체가 아니라, 오프라인 렌더에서 번들 모델에 이 재질을 입혀 렌더하면 결과물은 렌더 이미지다. 로우폴리 소품들을 "점토 질감" 하나의 룩으로 통일하는 장치가 되며, §4의 스타일 문제에 대한 답이기도 하다.
- **브러시 팁 (조건부)**: 팁은 알파 맵이라는 파생 형태이고 Krita 팁 환원 선례가 있다. 다만 원본 텍스처를 잘라 그대로 팁으로 쓰면 사실상 원본 파일 배포와 다를 바 없어, **모델 렌더에서 파생된 알파 맵**으로 한정해야 한다.
- **패턴 (조건부)**: fillPatternImage 경로는 있으나 카탈로그가 코드 내 SVG라, 래스터 패턴은 신규 패턴 종류를 코드로 추가하는 작업이 선행돼야 한다. 우선순위는 낮다.
- **재료 브러시 (불가, 직접)**: 카탈로그가 절차적 커널 정의라 외부 텍스처를 꽂을 자리가 없다. 번들 텍스처를 재료로 쓰는 길은 오프라인 렌더(Plasticine 경로)뿐이다.

## 3. 파이프라인 설계

### 단계 0 — 인제스션 (기존, 완료분)
`scripts/ingest-creator-bundle.mjs`가 번들 원본 → 내부 ID GLB + manifest(rights·inServiceOnly·downloadable:false)를 만든다. 드로잉 소재 파이프라인은 이 산출(GLB)을 입력으로 삼는 **후단 단계**로 붙는다. FBX/blend만 있는 팩은 Blender 변환이 선행돼야 한다(인제스션의 기존 전제와 동일).

### 단계 1 — 오프라인 렌더 (신규 스크립트 제안: `scripts/render-creator-bundle-assets.mjs`, Blender 헤드리스)
- 대상 선별: 카탈로그에서 role이 prop인 팩의 모델부터. scene(환경)은 배경 렌더 대상으로 별도 선별.
- 프리셋 고정: 카메라 3/4 뷰 기본 + 정면 변형, 조명 HDRI 고정 1종, 배경 투명.
- 스타일 변형 2종을 동시 산출: (a) 컬러 렌더 — Plasticine 재질 오버라이드 옵션으로 룩 통일, (b) 라인 변형 — Depth/Normal 패스를 함께 렌더해 선화 추출(§1-8의 알고리즘 계열) 후 라인+플랫톤 합성본.
- 산출 규격은 CC0 prop-image 관례와 동일: 본 이미지 투명 WebP 1536×1536, 썸네일 384, 배경 렌더는 2048×1152(scene 관례).
- 소품별 메타(원본 모델 해시)를 기록해 매니페스트의 derivedFrom·sourceModelSha256을 채운다.

### 단계 2 — 매니페스트 생성 (asset-delivery.v1 호환 확장)
- 신규 팩 루트: `apps/web/public/assets/studio/bundle-renders-v1/` (초안: 이 폴더의 `apps/web/public/assets/studio/bundle-renders-v1/manifest.json`).
- CC0 스키마 필드를 그대로 쓰되 license 블록만 확장: id는 실제 라이선스 식별자(예 `EmaceArt-Asset-License`), `redistributionAllowed: false`, `inServiceOnly: true`를 명시. kind 값은 기존 5종 중 prop-image·background만 쓴다(surface-texture·model은 이 팩에서 쓰지 않음 — 원본 파일이 나가는 종류라 제외).
- CC0 팩과 달리 **다운로드용 index.html을 만들지 않는다.** CC0 팩 README의 "index.html에서 검색·다운로드" 패턴은 재배포 허용 라이선스 전용이다.

### 단계 3 — 등록·노출 (신규 delivery 모듈)
- `studio-cc0-asset-delivery.ts`를 복제하지 말고, 라이선스 검증을 일반화한 신규 모듈(가칭 `studio-bundle-asset-delivery.ts`)이 bundle-renders-v1 매니페스트를 같은 검증 강도(sha256·바이트·치수·무결성)로 로드한다. 삽입 산출은 동일한 StudioAsset 레코드 형태(rights에 실제 라이선스 표기)라, 캔버스·레퍼런스 보드·소스 풀이 그대로 소비한다.
- 패널 노출은 통합 에셋 팝오버(`StudioAssetToolPopoverWorkspace` → `StudioUnifiedAssetToolPopoverContent`)에 소스 탭을 추가하는 형태가 기존 동선과 가장 잘 맞고, CC0 패널과 나란히 "번들 렌더 소품"으로 구분 표기한다(권리 표기 분리 유지).

### 단계 4 — 검수 게이트
CC0 관례의 상태값을 그대로 적용: visualReviewed(컨택트시트 검수) 전에는 curationStatus를 `pending-render-review`로 두고 노출 대상에서 제외, studioRuntimeVerified는 실제 삽입 라운드트립 확인 후 승격.

## 4. 해상도·스타일 통일성 (판정 시 고려한 실측 근거)
- 해상도: CC0 렌더 소품 규격이 1536²이다. 번들 모델은 로우폴리+공용 아틀라스(예: Cartoon City는 1024 아틀라스 중심)라 1536 렌더에서 질감이 부드럽게 뭉개지는 것은 피할 수 없다. 단 이건 결격이 아니다 — CC0 라이브러리 자체가 style `stylized-low-poly` 998개를 이미 포함하고 패널에 스타일 필터가 있어, **스타일을 숨기지 않고 라벨로 구분하는 것이 이 레포의 기존 해법**이다. 번들 렌더는 style `stylized-low-poly` + 파생 표기로 등록한다.
- 스타일 이질감: 컬러 렌더를 그대로 2D 작화 위에 얹으면 이질감이 가장 크다. 완화책 3단: (1) Plasticine 재질 오버라이드로 소품군 내부 룩 통일, (2) 라인 변형본을 기본 노출로 하고 컬러본은 변형으로, (3) 배경 렌더는 "레퍼런스/밑그림" 포지션(장면 매니페스트의 review 표기처럼 용도를 명시)으로 먼저 내고 완성 배경 포지션은 검수 후 승격.

## 5. 우선순위 제안
- **P1. 소품 투명 렌더 스탬프** — 음식(cbv1-045) → 주방·가구(cbv1-042) → 자연물(cbv1-028·030) 순. 기존 수요 카테고리·동선·검증 체계가 전부 갖춰진 유일한 즉시 투입 경로.
- **P2. 환경 배경 렌더** — 2D 장면 매니페스트 경로. bg3d와 역할이 갈리는 지점(평면 완성 배경)만 담당.
- **P3. 캐릭터·환경 레퍼런스 렌더** — 레퍼런스 보드 투입. 캐릭터 쪽 검토(아바타·군중)와 렌더 자산을 공유한다.
- **P4. 팁 파생·래스터 패턴** — 조건부. 파생 경계(렌더 파생 한정)를 코드 리뷰로 확정한 뒤.
- **제외 확정**: 텍스처 원본 서빙(surface-texture 방식), 재료 브러시 직접 투입, 모델 파일의 드로잉 페이지 직접 가져오기(model 종류는 기존에도 3D 파이프라인 소관).
