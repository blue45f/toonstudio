# Clip Studio Paint `.clip` 문서 읽기 코덱: 제3자 공개 명세 기반 (2026-10-29)

- **상태**: `current` — 구현, 합성 단위 테스트 740종, 변이 시험 2,576종과 독립 검토 2회(두 번째의 지적 반영까지)를 마쳤다. **우리가 실제 `.clip` 파일을 열어 확인한 것은 하나도 없다.** 아래 모든 포맷 사실은 제3자가 공개한 명세 문서에서 왔고, 실제 파일로 검증하는 절차와 도구는 7절에 있다.
- **작성일**: 2026-10-29 (같은 날 2차 개정: 첫 독립 검토 지적 반영. 2026-10-30 3차 개정: 두 번째 독립 검토 지적 반영)
- **분석 도구**: 이번 변경에서 REA(`reverse-engineer-anything`)를 실행하지 않았고, CELSYS 바이너리(Clip Studio Paint)를 실행·디컴파일·분석하지 않았으며, 제3자 코드를 내려받아 실행하지도 않았다. 구현자가 한 일은 공개 저장소의 **명세 문서를 읽은 것**뿐이다. 다만 구현을 마친 뒤 독립 검토를 맡긴 에이전트는 명세의 진술을 확인하려고 S1 저장소의 소스 파일 일부도 읽었다(2절 "하지 않은 일"의 정정 참조). 두 번째 독립 검토 에이전트는 허용된 명세 문서(md)만 읽었고 제3자 소스는 열지 않았다.
- **구현 모듈**: [`chunked-sqlite-container.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-container.ts)(컨테이너, 별도 문서), [`zlib-inflate.ts`](../../packages/studio-format-gateway/src/zlib-inflate.ts)(제한이 있는 zlib 해제), [`chunked-sqlite-blocks.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-blocks.ts)(오프스크린 속성·블록 레코드·픽셀 환원), [`chunked-sqlite-layer-model.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-layer-model.ts)(`Layer` 행 해석·종류 판정·트리 평탄화), [`chunked-sqlite-document-reader.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-document-reader.ts)(주입한 SQLite 판독기로 읽는 표), [`chunked-sqlite-document.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-document.ts)(가져오기 진입점), [`chunked-sqlite-document-types.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-document-types.ts)(타입·오류·한도·판독기 인터페이스), [`chunked-sqlite-issues.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-issues.ts)(진단 목록), [`chunked-sqlite-pacing.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-pacing.ts)(이벤트 루프 양보·중단 확인)
- **테스트**(파일별 개수는 2026-10-30 로컬 실행 기준): [`zlib-inflate.test.ts`](../../packages/studio-format-gateway/src/__tests__/zlib-inflate.test.ts) 48, [`zlib-inflate-streams.test.ts`](../../packages/studio-format-gateway/src/__tests__/zlib-inflate-streams.test.ts) 68, [`chunked-sqlite-blocks.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-blocks.test.ts) 110, [`chunked-sqlite-container.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-container.test.ts) 57, [`chunked-sqlite-layer-model.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-layer-model.test.ts) 43, [`chunked-sqlite-document-reader.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-document-reader.test.ts) 106, [`chunked-sqlite-document.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-document.test.ts) 147, [`chunked-sqlite-document-structure.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-document-structure.test.ts) 41, [`chunked-sqlite-document-budget.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-document-budget.test.ts) 24, [`chunked-sqlite-document-input.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-document-input.test.ts) 18, [`chunked-sqlite-document-abort.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-document-abort.test.ts) 8, [`chunked-sqlite-document-unexpected.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-document-unexpected.test.ts) 3, [`chunked-sqlite-issues.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-issues.test.ts) 17, [`chunked-sqlite-pacing.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-pacing.test.ts) 11, [`node-sqlite-clip-reader.test.ts`](../../tests/format-gateway/node-sqlite-clip-reader.test.ts) 11, 검사 도구 [`inspect-chunked-document.test.ts`](../../scripts/inspect-chunked-document.test.ts) 20 · [`inspect-chunked-container.test.ts`](../../scripts/inspect-chunked-container.test.ts) 8. 합성 빌더는 [`chunked-sqlite-block-fixtures.ts`](../../tests/corpus/formats/chunked-sqlite-block-fixtures.ts)·[`deflate-writer.ts`](../../tests/corpus/formats/deflate-writer.ts)(DEFLATE를 비트 단위로 직접 쓰는 빌더)·[`chunked-sqlite-document-fixtures.ts`](../../tests/corpus/formats/chunked-sqlite-document-fixtures.ts)·[`chunked-sqlite-document-test-kit.ts`](../../tests/corpus/formats/chunked-sqlite-document-test-kit.ts), 테스트·검사용 `node:sqlite` 판독기는 [`node-sqlite-clip-reader.ts`](../../tests/corpus/formats/node-sqlite-clip-reader.ts), 로컬 실샘플 검사는 [`local-samples-corpus.test.ts`](../../tests/format-gateway/local-samples-corpus.test.ts)
- **관련 문서**: [컨테이너 파서](chunked-sqlite-container-parser-2026-10-29.md)(`CSFCHUNK` 틀, 헤더 필드 순서와 `CHNKHead` 교차 확인), [Krita 문서 읽기 코덱](krita-kra-reader-observed-2026-10-29.md)(같은 방식의 선행 사례. 단 Krita 쪽은 실제 프로그램을 블랙박스로 실행해 검증했고 이 문서의 대상은 그렇지 않다)

---

## 1. 목적과 범위

창작자가 보유한 Clip Studio Paint 문서(`.clip`)에서 캔버스 크기, 레이어 트리와 속성, 래스터 레이어의 픽셀, 레이어 마스크 값, 저장된 미리보기 PNG를 읽을 수 있게 한다.

- 하는 것: `CSFCHUNK` 컨테이너 검증, 임베디드 SQLite 문서 DB에서 `Canvas`·`Layer`·`Mipmap`·`MipmapInfo`·`Offscreen`·`VectorObjectList`·`CanvasPreview` 읽기, 레이어 트리 평탄화(순환·끊긴 연결·깊이 방어), 레이어 종류 판정, 래스터·화상 소재·3D 레이어와 레이어 마스크의 블록 해독(zlib)과 RGBA8(직선 알파) 환원, 읽지 못한 항목의 진단.
- 하지 않는 것: 레이어 합성과 블렌드 모드 계산, 텍스트·벡터·그라데이션/단색 채움·필터·3D·화상 소재 레이어의 편집 정보 해석, **텍스트·벡터·채움 레이어의 저장 픽셀 읽기**(3.3절 정책), 컷 틀 폴더의 마스크, 마스크를 레이어 알파에 적용하는 일, 1비트 단색 오프스크린, 16비트·CMYK 오프스크린, 애니메이션 타임라인, 코믹 프로젝트(`.cmc`), 썸네일, ICC 색 변환, **쓰기**.
- SQLite를 번들하지 않는다. 호출자가 `openSqlite`로 읽기 전용 판독기를 넘긴다(앱은 sqlite-wasm, 테스트와 검사 도구는 `node:sqlite`). **앱에 연결하는 일은 이 변경에 없다.** 연결에는 `AGENTS.md`의 별도 승인이 필요하다.

---

## 2. 출처와 이용 조건

| 기호 | 자료 | 이용 조건 | 이 변경에서 한 일 |
| --- | --- | --- | --- |
| S1 | `nanikasheila/CLIP_STUDIO_PAINT_Format`의 `docs/spec/`(`01-container` ~ `04-raster`, `schema-catalog`) | MIT | 명세 문서를 읽고 **필드 위치·값의 의미·규칙이라는 사실만** 자체 표현으로 구현했다. 문서의 문장, 표, 코드를 복사하지 않았다. 저자는 실제 파일 719개로 대조했다고 적었고 항목마다 확신 수준(확인됨/추측)을 표시했다. 합성 모드 표는 저자가 CSP와 대조했다고 적었다. |
| S2 | `wamsoft/clipparse`의 `docs/CLIP_FORMAT.md` | MIT | 같은 방식으로 사실만 구현했다. 저자는 실제 파일 4개(블록 164,562개)로 측정했다고 적었고 항목마다 `[실측]`/`[추정]`을 표시했다. |
| S3 | `Inochi2D/clip-d`의 `SPEC.md` | BSD-2-Clause | 컨테이너 틀(헤더 필드 순서, 빅엔디언, 청크 순서)만 적은 문서. 컨테이너 문서에서 쓴다. |

**하지 않은 일(투명성)**

