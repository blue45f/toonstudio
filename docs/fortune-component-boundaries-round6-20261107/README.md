# Fortune Round 6 — 화면별 표현 컴포넌트 경계 분리 및 유지보수성·테스트 용이성 개선 증거

- **작업 일자**: 2026-11-07
- **기준 브랜치**: `origin/main` (`a4700a42` — Round 5 `GAP-R4-02` 접근성 수정 병합 완료 커밋 기반)
- **작업 브랜치**: `codex/fortune-component-boundaries-round6-20261107`
- **소유 범위**:
  - [`apps/web/src/domains/fortune/FortunePage.tsx`](../../apps/web/src/domains/fortune/FortunePage.tsx) (`1,685`줄 → `709`줄, `-976`줄 감소, `800`줄 상한 준수)
  - [`apps/web/src/domains/fortune/FortuneCharacterPickerSection.tsx`](../../apps/web/src/domains/fortune/FortuneCharacterPickerSection.tsx) (`155`줄)
  - [`apps/web/src/domains/fortune/FortuneCharacterSidebar.tsx`](../../apps/web/src/domains/fortune/FortuneCharacterSidebar.tsx) (`110`줄)
  - [`apps/web/src/domains/fortune/FortuneResultPanel.tsx`](../../apps/web/src/domains/fortune/FortuneResultPanel.tsx) (`569`줄)
  - [`apps/web/src/domains/fortune/FortuneToolInputForms.tsx`](../../apps/web/src/domains/fortune/FortuneToolInputForms.tsx) (`406`줄)
  - [`apps/web/src/domains/fortune/FortunePage.period.test.tsx`](../../apps/web/src/domains/fortune/FortunePage.period.test.tsx) (`555`줄, 기존 27개 회귀 테스트 보존 + 분리된 4개 표현 컴포넌트 직접 경계 테스트 4건 추가 = 총 31개 통과)
  - [`./verification-report.json`](./verification-report.json)

---

## 1. 컴포넌트 분리 아키텍처 및 줄 수(800줄 상한) 검증

| 파일 | 분리 전 줄 수 | 분리 후 줄 수 | 상한 (`800`줄) | 역할 및 경계 |
| --- | ---: | ---: | :---: | --- |
| [`FortunePage.tsx`](../../apps/web/src/domains/fortune/FortunePage.tsx) | `1,685` | `709` | PASS | 상태/스토어 연동, 로컬 계산 호출, `role="tablist"` 키보드 로빙(`ArrowRight`/`ArrowLeft`/`Home`/`End`), `role="tabpanel"` 래퍼, `FortuneBirthGate`/`FortunePeriodPanel` (`F-B10-2`), [`FortuneShareModal.tsx`](../../apps/web/src/domains/fortune/FortuneShareModal.tsx) 오케스트레이션 |
| [`FortuneCharacterPickerSection.tsx`](../../apps/web/src/domains/fortune/FortuneCharacterPickerSection.tsx) | — | `155` | PASS | 1단계 빠른 오늘의 운세(`FortuneQuickToday`), 최근 본 운세 보관함 레일(`history`), 2단계 `#fortune-character-picker` 헤딩, 로드 실패 알림(`role="alert"`), 캐릭터 4열 그리드 |
| [`FortuneCharacterSidebar.tsx`](../../apps/web/src/domains/fortune/FortuneCharacterSidebar.tsx) | — | `110` | PASS | 선택된 캐릭터 아바타/이름/작품명, 연속 출석 배지(`streak`), `"다른 캐릭터 선택"` 리셋 버튼, `AGENT'S VOICE` 인사말, 웹툰 음성 재생 상태(`animate-ping motion-reduce:animate-none`) |
| [`FortuneResultPanel.tsx`](../../apps/web/src/domains/fortune/FortuneResultPanel.tsx) | — | `569` | PASS | 결과 공통 헤더(`resultHeadingRef`, `shareTriggerRef`, `"공유·저장"`, `"다시 보기"`), 오늘/별자리/처방전/궁합/사주(`FortuneSajuResult`)/타로 결과 본문, 웹툰 스트립(`WebtoonStrip`) + 오디오 컨트롤바, 행운의 작품 추천(`TitleCard`) |
| [`FortuneToolInputForms.tsx`](../../apps/web/src/domains/fortune/FortuneToolInputForms.tsx) | — | `406` | PASS | 오늘/별자리/처방전/궁합/사주(`role="group"` + `#fortune-saju-gender-label` + `aria-pressed` 성별 토글)/타로(`idle`·`shuffling`·`spread`) 도구별 입력 폼 |
| [`FortuneShareModal.tsx`](../../apps/web/src/domains/fortune/FortuneShareModal.tsx) | `267` | `267` | PASS | Round 5 초기 초점(`닫기`), `Tab`/`Shift+Tab` 순환 포커스 트랩, `Escape` 닫기 및 트리거(`shareTriggerRef`) 복귀 무변경 유지 |
| [`FortunePage.period.test.tsx`](../../apps/web/src/domains/fortune/FortunePage.period.test.tsx) | `312` | `555` | PASS | 기존 `F-B10-2` 기간 패널 3건 + Round 5 `GAP-R4-02` 접근성 3건 + Round 6 분리된 4개 표현 컴포넌트 직접 경계 단위 테스트 4건 (총 10건) |

### 비소유 영역 무변경 검증
- **운세 계산 알고리즘**: [`fortune-client-draw.ts`](../../apps/web/src/domains/fortune/fortune-client-draw.ts), `@toonstudio/core/fortune` 수정 없음 (`0 diff`)
- **개인정보·스토어·공유 발송·결제**: [`fortune-store.ts`](../../apps/web/src/domains/fortune/fortune-store.ts), [`FortuneShareModal.tsx`](../../apps/web/src/domains/fortune/FortuneShareModal.tsx), [`FortuneShareCard.tsx`](../../apps/web/src/domains/fortune/FortuneShareCard.tsx) 수정 없음 (`0 diff`)
- **공통 UI·라우트**: `apps/web/src/shared/**`, `apps/web/src/app/routes/**` 수정 없음 (`0 diff`)

