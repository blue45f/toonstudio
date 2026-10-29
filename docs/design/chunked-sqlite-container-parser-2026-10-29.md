# Clip Studio Paint `.clip`/`.lip` (`CSFCHUNK`) 통합 컨테이너 파서 (2026-10-29)

- **상태**: `current` — 구현과 합성 픽스처 단위 테스트까지 완료. **실제 `.clip` 샘플로는 검증하지 않았다.**
- **작성일**: 2026-10-29
- **분석 도구**: 이번 변경에서 REA(`reverse-engineer-anything`)를 새로 실행하지 않았고, CELSYS 바이너리를 디컴파일하지도 않았다. 범위는 사용자가 소유한 문서 파일의 포맷 상호운용(읽기)으로 한정한다.
- **구현 모듈**: [`packages/studio-format-gateway/src/chunked-sqlite-container.ts`](../../packages/studio-format-gateway/src/chunked-sqlite-container.ts)
- **테스트**: [`packages/studio-format-gateway/src/__tests__/chunked-sqlite-container.test.ts`](../../packages/studio-format-gateway/src/__tests__/chunked-sqlite-container.test.ts)
- **선행 자산**: [`csp-lippreview-tos-scan-skshaper.ts`](../../packages/studio-format-gateway/src/csp-lippreview-tos-scan-skshaper.ts), [`csp-sut.ts`](../../packages/studio-format-gateway/src/csp-sut.ts)

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
가설을 분리한다. 초안에서는 헤더 레이아웃을 "관측 사실"로 적었으나 그 근거가 저장소에 없어 아래와 같이 정정했다.

### 2.1 저장소에서 확인되는 사실 (Observed in repo)

1. 선행 모듈 `csp-lippreview-tos-scan-skshaper.ts`는 `.clip`을 `CSFCHUNK` 매직으로 식별하고 SQLite
   페이로드를 `CHNKSQLi` 라벨 뒤 16바이트(라벨 8 + 길이 필드 8) 위치로 다룬다. 다만 그 테스트는 합성 스텁이며,
   모듈 주석이 인용하는 REA/Ghidra 근거(`Planeswalker::PWDBSQLiteChunkRead` 등)는 이번 변경에서 재현하지 않았다.
2. SQLite 3 헤더 판정(페이지 크기·스키마 포맷·텍스트 인코딩)은 `csp-sut.ts`의 `inspectCspToolFile`이
   구현하고 테스트한다.

### 2.2 가설 (Assumptions — 이번 변경이 기대는 전제, 미검증)

출처는 공개 커뮤니티 해설에 대한 기억이며, 1차 출처 링크는 확보하지 못했다.

- **H1 고정 헤더 24바이트**: 매직 `CSFCHUNK`(8) 뒤 uint64 BE 두 필드. 하나는 청크 시작 오프셋(24), 다른
  하나는 선언 파일 길이. **필드 순서는 확정하지 못해** 파서는 양쪽 순서를 모두 받아들이고 판정 결과를
  `headerLayout`(`length-then-offset` / `offset-then-length` / `unrecognized`)으로 노출한다.
- **H2 청크 프레임**: 라벨 8바이트(`CHNK`+4자) + uint64 BE 페이로드 길이 + 페이로드.
- **H3 청크 종류**: `CHNKHead`, `CHNKExta`(다수), `CHNKSQLi`, `CHNKFoot`.
- **H4 `CHNKExta` 하위 레이아웃**: uint64 BE 외부 ID 길이 + ASCII 외부 ID(`extrnlid…`) + uint64 BE 데이터
  길이 + 데이터. 맞지 않으면 원본 페이로드를 `parsed: false`로 그대로 노출한다.

### 2.3 미확인 (Unknowns)

- **U1** 헤더 두 필드의 실제 순서.
- **U2** `CHNKHead` 페이로드의 필드 의미.
- **U3** `CHNKExta` 데이터 블록 내부의 압축/타일 인코딩 — 외부 블록 경계와 ID까지만 복원하고 내부는 해석하지 않는다.
- **U4** `encodeClipContainer` 출력을 Clip Studio Paint가 열 수 있는지 — 직렬화기는 합성 픽스처용이다.
- **U5** 실제 `.clip` 샘플에 대한 파서의 양성·음성 동작 — 이번 변경에는 실제 샘플이 없다.

---

## 3. 모듈 API

