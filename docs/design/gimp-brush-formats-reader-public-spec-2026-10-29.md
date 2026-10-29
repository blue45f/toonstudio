# GIMP 브러시 계열 읽기 코덱 (.gbr .gih .pat .vbr) (2026-10-29)

- **상태**: `current` — 구현, 합성 단위 테스트 98종, 변이 시험 70종, 실제 GIMP 데이터 파일 76개에 대한 독립 해석기 대조까지 완료. 검증 범위는 3절에 구분해 적었다.
- **작성일**: 2026-10-29
- **구현 모듈**: [`gimp-brush.ts`](../../packages/studio-format-gateway/src/gimp-brush.ts)(`.gbr`·`.pat`·형식 판별), [`gimp-brush-pipe.ts`](../../packages/studio-format-gateway/src/gimp-brush-pipe.ts)(`.gih`), [`gimp-generated-brush.ts`](../../packages/studio-format-gateway/src/gimp-generated-brush.ts)(`.vbr`), [`gimp-brush-core.ts`](../../packages/studio-format-gateway/src/gimp-brush-core.ts)(공통: 입력, 오류, 한도, 헤더, 브러시 한 개 해석)
- **테스트**: [`gimp-brush.test.ts`](../../packages/studio-format-gateway/src/__tests__/gimp-brush.test.ts) 59(`.gbr`·`.pat`·판별·손상 입력), [`gimp-brush-pipe.test.ts`](../../packages/studio-format-gateway/src/__tests__/gimp-brush-pipe.test.ts) 27(`.gih`), [`gimp-generated-brush.test.ts`](../../packages/studio-format-gateway/src/__tests__/gimp-generated-brush.test.ts) 12(`.vbr`). 합성 빌더는 [`gimp-brush-fixtures.ts`](../../tests/corpus/formats/gimp-brush-fixtures.ts), 로컬 실샘플 검사는 [`local-samples-corpus.test.ts`](../../tests/format-gateway/local-samples-corpus.test.ts)
- **관련 문서**: [XCF 읽기 코덱](xcf-reader-public-spec-2026-10-29.md), [Aseprite 읽기 코덱](aseprite-sprite-reader-public-spec-2026-10-29.md)(같은 방식의 선행 사례)

---

## 1. 목적

창작자가 보유한 GIMP 브러시 자산을 읽어 브러시 팁 이미지와 매개변수를 얻을 수 있게 한다. 이 계열에는 네 가지 파일이 있다.

| 확장자 | 내용 |
| --- | --- |
| `.gbr` | 브러시 팁 한 장(회색 마스크 또는 RGBA)과 이름, 기본 간격 |
| `.gih` | 브러시 여러 장을 이어 붙인 파이프(애니메이션·다중 팁)와 사용 방식 매개변수 |
| `.pat` | 반복 무늬(패턴) 한 장 |
| `.vbr` | 이미지 없이 매개변수(모양, 반지름, 경도, 가로세로비, 각도, 간격)로 정의하는 생성 브러시 |

범위는 **읽기**다. 픽셀은 파일에 저장된 그대로 돌려주고, 색 변환·간격 적용·가시 수에 따른 모양 생성·파이프 선택 규칙 적용은 하지 않는다. 쓰기는 하지 않는다.

---

## 2. 출처와 이용 조건

| 자료 | 이용 조건 | 사용 방식 |
| --- | --- | --- |
| GIMP 개발자 사이트의 포맷 문서(`developer.gimp.org/core/standards/`의 gbr, gih, vbr 쪽) | CC BY-SA 4.0 | 필드 순서·크기·상수 같은 **사실만** 자체 표현으로 구현했다. 문구를 복사하지 않았다. |
| Kaitai Struct 커뮤니티 명세 `gimp_brush`(`formats.kaitai.io`) | CC0-1.0 | 바이트 순서(big-endian), 널 종결 이름, 유효 범위를 교차 확인하는 데만 읽었다. |
| 오래된 패턴 문서(`devel-docs/pat.txt`, GIMP 2.2 소스 패키지) | GIMP 소스 트리의 문서 | 패턴 헤더 필드 순서·크기만 교차 확인했다. |
| GIMP 애플리케이션 소스 | GPL | **읽지 않았다.** |

