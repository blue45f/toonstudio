# Aseprite 스프라이트 읽기 코덱 (공개 명세 기반) (2026-10-29)

- **상태**: `current` — 구현, 합성 단위 테스트 103종, 변이 시험 50종, 실제 Aseprite 파일 16개에 대한 독립 해석기 대조까지 완료. 검증 범위는 3절에 구분해 적었다.
- **작성일**: 2026-10-29
- **구현 모듈**: [`aseprite-sprite.ts`](../../packages/studio-format-gateway/src/aseprite-sprite.ts)(가져오기 본체), [`aseprite-sprite-cursor.ts`](../../packages/studio-format-gateway/src/aseprite-sprite-cursor.ts)(커서·오류·한도), [`aseprite-sprite-chunks.ts`](../../packages/studio-format-gateway/src/aseprite-sprite-chunks.ts)(청크 디코더), [`aseprite-sprite-pixels.ts`](../../packages/studio-format-gateway/src/aseprite-sprite-pixels.ts)(zlib 해제·RGBA8 변환), [`aseprite-sprite-model.ts`](../../packages/studio-format-gateway/src/aseprite-sprite-model.ts)(레이어 트리·셀 검증·팔레트 시점), [`aseprite-sprite-types.ts`](../../packages/studio-format-gateway/src/aseprite-sprite-types.ts)(공개 타입)
- **테스트**: [`aseprite-sprite.test.ts`](../../packages/studio-format-gateway/src/__tests__/aseprite-sprite.test.ts) 34, [`aseprite-sprite-cels.test.ts`](../../packages/studio-format-gateway/src/__tests__/aseprite-sprite-cels.test.ts) 28, [`aseprite-sprite-recovery.test.ts`](../../packages/studio-format-gateway/src/__tests__/aseprite-sprite-recovery.test.ts) 9, [`aseprite-sprite-metadata.test.ts`](../../packages/studio-format-gateway/src/__tests__/aseprite-sprite-metadata.test.ts) 32. 합성 빌더는 [`aseprite-fixtures.ts`](../../tests/corpus/formats/aseprite-fixtures.ts), 로컬 실샘플 검사는 [`local-samples-corpus.test.ts`](../../tests/format-gateway/local-samples-corpus.test.ts)
- **관련 문서**: [XCF 읽기 코덱](xcf-reader-public-spec-2026-10-29.md)(같은 방식의 선행 사례)

---

## 1. 목적

창작자가 보유한 Aseprite 문서(`.aseprite`/`.ase`)를 ToonStudio로 가져와 프레임, 레이어 트리, 셀 픽셀, 팔레트, 태그,
슬라이스, 타일셋, 사용자 데이터를 읽을 수 있게 한다. 범위는 **읽기**이며 쓰기는 하지 않는다. 프레임 합성, 블렌드 모드
계산, 색 프로파일 적용, 타일맵 래스터화도 하지 않는다. 불투명도와 블렌드 모드는 파일에 적힌 값과 그 값이 유효한지
(헤더 플래그에 따라)만 돌려준다.

---

## 2. 출처와 이용 조건

| 자료 | 이용 조건 | 사용 방식 |
| --- | --- | --- |
| Aseprite 파일 포맷 문서(`docs/ase-file-specs.md`, 고정 커밋 `24086ec0`) | 문서에 라이선스 표기가 없다. 같은 저장소의 소스·바이너리는 별도 EULA 아래에 있다. | 필드 크기와 상수 같은 **사실만** 자체 표현으로 구현했다. 문서의 문구·표를 복사하지 않았다. |
| Aseprite 애플리케이션 소스 | EULA | **읽지 않았다.** |
| 공개 파서(Rust `asefile` 0.3.8·`aseprite-loader` 0.4.2, npm `ase-parser` 0.0.19 등) | 각 저장소 라이선스 | 코드를 복사하지 않았고 실행하지도 않았다. 패키지에 들어 있는 `.aseprite` **데이터 파일**만 검증 표본으로 읽었다. |

문서 자체의 이용 조건을 확인하지 못했다. "사실만 자체 표현으로 옮긴다"는 운용이 충분한지는 앱에 연결하기 전에 소유자·법무가
확인하는 것이 바람직하며, 이 문서는 법적 결론이 아니다.

