# 보안 정책

## 취약점 제보

ToonStudio의 보안 취약점을 발견하시면 공개 이슈나 PR로 올리지 말고 비공개 경로로 제보해 주세요.

- 비공개 제보 경로: [GitHub Security Advisories 비공개 제보](https://github.com/blue45f/toonstudio/security/advisories/new)
  (`https://github.com/blue45f/toonstudio/security/advisories/new`, GitHub Private vulnerability reporting 기능이며
  2026-10-22에 GitHub API로 활성화를 확인했습니다. 저장소의 **Security 탭 > Report a vulnerability**에서도 바로 접근할 수 있으며,
  화면이 보이지 않거나 제보할 수 없으면 저장소 소유자에게 알려 주세요.)
- 보안 권고 목록: [ToonStudio Security Advisories](https://github.com/blue45f/toonstudio/security/advisories)
- 제보 시 함께 보내 주시면 좋은 정보: 영향받는 기능·경로, 단계별 재현 절차, 예상 영향 범위 및 개념 증명(PoC)

## 취약점 접수·대응 및 공개 원칙

ToonStudio는 책임 있는 협조적 취약점 공개(Coordinated Vulnerability Disclosure) 절차를 따릅니다.

- **접수 확인**: 비공개 제보 접수 후 영업일 기준 **3일(72시간)** 이내에 확인 회신을 드립니다.
- **분류 및 수정**: 재현과 심각도 평가가 끝나면 수정 일정과 진행 상황을 제보자에게 공유합니다. 치명·높음(Critical/High) 취약점은 **14일** 이내, 보통(Medium) 이하 취약점은 **30일** 이내 수정을 목표로 처리합니다.
- **공개 원칙**: 수정 배포가 완료된 뒤 제보자와 시점을 협의해 보안 권고(Security Advisory)를 공개합니다. 별도 합의가 없는 한 최초 제보일로부터 최대 **90일(90 days)** 이내에 수정 배포 및 공개(disclosure)를 마치는 것을 원칙으로 합니다.
- **선의의 연구 보호**: 본인 계정과 본인 데이터 범위 내에서 서비스 가용성을 해치지 않고 수행한 선의의 보안 취약점 연구는 환영합니다.

## 지원 범위

- 최신 `main` 브랜치와 운영 서비스([toonstudio.cloud](https://www.toonstudio.cloud))가 지원 대상입니다.
- 의존성 버전 업데이트는 `.github/dependabot.yml`의 Dependabot 버전 업데이트 설정으로 추적합니다.
  Dependabot 보안 업데이트(취약점 자동 수정 PR), Secret scanning, Push protection이 켜져 있음을
  2026-10-22에 GitHub API로 확인했습니다. 알림 건수는 저장소 소유자만 볼 수 있어 이 문서는 건수를 주장하지 않습니다.