---

## 2. 정적 게이트 및 회귀 테스트 결과 (31 Tests PASS)

1. **Vitest 도메인 회귀 + 신규 컴포넌트 경계 테스트 (`4 files, 31 tests passed`)**:
   - [`FortunePage.period.test.tsx`](../../apps/web/src/domains/fortune/FortunePage.period.test.tsx): `10 passed` (`F-B10-2` 3건 + `GAP-R4-02` 접근성 3건 + Round 6 표현 컴포넌트 경계 4건)
   - [`fortune-status-i18n-r3c10.test.ts`](../../apps/web/src/domains/fortune/fortune-status-i18n-r3c10.test.ts): `4 passed` (`tx()` 한·영 이중언어 호출 및 `motion-reduce:animate-none` 정적 계약 통과)
   - [`fortune-client-draw.test.ts`](../../apps/web/src/domains/fortune/fortune-client-draw.test.ts): `8 passed` (서버 운세 계산 엔드포인트 비호출 계약 및 로컬 계산 결정성 통과)
   - [`FortunePageHeader.test.tsx`](../../apps/web/src/domains/fortune/FortunePageHeader.test.tsx): `9 passed`
2. **TypeScript (`tsc --noEmit`)**: `0 errors`
3. **ESLint & `lint-changed.mjs`**: `0 errors, 0 warnings`
4. **Source File Size Ratchet (`node scripts/check-source-file-size.mjs`)**: `OK (ceiling 800 lines)`
5. **Secretlint (`node scripts/secretlint-files.mjs`)**: `OK`

---

## 3. 실제 브라우저 키보드·시각 회귀 검증 (`320` / `390` / `768` / `1440` / `200%` 확대)

상세 측정 데이터는 [`./verification-report.json`](./verification-report.json)에 기록되어 있으며, Round 5 접근성 수정 결과(`a4700a42`)와 동일한 DOM/ARIA/레이아웃 결과를 유지함을 검증했습니다.

| 뷰포트 | 캐릭터 피커 (`#fortune-character-picker`) | `role="tablist"` & `role="tabpanel"` (1:1 연결) | 사주 성별 `role="group"` & `aria-pressed` (3버튼) | 공유 모달 초기 초점(`닫기`) & `Escape` 트리거 복귀 | 가로 오버플로우 (`scrollWidth - clientWidth`) | 사주 입력 스크린샷 | 오늘의 운세 결과 스크린샷 | 공유 모달 스크린샷 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `320×640` (Mobile S) | PASS ([피커](./picker-320.png)) | PASS (`8` tabs / `1` panel) | PASS (`true`/`false`/`false`) | PASS (`닫기` → `공유·저장`) | `0px` | [saju-input-320.png](./saju-input-320.png) | [today-result-320.png](./today-result-320.png) | [share-modal-320.png](./share-modal-320.png) |
| `390×844` (Mobile M) | PASS | PASS (`8` tabs / `1` panel) | PASS (`true`/`false`/`false`) | PASS (`닫기` → `공유·저장`) | `0px` | [saju-input-390.png](./saju-input-390.png) | [today-result-390.png](./today-result-390.png) | [share-modal-390.png](./share-modal-390.png) |
| `768×1024` (Tablet) | PASS | PASS (`8` tabs / `1` panel) | PASS (`true`/`false`/`false`) | PASS (`닫기` → `공유·저장`) | `0px` | [saju-input-768.png](./saju-input-768.png) | [today-result-768.png](./today-result-768.png) | [share-modal-768.png](./share-modal-768.png) |
| `1440×900` (Desktop) | PASS ([피커](./picker-1440.png)) | PASS (`8` tabs / `1` panel) | PASS (`true`/`false`/`false`) | PASS (`닫기` → `공유·저장`) | `0px` | [saju-input-1440.png](./saju-input-1440.png) | [today-result-1440.png](./today-result-1440.png) | [share-modal-1440.png](./share-modal-1440.png) |
| `720×450` (`200%` Zoom) | PASS | PASS (`8` tabs / `1` panel) | PASS (`true`/`false`/`false`) | PASS (`닫기` → `공유·저장`) | `0px` | [saju-input-200pct.png](./saju-input-200pct.png) | [today-result-200pct.png](./today-result-200pct.png) | [share-modal-200pct.png](./share-modal-200pct.png) |

### 키보드 여정 실측 요약 (`1440×900` & 전 뷰포트 공통)
- **운세 `tablist` 화살표/Home/End 이동**:
  - `#fortune-tab-today`에서 `ArrowRight` → `#fortune-tab-monthly` (`aria-selected="true"`, `tabpanel="fortune-tabpanel-monthly"`)
  - `End` → `#fortune-tab-tarot` (`aria-selected="true"`, `tabpanel="fortune-tabpanel-tarot"`)
  - `Home` → `#fortune-tab-today` (`aria-selected="true"`, `tabpanel="fortune-tabpanel-today"`)
- **공유 모달 포커스 트랩 및 복귀**:
  - `공유·저장` 클릭 → 초기 포커스 `닫기` 버튼(`aria-label="닫기"`)
  - `Shift+Tab` → 모달 마지막 버튼(`링크 복사`)으로 순환
  - `Tab` → 모달 첫 버튼(`닫기`)으로 순환
  - `Escape` → 모달 즉시 닫힘 + 트리거 버튼(`공유·저장`)으로 포커스 정확히 복귀
