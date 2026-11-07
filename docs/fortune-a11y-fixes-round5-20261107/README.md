# Round 5 운세 페이지·공유 모달 접근성 결함(`GAP-R4-02`) 수정 및 실브라우저 검증 증거

- **결함 ID**: `GAP-R4-02` (`SURF-08-FORTUNE`, `/fortune` 및 `/fortune/:tool`)
- **소유 범위**:
  - [FortunePage.tsx](../../apps/web/src/domains/fortune/FortunePage.tsx) (`1,685줄` / 기준선 `1,693줄` 이하 유지)
  - [FortuneShareModal.tsx](../../apps/web/src/domains/fortune/FortuneShareModal.tsx) (`267줄` / 상한 `800줄` 이하 유지)
  - [FortunePage.period.test.tsx](../../apps/web/src/domains/fortune/FortunePage.period.test.tsx) (`312줄` / 상한 `800줄` 이하 유지)
- **비수정 보호 범위**: 운세 계산 알고리즘(`@toonstudio/core/fortune`, `fortune-client-draw.ts`), 입력 데이터/저장 스키마(`fortune-store.ts`), 결제, 공유 발송 페이로드, 개인정보 처리, IR/Learn, `#2740`(PackagePanel), 메시지함, 공유 UI, 캐릭터 문서는 일절 수정하지 않음.

---

## 1. 전후(Before / After) 핵심 지표 비교

| 검증 항목 | 수정 전 (Round 4 재현 `GAP-R4-02`) | 수정 후 (Round 5 실측) | 판정 |
| --- | --- | --- | --- |
| 공유 모달(`FortuneShareModal`) 초기 초점 | `dialogRef.current?.focus()`만 호출되어 내부 닫기 컨트롤로 초점 미진입 | 오픈 즉시 `closeButtonRef` (`aria-label="닫기"`, `44×44px`)로 초기 초점 진입 | PASS |
| 공유 모달 `Tab` / `Shift+Tab` 순환 트랩 | 미구현 (배경 페이지로 초점 이탈) | `닫기` ↔ `이미지 저장` ↔ `공유하기` ↔ `링크 복사` 4개 활성 컨트롤 내부 순환 트랩 | PASS |
| 공유 모달 `Escape` 닫기 및 트리거 복귀 | `Escape` 닫기 후 트리거 복귀 없음 | `Escape` 닫기 시 `triggerRef` 및 `shareTriggerRef`(`공유·저장`)로 초점 즉시 복귀 | PASS |
| 운세 `role="tablist"` 키보드 탐색 | `ArrowRight`/`ArrowLeft`/`Home`/`End` 미지원, `tabIndex`·`aria-controls` 누락 | `ArrowRight`/`ArrowLeft`(순환)·`Home`·`End`로 선택·초점 동시 이동, 로빙 `tabIndex` 적용 | PASS |
| 운세 `role="tabpanel"` 연결 | `tabpanelCount: 0` (`role="tabpanel"` 부재) | `tabpanelCount: 1` (`id="fortune-tabpanel-${activeTab}"`, `aria-labelledby="fortune-tab-${activeTab}"`) | PASS |
| 사주 성별 토글 `role="group"` 및 `aria-pressed` | `role="group"` 부재, `genderHasAriaPressed: false` | `role="group"[aria-labelledby="fortune-saju-gender-label"]` 및 3개 버튼 `aria-pressed`(`true`/`false`) 반영 | PASS |
| 재생 배지 `animate-ping` 모션 감소 대응 | `motion-reduce:animate-none` 누락 | `motion-reduce:animate-none` 추가 | PASS |

---

## 2. 실제 브라우저 키보드 동선 및 뷰포트(320 / 390 / 768 / 1440 / 200% 확대) 검증 결과

상세 JSON 원시 측정값은 [verification-report.json](./verification-report.json)에 기록되어 있습니다.

| 뷰포트 | 해상도 / 배율 | 본문 가로 오버플로 | 모달 가로 오버플로 | `tablist` / `tabpanel` / `group` | 모달 초기 초점 내부 진입 | 닫기 버튼 크기 | `Escape` 후 `공유·저장` 복귀 | 스크린샷 증거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mobile-320` | `320×640` (100%) | `0px` | `0px` | `true / true / true` | `true` (`닫기`) | `44×44px` | `true` | [fortune-320-tablist-saju-gender.png](./screenshots/fortune-320-tablist-saju-gender.png) |
| `mobile-390` | `390×844` (100%) | `0px` | `0px` | `true / true / true` | `true` (`닫기`) | `44×44px` | `true` | [fortune-390-share-modal-focus.png](./screenshots/fortune-390-share-modal-focus.png) |
| `tablet-768` | `768×1024` (100%) | `0px` | `0px` | `true / true / true` | `true` (`닫기`) | `44×44px` | `true` | [fortune-768-tablet-layout.png](./screenshots/fortune-768-tablet-layout.png) |
| `pc-1440` | `1440×900` (100%) | `0px` | `0px` | `true / true / true` | `true` (`닫기`) | `44×44px` | `true` | [fortune-1440-pc-share-modal.png](./screenshots/fortune-1440-pc-share-modal.png) |
| `pc-1440-zoom-200` | `720×450` (200% 확대 상당) | `0px` | `0px` | `true / true / true` | `true` (`닫기`) | `44×44px` | `true` | [fortune-1440-zoom200-layout.png](./screenshots/fortune-1440-zoom200-layout.png) |

---

## 3. 자동화 회귀 테스트 및 정적 게이트

- **JSDOM 통합/접근성 회귀 테스트**: [FortunePage.period.test.tsx](../../apps/web/src/domains/fortune/FortunePage.period.test.tsx) (기존 월간/연간 기간 패널 3건 + 신규 `GAP-R4-02` `tablist` 화살표/Home/End·`tabpanel`, 성별 `role="group"`/`aria-pressed`, `FortuneShareModal` 초기 초점·`Tab`/`Shift+Tab` 순환·`Escape` 트리거 복귀 3건 = 총 6건 통과)
- **운세 도메인 정적 계약 테스트**:
  - [fortune-status-i18n-r3c10.test.ts](../../apps/web/src/domains/fortune/fortune-status-i18n-r3c10.test.ts) 통과
  - [fortune-client-draw.test.ts](../../apps/web/src/domains/fortune/fortune-client-draw.test.ts) 통과
  - [FortunePageHeader.test.tsx](../../apps/web/src/domains/fortune/FortunePageHeader.test.tsx) 통과
