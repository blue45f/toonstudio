# GIMP XCF 읽기 코덱 (공개 명세 기반) (2026-10-29)

- **상태**: `current` — 구현, 합성 단위 테스트, 실제 GIMP 산출물 10개에 대한 로컬 검증까지 완료. 검증 범위는 3절에 구분해 적었다.
- **작성일**: 2026-10-29
- **구현 모듈**: [`xcf.ts`](../../packages/studio-format-gateway/src/xcf.ts), [`xcf-pixels.ts`](../../packages/studio-format-gateway/src/xcf-pixels.ts), [`xcf-tiles.ts`](../../packages/studio-format-gateway/src/xcf-tiles.ts), [`xcf-cursor.ts`](../../packages/studio-format-gateway/src/xcf-cursor.ts), [`xcf-layer-modes.ts`](../../packages/studio-format-gateway/src/xcf-layer-modes.ts)
- **테스트**: [`xcf.test.ts`](../../packages/studio-format-gateway/src/__tests__/xcf.test.ts), [`xcf-tiles.test.ts`](../../packages/studio-format-gateway/src/__tests__/xcf-tiles.test.ts), [`xcf-layer-modes.test.ts`](../../packages/studio-format-gateway/src/__tests__/xcf-layer-modes.test.ts), 합성 빌더 [`xcf-fixtures.ts`](../../tests/corpus/formats/xcf-fixtures.ts), 로컬 코퍼스 [`local-samples-corpus.test.ts`](../../tests/format-gateway/local-samples-corpus.test.ts)
- **관련 정책**: [`ADR-0008`](../adr/0008-license-isolation-policy.md) §4 (GPL 코어는 reference-only)

---

## 1. 목적

창작자가 보유한 GIMP 문서(`.xcf`)를 ToonStudio로 가져와 레이어 구조와 픽셀을 읽을 수 있게 한다. 범위는 **읽기**이며
쓰기는 하지 않는다. 결과는 레이어 목록(이름, 위치, 크기, 가시성, 불투명도, 모드, 그룹 경로, 직선 RGBA8 픽셀)과
진단(`FormatIssue`)이다.

---

## 2. 출처와 라이선스 운용

| 자료 | 라이선스 | 사용 방식 |
| --- | --- | --- |
| XCF 포맷 명세 문서 (`developer.gimp.org/core/standards/xcf/`) | GPL-2.0-or-later (문서 개별 표기) | 레이아웃·열거값 같은 **사실만** 자체 표현으로 구현. 문구를 복사하지 않았다. |
| GIMP 애플리케이션 소스 (`app/xcf` 등) | GPL-3.0 | **읽지 않았다.** |
| MIT/ISC 독립 구현(npm `xcfreader` 계열, `is-xcf`) | MIT, ISC | 교차 확인에만 읽었다. 코드를 복사하지 않았다. |
| ImageMagick 6.9.12 | ImageMagick 라이선스 | 설치된 실행 파일의 읽기 전용 디코드를 블랙박스 오라클로만 사용. 소스를 읽지 않았다. |

ADR-0008 §4는 GPL 핵심을 reference-only로 두고 포맷·동작의 관찰과 문서 기반 재구현을 허용한다. 이 구현은 그 운용을
따른다. 명세 문서 자체가 GPL이므로 "사실만 자체 표현으로 옮긴다"는 운용이 충분한지는 소유자·법무가 확인하는 것이
바람직하며, 이 문서는 법적 결론이 아니다.

**실표본의 출처**: 검증에 쓴 `.xcf` 10개는 MIT 라이선스 저장소와 npm 패키지에서 받았다. 저장소 루트의 라이선스는
확인했지만 개별 파일의 저작권·재배포 허용은 확인하지 못했다. 그래서 **저장소에 커밋하지 않고** Git이 무시하는 로컬
디렉터리(`tests/corpus/formats/local-samples/`)에서만 쓴다.

---

## 3. 근거 수준

### 3.1 실제 GIMP 파일로 검증한 것

실제 GIMP 산출물 10개: 버전 태그 `file` 1개·`v003` 3개·`v011` 3개·`v012` 3개, RLE 압축, RGB·회색·인덱스드, 8비트 감마
정수·32비트 감마 정수·32비트 선형 실수, 4바이트·8바이트 포인터, 최대 1920x1080, 한 파일은 182레이어에 그룹 31개.

