# 3D 캐릭터 PR의 공통 검증 차단 수정

상태: current · 확인일: 2026-11-03

## 원인과 수정

- 경쟁 제품 대체 검증 프로그램의 PR-042 증거 경로가 파일 이동 전 위치를 참조했다. 실제 자산 라이선스 시험인 `apps/web/src/domains/creator/assets/studio-community-asset-license.test.ts`로 갱신했다. 증거 검사는 그대로 유지한다.
- 커뮤니티 쇼케이스의 구인 매칭 링크 `/collaboration`은 등록되지 않은 경로였다. 라우트와 기존 구인 화면의 정식 주소인 `/team/recruiting`으로 연결했다. 호환 별칭을 새로 만들지 않는다.
- 두 문제는 손가락 수정과 독립적으로 기존 main에도 존재했다. 손가락 PR과 별도 변경으로 다룬다.

## 검증

- `vitest run apps/web/src/app/routes/hardcoded-link-integrity.test.ts apps/web/src/app/routes/groups/collaborate-workspace-redirect.test.tsx scripts/verify-studio-competitor-replacement.test.ts`: 3개 파일, 9개 시험 통과.
- `pnpm run verify:studio-competitor-replacement:program`: 57개 작업과 123개 증거 경로 검사 및 검증기 시험 통과.
- 전체 하네스와 푸시 게이트의 최종 결과는 PR에 기록한다.

## 러너 관찰과 한계

PR #2676의 Core production build 작업 126126255645는 GitHub 호스팅 ubuntu-24.04 러너에서 수행됐다. shallow fetch는 19:07:07~19:38:54 UTC, 파일 체크아웃은 19:38:54~19:39:15 UTC였다. 35분 작업 제한 때문에 의존성 설치와 실제 빌드가 실행되지 않았다. 손 시각 검사도 체크아웃 도중 20분 제한에 걸렸다. 이는 빌드·렌더 성공을 뜻하지 않는다.

로그에 fetch 지연의 세부 네트워크 원인까지 드러나지는 않는다. 테스트·전체 빌드 자산·제한 시간을 변경하거나 유료 러너를 추가하지 않았다. 최신 main 반영 후 실행 결과를 다시 확인해야 한다.

## 손 시각 감사 부트스트랩 시험의 기존 버전 불일치

워크플로의 `setup-node@v7` 갱신 후 부트스트랩 시험에는 `v6` 검색 조건이 남아 4개 중 2개가 실패했다. 시험의 버전 참조를 현재 `v7`으로 맞췄다. pnpm 선행 설치 순서와 캐시 설정 검사, 실제 번들 모델 존재 검사는 유지한다. 수정 후 4개 시험이 모두 통과했다.

## 동일 스크립트의 클라우드 렌더 결과

- 최신 main 반영 후 굽힘·접촉·손바닥 방향 관련 3개 파일 16개 시험이 통과했다.
- GitHub 손 시각 감사와 같은 `scripts/verify-vrm-hand-visual-audit.mts`를 클라우드에서 실행했다. 번들 모델 6종의 기본 손 자세와 소품 접촉 장면 이미지 42장이 생성됐고, receipt의 브라우저 오류는 0건이었다. GitHub 러너에서 해당 작업이 성공한 것으로 대신 표기하지 않는다.
- 기본 자세의 양손 확대 12장을 직접 확인했다. 카게 정면에서는 의상이 오른손 대부분을 가려 손가락 모양의 시각 판정에 한계가 있다. 다른 각도와 의상·포즈 조합의 추가 점검이 필요하다. 이번 참조·부트스트랩 수정으로 의상 충돌 문제까지 해결했다고 주장하지 않는다.
- 생성 이미지와 receipt, 시험 로그는 클라우드 `/workspace/vrm-hand-evidence/`에 보관한다. 모든 3D 설정 조합의 전수 화면 검증을 완료한 것은 아니다.
