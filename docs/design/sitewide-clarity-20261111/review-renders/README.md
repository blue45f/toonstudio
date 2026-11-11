# 실제 구현 화면 — 후속 개선 전후 관측

상태: **current 관측 / migration 구현**. `2026-11-11` 개발 서버의 개선 전 PNG 10장·개선 후 PNG 9장과 고정 프로덕션 번들의 **로컬 미리보기 PNG 4장**을 보존한다. 모두 기존 QA 원본을 바이트 그대로 선별 복사한 자료이며 새 시안·합성 화면·새 캡처가 아니다. 데스크톱 편집기 캡처 시간 초과로 프로덕션 화면 증거는 **미완료**다. 초기 계획의 6장 완료·운영 배포 화면·전수 사용성 완료로 표시하지 않는다.

## 개선 전 개발 관측 — 원본 10장 보존

| 상태 | 데스크톱 | 모바일 |
| --- | --- | --- |
| 신규 사용자, 기본 예시만 있음 | [1440px](./before-new-user-with-samples-1440.png) | [390px](./before-new-user-with-samples-390.png) |
| 실제 생성한 작업의 최근 목록 | [1440px](./before-recent-work-1440.png) | [390px](./before-recent-work-390.png) |
| 텍스트 편집·기기 저장 확인 | [1440px](./before-editor-saved-text-1440.png) | [390px](./before-editor-saved-text-390.png) |
| 소재 검색·선택 | [1440px](./before-asset-picker-1440.png) | [390px](./before-asset-picker-390.png) |
| 소재 삽입·저장·새로고침 | [1440px](./before-editor-applied-asset-1440.png) | [390px](./before-editor-applied-asset-390.png) |

숫자는 설정한 뷰포트 폭이다. 실제 PNG 치수·파일 해시·코드 변경분 해시는 [manifest.json](./manifest.json)에 기록했다. 스크롤바·캡처 범위 때문에 이미지 폭과 뷰포트 폭이 다를 수 있다.

- QA 전용 게스트 프로젝트를 UI로 만들었다. 프로젝트·API 성공 응답을 시딩하지 않았다.
- 텍스트와 카페 이미지 1개는 앱이 사용하는 OPFS/SQLite 리더로 저장 내용·시각을 확인했으며, 새로고침 뒤 보존됐다. 로컬 API는 연결되지 않았으므로 서버 동기화·백업 성공으로 해석하지 않는다.
- 신규 사용자는 사용자 생성 작업이 없지만 기본 예시 두 개가 존재한다. 완전히 빈 목록을 캡처했다고 주장하지 않는다.
- 모바일 소재 화면은 데스크톱에서 폭을 바꾼 뒤 검색·선택이 초기화된 실제 관측이다. 모바일 단독 선택·적용의 성공 증거가 아니다.
- 모바일의 텍스트가 화면 밖으로 밀리는 구도, 겹친 안내, 데스크톱의 잘못된 단계 표시·낮은 경고 대비는 개선 대상으로 보존했다.
- 초기 프로필에서 복원된 중복 QA 탭 때문에 발생한 다중 창·잠금 관측은 이 정상 단일 창 저장 증거와 분리했다.

원본 실행 기록은 Git 제외 폴더 `.qa/clarity-20261111/dot-review/creator-evidence.json`과 `creator-asset-evidence.json`에 있다. 전체 경로의 실사용 성공이나 최종 운영 검증은 별도다.

## 개선 전후 대조 — 개발 서버 범위