| 검증 | 결과 |
| --- | --- |
| 전 파일 가져오기 | 10개 모두 오류 없이 읽었고, 레이어 수가 헤더 포인터 배열과 일치했다. |
| 8비트 RGB·회색 레이어를 ImageMagick 디코드와 대조 | 대조 가능한 176개 레이어의 RGBA가 **바이트 단위로 일치**했다(완전 투명 픽셀의 RGB 제외). |
| 32비트 감마 정수 vs 32비트 선형 실수(같은 그림의 쌍) | 채널 샘플 70,000개에서 최대 차이 1, 차이가 1을 넘는 샘플 0개. |
| 인덱스드 | 서로 다른 색의 수가 색지도 크기 이하라는 불변식만 확인했다. 대조 오라클이 없다. |
| 그룹 부모 복원 | 182레이어 파일의 모든 항목 경로가 해석되었다(`xcf-group-path-unresolved` 경고 0). 정답과 대조한 것은 아니다. |

### 3.2 합성 테스트로만 확인한 것

압축 없음, 16비트 정수, 16·64비트 실수, 선형 8비트 정수의 환원, 선형 정밀도에서의 알파 비OETF, 그룹 경로 변형과
부모 없는 경로, 음수 오프셋, 색지도·사용자 단위의 잘못된 기록 길이, 손상·절단·한 바이트 변조 파일. 합성 빌더는
리더 코드를 import하지 않지만, 같은 사람이 같은 사실로 쓰므로 명세 자체를 잘못 이해한 경우는 잡지 못한다. 그 반증은
3.1의 실파일 검증이 맡는다. 환원 정책(감마 정수는 값/최댓값, 선형은 sRGB OETF 후 반올림)은 설계 선택이며 GIMP 내부
변환과 같다는 보증이 아니다.

### 3.3 미검증 (실표본 없음, 진단으로 표기)

- 압축 2(zlib): 형식(zlib 래퍼인지 raw deflate인지)과 타일 압축 구간의 끝이 명세에 없다. 기본 구현을 제공하지 않고
  `inflate` 어댑터를 주입할 때만 푼다. 어댑터가 없으면 해당 레이어의 픽셀은 `null`이고 `xcf-compression-unsupported`로 알린다.
- XCF 7~10의 정밀도 필드: 명세 서술에만 근거한다. `xcf-precision-field-unverified` 경고를 남기고, 알려진 정밀도 번호가
  아니면 거부한다.
- GIMP 3.x(XCF 13~26): 구조는 받아들이되 모르는 속성은 건너뛴다. 실표본이 없다.
- 레이어 마스크: 읽지 않고 `xcf-layer-mask-not-decoded`로 알린다(알파에 반영되지 않는다).
- 고정밀도 이미지의 부분 알파: 표본의 알파가 모두 255라 검증하지 못했다.
- 레이어 그룹의 픽셀 의미: 명세가 침묵한다. 그룹 레이어의 `pixels`는 `null`이다.

### 3.4 명세와 실표본의 관계

해상도 속성은 명세대로 big-endian이 맞다(일부 서드파티 리더는 little-endian으로 읽는다). 불투명도는 명세대로
부동소수 속성(33)이 8비트 속성(6)을 덮어쓰며, 실표본에도 두 값이 어긋난 채 함께 있다(195 대 0.762).
`PROP_COLORMAP`과 `PROP_USER_UNIT`의 기록 길이는 신뢰할 수 없어 필드를 읽어 실제 길이를 계산한다.

---

## 4. 지원 범위

| 항목 | 지원 |
| --- | --- |
| 버전 | `file`(0), `v001`~`v003`, `v007`~`v026`. 개발판 4~6, CinePaint(100 이상), 26 초과는 `version-unsupported`. |
| 포인터 | XCF 10 이하 4바이트, 11 이상 8바이트(안전 정수 초과는 거부). |
| 압축 | 0(없음), 1(RLE) 디코드. 2는 어댑터 주입 시. 3(예약)·속성 없음은 구조만 읽고 진단. |
| 정밀도 | 100·150·200·250·300·350·500·550·600·650·700·750 → 직선 RGBA8. 정밀도 필드가 없는 XCF 3 이하는 150. |
| 색 모드 | RGB, 회색, 인덱스드(알파 포함). |
| 읽지 않음 | 레이어 마스크 픽셀, 채널(선택 영역 포함), 벡터, 효과 구조, 텍스트 메타데이터. |

