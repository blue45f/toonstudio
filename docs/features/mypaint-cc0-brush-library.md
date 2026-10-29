# CC0 MyPaint 브러시 라이브러리 (실제 libmypaint 엔진 변환)

작성 기준일: 2026-10-29 · 대상: 인스펙터 "선택 획 · 네이티브 엔진 변환"의 libmypaint 재질 "MyPaint 브러시 라이브러리"

이 문서는 mypaint/mypaint-brushes(CC0) 브러시 196종을 저장소에 고정된 libmypaint 1.6.1 WASM 으로 실제 실행하는 경로의 **현재 구현(current)**, 근거, 한계를 나눠 적는다.

## 1. 상태 요약

| 영역 | 상태 | 근거 |
| --- | --- | --- |
| 브러시 데이터 196종(`.myb` v3 설정·입력 곡선 원문, 원본별 SHA-256) | current | `apps/web/src/domains/creator/brush/mypaint-library/studio-mypaint-cc0-library-data.generated.ts` |
| 가벼운 색인(묶음 7개, 표시 이름, 빈 표면 분류, 도달 범위 상한) | current | `…/studio-mypaint-cc0-library-index.generated.ts`, `…/studio-mypaint-cc0-library-catalog.ts` |
| 생성기(개발 전용, 결정적, `--check`) | current | `scripts/generate-studio-mypaint-cc0-library.mjs` |
| `.myb` → libmypaint 문서 변환(MyPaint 앱 의미론) | current | `…/studio-mypaint-cc0-library-program.ts` |
| 작업자 지연 로드와 실행(실제 WASM, 첫 샘플 프라이밍) | current | `brush/studio-native-brush-probe.worker.ts`, `…/studio-mypaint-cc0-library-loader.ts`, `packages/studio-brush-platform/src/libmypaint.ts`(`primeAtFirstSample`) |
| 제품 진입점 | current | 인스펙터 `StudioNativeBrushDocumentInspector.tsx` → 재질 "MyPaint 브러시 라이브러리(196종)" |
| 실시간(획 그리는 중) MyPaint 칠하기, 기존 레이어 물감과의 상호작용 | 미구현 | 아래 4절 |

## 2. 무엇을 하는가

선택한 자유곡선 획의 중심선·필압·기울기·시간을 그대로 재생해, 고른 MyPaint 브러시로 다시 그린 PNG 를 문서에 추가한다(원본 획은 숨김 보존, 실행 취소 가능). 브러시의 모든 설정과 입력 곡선(필압·속도·방향·기울기·랜덤·스트로크·커스텀·그리드맵 등)은 원본 값 그대로 libmypaint 에 프로그램되고, **작업 색과 지름만** 선택 획의 값으로 바꾼다. MyPaint 에서 브러시를 고를 때 작업 색과 크기 슬라이더가 기준값을 바꾸는 것과 같다.

### 2.1 변환 규칙(무손실)

- 숫자는 JSON 원문 그대로(배정밀도 왕복 표기) 옮긴다.
- 기본 브러시(`mypaint_brush_from_defaults`)와 같은 상태가 되는 설정만 생략한다(기본값이고 곡선이 없는 설정). `opaque_multiply` 는 기본 상태에 필압 곡선이 있어 항상 싣는다.
- MyPaint 앱은 문서에 실린 설정의 곡선 전체를 바꾸므로, `opaque_multiply` 가 필압 곡선 없이 실려 있으면 빈 곡선으로 기본 곡선을 지운다(`tanda/splatter-02`, `tanda/splatter-04` 2종).
- 개발판 MyPaint 입력 이름 `surfacemap_x/y` 는 정식 이름 `gridmap_x/y` 로 옮긴다(12종). libmypaint 1.6.1 은 옛 이름을 모른다.
- 196종이 쓰는 설정 이름은 모두 libmypaint 1.6.1 의 설정 64개 안에 있다(`softness` 는 1.6.1 에 없고 어떤 브러시도 쓰지 않는다).

### 2.2 첫 샘플 프라이밍

새 브러시는 추적 커서가 (0, 0)에 있어 `slow_tracking` 이 있는 브러시는 획이 원점에서 끌려와 시작한다. MyPaint 앱은 펜이 닿기 전 호버 이벤트로 이 상태를 맞춘다. 라이브러리 브러시는 첫 샘플 위치에 필압 0, dtime 6초(libmypaint `max_dtime` 5초 초과) 이벤트를 한 번 보내 엔진이 그 위치에서 리셋하게 한다. 기존 자체 3종(잉크·워시·초크)과 패리티 랩은 이 옵션을 쓰지 않아 출력이 바이트 단위로 같다.

### 2.3 빈 표면 분류와 여백

