# 투고 패키지 내보내기와 계약서 검토 체크리스트

- 상태: 1절은 기준 커밋을 읽고 내린 결정의 근거(**current**)다. 2~3절은 이 변경(`claude/swq-pack` 브랜치)이 구현하고 테스트한 기능(**current** — 병합 전에는 이 브랜치에만 있다)이고, 5절은 아직 하지 않은 일(**target**)과 알려진 공백(**legacy exception**)이다.
- 기준 커밋: `c02cd0641729a166df1ba00598e7896d32aadd7c`
- 작성일: 2026-10-15
- 대상: Studio 프로젝트 > 내보내기 > 만든 파일(`/studio/p/:projectId/export?view=packages`), 학습 > 계약서 검토(`/learn/contract-checklist`), 제작 허브 > 계약·정산(`rights`) 화면
- 함께 보기: [Studio 현재 경계](../architecture/studio-current-boundaries.md) · 같은 ZIP 작성기를 쓰는 기존 코드 `apps/web/src/domains/creator/studio-package-archive.ts`

작가가 공모전·플랫폼에 작품을 내기 전에 두 가지를 스스로 마칠 수 있게 돕는 기능이다.

1. **투고 패키지**: 한 작품에서 회차 원고 3화 이상, 캐릭터 시트, 로그라인·시놉시스를 모아 ZIP 하나(+Markdown 표지, 선택 PDF 표지)로 묶는다. 전부 이 브라우저 안에서 처리하고 어떤 서버로도 보내지 않는다.
2. **계약서 검토 체크리스트**: 서명 전에 내 계약서를 문화체육관광부(문체부) 웹툰 표준계약서 항목과 하나씩 대조한다. **법률 자문이 아니다.**

## 1. 정본 모델 결정 (current)

"작품"과 "회차"를 가진 모델이 저장소에 셋 있다. 코드를 읽고 무엇이 원고의 정본인지 가렸다. 아래 근거는 기준 커밋의 소스에서 확인했다.

| 후보 | 실제로 가진 것 | 근거 (경로 · 기호) | 투고 패키지의 원천으로 |
| --- | --- | --- | --- |
| **Studio 프로젝트와 그 문서** | 원고 픽셀의 유일한 정본. 문서 안의 `pagesList`가 쪽(페이지) 목록이다. 프로젝트 쪽 목록은 문서의 제목·종류·폭·높이·쪽수 같은 **메타데이터**만 읽기 전용으로 가진다. 스토리 바이블(캐릭터·서술형 시트)도 프로젝트 워크스페이스에 있다. | `studio-project-file.ts` (`pagesList: z.array(ProjectPageSchema).min(1).max(STUDIO_PROJECT_MAX_PAGES)`), `studio-creator-work-project.ts` (`pagesList: rawPages`), `studio-project-document-reader.ts` (`StudioProjectDocumentEntry`: `kind: "webtoon"`, `pageCount`, `width`, `height`), `studio-project-diagnostics.ts` (`StudioProjectDiagnosticSource.story.bible`·`story.narrative`), `planning/studio-character-profile.ts` (`StudioStoryCharacterProfile`) | **채택.** 회차는 프로젝트의 활성 `webtoon` 문서, 캐릭터 시트는 프로젝트 스토리 바이블이다. |
| **클라우드 시리즈 / 게시 작품** | 게시된 작품을 묶는 공개 메타데이터. `seriesId`·`episodeNo`·`seriesTitle`과 게시 결과 `pages: string[]`. 스키마가 준비되지 않은 환경에서는 `seriesId`·`episodeNo`가 항상 `null`이다. 캐릭터 시트·시놉시스 필드가 없다. | `apps/api/src/server/creator/works-contract.ts` (`CreatorWorkSummary`, `CreatorWorkDetail`), `apps/web/src/platform/creator-client.ts` (`seriesId`, `episodeNo`) | **쓰지 않음.** 게시 전의 투고에는 아직 없는 데이터이고, 읽으려면 서버 통신이 필요해 "브라우저 안에서만 처리"와 맞지 않는다. |
| **제작 허브 에피소드** | 제작 운영 기록. 단계 상태를 `EpisodeCollaboration`(`@toonstudio/core/production`)에서 **도출**하고, 산출물은 `integratedRevisionRef`·`visualRevisionRef`·`{processId, revisionId}` 같은 **개정 참조**로만 가리킨다. 픽셀을 갖지 않는다. | `production-hub/production-episode-stage.ts` (머리말: "새 저장소를 만들지 않고 기존 데이터에서만 도출한다"), `production-hub/process-compare-model.ts` (`kind: "revision"`), `production-hub/production-episode-room-model.ts` | **쓰지 않음.** 운영 상태의 래퍼일 뿐 원고를 담고 있지 않다. |