- CSP 또는 CELSYS 바이너리를 실행·디컴파일·분석하지 않았다. REA(`reverse-engineer-anything`)와 Ghidra를 이번 변경에 사용하지 않았다.
- 구현자는 제3자 저장소의 코드를 읽지도 가져오지도 실행하지도 않았다. 명세 문서만 읽었다. **정정(2차 개정)**: 구현을 마친 뒤 독립 검토를 맡긴 에이전트(별도 컨텍스트)는 명세의 진술이 맞는지 확인하려고 S1 저장소의 Rust 소스 파일 일부를 읽었다. 읽기만 했고 가져오거나 실행하지 않았으며 구현은 그보다 먼저 작성됐다. 검토 보고서의 지적은 사실(필드 위치·값의 의미·대소문자)로만 옮겨 반영했고 코드는 옮기지 않았다. 그래도 "제3자 코드를 전혀 보지 않았다"고는 말할 수 없으므로 이 구현을 클린룸이라고 주장하지 않는다(법적 결론도 아니다).
- 실제 `.clip` 파일을 입수하거나 열어 보지 않았다. 아래 모든 "일치"는 **독립된 문서가 같게 적었다**는 뜻이지 우리가 확인했다는 뜻이 아니다.
- **명세 문서는 웹 조회 도구의 발췌와 요약을 거쳐 읽었다.** 문서 전문을 한 줄씩 대조한 것이 아니다. 그래서 아래 표의 "S2는 적지 않았다" 같은 표현은 "내가 읽은 범위에서 확인하지 못했다"는 뜻이다. **이 한계가 실제 오류를 만들었다**: 두 번째 독립 검토(2026-10-30)는 출처 귀속 오류를 여섯 건 찾았다(컷 틀 폴더가 S1 전용인데 S2로 적음, 외부 청크 부재 처리와 `CanvasDefaultColorTypeIndex`·`CanvasChannelBytes`가 "한쪽만"이 아니라 일치였음, 텍스트·벡터 정책이 S1의 서술과 반대 방향인데 어긋남 목록에 없었음, 0.5% 허용 오차의 출처 오인, `Attribute` 값 배치의 "일치" 과장). 구현자가 해당 문서를 다시 발췌해 확인했고(2026-10-30) 아래 표와 소스 주석을 바로잡았다. 그래도 표의 "일치/S1만/S2만"은 원문 줄 단위 대조가 아니라 요약과 두 차례의 직접 발췌에 근거한다.
- 법적 결론이 아니다. "사실만 자체 표현으로 옮긴다"는 운용이 충분한지는 앱에 연결하기 전에 소유자·법무가 확인하는 것이 바람직하다(ADR-0008 §4의 reference-only 운용과 같은 접근).

---

## 3. 근거 수준: 항목별 교차 확인

기호: **일치** = S1과 S2가 같게 적음(독립 출처 둘). **S1만** = S1만 적음(S2에서 확인하지 못함). **어긋남** = 둘이 다르게 적음. **가정** = 출처가 정하지 못해 구현이 규칙을 골랐음. 컨테이너 항목은 [컨테이너 문서 2.2절](chunked-sqlite-container-parser-2026-10-29.md)에 있다.

### 3.1 SQLite 문서 DB

| 항목 | 구현 | 근거 |
| --- | --- | --- |
| `CHNKSQLi` 본문은 표준 SQLite 3 | 주입한 판독기가 연다 | 일치 |
| `MainId`가 행 식별자이고 연결은 모두 `MainId`를 가리키며 0은 "없음" | 연결 값 0 = 끝 | S1(`02-database`). S2의 연결 목록 서술과 같음 |
| 표·열은 처음 필요할 때 만들어지므로 없는 열은 "값 없음"이지 오류가 아니다 | 필수 열(아래)만 요구하고 나머지는 기본값 | S1만 |
| `ExternalChunk.ExternalID`는 BLOB로 선언됐지만 TEXT로 저장된다 | 외부 ID는 `Offscreen.BlockData`에서 읽고 문자열·BLOB를 모두 받는다(끝의 NUL은 뗀다). **`ExternalChunk` 표는 읽지 않는다**: S2는 "실체의 유무는 `ExternalChunk`에 실렸는지로만 판정하라"고 적었으나 이 구현은 컨테이너의 `CHNKExta`가 있는지로 판정한다. 두 판정이 어긋나는 파일(표에는 있는데 청크가 없음)은 조용히 투명하게 읽히므로 실샘플 검증 항목이다(7절) | 일치(S2도 같은 점을 적음). 판정 방식은 구현의 선택 |
| `Offscreen.BlockData`가 가리키는 데이터 청크가 컨테이너에 없으면 그 오프스크린은 **저장된 데이터가 없는 것**이다. 블록 크기(`BlockSize`)는 데이터 유무를 알려 주지 않는다 | 모든 블록이 초기 색을 따른다(`clip-offscreen-external-absent` 경고). 외부 ID가 없는 오프스크린도 같다(조용히). 단 컨테이너를 끝까지 읽지 못했거나 해석하지 못한 외부 블록이 있으면 청크가 사라졌을 수 있어 단정하지 않고 `clip-offscreen-external-missing`으로 실패시킨다 | 일치: S2(측정한 파일에서 확인)와 S1 `01-container`("열이 외부 ID를 가리켜도 그 청크가 없는 경우가 있고 읽는 쪽은 '데이터 없음'으로 취급한다"). 3차 개정이 "S2만"을 정정 |
| 외부 ID의 16진 글자 대소문자 | DB의 ID와 컨테이너의 ID를 **소문자로 맞춰** 비교한다. 대소문자만 달라 짝을 못 찾으면 모든 래스터 레이어가 조용히 투명해지기 때문이다. 대소문자만 다른 두 청크 ID는 같은 ID로 보고(`clip-external-duplicate-id`) 처음 것만 쓴다. 결과의 `layer.storedBlocks`(마스크는 `mask.storedBlocks`)는 실제로 푼 블록 수라서 전부 0이면 이 대조를 의심한다 | S2: `extrnlid` + 32자리 **대문자** 16진(§2.2.1). S1: 대소문자를 적지 않음. 두 곳(DB·청크)이 같은 글자를 쓴다는 근거는 없다 → 가정 |
| 열 이름 | `Canvas`: `MainId` `CanvasUnit` `CanvasWidth` `CanvasHeight` `CanvasResolution` `CanvasRootFolder` (필수), `CanvasDefaultColorTypeIndex` `CanvasChannelBytes` (선택). `Layer`: 필수는 `MainId` `LayerFirstChildIndex` `LayerNextIndex`, 읽는 열은 `CLIP_LAYER_COLUMNS`(34개; 이름·UUID는 판독기가 앞 4,096자/바이트만 가져오게 요청하고, `TextLayerString` `GradationFillInfo` `FilterLayerInfo` `ResizableImageInfo`는 길이만, `VectorNormalStrokeIndex`는 NULL 여부만 묻는다). `Mipmap`: `MainId` `BaseMipmapInfo`. `MipmapInfo`: `MainId` `Offscreen` `ThisScale`. `Offscreen`: `MainId` `Attribute`(1 MiB까지) `BlockData`(4,096자까지). `CanvasPreview`: `ImageData` | S1의 `schema-catalog`. S2는 `Layer`·`Mipmap` 계열의 이름을 적었고 `Canvas`의 크기 열 이름은 적지 않았다. `ResizableImageInfo`가 BLOB 열이라는 점은 독립 검토가 바로잡았다 |

### 3.2 캔버스

| 항목 | 구현 | 근거 |
| --- | --- | --- |
| `CanvasRootFolder` = 루트 `Layer.MainId` | 트리 순회의 시작 | 일치 |
| 단위 코드 0 px, 2 mm는 S1이 확인된 값으로 적었고 **1 cm, 3 inch, 5 pt는 S1이 추측으로 표시했다** | 5개 코드를 모두 받고 이외의 코드(4 포함)는 `database-invalid`. 추측 표시가 있는 세 코드는 실제 파일로 확인되기 전까지 가정이다 | S1만(일부 추측) |
| 픽셀 크기 = `값 × 해상도 / 단위 길이`를 "偶数丸め"한다. 예: 297 mm, 600 dpi → 7016 px | 가장 가까운 정수로 반올림하고 정확히 .5면 짝수 쪽(round-half-even)으로 읽었다. **S1의 표현이 모호해 이 읽기는 가정이다**(가장 가까운 짝수 정수로 맞춘다는 뜻일 수도 있다) | S1만, 규칙은 가정 |
| 단위 셀이 NULL이면 픽셀(0)로, 해상도 셀이 NULL이면 해상도 없음(`resolution: null`)으로 읽고 픽셀 단위일 때만 받아들인다 | 독립 검토의 지적을 반영한 관대한 읽기. 근거가 되는 실제 파일은 없다 | 가정 |
| `CanvasChannelBytes`는 8비트 채널이면 1, `CanvasDefaultColorTypeIndex`는 0 컬러·1 회색·2 단색 | 값을 그대로 노출만 하고 해석에 쓰지 않는다 | 일치: S1, 그리고 S2 §3.2.1(`CanvasDefaultColorTypeIndex` 0 컬러·1 회색·2 단색)·§7(`CanvasChannelBytes`가 모든 표본에서 1. 단 S2는 의미를 미확정으로 표시). 3차 개정이 "S1만"을 정정 |

크기 환산을 직접 검증할 방법: 같은 문서에서 캔버스 전체를 덮는 래스터 레이어의 오프스크린 크기와 환산 결과를 대조한다(7절의 `extentEqualsCanvas`).

### 3.3 레이어 트리와 속성

