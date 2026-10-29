# 필터 갤러리 (효과 스택)

작성 기준일: 2026-10-29 · 대상: 상단 메뉴 **필터 ▸ 필터 갤러리…**

이 문서는 효과를 여러 겹 쌓아 비파괴로 적용하는 필터 갤러리의 **현재 구현(current)**, 저장 형식, 실행 경로, 효과 목록, 한계를 적는다. 분석·내재화 경위는 [`reports/brush-filter-rea-internalization-2026-10-29.md`](../reports/brush-filter-rea-internalization-2026-10-29.md)에 있다.

## 1. 상태 요약

| 영역 | 상태 | 근거 |
| --- | --- | --- |
| 메뉴 행·명령(`filter.filter-gallery`)·75개 언어 문구 | current | `studio-main-menu-items-filter.ts`, `studio-command-catalog.ts`, `apps/web/public/i18n/studio/**` |
| 대화상자(분류·검색, 최대 8겹, 겹별 표시·순서·불투명도·매개변수, 무늬 바꾸기, 선택 안/밖 적용) | current | `filter/gallery/StudioFilterGalleryDialog.tsx`(지연 로드 `studio-filter-gallery-lazy.ts`) |
| 저장 형식 `filterGallery`(효과 id·매개변수만) | current | `filter/gallery/studio-filter-gallery-types.ts`, `render/studio-konva-filter-fields.ts` |
| 정규화·예산·실행 | current | `filter/gallery/studio-filter-gallery-registry.ts`, `…-engine.ts` |
| Konva 캐시 필터·이미지 필터 Worker 실행 | current | `render/studio-konva-filters.ts`(`F.FilterGallery`), `studio-image-filter-worker-client.ts` |
| 효과 커널 | current | `filter/gallery/studio-filter-gallery-*.ts` 계열 파일(3절) |
| 겹별 썸네일 미리보기, 사용자 프리셋 저장, 보정 레이어(smart filter) 스택 편입 | 미구현 | 5절 |

## 2. 동작

- **열기**
  - 필터 ▸ 필터 갤러리…는 다른 필터와 같은 세션(`openStudioFilter("filter-gallery")`)으로 열린다.
  - 대상 규칙은 단일 필터와 같다: 선택 이미지, 선택 레이어 또는 현재 페이지 합성, 선택 영역 안/밖.
  - 세션 대화상자는 종류가 `filter-gallery`일 때만 갤러리 대화상자를 띄운다.
- **쌓기**
  - 왼쪽 목록에서 효과를 누르면 스택 맨 아래에 기본값으로 더해진다.
  - 스택은 위에서 아래 순서로 적용된다.
  - 겹마다 켜기·끄기, 위·아래 이동, 빼기, 불투명도(0~100%), 매개변수를 고친다.
  - "무늬 바꾸기"는 스택 시드를 바꿔 무작위 무늬가 있는 효과의 결과를 다시 뽑는다.
- **미리보기**
  - 값이 바뀔 때마다 `{ filterGallery }` 패치로 캔버스에 바로 그린다.
  - 실제 필터 엔진이 같은 커널을 실행하므로, 미리보기와 적용 결과가 같다.
- **적용**
  - 이미지 대상은 요소에 `filterGallery` 필드를 저장한다(비파괴). 다시 열면 겹마다 고칠 수 있다.
  - 효과를 모두 빼고 적용하면 필드를 지운다.
  - 페이지 합성 대상은 다른 필터처럼 원본을 보존한 새 래스터 레이어로 굽는다.

## 3. 저장 형식과 실행 경로

```ts
interface StudioFilterGalleryStack {
  version: 1;          // 모르는 버전이면 실행하지 않는다
  seed: number;        // 32비트 부호 없는 정수. 겹마다 순번과 섞어 효과 시드를 만든다
  entries: {
    id: string;        // "분류.이름" (예: "artistic.dry-brush"). 문서에 저장되므로 바꾸지 않는다
    params: Record<string, number | string | boolean>;
    opacity?: number;  // 0~1, 생략하면 1
    enabled?: boolean; // false 면 건너뛴다
  }[];                 // 최대 8개
}
```

- **즉시 로드 경로**: `render/studio-konva-filter-fields.ts`는 type-only import만 둔다(모듈 경계 시험이 고정). 그래서 활성 여부는 이 파일 안의 가벼운 후보 판정(`hasActiveStudioFilterGalleryCandidate`)으로 보고, 캐시 키에 스택 전체를 넣는다.
- **정규화**: 필터 엔진 청크에 있는 등록부가 스택을 다시 정규화한다.
  - 모르는 id는 버린다.
  - 숫자는 스펙의 범위·간격에 맞춘다.
  - 선택값·색·토글은 형식을 확인한다.
  - 9번째 겹부터는 버린다.