**실표본의 출처**: 검증에 쓴 파일 16개는 위 패키지의 테스트 데이터다. 패키지 루트의 라이선스는 확인했지만 개별 파일의
저작권·재배포 허용은 확인하지 못했다. 그래서 **저장소에 커밋하지 않고** Git이 무시하는 로컬 디렉터리
(`tests/corpus/formats/local-samples/`)에서만 쓴다.

**이름 주의**: `ase-csh.ts`는 Adobe Swatch Exchange(`.ase`)를 구현한다. 두 형식이 확장자를 공유하므로 확장자로 판별하지
않고 파일 맨 앞의 서명으로 가른다. Aseprite는 오프셋 4의 WORD `0xA5E0`, Adobe는 ASCII `ASEF`이며
`inspectAsepriteSignature`가 `"aseprite" | "adobe-swatch-exchange" | "unknown"`을 돌려준다.

---

## 3. 근거 수준

### 3.1 실제 Aseprite 파일로 검증한 것

SHA-256으로 중복을 걸러 낸 실제 파일 16개: 색 깊이 RGBA 9개·회색 1개·인덱스드 6개, 프레임 1~8개, 레이어 1~6개(그룹 1개),
캔버스 16x16~256x256. 청크 개수는 리더와 무관한 바이트 순회(`chunk_hist.py`)로 센 값이다.

| 항목 | 실파일에서 본 것 |
| --- | --- |
| 셀 | 65개: 압축 이미지 57, 링크 7, 압축 타일맵 1. **원시(비압축) 셀은 하나도 없었다.** |
| 팔레트 | 구 팔레트(0x0004) 16개 파일 전부, 새 팔레트(0x2019) 9개 파일. 새 팔레트가 없는 인덱스드 파일 2개는 구 팔레트로만 읽었다. |
| 색 프로파일(0x2007) | 16개 전부 sRGB |
| 태그(0x2018) / 슬라이스(0x2022) / 타일셋(0x2023) | 5개 파일 / 1개 파일 / 청크 2개(1개 파일) |
| 사용자 데이터(0x2020) | 청크 16개(3개 파일), 플래그는 텍스트·색 조합뿐이다(속성 맵 없음). |
| 헤더 플래그 | 16개 모두 1(레이어 불투명도 유효). 플래그 2·4는 없었다. |

| 검증 | 결과 |
| --- | --- |
| 전 파일 가져오기 | 16개 모두 `truncated: false`, `warnings`·`unsupported` 0건 |
| 구조 필드: 프레임(지속시간·청크 수), 레이어(이름·종류·레벨·블렌드·불투명도·플래그), 셀(레이어·위치·불투명도·z·종류·크기·링크 프레임), 태그, 슬라이스(이름·키 수), 타일셋(ID·타일 수·크기·이름) | 표준 라이브러리만 쓰는 독립 구조 해석기(`ase_check.py`, 공개 명세 텍스트만 보고 작성)와 필드 단위로 **전부 일치**: 프레임 36, 레이어 32, 셀 65, 태그 11, 슬라이스 1, 타일셋 2 |
| 사용자 데이터 청크 16개의 귀속 대상(스프라이트·레이어·셀·태그·슬라이스)별 개수 | 명세 서술을 파이썬으로 다시 구현한 재생과 **일치** |
| 셀 65개·타일셋 2개의 해제 후 바이트 | 표준 `zlib`로 직접 푼 바이트의 SHA-256과 **전부 일치** |
| 최종 시점 팔레트 1,222항목(구 팔레트 포함) | 독립 해석기와 **전부 일치** |
| 링크 셀 | 7개 모두 앞 프레임의 실제 셀로 이어진다. |
| 인덱스드 셀 | 모든 인덱스가 팔레트 범위 안이다(`outOfRangePaletteIndexCount` 0). |

독립 해석기는 검증 중에 쓴 임시 스크립트이며 저장소에 넣지 않았다. 저장소에는 같은 불변식을 확인하는 로컬 코퍼스
테스트가 있다(`.aseprite`를 로컬 디렉터리에 두고 `pnpm exec vitest run tests/format-gateway/local-samples-corpus.test.ts`).
앱 렌더 결과(Aseprite 실행 파일이나 CLI)와는 대조하지 못했다. 그래서 **RGBA 변환이 Aseprite가 보여 주는 색과 같다는
보증은 없다.** 대조한 것은 압축을 푼 원시 바이트까지다.