| 항목 | 구현 | 근거 |
| --- | --- | --- |
| 트리는 `LayerFirstChildIndex`(첫 자식) + `LayerNextIndex`(다음 형제)의 연결 목록이고 0으로 끝난다. 형제는 **아래에서 위** 순서(첫 자식이 가장 아래) | 결과는 같은 폴더 안에서 위쪽이 먼저 오는 깊이 우선 순서 | 일치 |
| `LayerType` 256 = 루트, 1584 = 용지 | 루트는 결과에 넣지 않는다 | 일치 |
| `LayerType` 비트 0 = 래스터(비트 1은 마스크를 가진 래스터), 4096(비트 12) = 색조 보정 | 종류 판정에 쓴다 | 일치 (S2: 1 래스터, 2 = 마스크, 4096 필터, 4098 보정) |
| `LayerType` 800 = 작품 정보 | `story-info` | S1만 |
| `LayerFolder` 비트 0 = 폴더 | 폴더 판정 | 일치 |
| `LayerOpacity` 0~256 (256 = 100%) | `opacity = clamp(raw / 256, 0, 1)`, 원본도 노출 | 일치 |
| `LayerClip` ≠ 0이면 아래 레이어에 클리핑 | `clipToBelow` | 일치 |
| `LayerComposite` 값 → 모드 | 29개 값을 ID로 옮긴다(`normal` `multiply` … `pass-through` `divide`). 모르는 값은 `null` + 원본 | 일치: S2 §9의 표도 29개 값이 같다(독립 검토가 대조). S1은 저자가 CSP와 대조했다고 적음 |
| `LayerLock` 비트 0 = 편집 잠금, 비트 4 = 투명 픽셀 잠금 | `editLocked` `transparencyLocked` + 원본 `lockRaw`(나머지 비트는 해석하지 않음). 앞선 판의 `locked`(0이 아니면 잠김)는 비트를 구분하지 못해 없앴다 | S2만(S1은 비트 의미를 적지 않음), 단일 출처 가정 |
| 레이어 종류 판정 순서 | 용지 → 작품 정보 → 폴더(`ComicFrameLineMipmap`이 있으면 **컷 틀 폴더** `frame-folder`) → 텍스트(`TextLayerString`) → 채움(`GradationFillInfo`) → 보정(`FilterLayerInfo` 또는 비트 12) → 3D(`FirstLayerObject`) → 화상 소재(`ResizableImageInfo`) → 벡터(`VectorObjectList`에 든 레이어) → 래스터(비트 0) → 그린 것이 없는 벡터(`LayerType` 0 + `VectorNormalStrokeIndex`가 NULL이 아님) → 그 밖. 표지 열이 "있다"는 기준(BLOB는 길이 > 0, 정수는 > 0)은 구현의 가정이다(S1은 NULL이 아니면 그 종류라고만 적음) | 순서는 S1만(저자 코퍼스의 분포 표 포함). 컷 틀 폴더 표지(`ComicFrameLineMipmap`)도 **S1만**이다(S2는 컷 틀 폴더를 서술하지 않음. 3차 개정이 "S2"를 정정) |
| 종류별 픽셀 읽기 정책 | 래스터·화상 소재·3D는 저장된 픽셀을 읽는다(화상 소재·3D는 `clip-layer-cache-only`로 "편집 정보를 해석하지 않고 렌더 캐시만 읽는다"고 알림. S1은 화상 소재의 렌더 캐시가 저장되지 않은 경우가 많다고 적어 빈 버퍼로 읽히는 일이 잦을 수 있다). **텍스트·벡터·채움 레이어는 저장 픽셀이 있어도 읽지 않고** `clip-layer-kind-not-rendered`로 알린다. 보정·작품 정보·그 밖의 종류도 읽지 않는다 | S2(§2.3): 텍스트 레이어는 캔버스 전면 래스터를 저장하지 않고 글자 이미지는 어느 표의 외래 키로도 닿지 않는 경계 상자 오프스크린에 있으며, 벡터 레이어는 경계 상자 래스터조차 없다. S1(03, 합성 규칙): 래스터·벡터·텍스트·3D·화상 소재는 저장된 화소를 쓰고(벡터·텍스트는 화소가 없을 때만 근사·재구성), 채움·그라데이션·보정 레이어는 저장된 화소가 있어도 쓰지 않는다(낡을 수 있음). **텍스트·벡터는 두 출처가 어긋난다 → 4절**. 앞선 판은 이 레이어들의 캐시를 캔버스 좌표에 붙여 읽었는데 틀린 위치·낡은 내용을 낼 수 있어 바로잡았다 |
| 컷 틀 폴더는 마스크를 저장하지 않는다 | 마스크 연결 값이 있어도 레이어 마스크로 읽지 않고 `clip-layer-frame-mask-not-stored`로 알린다 | **S1만**(03). S2에는 컷 틀 폴더 서술이 없다. 3차 개정이 "S2만"을 정정 |
| 레이어 색은 `DrawColorMain{Red,Green,Blue}`의 32비트 값 상위 8비트 | `drawColor` + `drawColorEnabled`(용지의 색도 여기 든다고 S1이 적음) | S1만 |

### 3.4 위치

| 항목 | 구현 | 근거 |
| --- | --- | --- |
| 픽셀의 왼쪽 위 = `LayerOffset + LayerRenderOffscrOffset`. 많은 레이어에서 `LayerRenderOffscrOffset = −LayerOffset`라 픽셀이 캔버스 좌표 그대로다 | 이 합을 쓴다. 원본 여덟 개 값을 `placement`에 남긴다 | S1(확인됨) |
| 마스크의 왼쪽 위 = `LayerOffset + LayerMaskOffset + LayerMaskOffscrOffset` | 이 합을 쓴다 | S1만 |
| **어긋남**: S2는 다른 도구(clip-tools)의 경고를 옮겨 "`DrawToRenderOffscreenType`이 NULL이 아닌 레이어에서는 렌더 오프셋이 이미 래스터에 반영돼 있어 다시 더하면 안 된다"고 적었다(S2 자신의 측정이 아니라고 표시). S1은 그렇게 적지 않았다. 독립 검토도 이 어긋남이 풀리지 않았다고 확인했다 | S1의 합산을 따르고, `DrawToRenderOffscreenType` 원본 값을 `placement.drawToRenderOffscreenType`로 노출해 실제 파일에서 상관을 볼 수 있게 한다. 검사 도구가 그 값의 분포와 "렌더 오프셋이 레이어 오프셋을 상쇄하는 레이어 수"를 집계한다 | 어긋남, 미해결 |

### 3.5 래스터 경로와 오프스크린 속성

| 항목 | 구현 | 근거 |
| --- | --- | --- |
| `Layer.LayerRenderMipmap` → `Mipmap.MainId` → `BaseMipmapInfo` → `MipmapInfo.MainId`(첫 단계) → `MipmapInfo.Offscreen` → `Offscreen.MainId` | 이 순서로 따른다. 마스크는 `LayerLayerMaskMipmap`에서 같은 방식 | 일치 (S2는 `LayerId`·`ThisScale`로 찾지 말고 연결을 따라가라고 경고) |
| 첫 단계가 원본 크기(`ThisScale` 100)이고 아래 단계는 절반씩 | 첫 단계만 읽고(`BaseMipmapInfo`가 가리키는 행. `NextIndex`로 이어진 아래 단계는 쓰지 않는다), 배율이 100에서 절댓값 0.5(=0.5%)를 넘게 벗어나면 읽지 않고 `unsupported`로 알린다(99.5와 100.5는 읽고 그 너머는 읽지 않는다) | 첫 단계가 원본 크기라는 점은 일치. **0.5라는 허용 오차는 구현의 선택**이다(S1의 "0.5% 이내면 단계 화소를 그대로 쓴다"는 문장은 미리보기 배율과 단계 배율을 비교하는 것이라 이 용도의 근거가 아니다. 3차 개정이 "일치"를 정정) |
| 종이(용지) 레이어의 100% 밉맵은 실체(오프스크린)가 없고 `InitColor`가 불투명 흰색이다 | 용지 레이어는 픽셀을 읽지 않고 `drawColor`만 노출한다 | S2만 |
| `Offscreen.Attribute` BLOB: 머리 `u32 16` + 세 절 길이, 이어서 `Parameter`·`InitColor`·`BlockSize` 절(각각 `u32 9` + UTF-16BE 이름 + u32 BE 값 열) | `parseClipOffscreenAttribute`. 필드 배치는 `chunked-sqlite-blocks.ts` 머리말. 값 열의 모양은 **S2의 튜플과 길이 산식**을 따른다: `InitColor` = `(20, 초기화 여부, 묶음 RGBA, 추가 값 개수, 채널 수, 추가 값…)`이고 절 길이는 42 + 4 × 추가 값 개수, `BlockSize` = `(12, 블록 수, 채널 수, 블록마다 레코드 길이…)`이고 절 길이는 34 + 4 × 블록 수 | 틀(머리·세 절·이름)은 일치. **값 열은 S2만 세부를 적었다**: S1은 값 개수를 적지 않았고 `BlockSize`를 "개수, 크기들"로, `InitColor`를 "초기화 여부·알파 값·색의 값 10개"로 더 느슨하게 적어(S2의 앞쪽 `12`·채널 수나 `추가 값 개수`·`채널 수`가 없다) 직접 대조할 수 없다. 구현은 S2의 측정 산식에 맞춰 개수를 엄격히 검사하므로 S1의 서술이 글자 그대로 맞다면 모든 오프스크린이 `clip-offscreen-attribute`로 실패한다(조용하지 않다). 실샘플로 확인할 항목(3차 개정이 "일치"를 정정) |
| `Parameter`: 폭, 높이, 가로 블록 수, 세로 블록 수, 채널 순서(0x21 색 / 0x11 회색 / 0x01 알파), 채널 수, 바이트 코드 | 블록 격자가 크기에서 올림해 계산한 값과 같아야 한다 | S1 |
| `InitColor`: 초기화 여부, 두 번째 값(0xFFFFFFFF = 불투명 흰색), 추가 값(관찰된 것은 모두 0) | 데이터 없는 블록의 값. 두 번째 값을 빅엔디언 RGBA를 한 u32로 묶은 것으로 읽는다. 가정: 초기화 여부가 0이면 투명(0) | **어긋남**: S1은 이 값을 "알파 값"이라 부르고 S2는 RGBA 묶음이라 적었다(S2가 측정한 것은 0xFFFFFFFF 하나뿐). 4절 참조 |
| 외부 ID로 컨테이너의 `CHNKExta` 외부 블록을 찾는다 | `Offscreen.BlockData`의 ID → 컨테이너 `externalBlocks` | 일치 |