ADR-0008 §4는 GPL 핵심을 reference-only로 두고 포맷의 관찰과 문서 기반 재구현을 허용한다. 이 구현은 그 운용을 따른다. "사실만 자체 표현으로 옮긴다"는 운용이 충분한지는 앱에 연결하기 전에 소유자·법무가 확인하는 것이 바람직하며, 이 문서는 법적 결론이 아니다.

**실표본의 출처**: 검증에 쓴 76개는 GIMP 데이터 저장소(`gimp-data`, Debian 소스 패키지 `gimp` 3.2.6-1에 포함된 사본)의 `brushes/`·`patterns/` 파일이다. 저장소 루트의 라이선스는 확인했지만 개별 파일의 저작권·재배포 허용은 확인하지 못했다. 그래서 **저장소에 커밋하지 않고** Git이 무시하는 로컬 디렉터리(`tests/corpus/formats/local-samples/`)에서만 쓴다.

---

## 3. 근거 수준

### 3.1 실제 GIMP 파일로 검증한 것

GIMP 데이터 저장소의 실제 파일 76개(`.gbr` 21, `.gih` 26, `.pat` 20, `.vbr` 9)를 리더와 독립 해석기(표준 라이브러리만 쓰는 Python, 코드를 공유하지 않음)가 각각 읽고 필드 단위로 대조했다.

| 형식 | 실표본에서 본 것 |
| --- | --- |
| `.gbr` 21개 | 전부 v2, 매직 `GIMP`, 이름은 널 종결. 회색 20개와 RGBA 1개, 한 변 1~250픽셀, 간격 3~100. 파일 길이가 헤더 + 가로×세로×bytes와 정확히 같다. |
| `.gih` 26개 | 브러시 212개(파이프당 2~24개, 회색 193개·RGBA 19개), 2차원 파이프 1개(`dim:2`), 선택 방식 random 23·incremental 3·angular 1(차원 단위로 센 값), 배치 constant 26. 브러시들이 빈틈 없이 이어져 마지막 브러시가 파일 끝에서 끝난다. |
| `.pat` 20개 | 전부 v1, 매직 `GPAT`. bytes 3(RGB) 16개, 4(RGBA) 2개, 1(회색) 2개. |
| `.vbr` 9개 | 버전 1.0 6개(8줄), 1.5 3개(10줄: square 2·diamond 1). |

| 검증 | 결과 |
| --- | --- |
| 전 파일 가져오기 | 76개 모두 `warnings`·`unsupported` 0건이고 파이프 26개는 모두 `truncated: false`. 앞부분 판별(`inspectGimpBrushFormat`)이 76개 모두 확장자와 같은 형식을 돌려준다. |
| 필드(버전, 이름, 크기, bytes, 간격, 헤더 크기, 파이프 안 위치·길이, 매개변수 전부, 생성 브러시 값) | 독립 해석기와 **전부 일치** |
| 픽셀 | 브러시 233개(단독 21 + 파이프 안 212)와 패턴 20개의 픽셀 바이트 SHA-256이 독립 해석기와 **전부 일치** |

### 3.2 공개 문서와 실제 파일이 달랐던 곳