- **실행**
  - Konva attrs에는 숫자·문자열만 실을 수 있어서 정규화된 스택을 JSON 문자열 하나(`attrs.filterGallery`)로 넘긴다. 같은 문자열은 다시 파싱하지 않는다.
  - 체인 위치는 비네트 뒤, 외곽선·테두리 앞이다.
- **예산**
  - 효과마다 픽셀당 상대 작업량 `cost`가 있다.
  - 픽셀 수 × 켜진 겹의 cost 합이 `STUDIO_FILTER_GALLERY_DIRECT_BUDGET`(1024²×6)을 넘으면 이미지 필터 Worker 경로를 쓴다.
  - `STUDIO_FILTER_GALLERY_WORK_BUDGET`(4096²×24)을 넘으면 픽셀을 전혀 바꾸지 않는다. 부분 적용으로 결과가 뒤바뀌지 않게 하기 위해서다.
- **결정성**
  - 커널은 `Math.random`·시계를 쓰지 않는다. 모든 무작위성은 시드를 섞은 정수 해시다.
  - 그래서 같은 문서는 어느 기기, 어느 경로(Konva·Worker)에서 그려도 같은 픽셀이 된다.

## 4. 효과 목록

효과 목록은 `filter/gallery/studio-filter-gallery-registry.ts`의 `STUDIO_FILTER_GALLERY_EFFECTS`가 정본이다. 아래 표는 그 목록에서 생성했다.

"기능 대응"은 같은 기능을 가진 프로그램의 공개 메뉴 이름이다. **코드 출처가 아니다.** 모든 커널은 공개 알고리즘(논문)과 기능 설명만으로 새로 구현했다.

<!-- gallery-table:start -->
총 16종 · 노이즈 4 · 흐림 2 · 색 10

### 노이즈 (`noise`)

| id | 이름 | 하는 일 | 기능 대응(공개 메뉴 이름) | 매개변수 | cost |
| --- | --- | --- | --- | --- | ---: |
| `noise.hurl` | 던지기 | 고른 비율만큼의 픽셀을 완전히 무작위한 색으로 바꿉니다. | GIMP · 던지기(Hurl) | 무작위 비율, 반복 | 1 |
| `noise.pick` | 고르기 | 고른 비율만큼의 픽셀을 바로 옆 3×3 이웃 가운데 무작위로 고른 픽셀로 바꿉니다. | GIMP · 고르기(Pick) | 무작위 비율, 반복 | 1 |
| `noise.slur` | 흘러내림 | 고른 픽셀이 바로 위(가끔 위 대각선) 픽셀을 이어받아 그림이 아래로 녹아 흐르는 듯 보이게 합니다. | GIMP · 흘러내림(Slur) | 무작위 비율, 반복 | 1 |
| `noise.hsv-noise` | HSV 노이즈 | 색상·채도·명도를 따로 정한 폭 안에서 무작위로 흔들어 색 얼룩 같은 노이즈를 만듭니다. | GIMP · HSV 노이즈 | 고정도, 색상 폭, 채도 폭, 명도 폭 | 0.8 |

### 흐림 (`blur`)

| id | 이름 | 하는 일 | 기능 대응(공개 메뉴 이름) | 매개변수 | cost |
| --- | --- | --- | --- | --- | ---: |
| `blur.symmetric-nearest-neighbor` | 대칭 최근접 이웃 | 중심을 사이에 둔 픽셀 쌍마다 중심 색에 더 가까운 쪽만 평균해 경계를 지키며 잡티를 고릅니다. | GIMP · 대칭 최근접 이웃 | 반경 | 10 |
| `blur.mean-curvature` | 평균 곡률 흐림 | 등고선의 곡률을 따라서만 번지게 해 모서리는 살리고 잔 요철과 계단을 둥글게 다듬습니다. | GIMP · 평균 곡률 흐림 | 반복 | 30 |

### 색 (`color`)