### 3.6 블록 레코드와 픽셀 배치

| 항목 | 구현 | 근거 |
| --- | --- | --- |
| 블록은 256×256, 가로 우선, zlib(수준 1) | 한 변 256 고정 | 일치 |
| 레코드 = 길이 + `BlockDataBeginChunk` + 번호·해제 후 크기·256·256·데이터 있음 + (압축 길이 구간) + `BlockDataEndChunk`. 데이터 없는 레코드 104바이트, 있는 레코드 압축 길이 + 112바이트 | `parseClipBlockRecords` | 일치 |
| **압축 길이 필드만 리틀 엔디언**, 나머지는 빅엔디언 | 같음 | 일치 |
| 색 블록(해제 후 327,680바이트): 알파 평면 65,536바이트 뒤에 BGRA 262,144바이트(넷째 바이트는 쓰지 않음). 직선 알파 | R,G,B 순서로 뒤집어 RGBA8 | 일치 |
| S2는 알파를 "4×4 슈퍼픽셀 64×64 격자로 접어 폭 64 타일 넷으로" 저장한다고 적었다 | 색인식 `((y>>2)·256 + 64·(y&3) + (x>>2))·4 + (x&3)`을 풀면 `y·256 + x`라서 **행 우선 평면과 같은 바이트**다. 테스트가 이 대수 항등식과 S2의 색인으로 배치한 블록의 해독을 모두 확인한다 | 일치(대수적으로 확인) |
| 회색 8비트(해제 후 131,072바이트): 알파 평면 뒤에 회색 평면 | `colorMode: "gray"`, R=G=B | 일치(S2는 clip-tools가 순서를 거꾸로 적었다고 정정: 알파가 먼저) |
| 마스크(해제 후 65,536바이트): 한 평면, 0 = 가림, 255 = 보임 | `mask.values` | 일치(S2도 한 평면이라고 적음) |
| 1비트 단색(해제 후 16,384바이트) | 비트 순서를 확인하지 못해 읽지 않고 `unsupported`로 알린다 | S1·S2 모두 비트 순서를 정하지 못함 |
| **어긋남**: `BlockCheckSum` — S1은 블록당 Adler-32이고 빈 블록은 0이라고 적었다. S2는 알고리즘이 미해결이며 0은 CSP가 받아들인다고 적었다. S2가 기각한 후보 가운데 S1의 식(길이 4바이트 LE + zlib 바이트에 대한 Adler-32)은 없었다 | 검증하지 않는다(zlib 스트림 끝의 Adler-32는 해제기가 확인한다) | 어긋남이라기보다 S1의 주장이 미검증인 상태(3차 개정이 서술을 정확히 함) |

### 3.7 미리보기

`CanvasPreview` 한 행의 `ImageData`가 PNG(전체 레이어를 합성해 줄인 이미지)라는 것은 S1과 S2가 모두 적었다(`ImageType` 1). 구현은 PNG 서명을 확인한 뒤 바이트를 복사해 돌려주고 크기 한도를 넘으면 읽지 않는다. 디코드는 하지 않는다.

---

## 4. 출처 사이의 어긋남과 이 구현의 선택

| 항목 | S1 | S2 | 선택 |
| --- | --- | --- | --- |
| `LayerVisibility` 비트 | 비트 0 표시, 비트 1 마스크 사용, 비트 2 미해명 | 0/1만 적음 | 비트 0을 `visible`로, 비트 1을 `mask.enabled`로 쓰고 원본 값을 노출 |
| `LayerFolder` 비트 4 | 팔레트에서 열림 | 접힘 | 해석하지 않고 `folderFlags` 원본만 노출(합성과 무관한 표시 상태) |
| `InitColor`의 두 번째 값 | "알파 값"(0xFFFFFFFF = 불투명) | 빅엔디언 RGBA를 한 u32로 묶은 값. 측정한 것은 0xFFFFFFFF 하나뿐이고 추가 값은 모두 0 | RGBA 묶음으로 읽는다(0xFFFFFFFF는 두 읽기에서 같다). 마스크의 초기 값은 그 u32의 마지막 바이트. 색이 0xFFFFFFFF가 아닌 파일에서 갈릴 수 있다 |
| 렌더 오프셋 | 픽셀 원점 = 레이어 오프셋 + 렌더 오프셋 | 다른 도구의 경고: `DrawToRenderOffscreenType`이 있으면 이미 반영됨 | S1을 따르고 `drawToRenderOffscreenType`를 노출(3.4절) |
| `BlockCheckSum` | 블록당 Adler-32 | 알고리즘 미해결 | 검증하지 않음 |
| 마스크 바깥 값 | 보통 보임(255)이며 `InitColor`로 정함 | `InitColor`의 의미는 미해결 | 초기화 여부가 켜져 있으면 알파 바이트, 꺼져 있으면 0(가정) |
| 텍스트·벡터 레이어의 저장 픽셀 | 래스터·벡터·텍스트·3D·화상 소재는 저장된 화소를 쓰고 벡터·텍스트는 없을 때만 근사·재구성(03 합성 규칙) | 텍스트는 캔버스 전면 래스터를 저장하지 않고 글자 이미지는 FK로 닿지 않는 경계 상자 오프스크린에 있으며, 벡터는 경계 상자 래스터조차 없음(§2.3) | **읽지 않고 알린다**(`clip-layer-kind-not-rendered`). 두 서술이 모두 맞다면(S1은 "있을 때", S2는 "연결로 닿는 것이 없다") `LayerRenderMipmap` 연결을 따라 읽어서는 쓸 만한 화소를 얻지 못한다. 실샘플에서 연결이 있는 텍스트·벡터 레이어를 찾으면 `chunked-sqlite-document.ts`의 `PIXEL_KINDS` 한 곳에서 정책을 바꿀 수 있다 |
| `Offscreen.Attribute`의 값 열 | 개수 미기재, `BlockSize`는 "개수, 크기들", `InitColor`는 "초기화 여부, 알파 값, 색의 값 10개" | `InitColor` 튜플 `(20, 여부, 묶음, 추가 개수, 채널 수, 추가…)`, `BlockSize` 튜플 `(12, 블록 수, 채널 수, 크기…)`, 길이 산식(실측) | S2를 따른다. S1과 모양이 다르면 모든 오프스크린이 `clip-offscreen-attribute`로 실패해 드러난다(3.5절) |

---

## 5. 구현

### 5.1 진입점과 결과

```ts
importChunkedSqliteDocument(source: Blob | Uint8Array | ArrayBuffer, options: {
  openSqlite: ClipSqliteOpener;   // 필수
  limits?: Partial<ClipDocumentLimits>;
  signal?: AbortSignal;
  decodePixels?: boolean;         // false면 구조만(미리보기는 읽는다)
}): Promise<ClipDocumentImportResult>
```

결과(`format: "clip-document"`, `specProfile: "clip-secondary-spec"`)는 `canvas`, `layers`, `previewPng`, `warnings`, `unsupported`, `diagnosticCounts`(진단 코드별 총 건수), `source`(길이, SHA-256)를 담는다. `warnings`·`unsupported` 목록은 코드마다 50건에서 접히지만(아래) `diagnosticCounts`는 접히기 전의 건수라서 레이어가 수천 개인 문서에서도 코드별 분포를 그대로 보여 준다. 레이어의 `storedBlocks`(마스크는 `mask.storedBlocks`)는 압축 데이터가 있어 실제로 푼 블록 수이고, 0이면 그 레이어 전체가 초기 색이다. `specProfile`은 이 구현이 따른 근거가 제3자 문서뿐임을 값으로 남긴 것이다. 레이어는 깊이 우선·위쪽 먼저의 `index`, `parentIndex`, `depth`, `kind`, 속성(원본 값과 환산 값), `placement`, `extent`, `pixels`(RGBA8 직선 알파), `mask`를 가진다.

**실패 정책**: 구조적으로 읽을 수 없는 문서(컨테이너가 `CSFCHUNK`가 아니거나 SQLite 구역이 없음, `Canvas`·`Layer` 표나 필수 열·루트 폴더가 없음, 판독기 실패, 한도 초과, 중단)는 `ClipDocumentError`(코드 `aborted` `source-invalid` `options-invalid` `source-too-large` `container-invalid` `database-invalid` `reader-failed` `limit-exceeded` `limit-invalid`)로 던진다. **레이어 하나의 픽셀·마스크를 읽지 못한 것은 던지지 않고** `unsupported`에 레이어 위치와 이유 코드(`clip-offscreen-*`, `clip-layer-pixels-unreachable`, `clip-layer-pixels-scale` …)를 남기고 나머지를 계속 읽는다. 의도적으로 읽지 않는 종류·형식(`clip-layer-kind-not-rendered`, `clip-layer-cache-only`, `clip-layer-adjustment-not-applied`, `clip-layer-kind-unsupported`, `clip-layer-frame-mask-not-stored`, `clip-offscreen-mono-unsupported`)도 같은 목록에 남는다. 이 코드들은 `CLIP_BY_DESIGN_UNSUPPORTED_CODES`로 내보내며, 실파일 검증은 `diagnosticCounts.unsupported`의 코드에서 이 집합을 뺀 나머지가 비어 있는지 본다(목록을 보면 접힘 요약 `clip-issues-collapsed`가 끼어 거짓으로 실패한다. 1비트 단색은 `clip-offscreen-format`이 아니라 `clip-offscreen-mono-unsupported`로 알려 일반적인 형식 불일치와 구분한다). 읽기 실패 문구는 "픽셀 읽기 실패: …" / "마스크 읽기 실패: …" 꼴이다.