| 항목 | 공개 문서 | 실제 파일 | 이 구현 |
| --- | --- | --- | --- |
| 패턴 매직 | 오래된 `pat.txt`가 `GIMP`라고 적었다(같은 문서가 "GIMP brush magic number"라고 쓴 복사 오류로 보인다). 현재 개발자 사이트에는 패턴 문서를 찾지 못했다. | 패턴 20개 모두 `GPAT` | `GPAT`만 받는다. `GIMP` 매직은 매직이 없는 v1 브러시와 바이트 배치가 같아(이름이 오프셋 20에서 시작한다) 형식 판별로 가를 수 없고 실파일에도 없으므로, 가져오기가 `magic-invalid`로 거부하고 판별도 패턴으로 보지 않는다. 가져오기가 받는 패턴은 항상 판별도 `pat`이다. |
| 파이프 매개변수 | 예: `ncells:6 step:20 dim:1 cols:3 rows:2 rank0:6 selection:incremental` | `ncells cellwidth cellheight step dim cols rows placement rankN selN`(`sel0:random`) | 키를 가리지 않고 `entries`에 전부 남기고, 차원별 `rankN`/`selN`과 문서의 단일 `selection` 키를 모두 읽는다. 없거나 정수가 아닌 차원 값은 `null`로 자리를 지켜 뒤 차원의 값이 앞 차원으로 밀리지 않게 하고(`gimp-pipe-dimension-incomplete`), 16차원까지만 읽는다(넘으면 `gimp-pipe-dimension-limit`). |
| 바이트 순서 | 브러시·패턴 문서에 없다 | big-endian | Kaitai 명세와 실표본으로 big-endian을 확정했다. |
| 이름 종결 | 문서에 없다(길이는 헤더 크기로 정해진다) | 모두 널 종결 | 널이 있으면 거기서 자르고 없어도 읽는다. |
| 회색 값의 뜻 | 문서에 없다 | 회색 브러시 213개(단독 20 + 파이프 안 193) 중 값이 균일한 1개(1x1 사각, 255)를 뺀 212개에서 205개는 중심 평균이 가장자리 평균보다 높았다. 나머지 7개는 확인하지 않았다(링이나 질감 모양일 수 있다). | 값이 클수록 칠해진다고 **관찰**했으나 변환은 하지 않고 원본 값을 돌려준다. |

### 3.3 합성 테스트로만 확인한 것

실파일에 한 번도 나오지 않은 경로다: 브러시 v1(매직·간격 없음)과 v3(데이터 형식 식별자), 패턴 bytes 2(회색+알파), `.gih`의 CRLF 헤더·여러 가지 손상, `.vbr`의 CRLF·모르는 모양·지수 표기. 합성 빌더는 리더 코드를 import하지 않지만 같은 사람이 같은 사실로 쓰므로 명세 자체를 잘못 이해한 경우는 잡지 못한다. 그 반증은 3.1의 실파일 검증이 맡는데, 위 경로들은 그 검증 밖에 있다.

### 3.4 문서에 없어 선택한 것 (미검증)

- **v3 브러시**: 문서는 `bytes` 필드가 데이터 형식 식별자이고 알려진 값이 18(16비트 부동소수)이라고만 적는다. 픽셀 배치가 없어 본문을 해석하지 않고(`pixels: null`, `gimp-brush-v3-data-not-decoded`) 헤더만 돌려준다. 본문 크기를 모르므로 파이프 안에서는 그 뒤의 브러시를 읽지 않는다.
- **생성 브러시의 단위**: 문서에 반지름(픽셀)만 단위가 있다. 간격·경도·가로세로비·각도는 파일 값 그대로 돌려준다. 버전 1.0에는 모양 줄이 없어 `shape`는 null이다(GIMP가 이를 원으로 보는지는 문서에 없다).
- **알파**: RGBA 브러시와 패턴의 알파가 스트레이트인지 프리멀티플라이드인지 문서에 없다. 변환하지 않는다.
- **파이프 선택 규칙**: `sel`의 값(random, incremental, angular 등)과 `placement`의 뜻은 문서에 없다. 문자열 그대로 돌려준다.

---

## 4. API