| 대상 | 개선 전 | 개선 후 `after-dev-*` | 관측 범위 |
| --- | --- | --- | --- |
| 사용자 작업 없이 기본 예시만 있는 작업 목록 | [1440px](./before-new-user-with-samples-1440.png) · [390px](./before-new-user-with-samples-390.png) | [1440px](./after-dev-new-user-with-samples-1440.png) · [390px](./after-dev-new-user-with-samples-390.png) | 실제 새 게스트 프로필. 새 작업이 주 행동이며 예제를 개인 최근 작업으로 표시하지 않는다. |
| 실제 생성한 작업 이어하기 | [1440px](./before-recent-work-1440.png) · [390px](./before-recent-work-390.png) | [1440px](./after-dev-recent-work-1440.png) · [390px](./after-dev-recent-work-390.png) | 실제 UI로 만든 로컬 작업. 최근 작업 열기를 먼저 두고 다른 시작 방식은 접힌다. |
| 소재 검색·선택의 반응형 유지 | [1440px](./before-asset-picker-1440.png) · [390px](./before-asset-picker-390.png) | [1440px](./after-dev-asset-picker-1440.png) · [390px](./after-dev-asset-picker-390.png) | 같은 검색어·조건·선택을 유지한 폭 전환. 검색 결과를 먼저 두고 필터를 접는다. |
| 소재 상세 미리보기 | 대응 캡처 미선별 | [390px](./after-dev-asset-detail-390.png) | 실제 내장 래스터 소재 상세다. 하단 정보·적용은 패널 스크롤 범위이며 미리보기만으로 삽입하지 않는다. |
| 카탈로그 추천 목록 없음 | 대응 캡처 없음 | [390px](./after-dev-catalog-empty-390.png) | 명시적인 빈 추천 fixture와 다시 시도·조건 탐색 복구다. 카탈로그 전체가 비었다는 뜻이 아니다. |
| 작품 상세 요청 실패 | 대응 캡처 없음 | [390px](./after-dev-catalog-error-390.png) | 공개 snapshot 503 fixture와 재시도·목록 복귀다. 정상 감상 화면으로 표시하지 않는다. |

전후 이미지는 같은 업무 상태를 비교하기 위한 관측이다. 모든 프로젝트 내용·스크롤·뷰포트 높이가 동일한 픽셀 회귀 쌍은 아니다. 작업 목록에는 실제 온라인 연결 안내와 일부 프로젝트 미리보기 지연 로딩이 보인다. 해당 상태를 지우거나 완성 화면으로 다시 합성하지 않았다.

개선 후 원본·PNG 치수·SHA-256·뷰포트·실행 조건·실행 JSON은 [after-manifest.json](./after-manifest.json)에 기록했다. 9개 사본 모두 원본과 바이트가 같다. `manifest.json`과 `before-*` 10장은 변경하지 않았다.

- 작업 목록 4장: 실제 게스트 로컬 프로필이며 성공 API fixture가 없다. 기본 예시만 있는 프로필과 실제 UI로 만든 작업이 있는 프로필을 구분한다.
- 소재 3장: 실제 내장 래스터 카탈로그·같은 로컬 원고·백엔드 부재·API fixture 없음·software ANGLE/SwiftShader 조건이다. 실행 JSON의 10개 core 검사와 별도 모바일 진입 3개 검사가 미리보기 비변경·명시적 삽입·재열기를 확인한다. PNG 자체만으로 저장·3D 모델링 성공을 판정하지 않는다.
- 카탈로그 2장: 실제 생성 공개 데이터를 사용하는 여정에 게스트/API 503 fixture와 명시적 빈 목록·공개 snapshot 실패를 주입한 복구 상태다. 소재·작업 목록의 무 fixture 조건과 섞지 않는다.
- Phase2 앱 소스 체크포인트는 `70c577828b35886ec6ae71a1b37949798eab4323`, 통합 HEAD는 `e780510fd4`다. 두 `apps/web` 트리의 차이는 service-worker precache 테스트 1파일이며, 테스트를 제외한 tracked 앱 항목의 SHA-256이 같음을 확인했다. 각 캡처 시점의 Git SHA는 원본 PNG·QA JSON에 찍혀 있지 않으므로 최종 커밋에서 재캡처한 화면으로 표시하지 않는다.

## 고정 프로덕션 번들의 로컬 관측 — 화면 증거 일부 완료