경고 쪽에는 `clip-offscreen-external-absent`(데이터 청크가 없어 초기 색을 썼다), `clip-vector-list-unreadable`·`clip-preview-unreadable`(보조 표를 읽지 못했지만 가져오기를 계속한다), `clip-external-duplicate-id`(같은 외부 ID가 둘 이상이면 처음 것만 쓴다) 등이 남는다. 진단 목록은 전체 길이(`maxIssues`)와 **코드별 길이(50건)**를 모두 제한하고, 코드별로 넘친 건수는 `clip-issues-collapsed` 요약 한 건으로 붙는다(요약은 한도에 세지 않는다).

### 5.2 주입하는 SQLite 판독기의 약속

`ClipSqliteDatabase`는 `tableColumns(table)`(없으면 null)와 `select({table, columns, where?, distinct?, orderBy?, limit})`, `close()` 셋뿐이다. 가져오기는 일반 SQL을 만들지 않고 이 구조화된 요청만 보낸다.

- 표·열 이름은 상수와 `tableColumns` 결과에서만 온다. 판독기는 식별자를 검증해 인용하고, 값(`where.in`, 최대 500개)은 매개변수로 바인딩해야 한다.
- 열 모드 `present`/`length`는 큰 BLOB 열(`TextLayerString` `GradationFillInfo` `FilterLayerInfo` `ResizableImageInfo` `VectorNormalStrokeIndex`)의 내용을 옮기지 않고 존재·길이만 묻기 위한 것이다.
- 열의 `limit`은 판독기가 TEXT·BLOB 셀을 데이터베이스 안에서(`substr` 등) 앞의 `limit`글자/바이트로 자른 값만 돌려 달라는 요청이다. 이름·UUID(4,096), `Offscreen.Attribute`(1 MiB + 1), `Offscreen.BlockData`(4,096)에 쓴다. **이 요청이 막는 것은 큰 셀이 JavaScript 힙으로 옮겨지는 것뿐이다.** SQLite 엔진은 `substr`을 계산하려고 셀 전체를 엔진 메모리에 올릴 수 있다(2차 독립 검토의 측정, 2026-10-30: `node:sqlite`에서 96 MiB BLOB 한 칸에 `substr(열, 1, 16)`을 적용하자 프로세스 메모리가 약 48에서 143 MiB로 늘었고 `length(열)`은 늘지 않았다). 앞선 판은 "수백 MB짜리 셀이 메모리에 올라오지 않게 한다"고 적었는데 틀린 주장이었다. 32비트 wasm 힙 같은 곳의 판독기는 `length(열)`로 크기를 먼저 보고 `limit`보다 크면 셀을 읽지 않고 표지 값을 돌려주는 식으로 만들어야 한다(이 저장소의 테스트용 판독기는 그렇게 하지 않는다). 숫자 셀은 자르지 않고 그대로 돌려줘야 한다. 넘침을 알리는 `limit`(허용 상한 + 1)은 `Offscreen.Attribute`에만 쓴다. 이름·UUID·외부 ID는 정확히 허용 길이만 요청하고 넘침을 따로 알리지 않는다.
- 정수 셀은 `bigint`로 돌려줘도 된다(권장: 2^53을 넘는 값이 조용히 뭉개지지 않는다). 가져오기는 안전 정수로 환산하고, 안전 범위를 벗어나면 "값 없음"으로 본다(8절의 한계).
- 판독기는 읽기 전용·방어 모드로 열어야 한다(신뢰할 수 없는 파일). 테스트·검사용 `node:sqlite` 판독기는 읽기 전용으로 열고 `PRAGMA trusted_schema = OFF`를 건다. DB 구간은 복사하지 않고 비공개 사본의 **보기**로 넘기므로 판독기는 열기 전에 필요한 만큼 가져가야 하고 그 보기를 고치면 안 된다. 가져오기는 돌려받은 행 수(`limit` 이하)와 행마다 열 수를 확인하고 어기면 `reader-failed`로 던진다.
- **한계**: SQLite 엔진 안의 자원(뷰·재귀 CTE로 만든 느린 질의 등)은 판독기가 제한해야 한다. 가져오기는 엔진이 돌려준 뒤의 행 수·바이트만 제한한다. 앱에서는 작업자(worker)에서 시간 제한과 함께 쓰는 것을 권한다.

### 5.3 자원 한도

기본값은 `CLIP_DOCUMENT_LIMITS`(호출자는 낮추기만 할 수 있다). 2차 개정에서 `maxSourceBytes`를 2,147,483,647에서 1 GiB로 낮췄고(입력을 비공개 사본으로 한 번 복사하므로 그만큼의 연속 메모리가 필요하다), `maxLayerPixels`를 67,108,864에서 134,217,728로 올렸다(A3·600 dpi는 약 69.7 M 픽셀이다). `maxInflatedBytes`로 새로 생겼던 해제 작업량 한도는 3차 개정에서 레코드 순회·출력 버퍼 만들기·공유 복사본까지 세는 **`maxWorkBytes`**(기본 4 GiB)로 바뀌었다. 입력 복사 이야기를 보태면, SHA-256을 `crypto.subtle.digest`로 구하는 동안 플랫폼이 입력을 한 번 더 복사하므로 `maxSourceBytes`급 입력의 최고 메모리는 입력 크기의 약 2배다(2차 독립 검토의 측정: 200 MiB 입력에서 프로세스 메모리가 약 203 MiB 늘었다). 레이어 이름·UUID 열은 `maxTextCharacters`로 자르기 전에 코드 단위 4,096개까지 일시적으로 올라온다(최악 약 330 MB: 4,096 × 2열 × 20,001행, CJK 3바이트 기준 — 파일 크기에 비례해 증폭은 아니지만 어느 예산에도 잡히지 않는다).

| 한도 | 기본값 | 넘으면 |
| --- | --- | --- |
| `maxSourceBytes` | 1,073,741,824 | `source-too-large` |
| `maxLayers`(루트 제외) | 20,000 | `limit-exceeded` |
| `maxGroupDepth` | 64 | 그 아래를 읽지 않고 경고 |
| `maxCanvasDimension` | 262,144 | `limit-exceeded` |
| `maxLayerPixels`(오프스크린 하나) | 134,217,728 | 그 오프스크린만 `unsupported` |
| `maxDecodedBytes`(출력 버퍼 합계) | 1,073,741,824 | 이후 오프스크린은 `unsupported` |
| `maxWorkBytes`(디코드 작업량 누계, 되돌려 주지 않음) | 4,294,967,296 | 이후 오프스크린은 `unsupported` |
| `maxPreviewBytes` | 33,554,432 | 미리보기를 읽지 않고 경고 |
| `maxTextCharacters` | 1,024 | 이름·UUID를 자름 |
| `maxIssues` | 500 | 목록을 자르고 건수를 한 건으로 요약 |

블록 수준의 고정 상한(`chunked-sqlite-blocks.ts`): 오프스크린 하나의 블록 수 16,384(`CLIP_BLOCK_LIMITS.maxBlocks`), 레코드 하나의 압축 길이 ≤ 해제 후 크기 + 1/8 + 1,024바이트(zlib이 만드는 스트림은 `compressBound` 안이므로 정상 파일은 닿지 않는다), 블록 하나를 푸는 zlib 스트림의 DEFLATE 블록 수 256(정상 스트림은 수십 개 안쪽).