| 공개 심볼 | 역할 |
| --- | --- |
| `importGimpBrush(source, options?)` | `.gbr` 하나를 읽어 `GimpBrushImportResult`(헤더 필드, 원본 픽셀, 진단, 입력 길이와 SHA-256)를 돌려준다. 버전 1·2·3. |
| `importGimpBrushPipe(source, options?)` | `.gih`를 읽어 이름, 선언한 브러시 수, 매개변수(`GimpBrushPipeParameters`), 브러시 목록을 돌려준다. 브러시 하나가 깨져도 그 앞까지는 돌려주고 `truncated`로 표시한다. |
| `importGimpPattern(source, options?)` | `.pat` 하나를 읽는다. |
| `importGimpGeneratedBrush(source, options?)` | `.vbr`을 읽는다(버전 1.0·1.5). |
| `inspectGimpBrushFormat(bytes)` | 파일 앞부분으로 `"gbr" \| "gih" \| "pat" \| "vbr" \| "unknown"`을 가른다. 확장자는 보지 않는다. |
| `GIMP_BRUSH_LIMITS`, `GimpBrushError` | 한도(호출자는 낮추기만 가능)와 오류 클래스. 코드: `aborted`, `source-invalid`, `source-too-large`, `header-invalid`, `magic-invalid`, `version-unsupported`, `color-depth-unsupported`, `limit-exceeded`, `truncated`. |

입력은 `Blob`·`Uint8Array`·`ArrayBuffer`이고 항상 복사해 읽으므로 호출자가 이후에 버퍼를 바꿔도 결과는 영향받지 않는다. 파일 전체를 해석할 수 없을 때만 던지고, 회복 가능한 문제는 `warnings`/`unsupported`로 보고한다.

---

## 5. 진단 코드

`warnings`: `gimp-brush-name-utf8-invalid`, `gimp-brush-name-trailing-bytes`, `gimp-brush-trailing-bytes`, `gimp-pattern-trailing-bytes`, `gimp-pipe-header-utf8-invalid`, `gimp-pipe-carriage-return`, `gimp-pipe-parameter-malformed`, `gimp-pipe-parameter-duplicate`, `gimp-pipe-parameter-not-integer`, `gimp-pipe-dimension-incomplete`, `gimp-pipe-dimension-limit`, `gimp-pipe-ncells-mismatch`, `gimp-pipe-rank-product-mismatch`, `gimp-pipe-brush-count-mismatch`, `gimp-pipe-trailing-bytes`, `gimp-vbr-utf8-invalid`, `gimp-vbr-carriage-return`, `gimp-vbr-name-too-long`, `gimp-vbr-shape-unknown`, `gimp-vbr-trailing-lines`.

`unsupported`: `gimp-brush-v3-data-not-decoded`(v3 본문), `gimp-pipe-brush-invalid`(그 브러시부터 읽지 않음), `gimp-pipe-brush-body-unknown`(본문 크기를 모르는 브러시 뒤를 읽지 않음).

---

## 6. 안전 한도

| 한도 | 기본값 | 막는 것 |
| --- | --- | --- |
| `maxFileBytes` | 256,000,000 | 과대 입력 |
| `maxDimension` | 10,000 | 한 변이 큰 브러시·패턴(공개 명세가 정한 유효 범위 1~10000). 픽셀 바이트는 한 변 한도 × 최대 4바이트라 정수 범위를 넘지 않는다. |
| `maxNameBytes` | 4,096 | 이름 영역 |
| `maxPipeBrushes` | 4,096 | 파이프의 브러시 수 |
| `maxLineBytes` | 8,192 | 파이프 텍스트 헤더의 한 줄. 생성 브러시(`.vbr`)는 텍스트 전체를 이 값의 16배(131,072바이트)까지만 받는다(올바른 파일은 수백 바이트이며, 줄 수가 입력 크기에 비례해 늘지 못하게 한다). |

헤더가 입력보다 크거나 픽셀이 모자라면 할당 전에 `truncated`로 거부한다. 파이프 매개변수의 차원 수 `dim`이 아무리 커도 `rankN`/`selN`은 16차원까지만 훑고(적대적 입력이 반복 횟수를 키우지 못하게) 넘으면 `gimp-pipe-dimension-limit`로 알린다. 결과 배열은 `min(dim, 16)` 길이다. 매개변수 객체는 프로토타입이 없는 객체라 `__proto__` 같은 키가 와도 오염되지 않는다.

