# Clip Studio Paint `.clip`/`.lip` (`CSFCHUNK`) 통합 컨테이너 파서 (2026-10-29)

- **상태**: `current` — 구현과 합성 픽스처 단위 테스트까지 완료. 2026-10-29 개정에서 제3자 공개 명세 세 종과 항목별로 교차 확인했다.
  **우리가 실제 `.clip` 샘플로 검증한 것은 여전히 없다.**
- **작성일**: 2026-10-29 (같은 날 개정: 헤더 필드 순서·`CHNKHead`·외부 ID 형식 정렬. 같은 날 2차 개정: 독립 검토 반영으로 외부 ID 16진 글자의 대소문자 정정, 첫 `CHNKHead`만 해석, 짧은 `CHNKExta` 본문 진단 추가)
- **분석 도구**: 이번 변경에서 REA(`reverse-engineer-anything`)를 새로 실행하지 않았고, CELSYS 바이너리를 디컴파일하지도 않았다. 범위는 사용자가 소유한 문서 파일의 포맷 상호운용(읽기)으로 한정한다.
  근거는 제3자가 공개한 명세 문서(아래 2절)를 읽은 것뿐이며 그 문서가 인용한 코드는 가져오지 않았다.
- **구현 모듈**: [`packages/studio-format-gateway/src/chunked-sqlite-container.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-container.ts)
- **테스트**: [`packages/studio-format-gateway/src/__tests__/chunked-sqlite-container.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-container.test.ts)
- **선행 자산**: [`csp-lippreview-tos-scan-skshaper.ts`](../../packages/studio-format-gateway/src/csp-lippreview-tos-scan-skshaper.ts), [`csp-sut.ts`](../../packages/studio-format-gateway/src/csp-sut.ts)
- **후속 문서**: 항목별 교차 확인 표와 문서 가져오기(레이어 트리·픽셀)는
  [`chunked-sqlite-document-reader-secondary-spec-2026-10-29.md`](./chunked-sqlite-document-reader-secondary-spec-2026-10-29.md)

---

## 1. 개요 및 목적

ToonStudio는 창작자가 보유한 Clip Studio Paint 문서(`.clip`)와 미리보기 자산(`.lip`)을 가져올 수 있도록
`CSFCHUNK` 컨테이너를 클린룸 방식으로 다룬다. 기존 자산에는 다음 한계가 있었다.

- `csp-lippreview-tos-scan-skshaper.ts`는 `CHNKSQLi` 시그니처를 **선형 스캔**해 `CanvasPreview` PNG만
  추출한다. 컨테이너의 청크 디렉터리를 순회하지 않으므로 SQLite 페이로드를 선언 길이로 잘라내지 못한다.
- `csp-sut.ts`의 SQLite 검사(`inspectCspToolFile`)는 단일 SQLite 컨테이너(`.sut`/`.sutg`)를 전제해
  `CSFCHUNK`로 감싼 `.clip`에는 바로 적용되지 않는다.
- `CHNKExta` 외부 블록을 외부 ID로 열거하는 기반 리더가 없었다.

본 변경은 이 공백을 메우는 **기반 프리미티브**로서 컨테이너를 구조적으로 순회하고, 임베디드 SQLite를
선언 길이로 추출하며, 외부 블록을 열거하고, 합성 픽스처용 직렬화기를 제공한다.

---

## 2. 근거 수준 (Observed / Assumptions / Unknowns)

루트 `AGENTS.md` §10("불확실한 항목은 사실처럼 단정하지 않는다")에 따라, 이 저장소에서 확인되는 것과
제3자 문서에서 가져온 것, 아직 모르는 것을 분리한다. 초안(같은 날 오전)은 근거 링크 없이 기억에 기대어 가설 H1–H4를
적었다. 이번 개정에서 공개 명세 세 종을 읽고 항목별로 맞춰 보았다.

### 2.1 제3자 공개 명세 (Secondary sources)