**CPU·메모리 방어(3차 개정)**
- 검증 순서: 레코드 표식·길이, 해제 후 크기의 형식 일치, 압축 길이 상한을 먼저 모두 확인한 뒤에야 출력 버퍼를 예약·할당한다. **레코드 구조가 깨진 입력은 버퍼를 잡지 않는다.** 블록 안의 zlib 본문이 깨진 입력은 풀어 봐야 알 수 있어 버퍼가 이미 잡힌 뒤 실패한다. 앞선 판의 "손상된 스트림이 큰 버퍼를 잡았다 버리지 않는다"는 구조가 깨진 경우에만 맞는 말이었고(2차 독립 검토 지적), `chunked-sqlite-document-budget.test.ts`의 "압축을 풀다 실패한…" 시험이 그 동작을 보여 준다.
- 예산은 둘이다. ① 출력 예산 `maxDecodedBytes` = **지금 살아 있는** 출력 버퍼의 합. 풀다 실패한 버퍼와 레이어에 붙이지 못한 버퍼의 몫은 돌려준다. ② 작업량 예산 `maxWorkBytes` = **돌려주지 않는 누계**(바이트로 환산): 오프스크린마다 `레코드 수 × 1,024`(`CLIP_RECORD_COST_BYTES`), 출력 버퍼 크기(할당과 초기 색 채움), 데이터가 있는 블록마다 `해제 후 크기 + DEFLATE 블록 수 × 8,192`(`CLIP_DEFLATE_BLOCK_COST_BYTES`), 공유 오프스크린의 복사본 크기. ②가 없던 앞선 판은 ①이 환급돼 되풀이를 막지 못했다: 레이어 20,000개가 서로 다른 거대한(1.3억 픽셀, 512 MiB) 오프스크린을 가리키고 모두 실패하거나 위치 때문에 버려지는 약 175 MB 입력이 오프스크린마다 큰 버퍼를 만들고 채웠다 버려 CPU 시간이 사실상 무제한이었다(2차 독립 검토의 외삽: 512 MiB 채움 약 0.3~1초 × 20,000회). 이제 작업량이 4 GiB에서 멈추므로 그런 입력은 큰 버퍼 몇 개(8개 안팎)를 만들고 끝난다. 정상 문서가 쓰는 작업량은 출력 크기의 약 2.3~2.9배다(2026-10-30 로컬 측정, 스크래치 스크립트로 Node zlib 수준 1이 만든 327,680바이트 블록 4종을 풀어 `(출력 262,144 + 해제 후 크기 327,680 + DEFLATE 블록 수 × 8,192 + 레코드 1,024) / 출력`을 계산: 무작위 2.91, 그라데이션+잡음 2.79, 단색 띠 2.29, 알파 평면 255 + 무작위 색 2.79; DEFLATE 블록은 1~21개). 그래서 기본값 4 GiB는 출력 예산(1 GiB)을 가득 채운 정상 문서(약 2.9 GiB)도 받는다.
- **작업량과 걸리는 시간(실측)**: 비용 상수는 최악 입력이 작업량 1바이트당 잡음 블록과 비슷한 시간을 쓰도록 맞췄다. 2026-10-30 이 환경(Node 22.22.0, 4 vCPU, 가벼운 다른 프로세스 하나가 도는 상태, 각 3회 실행, 스크래치 스크립트)에서 ① 무작위 RGBA 블록(허프만 부호화된 리터럴을 푸는 데 약 5.5 ms, 복사에 약 0.5 ms) 한 블록 해독 6.8~8.2 ms, 작업량 754,688바이트(약 9~11 ns/바이트), ② DEFLATE 블록 256개를 모두 15비트 동적 부호로 채운 블록 31~36 ms, 작업량 2,688,000바이트(약 12~13 ns/바이트. 15비트 표 하나를 만드는 데 약 100~150 µs, 보통 크기의 표는 약 12 µs), ③ 데이터 없는 블록 16,384개의 띠(출력 16 MiB) 31 ms, 작업량 33,554,432바이트(약 0.9 ns/바이트. 레코드 하나를 훑는 데 약 1.1 µs, 초기 색 채움은 바이트당 약 0.8 ns라 이 두 상수는 시간보다 넉넉하다). 이 속도로 기본 예산 4 GiB를 다 쓰는 데 ①은 약 39~47초, ②는 약 50~57초, ③은 약 4초가 걸린다. 압축이 잘 되는 정상 그림은 이보다 빠르다. 수치는 이 환경의 것이고 기기마다 다르다.
- 얇은 띠 하나가 블록 수천 개를 푸는 입력은 출력 크기(가장자리 블록을 잘라 센다)가 작아 ①로 막을 수 없는데, ②의 `해제 후 크기` 항이 막는다.
- 초기 색 채움은 첫 픽셀을 쓴 뒤 이미 쓴 구간을 두 배씩 복사해 가므로 픽셀마다 쓰는 반복보다 훨씬 빠르다(그래도 비용은 작업량에 센다).
- 같은 오프스크린을 가리키는 레이어들은 **한 번만 풀고** 첫 레이어가 원본 버퍼를, 나머지가 출력 예산을 잡은 복사본을 받는다. 복사본을 만들었다가 위치가 범위를 벗어나 버려도 출력 예산은 돌려주지만 작업량은 돌려주지 않는다.
- 데이터 없는 블록만 있는 오프스크린(블록 16,384개 포함)은 풀지는 않지만 레코드 순회와 출력 버퍼 비용(`레코드 수 × 1,024 + 출력 크기`)은 센다. 앞선 판의 "해제 작업량이 0이다"는 CPU가 0이라는 뜻이 아니었다.

출력 버퍼는 만들기 직전에 바이트 수를 출력 예산에 반영한다. 레이어를 모두 먼저 풀고 마스크 값은 그 뒤에 풀어 마스크가 레이어의 몫을 줄이지 않는다. 블록 해독기(`stepClipOffscreenDecode`)는 generator라서 데이터가 있는 블록 64개마다 `yield`하고, 가져오기는 그때마다 `pace()`를 부른다. 오프스크린 하나를 시도할 때마다(**성공이든 실패든**) 그리고 레이어 하나를 읽은 뒤에도 `pace()`를 부른다(앞선 판은 성공한 뒤에만 불러, 실패하는 오프스크린이 줄줄이 이어지면 중단 신호를 16개마다 한 번만 봤다). `pace()`는 부를 때마다 중단 신호를 확인하고 마지막 양보 뒤 25 ms 이상 지났을 때만 이벤트 루프에 양보한다(시계를 주입할 수 있어 24/25/26 ms 경계를 시험한다).

zlib 해제기(`inflateZlib`)는 `DecompressionStream` 대신 순수 구현이다: 출력 상한(`maxOutputBytes`)·기대 크기(`expectedBytes`)·DEFLATE 블록 수 상한(`maxBlocks`)을 강제하고, 헤더·FDICT·Adler-32를 확인하며, 잘림·압축 폭탄에 정해진 오류만 낸다. 불완전한 부호 집합과 EOB만 있는 부호 같은 드문 경우도 zlib과 같게 받아들이거나 거부한다. Node `zlib`과 수준·전략·`memLevel`·`windowBits`(9, 12, 15)를 바꿔 가며 같은 결과를 내는지 대조하고, DEFLATE를 비트 단위로 직접 쓰는 빌더(`deflate-writer.ts`)로 Node `zlib`이 만들지 못하는 스트림(과다 구독·불완전 부호·15비트 부호·범위를 벗어난 개수·반복 부호의 경계)을 시험한다.

---

## 6. 검증

- 합성 문서 단위 테스트(7절의 표본이 없을 때 가능한 전부): 트리 평탄화(순환·끊긴 연결·깊이·형제), 속성 환산, 위치 합산(경계 ±(2^31−1) 포함, 마스크는 x만·y만·합), 색 형식·초기 색, 마스크(초기 값 0·1·128·255), 종류 판정(우선순위 조합과 표지 열의 값 형식), 컷 틀 폴더, 캔버스 단위 환산(필드별 오류 문구 포함), 미리보기(길이 물음 `limit` 1, 서명 8바이트 각각, 한도 경계, 읽기 실패 시 경고), 컨테이너·DB 오류, 판독기 약속 위반과 실패(오류 문구와 200자 자름), 열기·조회·열기 직후·해독 도중의 중단, 레이어 하나의 픽셀 실패, 같은 오프스크린을 가리키는 레이어의 한 번 풀기와 복사본 예산, 실패한 해독의 출력 예산 되돌리기, 디코드 작업량 예산(레코드·출력·풀기·복사본 각 항의 경계, 얇은 띠 사례, **버퍼를 잡았다 버리기를 되풀이하는 입력과 복사본을 만들었다 버리기를 되풀이하는 입력이 작업량 누계에서 멈춤**), 외부 ID 대소문자(DB는 소문자·청크는 대문자, 그 반대, 대소문자만 다른 청크 둘), 레이어·마스크의 `storedBlocks`, 진단 코드별 총계(`diagnosticCounts`)가 목록의 접힘과 무관함, 실패하는 오프스크린이 이어질 때 중단 신호를 하나마다 확인함, 블록 130개짜리 레이어와 16,384개 빈 블록, 40개 레이어의 조회 묶음(16·16·8), 자원 한도의 경계(같은 값은 통과, 하나 모자라면 실패), 한도 옵션 검증, 입력 읽기 실패·SHA-256 대체 구현·DB 구간 보기, 진단 목록의 코드별 한도, 컨테이너의 외부 블록 순서(해석하지 못한 블록이나 중복 ID가 앞에 있어도 뒤의 유효한 블록이 연결됨), 마스크 복사본의 예산 경계, 출력 버퍼를 잡기 전에 실패한 해독이 예산을 되돌려 주지 않는 것, 복사본을 만들 메모리가 없을 때의 변환(`slice`를 대체해 `RangeError`는 레이어 실패로, 다른 예외는 그대로 던짐), 블록 해독기가 프로그램 오류를 던질 때의 전파(모듈을 대체해 확인).
- 손으로 적은 바이트 벡터와 인코더 출력의 대조, 바이트 하나를 바꾼 3,000건(속성·레코드 각각)의 퍼징(정해진 오류 외의 예외가 없음), 무작위 크기·종류·빈 블록 60건과 입력 픽셀의 일치, 절단 퍼징(속성 BLOB은 모든 길이, 블록 스트림은 7바이트 간격의 길이로 자른 입력에서 정해진 오류 외의 예외가 없음. 올바른 zlib 스트림 7종은 길이 0부터 전체 길이 − 1까지 모든 접두가 `truncated`).
- 명세 교차 확인 테스트: S2의 접힌 알파 색인식이 행 우선 평면과 같다는 항등식(65,536개 위치)과 그 색인으로 배치한 블록의 해독.
- 해독 도중 중단: 블록 해독기의 `next()` 호출 수를 세어(모듈 대체) 첫·둘째 양보 뒤 중단이 그 지점에서 멈추는지 확인한다. 양보 간격은 가짜 타이머로 `performance.now()`(없으면 `Date.now()`)와 `setTimeout(…, 0)`이 실제로 쓰이는지 확인한다.
- 시험이 약했던 곳(2차 독립 검토 지적)을 고쳤다: 진단 문구 자르기가 "한도에 비례하는 비용"인지는 문자열 반복자의 `next()` 호출 수(41번)로 확인하고, 벽시계 시간 단언은 없앴다. 판독기 시험의 임시 디렉터리 개수 비교는 시험 파일 전용 루트로 옮겨 병렬로 도는 다른 시험 파일의 판독기가 끼어들지 못하게 했다.
- 출처 없는 선택을 정답처럼 못박은 시험에는 그렇다고 주석을 달았다: 표지 열의 빈 BLOB 처리, 297 mm @ 600 dpi 밖의 반올림 기대값(4961 등).
- 변이 시험: 2,576개 변이 중 2,533개 검출(98.33%), 생존 43개는 모두 동치로 판정(6.1절).
- **한계**: 합성 문서는 읽기 코드와 같은 이해에서 나온 인코더가 만든다. 통과는 "코드가 우리의 이해대로 동작한다"는 증거이지 "이해가 실제 포맷과 같다"는 증거가 아니다. 이해가 틀렸다면 테스트도 같이 틀린다. 독립 검토가 찾은 오류 가운데 하나(외부 ID의 대소문자)가 바로 이런 경우였다: 코드와 테스트가 같은 오해를 공유해 통과하고 있었다.