### 3.2 합성 테스트로만 확인한 것

실파일에 한 번도 나오지 않은 경로다: 원시 셀(타입 0), 셀 엑스트라(0x2006), 외부 파일 목록(0x2008), ICC·없음 색 프로파일,
6비트 구 팔레트(0x0011), 폐기된 마스크·경로 청크(0x2016·0x2017), 사용자 데이터 속성 맵(플래그 4)과 속성 타입 전체,
레이어 UUID(헤더 플래그 4), 그룹 불투명도·블렌드 유효 플래그(헤더 플래그 2), 8·16비트 타일맵과 뒤집기 비트, 외부 타일셋
링크, 두 번째 이후 프레임의 팔레트 갱신, 9패치·피벗 슬라이스.

합성 빌더는 리더 코드를 import하지 않지만 같은 사람이 같은 사실로 쓰므로, 명세 자체를 잘못 이해한 경우는 잡지 못한다.
그 반증은 3.1의 실파일 검증이 맡는데, 위 경로들은 그 검증 밖에 있다.

### 3.3 문서에 없어 선택한 것 (미검증)

- **알파**: 스트레이트인지 프리멀티플라이드인지 문서에 없다. `asepriteCelToRgba8`은 스트레이트로 가정한다.
- **6비트 팔레트 확장**: 0~63을 8비트로 넓히는 방식이 문서에 없어 상위 비트를 복제했다(`(v<<2)|(v>>4)`). 변환할 때마다
  `aseprite-palette-6bit-expanded` 경고를 남긴다.
- **UUID**: 바이트 순서 규칙이 문서에 없어 저장된 순서 그대로 8-4-4-4-12 소문자 16진으로 쓴다.
- **셀 그리기 순서**: 문서의 서술대로 `레이어 번호 + z-index` 오름차순(뒤에서 앞으로), 같으면 z-index가 작은 쪽이 먼저다.
  `orderAsepriteFrameCels`가 구현하며 Aseprite 앱의 합성 결과와 대조하지 못했다.
- **투명 인덱스**: 배경 레이어에서는 투명으로 취급하지 않는다(문서 서술). 실표본 정답이 없다.
- **레이어 위치**: 첫 프레임의 레이어 청크 순서가 셀의 레이어 번호다. 두 번째 이후 프레임의 레이어 청크는 규격 밖이므로
  경고(`aseprite-layer-in-later-frame`)하고 뒤에 덧붙인다.

---

## 4. 지원 범위

| 청크 | 처리 |
| --- | --- |
| 0x0004, 0x0011 구 팔레트 | 읽는다(0x0011은 6비트 확장 + 경고). 새 팔레트가 하나라도 있으면 시점별 팔레트에서 무시한다. |
| 0x2019 팔레트 | 읽는다(부분 갱신, 이름, 알파). `asepritePaletteAtFrame`이 선언 크기에 맞춰 시점별 팔레트를 만든다. |
| 0x2004 레이어 | 이미지·그룹·타일맵, 플래그 7종, 블렌드 모드 19종 이름, UUID. 자식 레벨로 부모·깊이·실효 가시성을 계산한다. |
| 0x2005 셀 | 원시, 링크, 압축 이미지, 압축 타일맵. 픽셀은 원본 색 형식 그대로(`decodePixels: false`로 건너뛸 수 있다). |
| 0x2006 셀 엑스트라 | 직전 셀에만 붙는 16.16 고정소수점 정밀 경계. |
| 0x2007 색 프로파일 | 없음·sRGB·ICC(바이트 보존)·미지, 고정 감마. 적용하지는 않는다. |
| 0x2008 외부 파일 | 팔레트·타일셋·확장 속성·확장 타일 관리·미지. |
| 0x2018 태그 | 범위, 방향 4종, 반복, 폐기된 색, 이름. |
| 0x2020 사용자 데이터 | 텍스트, 색, 속성 맵(타입 0x0001~0x0013 전체, 64비트는 10진 문자열). 대상 귀속 규칙은 아래. |
| 0x2022 슬라이스 | 키, 9패치, 피벗. |
| 0x2023 타일셋 | 메타데이터, 외부 링크, 파일 안 타일 이미지(압축 해제), 타일별 사용자 데이터. |
| 0x2016, 0x2017 | 폐기된 청크. 건너뛰고 위치를 `unknownChunks`에 남긴다. |
| 그 밖의 타입 | `aseprite-chunk-type-unknown`으로 알리고 위치만 남긴다. |