### 1.1 결정과 그 결과

- **원천은 Studio 프로젝트다.** 회차 칸의 출발점은 프로젝트의 활성 `webtoon` 문서(제목·폭·높이·쪽수는 안내에만 쓴다), 캐릭터는 스토리 바이블 + 서술형 시트(`buildSubmissionCharacterSheets`)다.
- **이미지는 사용자가 고른 파일이다.** 문서를 정확한 이미지로 굽는 일은 편집기만 할 수 있다. 기존 내보내기 패널도 같은 경계를 지킨다(`studio-shell/StudioExportPanel.tsx`: 프로젝트 수준 점검을 하고 "exact rasterization"은 편집기에 넘긴다). 그래서 이 화면은 편집기에서 내보낸 PNG·JPEG·WebP를 회차별로 받아 규격을 점검한다. 점검은 문서 메타데이터가 아니라 **고른 이미지의 실제 크기**로 한다.
- 에디터가 문서를 직접 굽는 연결, 게시 작품(시리즈)에서 가져오기는 5절의 공백이다.

## 2. 투고 패키지 (current)

### 2.1 위치와 흐름

위치: `StudioProjectIntegratedPage`의 `section === "export" && view === "packages"`(만든 파일). 패널은 `lazy()`로 불러오므로 다른 보기에는 ZIP·PDF 작성 코드가 들어가지 않고, 프로젝트가 바뀌면 `key={projectId}`로 새로 만들어 작품 소개·회차 칸·고른 이미지가 다른 프로젝트로 섞이지 않게 한다. 진입 파일: `apps/web/src/domains/creator/submission-package/StudioSubmissionPackagePanel.tsx`.

1. 작품 소개를 적는다 — 제목(필수), 작가명(선택), 로그라인, 시놉시스. 시놉시스가 비어 있고 프로젝트에 설명이 있으면 "프로젝트 설명 넣기"로 한 번에 채운다(덮어쓰지 않는다).
2. 회차마다 번호·제목·메모를 적고 이미지를 고른다. 이름의 숫자 순서로 자동 정렬하고, 위/아래 버튼으로 순서를 바꾸거나 목록에서 뺀다.
3. 스토리 바이블의 캐릭터 중 담을 인물을 고른다. 서술 시트를 한 칸이라도 채운 캐릭터만 기본으로 담긴다.
4. 폭 점검 기준(네이버 690·카카오 720·웹툰 캔버스 800·고화질 1080·점검하지 않음), 표지 언어, 표지 요약 PDF 포함 여부를 정한다.
5. "만들기 전 점검"을 읽는다 — 필수 구성 5개 진행도, 전체 용량 막대, 막는 문제·알림·참고 목록.
6. "투고 패키지 만들기" → 진행 표시(취소 가능) → "ZIP 저장". 만든 뒤 내용을 고치면 "ZIP에 반영되지 않았다"고 알리고 "고쳐서 다시 만들기"를 안내한다.

### 2.2 ZIP 구성

경로는 모두 ASCII다. 한글 제목이나 원래 파일 이름을 경로에 쓰면 운영체제마다 유니코드 정규화(NFC/NFD)가 달라 압축을 풀 때 이름이 깨지거나 겹칠 수 있어서다. 원래 이름은 `manifest.json`에 남긴다. ZIP 안에 최상위 폴더는 두지 않는다. 구현: `submission-package-layout.ts`.

| 경로 | 내용 |
| --- | --- |
| `cover.md` | 받는 사람이 가장 먼저 여는 표지: 제목·작가·만든 날·구성 요약·폭 점검 기준, 비어 있는 필수 구성, 로그라인, 시놉시스, 회차 표(쪽 수·가로 폭·용량), 캐릭터 목록, 알림, 파일 목록 |
| `cover.pdf` | (선택) 같은 내용의 A4 요약 PDF, 최대 12쪽. 글자를 그림으로 그려 넣으므로 **글자 선택·검색이 되지 않는다**. 읽는 정본은 `cover.md`다. 브라우저가 그리지 못하면 PDF 없이 만들고 화면에 알린다 |
| `synopsis.md` | 로그라인·시놉시스 본문 |
| `characters.md` | 고른 캐릭터의 성격·말투·배경·욕망·외형 메모·대표 대사·관계 |
| `manifest.json` | 스키마 `toonstudio.submission-package/v1`: 만든 시각·언어, 회차별 파일 경로·원래 이름·형식·가로세로·용량, 점검 결과 요약, 텍스트 파일 크기 |
| `episodes/ep-NNN/p-NNN.png\|jpg\|webp` | 회차 번호(3자리)별 폴더, 쪽은 놓은 순서. 이미지 바이트는 고른 파일 그대로이고, 확장자는 파일 이름이 아니라 **헤더의 서명**으로 판독한 형식을 따른다 |

