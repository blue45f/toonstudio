# 실제 구현 화면 — 후속 개선 전후 관측

상태: **역사적 current 관측 / migration 구현**. `2026-11-11` 개발 서버의 개선 전 PNG 10장·개선 후 PNG 9장, Phase2 로컬 프로덕션 미리보기 PNG 4장과 **Phase3 로컬 미리보기 4장·실제 다운로드 PNG 1개**를 보존한다. 기존 QA 원본을 바이트 그대로 선별 복사했으며 새 시안·합성 화면·새 캡처가 아니다. Phase2 데스크톱 편집기 캡처 시간 초과는 그대로 남기고 Phase3의 별도 성공과 구분한다. 운영 배포 화면·전수 사용성 완료로 표시하지 않는다.

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

## Phase3 재접속·오프라인 편집·실제 PNG — 별도 고정 번들

`9d641f1c067905ec6921bcb97474ef3ed2026103`, `buildId=086eb4202efb`의 프로덕션 번들을 로컬 `http://127.0.0.1:5276`에서 실행한 실제 관측이다. 캡처 시각은 `2026-11-12 02:00:55~02:01:10 KST`, 실제 PNG 다운로드 확인은 `02:01:15 KST`다. **앞의 e780 캡처를 교체하거나 실패 기록을 성공으로 고친 것이 아니다.** Phase4의 미커밋 후속 변경이나 운영 배포를 포함하지 않는다.

| 실제 산출물 | 링크 | 관측과 제한 |
| --- | --- | --- |
| 같은 원고 재접속·기존 내용 있음 | [1440px](./after-phase3-editor-reopened-1440.png) · [390px](./after-phase3-editor-reopened-390.png) · [320px](./after-phase3-editor-reopened-320.png) | 실제 레이어 8개가 복원된 기존 게스트 로컬 원고다. 누적 QA 문구와 카페 이미지·텍스트 겹침, 연결 재확인 안내를 그대로 보존했다. 빈 상태·오류 상태의 대표 화면이 아니다. |
| PNG 다운로드 설정·출력 요약 | [1440px](./after-phase3-export-png-options-1440.png) | PNG 선택과 720×5333px 요약이 보인다. 이 설정 화면만으로 다운로드 성공을 판정하지 않는다. |
| 실제 현재 페이지 PNG 다운로드 | [720×5333px 파일](./after-phase3-actual-current-page.png) | UI 캡처가 아닌 실제 내려받은 원고다. 340,021bytes, SHA-256 `bf95c728a9f243eb25b1f0baf4ec93d47e85fa3a0b998fd1ab68dfd6a5d3401b`. |

원본 `summary.json`·`evidence.json`은 `.qa/clarity-20261111/dot-review-after/phase3-offline-2026-11-11T17-00-22-033Z/`에 있다. 원본 5개를 직접 열고 바이트·PNG 치수·해시를 확인해 복사했다. [after-manifest.json](./after-manifest.json)의 `phase3`에는 빌드, 개별 캡처 시각, 원본 경로, 사본 해시와 실행 제한을 기록했다.

실제 동선은 원본 보존→오프라인 편집의 journal/CAS 확인→재연결 후 같은 문서·페이지·원소 ID 복원 **4/4**, `pageErrors=[]`, 실제 현재 페이지 PNG 다운로드 통과다. `project-yv58so / ep01-1te2igr`의 기존 원고를 UI로 사용했으며 성공 API fixture나 정본 데이터 주입은 없다. 로컬 저장 영수증은 **`canonical-local`, `serverSequence=null`**이고 저장 시각은 `2026-11-11T17:00:40.363Z`다. 클라우드 동기화·서버 ACK·외부 게시 완료가 아니다. 실제 백엔드 부재·ANGLE/SwiftShader·service worker 차단 조건을 유지했다.

화면 맞춤은 390/320px에서 높이 44px와 가로 넘침 0을 확인했다. 이는 모든 모바일 조작부나 전체 화면군의 사용성 완료를 뜻하지 않는다. 같은 빌드의 별도 후속 실행에서 **320px 협업 summary의 native tap을 브러시 HUD가 가리는 문제**, **1440px 소재 상세 적용 버튼이 외부 clip 아래로 밀리는 문제**를 확인했다. 후자는 390/320px의 8개 검사 통과와 분리한다. 두 수정은 followups 소스에 있으며 **다음 고정 번들 실제 재검증 대기**다. 이 PNG를 수정 후 화면으로 재명명하지 않는다.

`2026-11-12 02:57 KST` 기록 시점의 Phase4는 미커밋 구현·검증 중이고, UX 브랜치의 원격 push/main 반영·운영 배포는 미실시다. 441주소·18계열은 커버리지 원장이다. 구현/검증/잔여와 앱·패키지·콘텐츠 경계는 [검증 대조표 11~13절](../verification-matrix.md)을 참조한다.