세 종 모두 자신들이 가진 실제 파일에서 관찰한 결과라고 밝히지만 CELSYS의 공식 문서가 아니고, 우리가 그 파일을 본 것도 아니다.
따라서 아래 "일치"는 **독립된 세 문서가 같게 적었다**는 뜻이지 "우리가 확인했다"는 뜻이 아니다.

| 기호 | 출처 | 라이선스 | 성격 |
| --- | --- | --- | --- |
| S1 | `nanikasheila/CLIP_STUDIO_PAINT_Format` 의 `docs/spec/01-container.md` 외 | MIT | 실제 파일 719개로 대조했다고 밝힘. 항목별 확신 수준(확인됨/추측)을 구분함 |
| S2 | `wamsoft/clipparse` 의 `docs/CLIP_FORMAT.md` | MIT | 실제 파일 4개 측정. 항목별 `[실측]`/`[추정]` 표기 |
| S3 | `Inochi2D/clip-d` 의 `SPEC.md` | BSD-2 | 헤더 필드 순서·빅엔디언·청크 순서만 적음 |

문서 문장이나 그 문서가 인용한 코드는 가져오지 않았고, 사실(필드 위치·순서·값)만 자체 표현으로 구현했다.

### 2.2 컨테이너 항목별 교차 확인

| 항목 | 현재 구현의 가정 | 출처 일치 | 상태 |
| --- | --- | --- | --- |
| H1 고정 헤더 24바이트 | 매직 8 + uint64 BE 두 필드 | S1·S2·S3 | 일치 (세 종) |
| 헤더 필드 순서 (구 U1) | 오프셋 8 = 파일 길이, 오프셋 16 = 첫 청크 위치(24) | S1·S2·S3 | **해결**: 이 순서가 기대값. 반대 순서는 `clip-header-order-unexpected`로 알리되 받아들임 |
| H2 청크 프레임 | 라벨 8 + uint64 BE 길이 + 본문 | S1·S2·S3 | 일치 |
| H3 청크 종류와 순서 | `Head`, `Exta`(여럿), `SQLi`, `Foot`(빈 본문, 마지막) | S1·S2·S3(종류와 순서). 푸터의 "빈 본문, 마지막"은 S1·S2만 적고 S3은 적지 않음(2026-10-30 두 번째 독립 검토가 정정) | 일치. 순서가 다르면 `clip-chunk-order-unexpected`, 푸터 본문이 비어 있지 않으면 `clip-foot-not-empty` |
| `CHNKHead` 본문 (구 U2) | 40바이트: uint64 256, uint64 `CHNKSQLi` 청크 머리의 파일 내 위치, uint64 16, 16바이트 파일 ID | S1·S2 (S3은 필드를 적지 않음) | **해결**(둘 일치). `head`로 노출. 첫 값 256·ID 길이 16의 **의미**는 모른다(관찰된 상수). 첫 `CHNKHead`만 해석한다: 첫 것이 해석에 실패해도 뒤의 것으로 대신하지 않으며, 둘째 이후는 `clip-chunk-order-unexpected`로 알린다 |
| H4 `CHNKExta` 본문 | uint64 40(ID 길이) + 40바이트 ID + uint64 데이터 길이 + 데이터 | S1·S2 | **확정**: 맨 앞 uint64 "데이터 길이"는 실재하는 필드이며 픽셀 블록 영역의 "남은 길이"와 같은 값이다 |
| 외부 ID 형식 | `extrnlid` + 16진 32자리(40자). **글자의 대소문자는 가리지 않고 받는다** | 길이·접두사는 S1·S2 일치. 대소문자는 S2만(측정한 파일에서 **대문자**), S1은 글자 모양을 적지 않음 | 정정: 이 문서와 구현의 앞선 판은 "소문자"로 적었는데 근거가 없는 오기였다(독립 검토가 S2의 측정 서술과 어긋남을 찾아냈다). 어긋나면 `clip-exta-id-format-unexpected`(파서는 그대로 받아들임), `idWellFormed`로 노출 |
| `CHNKSQLi` 본문 | `SQLite format 3\0`으로 시작하는 DB 전체 | S1·S2·S3 | 일치 |

