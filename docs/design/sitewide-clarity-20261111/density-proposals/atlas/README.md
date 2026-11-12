# 기술 도감 정보 밀도 목업 보존 — 2026-11-12 KST

상태: **target — 사용자 공유 완료한 정적 목업 아카이브**. 실제 제품 화면·구현 완료·성능 개선 증거가 아니다. [목업 열기](./index.html) · [원문/예시 데이터](./content.json) · [파일 해시·출처](./manifest.json).

| 목적 | 390×844 | 1440×1000 |
| --- | --- | --- |
| 기술 찾기 | [모바일](./proposal-atlas-find-390.png) | [PC](./proposal-atlas-find-1440.png) |
| 기술 비교 지도 | [모바일](./proposal-atlas-maps-390.png) | [PC](./proposal-atlas-maps-1440.png) |

[root가 이미 공유한10이미지 LibraryPage](https://chatgpt.com/space/page_1e4bdd165d908191b152ae11b81a568c)에 연결한다. 이 보존 작업에서 새 업로드·렌더·브라우저·설치·외부 호출을 실행하지 않았다. 실제 구현은 **별도 worktree에서 진행 중**이며 이 목업을 제품 적용 완료로 표시하지 않는다.

## 원문과 배치 예시

원문3개는 source `107c11ff43516a2e90fb9b40ccb42b7771a2b61d`의 기술 도감 카드에서 인용했다. ID는 `pointer-input-contract`, `autosave-crash-recovery-journal`, `pointer-drag-kanban`이다. 원문의 상태·자동저장 수치도 인용이며 이번 작업에서 기능·정확성을 재검증한 약속이 아니다.

나머지 **151개는 명시적인 배치 예시**다. 첫 페이지12개는 원문3개·예시9개이며 목업 검색/분야/페이지 조작은 이 예시 데이터만 대상으로 한다. **제품 정본154개 전체 검색·필터 성능은 미검증**이다. 지도5개의 이름·건수만 재사용했으며 상세429행·도식·제품 hash 복구·전체 인쇄를 구현하거나 검증한 목업이 아니다.

## 기존 시안 재사용과 검증 한계

사용자가 Gemini 원본으로 지정한 [생태계 SVG](../../../starlight-atelier-v2-mockups-2026-11-11/boards/board-g-h-i-k-p-ecosystem-hubs.svg)와 [Clarity trust 계열](../../index.html#contracts)의 보라·청록/중립 표면·라운드·검색/목차 우선 계약을 재사용했다. **독립 Gemini 생성 로그는 확인하지 못했다.** 원본 파일과 정적 제안의 출처를 제품 기능 검증과 구분한다.

기존 렌더 기록은390/1440의 찾기·지도4상태에서 가로 넘침0·측정한 활성 컨트롤44px 이상·첫 화면의 측정 대상 중심 가림0을 보고하고4PNG를 직접 검토했다. 이는 원래 목업의 지정 정적 검사다. 이번 아카이브는 그 원본 파일을 바이트 복사하고 JSON/HTML·상대 링크·해시만 확인했다. 새 브라우저 검사는 하지 않았다.

320px·전체 키보드/보조기기·실기기/OS IME·전체 스크롤·실제154개 검색·지도 본문·hash/Back 복귀·전체 인쇄·제품 성능은 별도 구현 후 검증해야 한다. 하단 내비게이션은 비대화형 표현용이다. 최초 실패와 QA runner·큰 로그는 원래 `.qa/atlas-density-proposal`에 보존하고 이 폴더로 복사하지 않았다. 초기 manifest의 render-pending/HTML 해시는 역사 기록이며 이 보존본의 실제 입력 HTML 해시는 성공 렌더 기록과 일치하는 값으로 기록했다.