### 6.1 변이 시험 (2026-10-30)

**방법.** 원본 소스는 건드리지 않고 임시 복사본에서 한 번에 한 곳씩 고쳐 대응하는 시험 파일을 돌렸다(연산자 뒤집기, `<`↔`<=` 같은 경계 이동, `if` 조건을 `true`/`false`로 고정, `break`↔`continue`, 숫자 상수 ±1, 불리언 반전. 문자열·주석·정규식 안은 건드리지 않음). 시험이 하나라도 실패하면 "검출", 60초 안에 끝나지 않으면(고친 반복문이 끝나지 않는 경우) "시간 초과"로 세고 이것도 검출로 본다. 끝까지 통과한 변이는 "생존"이며 하나씩 읽어 동치(관찰할 수 있는 동작이 같음)인지 진짜 시험 구멍인지 가렸다. 구멍은 시험을 더하거나 필요 없는 코드를 지워 없앴고, 소스가 바뀐 파일은 변이를 다시 만들어 처음부터 다시 돌렸다. 변이 도구는 일회용이라 저장소에 넣지 않았다(재현하려면 이 절의 방법대로 도구를 다시 만들어야 한다).

**결과.** 마지막 소스 기준이다. 해제기는 소스가 그대로이고, 나머지는 소스를 마지막으로 고친 뒤 다시 만든 변이로 돌렸다.

| 파일 | 변이 | 검출(시험 실패) | 시간 초과 | 생존(동치) |
| --- | ---: | ---: | ---: | ---: |
| `zlib-inflate.ts` | 780 | 728 | 18 | 34 |
| `chunked-sqlite-blocks.ts` | 576 | 561 | 13 | 2 |
| `chunked-sqlite-container.ts` | 316 | 314 | 2 | 0 |
| `chunked-sqlite-layer-model.ts` | 248 | 246 | 0 | 2 |
| `chunked-sqlite-document-reader.ts` | 320 | 320 | 0 | 0 |
| `chunked-sqlite-document.ts` | 287 | 282 | 0 | 5 |
| `chunked-sqlite-issues.ts` | 41 | 41 | 0 | 0 |
| `chunked-sqlite-pacing.ts` | 8 | 8 | 0 | 0 |
| **합계** | **2,576** | **2,500** | **33** | **43** |

검출률은 98.33%(2,533/2,576)다. 생존 43건은 모두 아래 표의 동치 변이다.

**동치로 판정한 생존 변이.** 판정은 코드를 읽은 분석이고, 해제기 34건은 추가로 무작위 차분 시험으로 확인했다: 원본과 변이가 같은 입력에 같은 출력·소비 바이트·DEFLATE 블록 수·오류 코드를 내는지 32,947건에서 대조했고 다른 것이 없었다. 입력은 Node `zlib`이 여러 수준·전략·창 크기로 만든 스트림, 비트 단위 빌더로 만든 고정·동적·저장 블록 스트림, 거기에 비트 뒤집기·자르기·덧붙이기를 가한 것, 출력이 초기 용량 65,536바이트와 131,072바이트 안팎인 스트림과 상한을 출력 길이·그보다 하나 적게 준 경우다. 이 대조가 힘이 있는지 보려고 시험이 이미 검출한 변이 40개를 무작위로 골라 같은 대조를 돌렸고 38개를 다르다고 가려냈다. 나머지 둘은 단위 시험만 아는 관찰로 검출된 것이다(거리 부호 표의 먼 거리 항목은 대조 입력의 거리가 닿지 않고, 버퍼 성장은 결과 바이트에 나타나지 않는다). 그래서 이 대조는 동치 분석을 보강하는 증거이지 증명이 아니다.

| 파일 | 변이(줄) | 동치인 이유 |
| --- | --- | --- |
| `zlib-inflate.ts` | `MAX_CODE_BITS` 15→16(65); 길이 개수·다음 부호·고정 표·코드 길이 배열 크기 +1 또는 −1(89, 109, 133, 141, 264) | 부호 길이는 코드 길이 알파벳이 만들어 0~15라 16번째 칸과 반복에 닿지 않는다. 늘어난 칸은 쓰이지 않고, 줄어든 칸(`+1`)도 15까지의 색인을 덮는다 |
| `zlib-inflate.ts` | 초기 출력 용량 `1 << 16`의 네 상수(66); 성장 배수 2→3(210) | 출력 버퍼를 언제 몇 번 키우는지만 바뀐다. 결과 바이트와 상한(`maxOutputBytes`)은 용량과 무관하고, 반환 버퍼가 상한을 넘지 않는 것은 용량을 상한으로 자르는 코드와 시험이 따로 보증한다 |
| `zlib-inflate.ts` | 해독 표 크기 `1 << maxLength`를 `2 <<`로(115) | 위쪽 절반은 `readSymbol`의 색인 마스크(`(1 << bits) - 1`)가 닿지 않는다 |
| `zlib-inflate.ts` | `symbol < symbolCount`→`<=`(91); `length > maxLength`→`>=`(94); `fill < size`→`<=`(124); `start < byteLength`→`<=`(303) | 한 번 더 도는 반복이 아무것도 바꾸지 않는다: 배열 밖 읽기는 `undefined`라 개수에 반영되지 않고, 배열 밖 쓰기는 무시되며, 같은 값을 다시 대입하고, 빈 구간의 Adler 갱신은 나머지 연산만 한다 |
| `zlib-inflate.ts` | `bitCount < count`→`<=`(169) | 비트를 한 바이트 더 미리 읽을 뿐이고 `alignToByte`가 완전한 바이트를 입력으로 되돌린다. 오류 판정은 부족한 비트 수로만 한다 |
| `zlib-inflate.ts` | 빈 거리 표의 크기·비트 수 4건(99) | 이 표에서 심볼을 읽으면 어느 경우든 같은 "잘못된 허프만 부호" 오류가 입력을 더 쓰기 전에 난다 |
| `zlib-inflate.ts` | `lengthCounts[0] = 0`→`1`(101); `code = 0`→`1`(110); 합산 반복 시작 1→2 또는 0(111) | 정규 부호의 시작 값에 2^길이의 배수가 얹혀도 `reverseBits`가 아래 길이 비트만 쓴다. `lengthCounts[0]`이 0이라 시작을 1이나 2로 옮겨도 첫 걸음이 같은 0이다 |
| `zlib-inflate.ts` | 고정 표 캐시 조건 `fixedTables === null`→`true`(132); 고정 표의 `allowIncomplete` false→true 2건(139, 141) | 캐시를 없애면 매번 다시 만들 뿐이다. 고정 표는 완전한 부호라 불완전 허용이 쓰이지 않는다 |
| `zlib-inflate.ts` | 고정 표 채움의 끝 상수 4건 +1(134~137) | 다음 `fill`이 그 칸을 덮어쓰거나 배열 끝에서 잘린다 |
| `zlib-inflate.ts` | `readBits`의 `count === 0` 조기 반환 제거(177) | 0비트를 읽는 일반 경로도 0을 돌려주고 상태를 바꾸지 않는다 |
| `chunked-sqlite-blocks.ts` | 초기 색 채움의 `filled < output.byteLength`→`<=`(346) | 끝에서 길이 0인 `copyWithin`을 한 번 더 부를 뿐이다 |
| `chunked-sqlite-blocks.ts` | `hasContent`를 읽는 바이트 순서 false→true(263) | 0인지 아닌지만 보며, 같은 4바이트는 어느 순서로 읽어도 0일 때만 0이다 |
| `chunked-sqlite-document.ts` | 타입 위치의 리터럴 `ok: true`, `ok: false` 2건(196, 204) | 타입 선언이라 컴파일 때 지워진다 |
| `chunked-sqlite-document.ts` | 마스크 `defaultValue: pixels.initial[0] ?? 0`의 대체값 0→1(555) | 마스크 오프스크린의 `initial`은 항상 한 원소라 대체값에 닿지 않는다(`noUncheckedIndexedAccess`가 요구하는 문장) |
| `chunked-sqlite-document.ts` | 입력이 `Uint8Array`인 분기 제거(149) | `ArrayBuffer` 경로(`new Uint8Array(source.slice(0))`)도 같은 내용의 사본을 만든다. 한 번 더 복사할 뿐이다 |
| `chunked-sqlite-document.ts` | `subtle !== undefined`→`true`(163) | `subtle`이 없으면 `subtle.digest` 호출이 던지고 바로 아래 `catch`가 순수 구현으로 돌아간다 |
| `chunked-sqlite-layer-model.ts` | `readClipInteger`의 `typeof value === "bigint"`→`true`(27) | bigint가 아닌 값은 `BigInt(converted) === value`가 항상 거짓이라 어느 쪽이든 null이다 |
| `chunked-sqlite-layer-model.ts` | 텍스트 셀 바이트 상한 `maxCharacters * 4`→`* 5`(50) | UTF-8은 UTF-16 코드 단위당 최대 3바이트라 4배로 충분하고, 더 읽어도 뒤의 `slice`가 `maxCharacters`에서 자른다 |

