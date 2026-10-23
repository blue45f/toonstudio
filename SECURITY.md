# 보안 정책

## 취약점 제보

ToonStudio의 보안 취약점을 발견하시면, 공개 이슈로 올리지 마세요.

- 제보 경로: 이 저장소의 **Security 탭 > Report a vulnerability**
  (GitHub의 비공개 취약점 제보(Private vulnerability reporting) 기능입니다.
  2026-10-22에 GitHub API로 활성화를 확인했습니다. 버튼이 보이지 않거나
  제보할 수 없으면 저장소 소유자에게 알려 주세요.)
- 제보 시 포함해 주시면 좋은 정보: 영향받는 기능/경로, 재현 절차, 영향 범위

## 처리 원칙

- 제보 내용을 확인하면 우선순위를 정해 수정하고, 수정이 배포된 뒤 제보자와 협의해 공개합니다.
- 선의의 보안 연구(본인 계정·데이터 범위 내, 서비스 방해 없음)는 환영합니다.

## 지원 범위

- 최신 `main` 브랜치와 운영 서비스(toonstudio.cloud)가 대상입니다.
- 의존성 버전 업데이트는 `.github/dependabot.yml`의 Dependabot 버전
  업데이트 설정으로 추적합니다. Dependabot 보안 업데이트(취약점 자동 수정 PR),
  Secret scanning, Push protection이 켜져 있음을 2026-10-22에 GitHub API로
  확인했습니다. 알림 건수는 저장소 소유자만 볼 수 있어 이 문서는 건수를
  주장하지 않습니다.
