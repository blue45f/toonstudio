# 새 프로젝트 UI·동선 개선 — 2026-10-31

상태: **구현 완료·검토용 Draft / 실제 앱 검증 대기**. 운영 배포·100점 판정 아님.

## 변경

기본 흐름을 형식 → 재료 → 이름·기본 크기 → 요약·다음 화면·시작으로 정리했다. 크기·제작 목적·협업, 작업실·출력 상세는 선택형 접기로 분리했다. 추가 설정을 접어도 값은 유지한다.

시작 버튼은 하나만 유지하고 상세 설정·미리보기·제작 계획 끝에서 같은 시작 버튼으로 돌아가게 한다. 비활성 상태면 오류 복구가 있는 요약으로 초점을 옮긴다. 복귀 자체는 생성하지 않는다.

모바일은 두 열로 정리하고 재료 카드의 아이콘을 위로 배치한다. 형식 카드의 장식 이미지를 숨기되 실제 결과물 구조 도형은 남긴다. 선택됨 텍스트와 aria-pressed, 오류와 입력의 aria 연결, 실제 다음 화면 안내를 제공한다.

기존 create/chooseFormat/chooseAuxiliary/chooseStartPoint 함수는 AST 대조에서 원본과 동일하다. 제작 계획과 파일 재료가 겹칠 때 버튼 문구의 우선순위만 실제 생성 분기와 맞췄다. 저장·템플릿·딥링크 계약은 재구현하지 않는다. 주 화면은 794줄에서 752줄로 줄었다.

## 검증 구분

독립 작업 컨테이너에서 **43개 정적·좁은 계약 검사 통과**: TypeScript/JSX 구문·transpile 진단·기존 함수 AST 보존·순서·기본 접힘·스타일 범위와 요약 컴포넌트의 props/콜백 분기. JSX/DOM 의존성을 대체한 검사이며 React 렌더·Vitest·전체 타입·브라우저 검증이 아니다.

StudioCreateFocusedFlow.test.tsx의 신규 **17개 회귀는 작성·미실행**이다. 기존 StudioProjectCreatePage의 생성·저장·경로 assertion은 보존하고 선택적 미리보기 계약을 명시했다.

사용자의 PR 우선 요청에 따라 GitHub API로 소스 스냅샷을 게시한다. 로컬 commit/push hooks와 전체 검사를 실행했다고 표시하지 않는다. 공유 Mac의 중앙 검사 순서·원본14·실패 증거·다른 소스는 변경하지 않는다. main 병합·CI 상태 변경·운영 배포는 이번 요청에서 수행하지 않는다.

## 병합 전 필수 확인

```sh
pnpm exec vitest run apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.test.tsx apps/web/src/domains/creator/studio-shell/StudioCreateFocusedFlow.test.tsx --maxWorkers=1 --no-file-parallelism
pnpm harness:verify
```

390px·1440px의 밝은/어두운/고대비 모드, 긴 한국어/영어, 키보드로 접기·오류 복귀·시작 복귀, 기본/직접 크기·파일 가져오기·제작 계획·실제 저장 후 재열기를 확인한다. 기존 제한시간·assertion은 유지한다.

범위는 새 프로젝트 화면이며, 프로필 설정 왕복4개·추가14개나 편집/내보내기/협업 전수 검증의 대체 증거가 아니다.