ZIP은 기존 작성기의 "store"(압축 없음) 방식이다. 이미지는 이미 압축된 형식이므로 용량이 줄지 않는다.

### 2.3 만들기 전 점검 규칙

규칙은 순수 함수 `evaluateSubmissionPackage`(`submission-package-preflight.ts`)이고, 문구는 `submission-package-messages.ts`가 한국어·영어로 만든다. 만들기 직전에 같은 규칙으로 한 번 더 평가하므로 화면의 낡은 결과로 ZIP을 만들지 않는다.

| 구분 | 코드 | 조건 |
| --- | --- | --- |
| 막는 문제 | `title-missing` | 작품 제목이 비어 있음 |
| 〃 | `episodes-too-few` | 이미지를 읽을 수 있는 회차가 3화 미만 (`SUBMISSION_PACKAGE_MIN_EPISODES`) |
| 〃 | `episode-empty` | 이미지가 없는 회차가 있음 (회차를 지우거나 이미지를 추가해야 함) |
| 〃 | `episode-number-invalid`, `episode-number-duplicate` | 회차 번호가 비었거나 1 미만·정수가 아님, 또는 번호 중복 |
| 〃 | `page-unsupported`, `page-unreadable`, `page-empty` | PNG·JPEG·WebP가 아님 / 헤더를 읽지 못함 / 빈 파일 |
| 〃 | `text-too-long` | 제목·작가·로그라인·시놉시스·회차 제목·메모·캐릭터 칸이 글자 수 상한을 넘음 (잘라서 넣지 않는다) |
| 〃 | `episodes-too-many`, `episode-pages-too-many`, `package-files-too-many`, `characters-too-many`, `page-too-large`, `package-too-large` | 2.4절의 앱 상한 초과 |
| 알림 | `width-mismatch` | 고른 폭 기준(예: 네이버 690)과 다른 이미지가 있음. 기준과 실제 폭을 함께 알린다 |
| 〃 | `width-mixed` | 폭 기준이 "점검하지 않음"인데 이미지마다 폭이 다름 |
| 〃 | `platform-file-over`, `platform-episode-over` | 앱에 기록된 투고처 용량 기준(2.4절)을 넘음 |
| 〃 | `page-large`, `package-large` | 앱의 권장 용량을 넘음 |
| 〃 | `logline-missing`, `synopsis-missing`, `characters-missing`, `character-sheet-thin` | 빠진 항목 안내. 만들 수는 있고 표지에 "작성하지 않음"으로 표시된다 |
| 〃 | `episode-number-gap` | 회차 번호가 건너뜀 |
| 참고 | `author-missing` | 작가명이 비어 있음 |

필수 구성 진행도는 제목·회차(3화 이상, 빈 회차 없음)·로그라인·시놉시스·캐릭터 시트 5개이고, 작가명은 선택 항목이다.

### 2.4 크기·개수 상한과 그 이유

**아래 숫자는 이 앱이 브라우저 메모리를 지키려고 정한 값이며 투고처의 규정이 아니다.** `SUBMISSION_PACKAGE_LIMITS`(`submission-package-types.ts`)에 있고 화면에도 그렇게 적는다. 용량 단위는 화면의 `formatStudioByteSize`와 같은 1MB = 1024×1024바이트다.

| 항목 | 값 | 이유 |
| --- | --- | --- |
| 이미지 한 장 | 50MB | 기존 ZIP 작성기는 항목을 하나씩 통째로 메모리에 올려 CRC를 계산한다(`studio-package-archive.ts`의 `readSource`). 한 번에 올라오는 양의 상한이 곧 이 값이다 |
| 이미지 전체 합계 | 300MB | 결과는 Blob 조각을 이어 붙인 ZIP Blob이라 합계가 곧 결과 크기다. 중저사양 기기에서 끝까지 가도록 묶는다 |
| 이미지 수 / 회차 수 / 회차당 쪽 수 | 600장 / 100화 / 200장 | 목록 렌더링과 ZIP 중앙 디렉터리를 사람이 다룰 수 있는 범위로 묶는다 |
| 권장선 (넘어도 만들 수 있음) | 이미지 20MB, 합계 150MB | 메일·클라우드 업로드가 느리거나 막힐 수 있는 수준을 알리는 앱의 권장선 |
| 캐릭터 수 | 30명 | 표지와 `characters.md`가 읽을 만한 길이를 유지하게 한다 |
| 글자 수 | 제목 100 · 작가 60 · 로그라인 300 · 시놉시스 4,000 · 회차 제목 100 · 회차 메모 300 · 캐릭터 한 칸 1,500 | 잘라서 넣지 않고 줄이도록 막는다 |