---

## 7. 검증

- 단위 테스트 98종: 헤더 필드와 픽셀, 버전 1·2·3, 이름(널 종결·UTF-8 깨짐·종결자 뒤 바이트), 한도 경계(정확히 같은 값은 허용하고 1만 넘으면 거부), 호출자 한도는 낮추기만 가능, 입력 복사, 중단 신호, 형식 판별(가져오기가 받는 패턴은 판별도 `pat`), 파이프 매개변수(문서 예·실제 형식·다차원·빠진 차원 값의 자리 보존·16차원 경계·반복·프로토타입 오염 시도), 파이프 안 브러시 손상, `.vbr` 숫자 형식과 줄 수.
- 손으로 배치한 리터럴 두 개(31바이트 브러시, 32바이트 패턴)가 빌더를 거치지 않고 필드 순서·크기를 확인한다.
- 손상 입력: 브러시·패턴·파이프를 **모든 길이로 잘라** 형식 오류 외의 예외가 없는지, 바이트 변조(시드 고정, 형식마다 600~800회)에도 `GimpBrushError` 외의 예외가 없는지 확인한다.
- 변이 시험: 소스에 일부러 버그 70개를 하나씩 넣어(경계 비교 반전, 오프셋·매직·상수 교체, 필드 순서 교체, 논리 연산 교체, 정규식 완화 등) 테스트가 모두 실패하는지 확인했다. 처음에는 5개가 살아남았고(널 종결자 뒤 0 바이트, 너비·높이 중 하나만 0인 헤더의 판별, 숫자로 시작하지 않는 둘째 줄의 판별, 파이프가 정확히 끝난 경우와 깨진 경우의 구분, 둘째 줄 오류의 이유) 그 경계를 직접 검사하는 테스트를 더했다. 그 뒤 자동 코드 리뷰(Codex)가 지적한 두 결함(`GIMP` 매직 패턴을 가져오기는 받지만 판별은 패턴으로 보지 못하는 불일치, 다차원 파이프에서 앞 차원의 `rankN`/`selN`이 빠지면 뒤 차원의 값이 앞 차원으로 밀리는 것)을 고치고, 각 결함을 되살리는 변이를 포함해 변이를 70개로 늘렸다. **70개 전부 잡혔다.** `dim`이 거대한 값일 때 차원을 16개까지만 훑는 상한을 지운 변이는 약 106초 뒤 시험 실행이 실패로 끝나 잡혔다(반복이 끝나지 않아 메모리를 소진한 것으로 보이며 원인은 따로 확인하지 않았다). 이 수치는 내가 고른 변이에 대한 것이며 전수 보증이 아니다.
- 실파일 76개: 3.1.
- `eslint --max-warnings=0`, `tsc -p packages/studio-format-gateway/tsconfig.json --noEmit` 통과.

---

## 8. 한계와 후속

- 브러시를 앱의 브러시 프리셋으로 사상하는 어댑터(팁 이미지 → 스탬프, 간격, 파이프 → 순환 팁)와 UI 연결은 별도 변경으로 분리한다.
- `.gtp`(GIMP 툴 프리셋)·`.gpl`(팔레트)·`.gdyn`(다이내믹스) 같은 이 계열의 다른 파일은 다루지 않았다.
- 호환성 보고서의 소스 포맷 열거(`sourceCreativeFormatSchema`)에는 이 형식들을 **추가하지 않았다.** API DTO와 DB 제약(`studio_compatibility_report_format_check`, 마이그레이션 0064)에 같은 값 목록으로 묶여 있어 코드만 고치면 API는 받고 DB는 거부한다. 앱에 연결할 때 마이그레이션과 함께 `AGENTS.md` §8의 별도 승인 절차로 처리한다.
- 3.3의 경로는 실표본이 있으면 하나씩 검증으로 옮길 수 있다.