**사용자 데이터 귀속**: 직전 객체 청크에 붙는다. 레이어·셀·슬라이스는 하나, 태그는 태그 순서대로, 타일셋은 타일셋 자신 뒤에
타일 번호 순이다. 첫 프레임에서 다른 객체 청크보다 앞선 팔레트 바로 뒤의 사용자 데이터는 스프라이트에 붙는다. 붙을
곳이 없거나 이미 있으면 `aseprite-user-data-orphan` 경고를 남기고 버린다.

---

## 5. API

| 공개 심볼 | 역할 |
| --- | --- |
| `importAsepriteSprite(source, options?)` | `Blob`·`Uint8Array`·`ArrayBuffer`를 읽어 `AsepriteSpriteImportResult`를 돌려준다. 청크 하나의 문제는 던지지 않고 `warnings`/`unsupported`로 보고한다. 결과의 `source`에 바이트 수와 SHA-256이 있다. |
| `inspectAsepriteSignature(bytes)` | Aseprite·Adobe Swatch Exchange·미지를 서명으로 가른다. |
| `ASEPRITE_SPRITE_LIMITS` | 입력, 캔버스, 프레임·레이어·셀 수, 디코드 예산 등의 상한. 호출자는 낮출 수만 있다. |
| `AsepriteSpriteError` | `aborted`, `source-invalid`, `source-too-large`, `signature-invalid`, `header-invalid`, `limit-exceeded`. |
| `asepritePaletteAtFrame`, `resolveAsepriteLinkedCel`, `orderAsepriteFrameCels` | 시점별 팔레트, 링크 셀 해석, 셀 그리기 순서. |
| `asepriteCelToRgba8`, `asepriteTilemapValues`, `asepriteTileFields` | 셀 → RGBA8, 타일맵 바이트 → 값 배열, 값 → 타일 번호·뒤집기. |
| `AsepriteInflateAdapter` | zlib 해제기 주입점. 없으면 `DecompressionStream("deflate")`를 쓴다. |

입력 바이트는 항상 복사해 읽으므로 호출자가 이후에 버퍼를 바꿔도 결과는 영향받지 않는다.

---

## 6. 진단 코드

`warnings`: `aseprite-file-size-mismatch`, `aseprite-frame-truncated`, `aseprite-frame-count-mismatch`,
`aseprite-frame-trailing-bytes`, `aseprite-trailing-bytes`, `aseprite-chunk-trailing-bytes`, `aseprite-chunk-deprecated`,
`aseprite-string-utf8-invalid`, `aseprite-palette-6bit-expanded`, `aseprite-layer-in-later-frame`,
`aseprite-layer-type-unknown`, `aseprite-blend-mode-unknown`, `aseprite-layer-child-level-invalid`,
`aseprite-layer-parent-not-group`, `aseprite-cel-extra-orphan`, `aseprite-cel-on-group-layer`,
`aseprite-cel-kind-mismatch`, `aseprite-user-data-orphan`.

`unsupported`: `aseprite-frame-invalid`(이 프레임부터 읽지 않고 `truncated`), `aseprite-chunk-invalid`(그 청크만 건너뜀),
`aseprite-chunk-type-unknown`, `aseprite-cel-type-unsupported`, `aseprite-cel-layer-missing`, `aseprite-cel-link-invalid`,
`aseprite-user-data-properties-invalid`(텍스트·색은 유지), `aseprite-pixels-decode-failed`,
`aseprite-decode-budget-exceeded`, `aseprite-inflate-unavailable`.

---

## 7. 안전 한도