기존 작성기의 자체 상한(`STUDIO_PACKAGE_ARCHIVE_LIMITS`: 파일 1,100개 · 항목 256,000,000바이트 · 합계 512,000,000바이트)은 위 값보다 크다. 호출 쪽은 작성기 상한을 **낮추기만** 한다(`submission-package-build.ts`의 `archiveLimits`).

투고처 용량 기준은 새로 만들지 않고 앱에 이미 기록된 내보내기 프리셋(`export/studio-export-presets.ts`의 `EXPORT_PRESETS`)을 읽는다. 폭 기준 `naver` → `naver-challenge`(이미지당 5MB·회차 합계 약 50MB)가 유일하게 용량 기준을 가진다. 이 값은 프리셋 작성 당시의 일반 기준값이며 **이 변경에서 투고처 최신 안내와 대조해 확인하지 않았다.** 화면 문구도 "앱에 기록된 일반 기준값이에요. 제출 전에 투고처의 최신 안내를 확인해 주세요."라고 말한다. 가로 폭 690·720·800·1080은 `studio-webtoon-guides.ts`의 `WEBTOON_WIDTH_STANDARDS`를 그대로 쓰는 작업용 가이드다.

### 2.5 브라우저 안 처리, 진행·취소·오류·재시도

- **서버 전송 없음.** 파일 선택(`<input type="file">`)으로 받은 `File`을 읽기만 하고 `fetch`·업로드를 부르지 않는다.
- **이미지 판독**: 파일 머리 4KB → 64KB → 1MiB만 읽어 PNG(IHDR)·JPEG(SOF)·WebP(VP8/VP8L/VP8X)의 형식과 가로세로를 얻는다. 전체를 디코딩하지 않는다. 동시에 4개까지 읽는다.
- **만들기**: `buildSubmissionPackage`가 점검 → 배치 계획 → (선택) 표지 PDF → 텍스트 파일·매니페스트 → `buildStudioPackageArchiveBlob`로 ZIP 조립 순으로 진행하고 `onProgress`로 단계·파일 수·바이트를 알린다.
- **취소**: `AbortSignal`을 모든 단계에 전달한다. 사용자가 취소하면 화면은 "취소했어요. 아무것도 저장되지 않았고 다시 만들 수 있어요"를 보여 주고, 화면을 떠나도 진행 중인 만들기를 취소한다.
- **오류와 재시도** (`SubmissionBuildErrorCode`): `invalid-draft`(점검이 막음, 재시도 불가), `limit`(앱 상한, 재시도 불가), `source-changed`(고른 파일을 읽는 도중 바뀌거나 지워짐, 재시도 가능), `unexpected`(재시도 가능), `aborted`(취소). 오류 화면은 이유와 해결 방법을 함께 말하고 재시도 단추를 둔다.
- **CRC 계산**: 기본은 Worker이고, Worker를 만들 수 없는 환경(CSP·구형 브라우저)이면 한 번만 메인 스레드 분할 계산(`direct-bounded`)으로 다시 시도하며 결과 화면에 알린다.
- **메모리**: 한 번에 올라오는 이미지는 하나(최대 50MB)이고 상한은 2.4절에서 미리 막는다. 결과 Blob은 저장하거나 "고쳐서 다시 만들기"를 누를 때까지만 화면이 쥔다.
- **저장**: `saveExportBlob`(`export/studio-export.ts`)을 쓴다 — 파일 선택기가 있으면 저장 위치를 고르고 없으면 다운로드한다. 선택 취소·저장 실패는 만든 패키지를 그대로 둔 채 따로 알린다.

### 2.6 저장하는 것과 저장하지 않는 것

