# 실제 구현 화면 — 후속 개선 전 관측

상태: **current 관측 / migration 구현**. 이 PNG 10장은 `2026-11-11` 개발 서버의 실제 앱을 조작해 캡처했다. HTML 시안·AI 이미지나 운영 배포 화면이 아니다. 후속 개선 전 상태를 보존하며, 최종 결과와 구분한다.

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