| id | 이름 | 하는 일 | 기능 대응(공개 메뉴 이름) | 매개변수 | cost |
| --- | --- | --- | --- | --- | ---: |
| `color.error-diffusion-dither` | 오차 확산 디더 | 적은 색으로 줄이면서 남는 오차를 이웃 픽셀로 퍼뜨려 점묘 같은 계조를 만듭니다. | Paint.NET · 디더링<br>GIMP · 디더<br>Krita · 디더<br>Photoshop · 인덱스 색상(확산 디더) | 알고리즘, 팔레트, 채널 단계 수, 지그재그 훑기 | 3 |
| `color.quantize` | 색 줄이기 | 그림에서 대표 색을 뽑아 지정한 색 수의 팔레트로 다시 칠합니다. | Paint.NET · 양자화<br>Krita · 팔레트화<br>Photoshop · 인덱스 색상<br>GIMP · 인덱스 모드 변환 | 색 수, 오차 확산 | 4 |
| `color.channel-extreme` | 채널 최대화 / 최소화 | 픽셀마다 가장 큰(또는 가장 작은) 채널만 남기고 나머지 채널을 0으로 만듭니다. | Krita · 채널 최대화<br>Krita · 채널 최소화<br>GIMP · 최대 RGB | 방식 | 0.2 |
| `color.slope-offset-power` | 기울기·오프셋·거듭제곱 | 영상 색보정의 ASC CDL 식(입력×기울기+오프셋)^거듭제곱과 채도로 톤을 다듬습니다. | Krita · 기울기·오프셋·거듭제곱<br>ASC CDL · 색 결정 목록 | 기울기, 오프셋, 거듭제곱, 채도 | 0.3 |
| `color.color-splash` | 컬러 스플래시 | 고른 색상 범위만 원래 색으로 남기고 나머지를 흑백으로 바꿉니다. | 사진 앱 공통 · 컬러 스플래시 | 남길 색상, 범위, 경계 부드럽게, 최소 채도 | 0.6 |
| `color.split-toning` | 분할 토닝 | 어두운 영역과 밝은 영역에 서로 다른 색조를 입히되 밝기는 그대로 둡니다. | Lightroom · 분할 토닝 | 밝은 영역 색상, 밝은 영역 채도, 어두운 영역 색상, 어두운 영역 채도, 균형 | 0.5 |
| `color.adaptive-threshold` | 적응형 임계값 | 주변 평균보다 어두운 픽셀만 잉크로 남겨 조명이 고르지 않은 스캔 선화도 깨끗한 흑백으로 바꿉니다(종이 투명을 켜면 알파가 바뀝니다). | OpenCV · 적응형 임계값<br>ImageJ · 국소 자동 임계값<br>Clip Studio Paint · 선화 추출(작업 흐름) | 주변 반경, 민감도, 주변 평균, 잉크 색, 종이를 투명하게 | 2 |
| `color.dodge-burn` | 닷지 / 번 | 어두운·중간·밝은 영역 중 고른 톤만 밝게(닷지) 하거나 어둡게(번) 합니다. | Krita · 닷지 필터<br>Krita · 번 필터<br>Photoshop · 닷지/번 범위 | 방식, 범위, 노출 | 0.3 |
| `color.value-invert` | 명도 반전 | 색상과 채도는 그대로 두고 명도(HSV의 V)만 뒤집습니다. | GIMP · 명도 반전 | 없음 | 0.2 |
| `color.retinex` | 레티넥스 | 여러 크기의 주변 밝기로 나눠 그늘진 곳의 디테일과 색을 살리는 다중 척도 레티넥스 보정입니다. | GIMP · 레티넥스 | 척도 분포, 최대 반경, 척도 수, 동적 범위 | 24 |
<!-- gallery-table:end -->

## 5. 한계와 다음 차례

- 원작과 픽셀 단위로 같지 않다. 원작 코드·텍스처 이미지·프리셋을 쓰지 않았기 때문이다(캔버스·삼베·사암·벽돌·리넨·종이 재질도 절차적으로 새로 만들었다).
- 크기 매개변수는 이미지 픽셀 단위다. 축소한 미리보기 캐시와 원본 해상도에서 같은 값의 모양이 조금 다를 수 있다.
- 미구현:
  - 겹별 썸네일 미리보기
  - 사용자 프리셋 저장·공유
  - 보정 레이어(smart filter) 스택 편입
  - 효과별 GPU 경로
- 실브라우저 시각 확인을 하지 않았다(jsdom 대화상자 시험과 Node 픽셀 시험만 했다).

## 6. 검증

```bash
pnpm exec vitest run apps/web/src/domains/creator/filter/gallery
```

```bash
pnpm exec vitest run apps/web/src/domains/creator/studio-main-menu-items-filter.test.ts apps/web/src/domains/creator/studio-main-menu-group-spec.test.ts apps/web/src/domains/creator/render/studio-konva-filter-module-boundary.test.ts
```

- 계열마다 효과별로 다음을 시험한다.
  - 결정성(같은 입력·시드 → 같은 바이트)
  - 기본값의 가시적 변화
  - 1×1·3×2 이미지에서 던지지 않음
  - 알파 보존(형상 효과는 문서화된 예외)
  - 매개변수 양 끝에서 던지지 않음
  - 효과별 의미 시험(예: 흑백 디더는 흑·백만 남김, 미러는 좌우 대칭)
- 등록부·엔진 시험은 정규화, 순서, 불투명도 혼합, 예산 거절, Konva attrs 경로, Worker 경로 판단을 고정한다.