대상은 `e780510fd4928ee244f965f9ff697d71544e6d25`, `buildId=35fcb401d50e`의 실제 프로덕션 번들을 `http://127.0.0.1:5276`에서 연 미리보기다. 운영 도메인에 배포한 화면이 아니다. 별도 실행의 기존 원본 4장을 직접 열어 확인한 뒤 `after-production-*`로 복사했다. before 10장과 after-dev 9장은 보존했다.

| 실제 캡처 | 링크 | 관측과 제한 |
| --- | --- | --- |
| 모바일 원고·Undo 후 재열기 | [390px](./after-production-editor-final-390.png) | 실제 원고에 내장 래스터 이미지가 보인다. 서버 연결 부재·기기 저장·연결 재확인 안내를 그대로 보존한다. |
| 모바일 소재 상세 | [390px](./after-production-asset-detail-390.png) | 선택한 내장 래스터 상세 이미지가 표시된다. 하단 정보·적용은 패널 스크롤 범위다. |
| 모바일 소재 검색 결과 | [390px](./after-production-asset-picker-390.png) | 검색 결과 텍스트·삽입 행동은 보이나 **첫 썸네일 paint 전 빈 영역**이 캡처됐다. 이미지 표시까지 완료된 화면으로 판정하지 않는다. |
| 데스크톱 소재 검색·선택 상세 | [1440px](./after-production-asset-picker-1440.png) | 목록과 선택 상세의 이미지가 모두 표시된다. 실제 온라인 연결 재확인 안내도 보존한다. |
| 데스크톱 편집기 | **미완료** | `editor-final-1440.png` 캡처가 `TimeoutError`(20초)로 실패했다. 대체 이미지·개발 캡처를 프로덕션 결과로 재명명하지 않았다. |

기능 결과와 캡처 완전성은 다음처럼 별도로 기록한다.

| 기능 실행 | 결과 | 근거·범위 |
| --- | --- | --- |
| 동일 원고의 실제 모바일 소재 동작 | **core 6/6**, pageerror 0 | `.qa/clarity-20261111/dot-review-after/production-resource/results.json`. 이미 존재하는 선택 래스터 1개→native Enter 1→Space 1→명시적 실제 터치 삽입 2→Undo 1→같은 문서 재열기 1이다. |
| 별도 데스크톱 재진입·native 미리보기 | **desktop 2/2**, pageerror 0 | `.qa/clarity-20261111/dot-review-after/production-resource-desktop/results.json`. 정확한 같은 문서의 Undo 결과 1개와 미리보기 비변경을 확인했으나 해당 실행의 `visualEvidenceComplete=false`다. |
| 전체 정규화 원고 보존 | 기준과 동일 | `.qa/clarity-20261111/dot-review-after/production-resource/consistency.json`. 기존 비이미지 draw 요소까지 포함해 Enter/Space·Undo·재열기의 원소 메타데이터가 기준과 같다. 이미지 개수만으로 원고 전체 보존을 추정하지 않았다. |

실제 게스트 로컬 문서·백엔드 부재·API fixture 없음·ANGLE/SwiftShader·QA context의 service worker 차단 조건이다. 3D 모델링·서버 동기화·백업·로그인 업무 성공을 보증하지 않는다. [after-manifest.json](./after-manifest.json)의 `production`에 빌드·원본 경로·뷰포트·PNG 치수·SHA-256·미완료 사유와 두 실행 결과를 분리해 기록했다. 기능 6/6과 2/2를 PNG 6장 완료로 합산하지 않는다.

최종 빌드·산출물 SHA·readiness·전체 주소 관측·운영 배포·사후 스모크는 각각 [검증·배포 인계](../validation-and-release.md)의 실제 결과로 판정한다. 후속 UX 수정은 이 캡처 이후 별도 작업이며, 아직 적용되지 않은 변경을 현재 화면에 포함하지 않는다.

이 폴더의 화면은 실제 앱 관측이다. 기존 SVG·HTML 디자인 시안과 AI 콘셉트 이미지는 상위 디자인 갤러리의 reference / target 자료이며 서로 다른 산출물이다.
