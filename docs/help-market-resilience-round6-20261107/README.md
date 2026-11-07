# Round 6 Help / Market 미리보기 복원력(Resilience) 검증 및 최소 수정 보고서

## 1. 작업 범위 및 파일 소유 경계

- **대상 컴포넌트 및 단위 테스트**:
  - [`HelpCenterPage.tsx`](../../apps/web/src/domains/legal/HelpCenterPage.tsx) (485줄 ≤ 800줄 상한)
  - [`HelpCenterPage.test.tsx`](../../apps/web/src/domains/legal/HelpCenterPage.test.tsx) (216줄 ≤ 800줄 상한)
  - [`MarketQuickPreviewDialog.tsx`](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx) (521줄 ≤ 800줄 상한)
  - [`MarketQuickPreviewDialog.test.tsx`](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.test.tsx) (219줄 ≤ 800줄 상한)
- **실브라우저 검증 스크립트 및 전후 리포트**:
  - [`verify-round6-resilience.mjs`](./verify-round6-resilience.mjs)
  - 수정 전 실브라우저 측정 리포트: [`before-report.json`](./before-report.json)
  - 수정 후 실브라우저 측정 리포트: [`verification-report.json`](./verification-report.json)
- **변경 금지 준수 확인**:
  - 개인정보·가격·라이선스·결제·공유/찜 전송 로직·스토어·라우트·공유 UI·드로잉 도메인 파일 무변경.

---

## 2. 실브라우저 재현 결함(`before`) 및 최소 수정(`after`) 요약

실제 Headless Chromium에서 긴 한영 혼합 제목(`75자`), 깨진 썸네일 URL(`/broken-thumbnail-round6-404.png`), 다수 태그(`8개`, 한영 장문 태그 포함), 화면 높이를 초과하는 장문 본문(`829자`), 검색 결과 0건, 모달 오픈 중 트리거 버튼 DOM 제거 시나리오를 7개 뷰포트(`320×568` 세로, `568×320` 가로, `390×844` 세로, `844×390` 가로, `768×1024`, `1440×900`, `1440×900 @ 200%`)에서 전수 검사했습니다.

| 검증 항목 | 수정 전 ([`before-report.json`](./before-report.json)) | 수정 후 ([`verification-report.json`](./verification-report.json)) | 최소 수정 내용 |
| :--- | :---: | :---: | :--- |
| `/help` 가로 오버플로 `0px` (`allHelpZeroOverflow`) | `true` | `true` | 검색 결과 컨테이너에 `[overflow-wrap:anywhere]` 보강 |
| `/help` 상단 검색창 인라인 `44×44px` 초기화 버튼 (`allHelpHaveInlineClear44px`) | **`false`** (인라인 초기화 버튼 부재) | **`true`** (`44×44px` + `Escape` 지원) | [`HelpCenterPage.tsx`](../../apps/web/src/domains/legal/HelpCenterPage.tsx) 검색 입력창 우측에 `size-11 min-h-11 min-w-11` 초기화 버튼(`검색어 초기화`) 및 `Escape` 키 핸들러 추가 |
| `/help` 검색 결과 0건 `검색어 지우기` 후 검색창 초점 복원 (`allHelpEmptyClearRestoresFocusToInput`) | **`false`** (클릭 후 `document.body`로 초점 유실) | **`true`** (`<input type="search">`로 초점 복원) | `searchInputRef` 및 `clearSearch()` 헬퍼로 검색어 초기화 즉시 `searchInputRef.current?.focus({ preventScroll: true })` 수행 |
| `/help` 인기 검색어 칩 재탭 시 선택 해제 토글 (`allHelpChipToggleOffWorks`) | **`false`** (재클릭 시 해제 불가) | **`true`** (`aria-pressed` 토글 해제) | 이미 선택된 인기 검색어 칩 클릭 시 `setQuery((prev) => (prev === label ? "" : label))`로 검색 초기화 |
| `/market` 빠른 미리보기 가로 오버플로 `0px` (`allMarketZeroOverflow`) | `true` | `true` | 제목·배급자 링크·본문·태그 칩에 `[overflow-wrap:anywhere]` 및 `max-w-full` 적용 |
| `/market` 내부 스크롤 후 닫기 버튼 뷰포트 유지 & 가로모드 첫 화면 제목 노출 (`allMarketCloseButtonAccessibleAfterScroll`) | **`false`** (내부 스크롤 시 상단 닫기 버튼이 뷰포트 밖으로 이탈, `568×320` 가로모드에서 커버 `305px`가 모달 `277px`를 덮어 제목 가림) | **`true`** (상단 `44×44px` 닫기 버튼 고정 + 하단 `44×44px` 닫기 버튼 + 가로모드 커버 `max-h-[28vh]` 제한) | [`MarketQuickPreviewDialog.tsx`](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx)에서 닫기 버튼을 내부 스크롤 영역(`[data-testid="market-quick-preview-scroll"]`) 바깥 고정 래퍼에 배치하고, 하단 닫기 버튼(`[data-testid="market-quick-preview-footer-close"]`)과 커버 높이 제한(`max-h-[28vh] sm:max-h-56`) 추가 |
| `/market` 깨진 썸네일 이미지 폴백 (`allMarketBrokenThumbnailsHandledCleanly`) | **`false`** (깨진 `<img>` 노출, 폴백 배지 없음) | **`true`** (`visibleBrokenImgCount: 0`, 폴백 배지 표시) | 커버 영역 `onErrorCapture`에서 실패한 `<img>`를 숨기고 기본 표지 안내 배지(`[data-testid="market-cover-fallback"]`) 렌더링 |
| `/market` 배경 스크롤 잠금 및 닫기 시 스크롤 위치 복원 (`allMarketBackgroundScrollLockedAndRestored`) | **`false`** (`document.body.style.overflow` 미잠금) | **`true`** (`overflow: hidden` 잠금 및 `scrollY` 복원) | 모달 오픈 시 `document.body.style.overflow = "hidden"` 및 `window.scrollY` 보존, 닫기/언마운트 시 원복 |
| `/market` 이전 트리거 DOM 제거 시 안전한 대체 초점 복원 (`detachedTriggerSafeFocusRestored`) | **`false`** (`document.body`로 초점 유실) | **`true`** (`#main-content` 내부 대화형 컨트롤로 안전 복원) | `!trigger.isConnected`일 때 `#main-content` / `main` 내부 첫 활성 컨트롤로 초점 폴백 |