- 저장함: 작품 소개 글, 회차 번호·제목·메모, 폭 기준, 표지 옵션, 캐릭터 직접 선택. `localStorage` 키 `toonstudio:submission-package:v1:<프로젝트 id>`, 400ms 디바운스, 바꾸기 전에는 쓰지 않는다. 저장소가 막혀 있으면 "이 화면을 닫으면 적은 내용이 사라져요"라고 알린다.
- 저장하지 않음: **이미지.** 용량이 커서 `localStorage`에 담을 수 없고 파일 접근 권한도 세션을 넘지 못하므로, 복원 뒤에는 "이미지 파일은 저장하지 않으므로 다시 골라 주세요"라고 안내한다.

### 2.7 재사용한 기존 코드

| 기존 코드 | 쓴 곳 |
| --- | --- |
| `studio-package-archive.ts` `buildStudioPackageArchiveBlob` | ZIP 조립(store 방식, UTF-8 이름, CRC-32, 진행·취소, 상한) |
| `studio-crc32-worker-client.ts` | CRC 실행 방식 선택과 Worker 폴백 |
| `export/studio-pdf-export.ts` `buildPdfFromJpegPages`, `canvasToJpegBytes` | 표지 PDF 쪽 조립 — `studio-review-pdf.ts`와 같은 방식(글자를 캔버스에 그려 JPEG로 넣는다) |
| `export/studio-download-file-name.ts` | 파일 이름(`<제목>-submission-<UTC 시각>.zip`) |
| `export/studio-episode-byte-budget.ts` `formatStudioByteSize` | 용량 표시 |
| `export/studio-export.ts` `saveExportBlob` | 저장 |
| `export/studio-export-presets.ts` `EXPORT_PRESETS` | 투고처 용량 기준 |
| `studio-webtoon-guides.ts` `WEBTOON_WIDTH_STANDARDS` | 폭 기준(네이버 690·카카오 720 등) |
| `studio-story-bible.ts`, `planning/studio-character-profile.ts` | 캐릭터와 서술형 시트(읽기 전용 투영) |
| `studio-shell/useStudioProjectWorkspace.ts` | 프로젝트 워크스페이스(스토리 바이블) 읽기 |

### 2.8 접근성과 표시

- 모든 조작이 이름 있는 기본 요소(`label`·`button`·`select`·`input`)이고 화면 순서대로 키보드로 닿는다. 순서 바꾸기·빼기 단추는 파일 이름을 포함한 접근 가능한 이름을 가진다(예: "02.png을(를) 위로 옮기기").
- 필수 칸이 비면 `aria-invalid`와 이유 문구를 `aria-describedby`로 잇는다. 문제의 심각도는 색이 아니라 "막는 문제 / 알림 / 참고" 글자와 아이콘으로 구분한다.
- **초점 이동**: 단추가 사라지는 변화마다 초점을 잃지 않게 옮긴다 — 만들기 → 취소 단추 → ZIP 저장 단추(오류면 다시 시도 단추), 회차를 더하면 새 회차의 번호 칸, 회차를 지우면 "회차 원고" 제목, 이미지를 빼면 그 회차의 제목, 순서를 바꾸면 옮긴 줄의 같은 방향 단추(끝에 닿아 꺼졌다면 반대 방향 단추). 처음 그릴 때는 초점을 가져가지 않는다.
- 진행은 `<progress>`, 용량은 `<meter>`, 상태 변화는 `role="status"`·`role="alert"`로 알린다. 불러오는 표시의 움직임은 `motion-reduce`에서 멈춘다. 색은 `globals.css`·`design-themes.css`에 선언된 토큰만 쓴다.

## 3. 계약서 검토 체크리스트 (current)

### 3.1 위치와 동작

- **학습**: `/learn/contract-checklist`(`domains/learn/LearningContractChecklistPage.tsx`). 학습 내비의 "계약서 검토", 사이트맵, 공개 라우트 목록(`site-public-routes.ts`), 리소스 제목(`creator-resource-titles.ts`)에 등록했다.
- **제작 허브**: `/production`의 "계약·정산"(`rights`) 화면 아래 "계약서 검토 체크리스트" 카드(`ProductionCommercialSurfaces.tsx`, id `production-contract-review`). 무거운 목록은 `LazyContractReviewChecklist`로 필요할 때만 불러온다.
- 두 곳이 같은 컴포넌트(`shared/components/contract-review/ContractReviewChecklist.tsx`)와 같은 저장소 키를 쓰므로 한쪽에서 고른 답이 다른 쪽에도 보인다.

화면 구성과 동작:

- 맨 위에 **"법률 자문이 아니에요"** 고지와 기준(고시 제2024-0032호, 2024-06-13 개정)·"이후 개정은 확인하지 못했어요"를 둔다.
- 항목마다 **"내 계약서에 있나요?"** 라디오 3택(있어요 / 없어요 / 잘 모르겠어요)과 "이 항목 답 지우기"를 둔다. 답에 따라 상태 표시가 "아직 확인 전 / 다시 확인 필요 / 먼저 확인하세요 / 표시된 문제 신호 없음"으로 바뀌고, "다시 확인 필요"와 "먼저 확인하세요"에서는 "다음 행동" 안내를 보인다("먼저 확인하세요"가 되는 답은 `attention`이 `when-absent`이면 "없어요", `when-present`이면 "있어요"다). 접이식 "표준계약서는 이렇게 다뤄요 · 내 계약서에서 볼 점"에는 표준계약서 내용, 살펴볼 점, 조항·쪽 근거와 출처 링크(새 창)가 들어 있다.
- 선택은 `localStorage`(`toonstudio:contract-review:v1`)에 저장한다. 저장소가 막히면 "저장되지 않아요" 배너를 보인다. 초기화는 확인 대화를 거친다.
- **Markdown 요약**을 내려받거나(`toonstudio-contract-review-YYYY-MM-DD.md`) 복사한다. 요약은 브라우저 안에서 만들고 서버로 보내지 않으며, 법률 자문이 아니라는 고지와 출처를 함께 넣는다. 다운로드·복사가 막히면 오류와 대안을 알린다.

### 3.2 항목 20개

데이터는 순수 모듈이다: `packages/core/src/contract-review-items.ts`(출처·분류·항목), `contract-review-checklist.ts`(답 처리·요약), 가져오기 경로 `@toonstudio/core/contract-review-checklist`. "표준 근거"의 조항·쪽은 해설집에 실린 표준 웹툰 연재계약서(별표3)와 2차적저작물작성권 계약서(별표7·8)를 기준으로 하며, 쪽은 문서 하단에 인쇄된 쪽 번호다.

| 분류 | id | 항목 | 표준 근거 |
| --- | --- | --- | --- |
| 기간과 권리 범위 | `term-and-extension` | 계약 기간·연장·권리 허락 기간 | 별표3 제3조 (58쪽) |
| 〃 | `grant-scope` | 권리의 범위: 연재 사이트·언어·독점 여부 | 제4조(59쪽)·제5조(60쪽)·제13조(65쪽) |
| 일정과 분량 | `delivery-volume` | 원고 인도 일정과 회차당 분량(컷 수) | 제2조 제13호(57쪽)·제7조(61쪽) |
| 〃 | `delay-penalty` | **지체상금(마감 지연 패널티)** | 제6조(60쪽)·제7조(61쪽)·제22~24조(70~71쪽), 2018 보도자료 |
| 〃 | `pause` | 휴재(쉬어 갈 권리) | 제8조 (62쪽), 정책브리핑 |
| 대가와 정산 | `fee-per-episode` | 회차당 대가와 지급 시기 | 제9조 (62쪽) |
| 〃 | `revenue-share` | **수익 배분(RS) 비율**과 ‘순 매출액’ 정의 | 제2조 제14·15호(57쪽)·제10조(63~64쪽), 정책브리핑 |
| 〃 | `deduction-method` | 연재료·비용 공제 방식과 적자 처리 | 제10조 제2항(63쪽), 부록 ‘완전원고 대가 계산 방식’(76~83쪽) |
| 〃 | `settlement-cycle` | **정산 주기**와 정산서 | 제9조(62쪽)·제10조 제5항(63쪽)·제11조(64쪽), 정책브리핑 |
| 〃 | `settlement-records` | 정산 근거 자료 요구와 보관 | 제10조 제6~8항 (63~64쪽) |
| 〃 | `extra-work-costs` | 비용 부담과 추가 작업의 대가 | 제12조(65쪽)·제10조 제3항 |
| 2차 저작과 작품 통제 | `secondary-rights-holder` | **2차적저작물작성권의 귀속**(영상화·게임화·상품화 등) | 제14조 (66쪽), 정책브리핑 |
| 〃 | `secondary-rights-license` | **2차 저작 계약의 독점 여부**·분야별 범위·분배 비율 | 별표7 제3·4·7·8조(126~129쪽), 별표8 제3·4·6조(137~141쪽) |
| 〃 | `moral-rights-editing` | 저작인격권·제목/내용 변경·교정 및 편집 | 제16조(67쪽)·제17조(68쪽) |
| 종료와 반환 | `termination` | **해지·해제** 조건과 절차 | 제22조 (70쪽) |
| 〃 | `rights-return` | 계약 종료 후 **권리·원고 반환** | 제3조(58쪽)·제4조 제4항(59쪽)·제18조(68쪽) |
| 검토 절차와 분쟁 | `review-period-counsel` | 설명 의무·검토 기간(15일)·전문가 자문 | 제26조 제2항(72쪽)·제31조(73쪽), 개요(10~11쪽) |
| 〃 | `written-contract-basics` | 서면 계약과 기본 기재 사항 | 개요(10~11쪽)·제32조(74쪽) |
| 〃 | `dispute-resolution` | 분쟁 해결과 관할 법원 | 제30조 (73쪽) |