### 2.3 저장소에서 확인되는 사실 (Observed in repo)

1. 선행 모듈 `csp-lippreview-tos-scan-skshaper.ts`는 `.clip`을 `CSFCHUNK` 매직으로 식별하고 SQLite
   페이로드를 `CHNKSQLi` 라벨 뒤 16바이트(라벨 8 + 길이 필드 8) 위치로 다룬다. 다만 그 테스트는 합성 스텁이며,
   모듈 주석이 인용하는 REA/Ghidra 근거(`Planeswalker::PWDBSQLiteChunkRead` 등)는 이번 변경에서 재현하지 않았다.
2. SQLite 3 헤더 판정(페이지 크기·스키마 포맷·텍스트 인코딩)은 `csp-sut.ts`의 `inspectCspToolFile`이
   구현하고 테스트한다.

### 2.4 미확인 (Unknowns)

- **U2′** `CHNKHead` 첫 값 256과 파일 ID의 의미.
- **U3** `CHNKExta` 데이터 블록 내부의 압축·타일 인코딩 — 컨테이너 파서는 경계와 ID까지만 복원한다. 내부는 `chunked-sqlite-blocks.ts`가
  S1·S2의 공개 설명대로 해독하며, 그 근거는 후속 문서에 있다.
- **U4** `encodeClipContainer` 출력을 Clip Studio Paint가 열 수 있는지 — 직렬화기는 합성 픽스처용이다.
- **U5** 실제 `.clip` 샘플에 대한 파서의 양성·음성 동작 — 이번 변경에도 실제 샘플이 없다. 세 출처가 일치한다는 사실은 이 항목을
  대신하지 못한다.

---

## 3. 모듈 API

| 공개 심볼 | 역할 |
| --- | --- |
| `inspectClipContainerKind(bytes)` | 선두 바이트만으로 `csfchunk` / `lip-sqlite3` / `unknown` 판정 |
| `parseClipContainer(bytes, options?)` | 청크 디렉터리 순회, SQLite 섹션·외부 블록·진단 수집, `headerLayout` 판정 |
| `extractClipSqliteDatabase(bytes, options?)` | `CHNKSQLi` 문서 DB를 선언 길이 기준으로 복사 |
| `readClipExternalBlockData(bytes, block)` | 외부 블록 데이터 바이트 복사 |
| `encodeClipContainer({ chunks, headerLayout? })` | 합성 픽스처용 직렬화(헤더 오프셋·길이 자동 계산) |
| `encodeClipExternalChunkPayload({ externalId, data })` | `CHNKExta` 레이아웃 페이로드 조립 |
| `encodeClipHeadPayload({ sqliteChunkOffset, fileId? })` | `CHNKHead` 본문 40바이트 조립(합성 픽스처용) |
| `planClipContainerLayout(payloadLengths)` | 청크별 본문 길이로 각 청크 머리의 파일 내 위치를 계산(Head의 SQLite 위치를 미리 알아야 하는 픽스처용) |
| `CLIP_CONTAINER_LIMITS` | 입력·청크·외부 블록·ID 길이 안전 한도 |

### 3.1 방어적 설계

- **경계 검사 우선**: 모든 uint64 길이를 `Number.MAX_SAFE_INTEGER`와 잔여 바이트에 대조한다. 손상은 예외 대신
  `truncated`와 `FormatIssue`로 보고해 가능한 범위까지 복구한다(`csp-sut`의 "원본 보존 + issue" 철학과 동일).
- **헤더 순서 비의존**: 청크 순회는 항상 고정 헤더(24바이트) 뒤에서 시작하므로 필드 순서가 달라도
  파싱 결과는 같다. 기대 순서(길이 → 위치)가 아니면 `clip-header-order-unexpected`, 판정 불가는
  `clip-header-fields-unrecognized`로 알린다.