---

## 3. 7개 뷰포트 실브라우저 측정 결과 (`after`)

### 3.1 `/help` (`HelpCenterPage.tsx`)

| 뷰포트 | 해상도 / 배율 | 문서 가로 오버플로 | 인라인 초기화 버튼 (`px`) | 0건 초기화 버튼 (`px`) | 초기화 후 초점 태그 | 인기 칩 재탭 토글 (`pressed -> unpressed`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `mobile-320x568-portrait` | `320×568 @ 100%` | `0px` | `44×44` | `110×44` | `input` | `true -> true` |
| `mobile-568x320-landscape` | `568×320 @ 100%` | `0px` | `44×44` | `110×44` | `input` | `true -> true` |
| `mobile-390x844-portrait` | `390×844 @ 100%` | `0px` | `44×44` | `110×44` | `input` | `true -> true` |
| `mobile-844x390-landscape` | `844×390 @ 100%` | `0px` | `44×44` | `110×44` | `input` | `true -> true` |
| `tablet-768x1024` | `768×1024 @ 100%` | `0px` | `44×44` | `110×44` | `input` | `true -> true` |
| `desktop-1440x900` | `1440×900 @ 100%` | `0px` | `44×44` | `110×44` | `input` | `true -> true` |
| `desktop-1440x900-zoom200` | `1440×900 @ 200%` | `0px` | `44×44` | `110×44` | `input` | `true -> true` |

### 3.2 `/market` (`MarketQuickPreviewDialog.tsx`)

| 뷰포트 | 모달/문서 가로 오버플로 | 모달 높이 / 커버 높이 (`px`) | 첫 화면 제목 노출 | 깨진 `<img>` 노출 / 폴백 배지 | 하단 스크롤 후 상단 닫기 버튼 가시성 | 하단 닫기 버튼 높이 (`px`) | 배경 스크롤 잠금 & 복원 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `mobile-320x568-portrait` | `0px / 0px` | `490 / 159` | `true` | `0 / true` | `true` (`scrollTop: 1530`) | `44` | `true` |
| `mobile-568x320-landscape` | `0px / 0px` | `277 / 90` | `true` | `0 / true` | `true` (`scrollTop: 781`) | `44` | `true` |
| `mobile-390x844-portrait` | `0px / 0px` | `728 / 205` | `true` | `0 / true` | `true` (`scrollTop: 743`) | `44` | `true` |
| `mobile-844x390-landscape` | `0px / 0px` | `337 / 224` | `true` | `0 / true` | `true` (`scrollTop: 652`) | `44` | `true` |
| `tablet-768x1024` | `0px / 0px` | `770 / 224` | `true` | `0 / true` | `true` (`scrollTop: 185`) | `44` | `true` |
| `desktop-1440x900` | `0px / 0px` | `770 / 224` | `true` | `0 / true` | `true` (`scrollTop: 185`) | `44` | `true` |
| `desktop-1440x900-zoom200` | `0px / 0px` | `387 / 126` | `true` | `0 / true` | `true` (`scrollTop: 486`) | `44` | `true` |

---

## 4. 정적 검사 · 단위 회귀 테스트 · 독립 감사 요약

1. **단위 회귀 테스트 (`vitest`)**:
   - [`HelpCenterPage.test.tsx`](../../apps/web/src/domains/legal/HelpCenterPage.test.tsx): **18 passed** (인기 검색어 칩 재클릭 해제, 상단 `44×44px` 인라인 초기화 버튼, 0건 `검색어 지우기` 클릭 시 검색창 초점 복원, `Escape` 초기화 포함)
   - [`MarketQuickPreviewDialog.test.tsx`](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.test.tsx): **4 passed** (배경 스크롤 잠금/복원, 깨진 썸네일 이미지 폴백 배지, 하단 닫기 버튼, 제거된 트리거 대체 초점 복원 포함)
2. **타입 · 린트 · 800줄 상한 · 시크릿 검사**:
   - TypeScript (`ts.createProgram`): **0 errors**
   - ESLint (`npx eslint`): **0 errors / 0 warnings**
   - 소스 파일 줄 수 상한 (`node scripts/check-source-file-size.mjs`): **PASS** (전체 800줄 이하)
   - 시크릿 누출 검사 (`pnpm run quality:secrets:changed`): **PASS**
3. **독립 서브에이전트 감사**:
   - 소유 경계, 800줄 상한, 모바일/가로모드/200% 확대 복원력 및 접근성 요구사항 전 항목 **PASS**.