**분석이 틀렸던 사례.** 해제기의 `while (capacity < needed)`→`<=`(210)를 처음에는 "성장 배수와 같은 종류의 용량 변이"로 보아 동치라고 적었다. 다시 따져 보니 용량이 필요한 크기와 같아지는 순간(`capacity == needed == maxOutputBytes`)에 한 번 더 도는데, 상한에서는 더 자랄 수 없어 **끝나지 않는다**. 초기 용량(65,536바이트)을 처음 넘는 한 걸음이 곧바로 상한에 닿는 입력(출력 65,537바이트, 상한 65,537)에서만 일어나 기존 시험이 놓쳤다. 직접 돌려 무한 반복을 확인하고 그 입력의 시험을 더했다(`zlib-inflate.test.ts`). 동치 판정은 틀릴 수 있으므로, 이 표의 항목도 읽는 사람이 다시 따져 볼 수 있게 이유를 적었다.

**한계.** 이 변이들은 시험이 "코드가 우리의 이해대로 동작하는가"를 얼마나 촘촘히 확인하는지를 잴 뿐이다. 이해가 실제 포맷과 같은지는 재지 못한다(위 6절 한계).

---

## 7. 실제 샘플 검증 절차

사용자가 소유하거나 사용 허락을 받은 `.clip` 파일을 `tests/corpus/formats/local-samples/`에 둔다(Git이 무시한다).

```bash
pnpm exec tsx scripts/inspect-chunked-container.mts tests/corpus/formats/local-samples/<파일>.clip
pnpm exec tsx scripts/inspect-chunked-document.mts tests/corpus/formats/local-samples/<파일>.clip
pnpm exec vitest run tests/format-gateway/local-samples-corpus.test.ts
```

두 도구는 이름·UUID·픽셀·미리보기 바이트를 출력하지 않는다. 출력만 공유하면 샘플은 공유하지 않아도 된다.

| 출력 | 확인하는 가정 |
| --- | --- |
| 컨테이너 도구의 `headerLayout`, `head`, `external … idLengths`, `issues` | 컨테이너 문서 2.2절의 모든 항목 |
| 컨테이너 도구의 SQLite 테이블·컬럼 목록 | 3.1절의 열 이름. 없는 열은 코드가 기본값을 쓴다 |
| 문서 도구의 `canvas … -> W×H px (unit-conversion)` | 3.2절의 환산·반올림 규칙 |
| 문서 도구의 `extent: equalsCanvas / insideCanvas / outsideCanvas` | 캔버스 전체를 덮는 레이어의 크기와 환산 결과의 일치(3.2), 위치 합산(3.4) |
| 문서 도구의 `placement`·`drawToRenderType` | 3.4절의 어긋남(렌더 오프셋을 더해야 하는가) |
| 문서 도구의 `composite`·`visibility`·`lock`·`folderFlags` 분포 | 3.3절의 비트·합성 모드 표, 4절의 어긋난 비트 |
| 문서 도구의 `warnings`·`unsupported` 코드별 건수 | 접히기 전의 총계(`diagnosticCounts`). 텍스트 레이어가 수천 개여도 `clip-layer-kind-not-rendered×N`의 N이 50에서 포화하지 않는다 |
| 문서 도구의 `pixels … (color/gray)`, `unsupported` | 3.5·3.6절의 블록 배치. 알파·색이 어긋났다면 결과가 깨져 보인다 |
| 문서 도구의 `storedBlocks: layersWithStoredBlocks / layersAllInitial / totalBlocks`, `warnings`의 `clip-offscreen-external-absent` 건수 | 외부 ID 대조 가정(3.1절: 대소문자, `ExternalChunk` 판정). **그림이 있는 문서인데 `layersWithStoredBlocks=0`이면 대조가 어긋난 것이다** — 모든 레이어가 조용히 투명하게 읽혔다는 뜻이다 |
| 컨테이너 도구의 SQLite 표 목록의 `ExternalChunk`와 문서 도구의 외부 블록 수 | S2의 "`ExternalChunk`에 실려 있는 것만 실체가 있다"와 이 구현의 "`CHNKExta`가 있는 것"이 같은 ID 집합을 가리키는지(행 수와 ID가 맞아야 한다) |
| 문서 도구의 `preview … aspectMatchesCanvas` | 캔버스 크기 환산(가로세로비) |
| 코퍼스 테스트 | 위 가정이 한꺼번에 어긋나지 않았는지(구조 진단 없음, 읽지 못한 레이어 없음 — 코드별 총계로 보고 의도적으로 읽지 않는 코드만 허용, 범위와 픽셀 길이 일치, 미리보기 비율, **외부 블록이 있고 픽셀을 읽은 래스터 레이어가 있으면 저장된 블록을 푼 레이어가 하나 이상 있을 것**). 마지막 단언은 그림이 없는 문서나 외부 블록이 벡터·텍스트용뿐인 문서에서 틀릴 수 있으므로 실패하면 먼저 샘플을 확인한다 |

**다음 단계(아직 하지 않음)**: S2는 레이어를 합성한 결과가 `CanvasPreview`와 오차 0으로 일치한다고 보고했다. 일반 합성기를 만들어 같은 대조를 하면 픽셀 환원(알파·색 순서·직선 알파)을 가장 직접 검증할 수 있다. 실제 샘플이 있어야 의미가 있어 보류했다.

---

## 8. 알려진 한계와 하지 않은 것

- **미해결**(3·4절): 렌더 오프셋 해석, `LayerVisibility` 비트 2, `LayerFolder` 비트 4, `LayerLock`의 나머지 비트와 비트 0·4의 단일 출처 여부, `BlockCheckSum` 알고리즘, `InitColor` 두 번째 값의 의미(RGBA 묶음인지 알파 값인지, 특히 초기화 여부가 꺼진 경우), 캔버스 크기 반올림 규칙과 단위 코드 1·3·5, NULL 단위·NULL 해상도의 의미, `Canvas` 행이 둘 이상인 파일의 의미, 외부 ID 16진 글자의 대소문자가 DB와 청크 사이에서 항상 같은지(구현은 소문자로 맞춰 짝지운다), `ExternalChunk` 표로 판정한 결과와 `CHNKExta`로 판정한 결과가 항상 같은지(구현은 `ExternalChunk`를 읽지 않는다), 텍스트·벡터 레이어의 저장 픽셀(S1과 S2가 어긋남, 4절), `Attribute` 값 열의 모양(S2의 측정 산식만 따름).
- **읽지 않는 것**: 1비트 단색, 16비트·CMYK·실수 오프스크린, 텍스트·벡터·채움 레이어의 저장 픽셀(3.3절 정책), 텍스트·벡터·그라데이션·필터·3D·화상 소재의 편집 정보, 컷 틀 폴더의 마스크, 애니메이션, `.cmc`, 썸네일, 레이어 효과·타임랩스 같은 부속 정보, 마스크의 적용.
- **조용히 기본값을 쓰는 것**: 안전 정수 범위를 벗어나거나 정수가 아닌 정수 열 값(좌표 포함)은 "값 없음"으로 보고 0 같은 기본값을 쓴다. 좌표가 그렇게 뭉개져도 진단이 남지 않는다. 정상 파일에서는 일어나지 않을 것으로 보지만 실파일로 확인하지 못했다.
- **CPU**: 작업량 누계 기본값 4 GiB는 적대적 입력이 이 환경에서 약 40~60초의 CPU를 쓰게 할 수 있다(5.3절 실측: 허프만 부호화 블록 약 39~47초, 15비트 표를 가득 채운 DEFLATE 블록 약 50~57초. 대부분 해제와 복사). 이벤트 루프 양보와 중단 신호 확인은 유지되지만 확인 간격은 데이터 블록 64개(또는 오프스크린 하나)라서 최악의 블록(31~36 ms)이 이어지면 약 2.2초(64 × 35 ms, 계산값)가 걸릴 수 있다. 앱은 작업자에서 시간 제한과 함께 쓰고 필요하면 `maxWorkBytes`를 낮춘다(작업량 1 GiB가 최악 약 10~14초에 해당).
- **판독기의 엔진 메모리**: `limit`이 막는 것은 JS 힙뿐이다(5.2절). 큰 셀이 엔진 메모리에 올라오는 것은 판독기가 막아야 하며 이 저장소의 테스트용 판독기는 막지 않는다. 레이어 이름·UUID 열은 자르기 전에 최악 약 330 MB가 일시적으로 올라올 수 있다(5.3절).
- **환원이 아닌 것**: `pixels`는 레이어 자체의 직선 알파 RGBA8이고 마스크·클리핑·불투명도·합성 모드는 적용하지 않는다.
- **쓰기**: 하지 않는다. `encodeClipContainer` 등은 합성 테스트 픽스처용이며 CSP가 여는 파일을 만든다고 보증하지 않는다.
- **앱 연결**: 하지 않았다. `AGENTS.md`의 별도 승인이 필요하다.