| 공개 심볼 | 역할 |
| --- | --- |
| `inspectClipContainerKind(bytes)` | 선두 바이트만으로 `csfchunk` / `lip-sqlite3` / `unknown` 판정 |
| `parseClipContainer(bytes, options?)` | 청크 디렉터리 순회, SQLite 섹션·외부 블록·진단 수집, `headerLayout` 판정 |
| `extractClipSqliteDatabase(bytes, options?)` | `CHNKSQLi` 문서 DB를 선언 길이 기준으로 복사 |
| `readClipExternalBlockData(bytes, block)` | 외부 블록 데이터 바이트 복사 |
| `encodeClipContainer({ chunks, headerLayout? })` | 합성 픽스처용 직렬화(헤더 오프셋·길이 자동 계산) |
| `encodeClipExternalChunkPayload({ externalId, data })` | `CHNKExta` 가정 레이아웃 페이로드 조립 |
| `CLIP_CONTAINER_LIMITS` | 입력·청크·외부 블록·ID 길이 안전 한도 |

### 3.1 방어적 설계

- **경계 검사 우선**: 모든 uint64 길이를 `Number.MAX_SAFE_INTEGER`와 잔여 바이트에 대조한다. 손상은 예외 대신
  `truncated`와 `FormatIssue`로 보고해 가능한 범위까지 복구한다(`csp-sut`의 "원본 보존 + issue" 철학과 동일).
- **헤더 순서 비의존**: 청크 순회는 항상 고정 헤더(24바이트) 뒤에서 시작하므로 H1의 필드 순서가 틀려도
  파싱 결과는 같다. 판정 불가는 `clip-header-fields-unrecognized`로 알린다.
- **재사용**: SQLite 판정은 `csp-sut`의 `inspectCspToolFile`을 그대로 쓴다.

진단 코드: `clip-input-too-large`, `clip-magic-unrecognized`, `clip-header-fields-unrecognized`,
`clip-chunk-label-invalid`, `clip-chunk-size-invalid`, `clip-chunk-overruns-file`, `clip-chunk-count-exceeded`,
`clip-exta-id-length-invalid`, `clip-exta-data-length-invalid`, `clip-external-count-exceeded`,
`clip-declared-length-mismatch`(`CHNKFoot`까지 읽지 못한 채 선언 길이가 실제보다 크면 `truncated`로 보고하며,
푸터까지 정상으로 읽은 경우에는 헤더 해석(H1)이 미검증이므로 issue만 남긴다), `clip-footer-missing`.

반환 바이트(`extractClipSqliteDatabase`, `readClipExternalBlockData`)는 항상 입력과 메모리를 공유하지 않는
복사본이다(Node `Buffer#slice`는 뷰를 돌려주므로 `subarray` 후 새 `Uint8Array`로 복사한다). 해석에 실패한
`CHNKExta`의 외부 ID는 페이로드를 해시하지 않고 청크 인덱스(`clip-exta-unparsed-N`)로 식별해, 손상 청크가
많은 입력에서 CPU 비용이 입력 크기에 비례해 늘어나지 않게 한다.

---

## 4. 검증

- 합성 픽스처 단위 테스트 15종: 4청크 라운드트립, SQLite 정밀 추출, `.lip` raw 인식, 미지원 매직, 페이로드
  오버런, `CHNKExta` 손상 폴백, 라벨 길이 검증, `maxChunkBytes` 한도, 헤더 양방향 순서, 헤더 판정 불가,
  선언 길이 불일치(푸터 미독 시 `truncated`), 푸터 누락, 푸터를 읽은 뒤의 길이 불일치(`truncated` 아님),
  Node `Buffer` 입력에서 추출 결과의 메모리 비공유.
- 합성 픽스처는 이 모듈의 가정(H1–H4)을 그대로 인코딩하므로, 테스트 통과는 **가정이 실제 포맷과 같다는 증거가
  아니다.** 실제 샘플 검증(U5)은 별도 과제다.

---

## 5. 다음 단계와 블로커

1. **실제 `.clip` 샘플로 H1–H4 검증** — 사용자가 소유하고 저장소에 반입해도 되는 샘플이 필요하다. 반입 시
   권리·라이선스를 확인하고 `tests/corpus/formats/`의 기존 정책을 따른다.
2. 검증 후에 SQLite 문서 스키마(레이어 트리)를 `@toonstudio/studio-project-model`의 `LayerGraphV3`로 사상하는
   임포터를 착수한다. 샘플 없이 컬럼명·열거값을 추측해 사상하지 않는다.