| 분류 | 개수 | 판정(곡선을 포함한 하한) | 인스펙터 |
| --- | --- | --- | --- |
| paint | 157 | 아래 어느 것에도 해당하지 않음 | 선택 가능 |
| smudge-only | 30 | smudge ≥ 0.98 | 비활성 + 이유 |
| eraser | 8 | eraser ≥ 0.999 | 비활성 + 이유 |
| posterize | 1 | posterize ≥ 0.999 | 비활성 + 이유 |

변환 표면 여백은 기존 최소값(지름×4+4)과 브러시별 도달 범위 상한(반지름 곡선, 랜덤 반지름, 랜덤·고정 오프셋, 트래킹 노이즈, 속도 오프셋 2,000px/s 가정) 중 큰 값이다. 실제 물감이 표면 가장자리에 닿으면 기존 출력 검증이 잘림을 숨기지 않고 거부한다. 도달 범위가 큰 브러시(예: `Dieterle/Flight_Feathers` 는 실측 반지름의 215배)는 굵은 획에서 2048px 표면 한도를 넘어 계획 단계에서 명시적으로 거부된다.

## 3. 검증(2026-10-29, Node·실제 WASM)

- `apps/web/src/domains/creator/brush/mypaint-library/studio-mypaint-cc0-library.test.ts`: 데이터 무결성, 1.6.1 설정·입력 대조, 프로그램 의미론, 그리고 **196종 전부를 고정 WASM 으로 표준 S자 획에 렌더**해 미지원 설정·입력 0건, 칠하기 157종 모두 물감 생성, 표면 가장자리 접촉 0건을 확인한다. 196종 렌더 전체가 약 1초다.
- 같은 테스트가 빈 표면 분류와 실제 결과를 대조한다. 비활성 39종 중 38종은 실제로 물감이 없고, `Dieterle/Posterizer` 는 아래 4절의 이유로 일반 칠하기로 그려진다.
- `packages/studio-brush-platform/src/__tests__/libmypaint-prime.test.ts`: 프라이밍 옵션이 기본 경로를 바이트 단위로 바꾸지 않고, `slow_tracking` 브러시의 원점 잉크를 없앰을 확인한다.
- 실기기 브라우저 작업자 실행은 이 세션에서 검증하지 않았다(작업자 경로는 기존 네이티브 변환과 같은 코드를 쓴다).

## 4. 한계(정직하게 적는다)

- **레거시 획 경로**: 저장소의 WASM 브리지는 libmypaint 1.6.1 의 `mypaint_brush_stroke_to`(레거시 표면 API)를 부른다. 이 경로는 MyPaint 2.0 의 안료 혼합(`paint_mode`, 스펙트럼 WGM)과 포스터화를 실행하지 않고, 옛 dab 수 계산을 쓴다. 단색 획 하나에서는 차이가 작지만, 스머지·혼색 비중이 큰 브러시는 MyPaint 2.0 앱과 색이 다르게 섞인다. `mypaint_brush_stroke_to_2` + Surface2 로 바꾸려면 WASM 을 다시 빌드해야 하며(emcc 필요), 이 세션 환경에는 빌드 도구가 없다.
- **빈 표면**: 변환은 선택 획만 투명한 새 표면에 다시 그린다. 지우개·문지르기 전용 브러시는 섞을 물감이 없어 막았고, 칠하는 브러시의 스머지도 같은 획의 물감끼리만 섞인다. 브리지에 기존 레이어 픽셀을 올리는 API 가 없다.
- **실시간 칠하기 아님**: 그리는 동안의 미리보기는 기존 브러시이고, MyPaint 결과는 변환을 실행했을 때 PNG 로 들어온다.
- 표시 이름은 원본 파일 이름(고유명사)이라 번역하지 않는다.

## 5. 다시 만들기

```bash
git clone https://github.com/mypaint/mypaint-brushes /path/to/mypaint-brushes
node scripts/generate-studio-mypaint-cc0-library.mjs --source /path/to/mypaint-brushes
node scripts/generate-studio-mypaint-cc0-library.mjs --source /path/to/mypaint-brushes --check
```

원본 커밋은 생성 파일 머리말과 `STUDIO_MYPAINT_CC0_LIBRARY_SOURCE_COMMIT` 에 고정된다(2026-10-29 생성: `08da4a48a4b63f2e0f3303942d7c21da8479ea9f`).

## 6. 권리

mypaint-brushes 의 `Licenses.dep5` 는 `brushes/*` 와 작성자별 묶음(Ramón Miranda, Marcelo "Tanda" Cerviño, David Revoy, Guillaume Loussarévian, Brien Dieterle)을 CC0-1.0 으로 명시한다. 출처와 CC0 법률 문서 사본은 [`third_party/mypaint-brushes/`](../../third_party/mypaint-brushes/README.md)에 둔다. libmypaint 엔진 자체(ISC)의 고지는 `packages/studio-brush-platform/src/libmypaint/` 의 기존 인벤토리가 담당한다.