`delay-penalty`는 다른 항목과 달리 **있으면** 살펴볼 항목이다. 해설집 본문에는 ‘지체상금’·‘위약금’·‘패널티’라는 표현이 나오지 않고 표준 웹툰 연재계약서(별표3)에도 마감 지연에 돈을 물리는 조항이 없다. 대신 인도 기일 변경(제7조), 정당한 이유 없는 지연·중단 금지(제6조), 위반이 계속될 때의 이행 요구·해지·손해배상과 불가항력(제22~24조)이 표준이 다루는 범위다. 내 계약서에 돈을 물리는 조항이 있다면 표준에 없는 추가 조건임을 짚어 주고 금액·상한·면책 사유·상대방의 책임을 확인하게 한다(데이터의 `standard`·`lookFor` 참조).

### 3.3 출처와 확인 기록

원문은 2026-10-15에 직접 열어 읽었다. 항목의 `standard` 문장은 이 출처에서 확인한 내용만 쓴다.

| id | 출처 | 날짜 | 무엇을 확인했나 |
| --- | --- | --- | --- |
| `mcst-standard-contracts` | [문체부 법령자료실 「[만화] 만화 분야 표준계약서('24.6. 개정)」](https://www.mcst.go.kr/web/s_data/generalData/dataView.jsp?pMenuCD=0405050000&pSeq=51) | 2024-06-24 게시 | 고시 제2024-0032호(2024-06-13 개정), 표준계약서 8종. 계약서 본문은 HWP·ZIP 첨부로 제공되며 **첨부 파일 자체는 열지 않았다** |
| `standard-contracts-commentary` | [해설집(PDF 99쪽, 한국콘텐츠진흥원 게시)](https://www.kocca.kr/about/laws/rule/standard_20250616_0402_02.pdf) | 2025-06-13 | PDF 본문을 글자 단위로 추출해 조항 번호와 인쇄 쪽 번호를 하나씩 대조했다. 이 문서에 표준계약서 전문과 해설이 실려 있어 조항·쪽 근거는 이 문서를 기준으로 한다. 펼침면 구성이라 PDF 한 쪽에 인쇄 쪽 두 개가 담겨 있어 ‘해설집 N쪽’은 문서 하단의 인쇄 쪽 번호다 |
| `mcst-press-2018-fair-council` | [보도자료 「민관 합동 ‘웹툰 공정상생협의체’ 출범」](https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pSeq=16571) | 2018-02-12 | 작가들이 제기한 고충에 ‘원고 지연에 대한 과도한 과금(패널티)’이 들어 있는 문장 |
| `korea-kr-2024-changes` | [정책브리핑 「‘웹툰 만화 분야 표준계약서’ 이렇게 달라집니다」](https://www.korea.kr/policy/civilView.do?newsId=148930625) | 2024-06-24 | 수익 정산서 제공, 50회당 2회 휴재, 2차적저작물작성권 계약서 2종 신규 마련 |

쓰지 않은 것과 확인하지 못한 것:

- 특정 계약서가 유효한지, 불리한지, 위법인지에 대한 판단은 하지 않는다. 표준계약서에 "이런 항목이 있다"와 "내 계약서에 있는가"의 대조까지만 한다.
- 표준계약서의 비율·금액·기한(예: RS 비율, 정산 주기의 기간)은 칸이 비어 있는 서식이다. 이 체크리스트는 수치를 권장하지 않는다.
- **2024-06-13 고시본과 2025년 해설집 이후의 개정은 확인하지 못했다.** 화면 맨 위에 같은 사실을 적는다. 새 고시가 나오면 `contract-review-items.ts`의 출처·`CONTRACT_REVIEW_CHECKED_ON`과 항목을 다시 대조해야 한다.
- 표준계약서는 개별 계약을 맺을 때 참고하는 샘플이고 표준과 다른 내용이 항상 불리한 것은 아니라는 해설집의 안내를 화면과 요약에 그대로 싣는다. 표준계약서의 법적 구속력은 따로 확인하지 않았고 단정하지 않는다.

## 4. 테스트와 실행 (current)

추가·수정한 시험:

| 영역 | 파일 |
| --- | --- |
| 투고 순수 모듈 | `submission-image-probe.test.ts`, `submission-package-preflight.test.ts`, `submission-package-text.test.ts`, `submission-package-cover.test.ts`, `submission-package-cover-pdf.test.ts`, `submission-package-messages.test.ts`, `submission-package-story.test.ts`, `submission-package-layout.test.ts`, `submission-package-build.test.ts`, `submission-package-draft-store.test.ts`, `submission-package-draft-state.test.ts`, `submission-package-platform.test.ts`, `submission-package-abort.test.ts` |
| 투고 훅·화면 (jsdom) | `use-submission-package-draft.test.tsx`, `use-submission-package-build.test.tsx`, `StudioSubmissionPackagePanel.test.tsx` — 처음 모습·복원·저장, 캐릭터 불러오는 중/실패/빈 상태, 이미지 추가·순서·빼기·폭 경고, 만들기·저장·저장 취소·저장 실패, 취소 후 재시작, 읽기 실패 후 재시도, 이름과 키보드 순서 |
| 계약 체크리스트 | `packages/core/src/contract-review-checklist.test.ts`, `shared/components/contract-review/*.test.ts(x)`, `domains/learn/LearningContractChecklistPage.test.tsx`, `domains/creator/production-hub/ProductionContractReview.test.tsx` |
| 라우트·내비 계약 | `site-public-routes.test.ts`, `SitemapPage.test.ts`, `LearnPage.navigation.test.tsx` |

실행 위치는 저장소 루트이고 부작용은 없다(네트워크·DB를 쓰지 않는다).

```bash
pnpm exec vitest run apps/web/src/domains/creator/submission-package
pnpm exec vitest run packages/core/src/contract-review-checklist.test.ts apps/web/src/shared/components/contract-review apps/web/src/domains/learn/LearningContractChecklistPage.test.tsx apps/web/src/domains/creator/production-hub/ProductionContractReview.test.tsx
```

jsdom 시험은 `TextEncoder`·`DOMException`이 다른 전역의 객체를 돌려주는 환경이라, 구현이 `instanceof` 대신 이름으로 취소를 판별하고(`submission-package-abort.ts`) 텍스트 바이트를 현재 전역의 `Uint8Array`로 옮긴다(`submission-package-build.ts`의 `currentRealmBytes`). 브라우저에서도 무해한 방어다.

## 5. 알려진 공백 (target · legacy exception)

- **편집기에서 문서를 바로 굽지 않는다 (target).** 이미지는 사용자가 에디터에서 내보낸 파일을 고른다. 편집기 래스터화 경로에 "회차 N장을 투고 규격으로 내보내기"를 연결하면 이 단계가 사라진다.
- **게시 작품(클라우드 시리즈)에서 가져오기 어댑터가 없다 (target).** 1절의 이유로 이번 범위에서 제외했다.
- **이미지는 새로고침하면 다시 골라야 한다 (legacy exception).** 글만 저장한다. 큰 파일을 IndexedDB에 두는 방식은 용량·삭제 정책이 필요해 하지 않았다.
- **표지 PDF는 글자를 선택·검색할 수 없다 (legacy exception).** 한글 폰트 임베드를 피하려고 `studio-review-pdf`와 같은 방식을 썼다. 그리는 코드는 가짜 캔버스로만 시험했고 **실제 브라우저에서의 모양은 확인하지 않았다.**
- **투고처 형식 제한을 점검하지 않는다 (target).** `EXPORT_PRESETS`에는 "네이버 도전만화는 JPG만"처럼 형식 제한 기록이 있지만 검증하지 않았고, 폭과 용량만 점검한다. 용량 기준값도 투고처 최신 안내와 대조하지 못했다.
- **브라우저 시각 확인을 하지 않았다.** 이 변경의 검증은 단위·컴포넌트 시험(상태·키보드·접근 가능한 이름)이며 라이트/다크/고대비, 좁은 화면의 실제 모양 확인은 이후 UI/UX 단계의 몫이다.
- **계약 체크리스트는 2024-06-13 고시본·2025년 해설집까지만 대조했다 (legacy exception).** 이후 개정과 표준계약서 HWP 첨부 원문은 확인하지 못했다. 영어 문구는 한국어 원문을 옮긴 안내이며 법적 번역이 아니다.