- **재사용**: SQLite 판정은 `csp-sut`의 `inspectCspToolFile`을 그대로 쓴다.

진단 코드: `clip-input-too-large`, `clip-magic-unrecognized`, `clip-header-fields-unrecognized`, `clip-header-order-unexpected`,
`clip-chunk-label-invalid`, `clip-chunk-size-invalid`, `clip-chunk-overruns-file`, `clip-chunk-count-exceeded`,
`clip-chunk-order-unexpected`, `clip-foot-not-empty`, `clip-head-length-unexpected`, `clip-head-field-out-of-range`,
`clip-head-version-unexpected`, `clip-head-id-length-unexpected`, `clip-head-sqlite-offset-mismatch`,
`clip-exta-payload-too-short`(본문이 16바이트 미만이라 두 길이 필드를 담지 못함), `clip-exta-id-length-invalid`, `clip-exta-id-format-unexpected`,
`clip-exta-data-length-invalid`, `clip-external-count-exceeded`,
`clip-declared-length-mismatch`(`CHNKFoot`까지 읽지 못한 채 선언 길이가 실제보다 크면 `truncated`로 보고하며,
푸터까지 정상으로 읽은 경우에는 선언 길이 필드의 해석을 우리가 실제 파일로 확인하지 못했으므로 issue만 남긴다), `clip-footer-missing`.

반환 바이트(`extractClipSqliteDatabase`, `readClipExternalBlockData`)는 항상 입력과 메모리를 공유하지 않는
복사본이다(Node `Buffer#slice`는 뷰를 돌려주므로 `subarray` 후 새 `Uint8Array`로 복사한다). 해석에 실패한
`CHNKExta`의 외부 ID는 페이로드를 해시하지 않고 청크 인덱스(`clip-exta-unparsed-N`)로 식별해, 손상 청크가
많은 입력에서 CPU 비용이 입력 크기에 비례해 늘어나지 않게 한다.

---

## 4. 검증