---

## 5. API

| 공개 심볼 | 역할 |
| --- | --- |
| `importXcf(source, options?)` | `Blob`·`Uint8Array`·`ArrayBuffer`를 읽어 `XcfImportResult`를 돌려준다. 회복 가능한 레이어 단위 문제는 던지지 않고 `warnings`/`unsupported`로 보고한다. |
| `inspectXcfHeader(bytes)` | 헤더만 읽어 버전, 크기, 색 모드, 정밀도, 포인터 폭을 돌려준다. |
| `XCF_LIMITS` | 입력, 캔버스, 레이어 수, 속성, 문자열, 디코드 예산의 상한. 호출자는 낮출 수만 있다. |
| `XcfError` | `aborted`, `source-invalid`, `source-too-large`, `magic-invalid`, `version-unsupported`, `precision-unsupported`, `structure-invalid`, `limit-exceeded`. |
| `XCF_LAYER_MODES`, `describeXcfLayerMode` | `PROP_MODE` 0~61의 이름, legacy 여부, 도입 버전. |

입력 바이트는 항상 복사해 읽으므로(`Buffer`가 원본과 메모리를 공유하는 문제를 피한다) 호출자가 이후에 버퍼를
바꿔도 결과는 영향받지 않는다. 결과의 `source`에는 바이트 수와 SHA-256이 들어 있다.

---

## 6. 진단 코드

`warnings`: `xcf-precision-field-unverified`, `xcf-colormap-length-mismatch`, `xcf-parasites-invalid`,
`xcf-channels-not-decoded`, `xcf-layer-type-mismatch`, `xcf-unknown-layer-mode`, `xcf-group-path-unresolved`.

`unsupported`: `xcf-compression-unsupported`, `xcf-layer-mask-not-decoded`, `xcf-layer-structure-invalid`(레이어를 건너뜀),
`xcf-hierarchy-invalid`, `xcf-bpp-mismatch`, `xcf-tile-decode-failed`, `xcf-decode-budget-exceeded`.

---

## 7. 검증

- 단위 테스트 53종: `xcf.test.ts` 28, `xcf-tiles.test.ts` 20, `xcf-layer-modes.test.ts` 5.
- 핵심 동작 일곱 곳(불투명도 우선순위, 64비트 포인터 시작 버전, RLE 반복 횟수, 선형 OETF, 색지도 길이, 그룹 부모 경로,
  실효 가시성)에 일부러 버그를 넣어 각각 의도한 테스트가 실패함을 확인한 뒤 원복했다.
- 로컬 코퍼스: 실파일 10개로 17개 테스트(무시 규칙 1, 구조 10, ImageMagick 대조 6)가 통과했다.
- `tests/corpus/formats/local-samples/`에 `.xcf`를 두고 `pnpm exec vitest run tests/format-gateway/local-samples-corpus.test.ts`로
  직접 재현할 수 있다. 샘플이 없으면 이 형식의 테스트는 등록되지 않는다.

---

## 8. 한계와 후속

- 레이어 마스크, 채널, zlib, GIMP 3.x 실표본이 있으면 3.3의 항목을 하나씩 검증으로 옮길 수 있다.
- `apps/web`의 상호운용 능력 표(`studio-interchange-capabilities.ts`)에는 XCF 항목을 추가하지 않았다. 그 파일이 소스
  파일 크기 래칫(2134줄)에 걸려 있어 먼저 분리해야 한다.
- 호환성 보고서의 소스 포맷 열거(`sourceCreativeFormatSchema`)에는 `xcf`를 **추가하지 않았다.** 이 열거는 API DTO와
  DB 제약(`studio_compatibility_report_format_check`, 마이그레이션 0064)에 같은 값 목록으로 묶여 있어, 코드만 고치면
  API는 받고 DB는 거부한다. 코덱을 앱에 연결할 때 마이그레이션과 함께 `AGENTS.md` §8의 별도 승인 절차로 처리한다.
- 가져온 레이어를 `@toonstudio/studio-project-model`의 `LayerGraphV3`로 사상하는 어댑터는 별도 변경으로 분리한다.