| 한도 | 기본값 | 막는 것 |
| --- | --- | --- |
| `maxFileBytes` | 128,000,000 | 과대 입력 |
| `maxCanvasDimension` | 32,768 | 한 변이 큰 캔버스 |
| `maxFrames`, `maxLayers`, `maxCels`, `maxChunksPerFrame` | 10,000 / 4,096 / 200,000 / 65,536 | 개수 폭주 |
| `maxCelDecodedBytes`, `maxTotalDecodedBytes` | 256,000,000 / 512,000,000 | 압축 폭탄: 압축률이 아니라 **선언한 해제 크기**와 예산으로 막는다. 빈 RGBA 셀은 정상 파일에서도 1000배 가까이 줄어들기 때문이다. |
| `maxUserDataDepth`, `maxUserDataValues` | 128 / 100,000 | 속성 맵 중첩·개수 폭주 |
| `maxTags`, `maxSlices`, `maxPaletteEntries`, `maxTilesetTiles` | 65,535 / 65,535 / 1,048,576 / 1,048,576 | 목록 폭주 |

선언된 개수가 남은 바이트에 비해 지나치게 크면 메모리를 잡기 전에 그 청크를 거부한다. 압축 해제는 선언 크기만큼 미리
할당하지 않고 실제로 풀린 만큼만 모은 뒤 길이가 정확히 맞을 때만 결과를 만든다.

---

## 8. 검증

- 단위 테스트 103종(위 머리말의 파일별 개수). 서명, 헤더, 프레임 복구, 레이어 트리, 셀·링크·그리기 순서, 해제 실패와 예산(경계 포함),
  RGBA 변환, 팔레트, 청크 복구, 태그·슬라이스·타일셋·타일맵, 외부 파일·색 프로파일, 사용자 데이터 귀속과 속성 타입 전체.
- 손으로 배치한 199바이트 리터럴 한 개가 빌더를 거치지 않고 필드 순서·크기를 확인한다.
- 손상 입력: 모든 청크 종류를 담은 파일을 **모든 길이로 잘라** 형식 오류 외의 예외 없이 `truncated`로 보고하는지, 무작위
  바이트 변조 1,500회(시드 고정)에도 `AsepriteSpriteError` 외의 예외가 없고 결과가 직렬화되는지 확인한다.
- 변이 시험: 소스에 일부러 버그 50개를 하나씩 넣어(경계 비교 반전, 플래그 비트 교체, 부호 있는/없는 정수 교체, 고정소수점
  분모, 바이트 건너뛰기, 순서 비교 등) 테스트가 모두 실패하는지 확인했다. 처음에는 4개가 살아남았고(해제 예산의 경계 두 곳,
  슬라이스 9패치/피벗 플래그가 항상 함께 켜진 데이터) 그 경계를 직접 검사하는 테스트를 더한 뒤 **50개 전부 잡혔다.** 이
  수치는 내가 고른 변이에 대한 것이며 전수 보증이 아니다.
- 실파일 16개: 3.1.
- `eslint --max-warnings=0`, `tsc -p packages/studio-format-gateway/tsconfig.json --noEmit` 통과.

---

## 9. 한계와 후속

- 합성(레이어 블렌드), 색 프로파일 적용, 타일맵 래스터화, 쓰기는 하지 않는다. 필요한 입력(불투명도, 블렌드 모드, 유효 플래그,
  그리기 순서)은 결과에 있다.
- 호환성 보고서의 소스 포맷 열거(`sourceCreativeFormatSchema`)에는 `aseprite`를 **추가하지 않았다.** 이 열거는 API DTO와 DB
  제약(`studio_compatibility_report_format_check`, 마이그레이션 0064)에 같은 값 목록으로 묶여 있어 코드만 고치면 API는 받고 DB는
  거부한다. 코덱을 앱에 연결할 때 마이그레이션과 함께 `AGENTS.md` §8의 별도 승인 절차로 처리한다.
- 가져온 레이어를 `@toonstudio/studio-project-model`의 `LayerGraphV3`로 사상하는 어댑터와 UI 연결은 별도 변경으로 분리한다.
- 3.2의 경로는 실표본이 있으면 하나씩 검증으로 옮길 수 있다. 특히 원시 셀, 속성 맵, ICC 프로파일, 그룹 불투명도 플래그가
  우선이다.
- 앱 렌더 결과와의 대조(3.1 끝)는 Aseprite 실행 파일이나 CLI를 쓸 수 있는 환경이 필요하다.