- 합성 픽스처 단위 테스트 57종(1차 개정까지는 29종): 4청크 라운드트립, SQLite 정밀 추출, `.lip` raw 인식, 미지원 매직, 페이로드
  오버런, `CHNKExta` 손상 폴백, 라벨 길이 검증, `maxChunkBytes` 한도, 헤더 양방향 순서(기대 순서와 반대 순서의 경고), 헤더 판정 불가,
  선언 길이 불일치(푸터 미독 시 `truncated`), 푸터 누락, 푸터를 읽은 뒤의 길이 불일치(`truncated` 아님),
  Node `Buffer` 입력에서 추출 결과의 메모리 비공유. 같은 날 개정에서 늘린 것: 손으로 적은 바이트로 `CHNKHead`·`CHNKExta` 필드 읽기,
  `encodeClipHeadPayload`, Head 길이·상수·숫자 범위·SQLite 위치 불일치 진단, 푸터 본문 진단, 청크 순서 진단, 외부 ID 형식 진단(표 기반),
  `planClipContainerLayout`이 계산한 위치와 인코더 출력의 일치. 2차 개정에서 늘린 것: 외부 ID 16진 대소문자(경계 글자 포함)와 마지막 글자 경계(`g` `G` `@` `/` `:` `` ` ``),
  두 번째 `CHNKHead`와 해석에 실패한 첫 `CHNKHead`, 16바이트 미만 `CHNKExta` 본문과 16바이트 경계, 안전 한도(`maxBytes` `maxChunks` `maxExternalBlocks` `maxExternalIdBytes` `maxChunkBytes`)의
  같은 값은 통과·하나 넘으면 진단인 경계, 알림이 한 번만 나오는 것, `CHNK`로 시작하지 않는 라벨, 데이터 길이가 본문 끝을 넘는 경계, 헤더 두 필드가 모두 24이거나 모두 아닌 경우, 한도 값의 `RangeError`.
  3차 개정(변이 시험의 생존 지적)에서 늘린 것: 종류 판정의 경계(24바이트 `CSFCHUNK` 머리, 16바이트 SQLite 매직, 한 바이트 모자라면 `unknown`)와 매직이 없는 긴 입력, `.lip`·`unknown`의 `truncated` 값, 한도가 기본 상한과 같으면 통과·1 크면 `RangeError`이고 0은 통과인 경계, 헤더 uint64가 2^53−1이면 선언 길이이고 2^53이면 선언 길이만 모르는 경계, `Foot` 뒤에 청크처럼 보이는 바이트가 붙어도 읽지 않고 알리지도 않음, 청크가 하나뿐인데 `Head`가 아닌 경우와 SQLi가 첫 청크일 때의 순서·Head 위치 진단, 해석하지 못한 외부 청크의 `idWellFormed`. 사용하지 않던 `issue()`의 `path` 인자는 없앴다(변이 시험이 "path가 있을 때"를 시험하는 코드가 없음을 드러냈다).
- 합성 픽스처는 이 모듈이 이해한 레이아웃을 그대로 인코딩하므로, 테스트 통과는 **가정이 실제 포맷과 같다는 증거가
  아니다.** 실제 샘플 검증(U5)은 아래 5절의 도구로 수행한다.
- 구조 검사 CLI(`scripts/inspect-chunked-container.mts`)는 `CHNKHead`의 첫 값·SQLite 위치·파일 ID 길이를 출력한다(파일 ID 자체는 식별자일 수 있어
  출력하지 않는다). 단위 테스트 8종: 구조 요약(행 내용 비출력), 스키마 판독기
  미주입, 손상 SQLite의 `schemaError` 보고, JSON 경로 비출력(파일명만), 텍스트 출력, `--no-sqlite`, 사용법 오류
  (종료 코드 2), 읽기 실패(종료 코드 1).
  경로 출력과 식별자 인용 누락 두 변이(mutation)를 일부러 넣어 해당 테스트가 실패함을 확인했다.

---

## 5. 실샘플 검증 절차와 블로커

가정 H1–H4는 사용자가 소유한 실제 `.clip`/`.lip` 파일로만 검증할 수 있다. 샘플이 없는 지금은 도구까지만 준비했다.

1. 샘플을 `tests/corpus/formats/local-samples/`에 둔다. 이 디렉터리는 `README.md`만 추적하고 나머지는 Git이
   무시한다(`.gitignore`). 본인이 만들었거나 사용 허락을 받은 파일만 둔다.
2. 구조를 검사한다. 픽셀, 행 내용, 사용자 텍스트는 출력하지 않고 청크 목록, SQLite 테이블·컬럼 이름, 행 수만
   출력한다. 파일은 SHA-256과 파일명(경로 제외)으로만 식별하므로, 샘플 대신 이 출력만 공유할 수 있다.

   ```bash
   pnpm exec tsx scripts/inspect-chunked-container.mts tests/corpus/formats/local-samples/<파일>.clip
   ```

3. 가정을 자동 확인한다. 샘플마다 헤더 판정, `CHNKSQLi`·`CHNKFoot` 존재, 외부 블록 해석, 진단 없음을 단언한다.
   샘플이 없으면 샘플별 테스트는 만들어지지 않고 로컬 디렉터리의 Git 무시 규칙만 확인한다.

   ```bash
   pnpm exec vitest run tests/format-gateway/local-samples-corpus.test.ts
   ```

4. 결과로 2.2절의 "출처 일치" 항목을 "우리가 확인함"으로 옮기고, 맞지 않는 항목은 파서를 고친다.
5. 그 뒤에야 SQLite 문서 스키마(레이어 트리)를 `@toonstudio/studio-project-model`의 `LayerGraphV3`로 사상하는
   임포터를 착수한다. 샘플 없이 컬럼명·열거값을 추측해 사상하지 않는다.
