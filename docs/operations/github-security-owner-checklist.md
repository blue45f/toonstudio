# GitHub 보안 설정 4건 — 소유자 확인 체크리스트와 기록 양식

상태: **부분 확인 (2026-10-22)** — 설정 토글 5건과 CodeQL 실행 결과는 에이전트가 GitHub API로 직접 읽어 §1-b에 적었다. 알림 건수(Dependabot·Code scanning·Secret scanning)는 에이전트의 API 권한이 없어(403) 읽지 못했으므로 소유자만 확인할 수 있다. 소유자가 이 문서를 따라 §2의 건수를 확인하고 §5 기록 양식을 채우면 그때 확정된다. 읽지 못한 항목은 "켜져 있다"거나 "0건"이라고 쓰지 않는다.

대상 저장소: `blue45f/toonstudio` (공개 저장소), 기본 브랜치 `main`.

## 1. 저장소 파일로 이미 확인된 것 (에이전트 실측, 2026-10-22)

| 항목 | 실측 | 뜻 |
| --- | --- | --- |
| `.github/workflows/codeql.yml` | 실재. 트리거는 `main` 대상 push·PR + 매주 목요일 03:17 UTC 스케줄. 분석 언어 5종(javascript-typescript·python·rust·c-cpp·actions, 전부 build-mode none), 잡 제한 180분 | 워크플로 정의는 완성. **최근 실행이 성공했는지는 파일로 알 수 없다** (§2-1 확인 대상) |
| `.github/dependabot.yml` | 실재. npm·cargo(3곳)·pip·github-actions 주간 버전 업데이트 PR 설정 | **버전 업데이트 PR 설정일 뿐**이다. 취약점 알림(Dependabot alerts)은 별도 토글이고 이 파일로 켜지지 않는다 (§2-2 확인 대상) |
| `.github/secret_scanning.yml` | 실재하나 내용은 테스트 fixture 2개 파일의 스캔 제외(`paths-ignore`)뿐 | Secret scanning 자체의 활성화 증거가 **아니다** (§2-3 확인 대상) |
| `SECURITY.md` | 실재. 비공개 제보 경로를 "소유자 활성화 필요"로 정직하게 표기済 (2026-10-22 H1 정합) | Private vulnerability reporting이 실제로 켜졌는지는 §2-4 확인 대상 |

### 1-b. GitHub API로 읽은 설정과 실행 결과 (에이전트 실측, 2026-10-22)

| 항목 | 읽은 값 | 읽은 방법 |
| --- | --- | --- |
| Dependabot security updates | `enabled` | 저장소 조회 응답의 `security_and_analysis.dependabot_security_updates` |
| Secret scanning | `enabled` | 같은 응답의 `secret_scanning` |
| Push protection | `enabled` | 같은 응답의 `secret_scanning_push_protection` |
| Secret scanning 비제공자 패턴 · 유효성 검사 | 둘 다 `disabled` | 같은 응답의 `secret_scanning_non_provider_patterns`·`secret_scanning_validity_checks` |
| Private vulnerability reporting | `{"enabled": true}` | 저장소의 `private-vulnerability-reporting` 조회 |
| CodeQL | `main` push(`826b39a`, 06:09Z)와 같은 커밋의 주간 스케줄(08:36Z) 실행이 모두 `success`. 그 뒤 push 실행 2건(`9a8f607`·`1346e02`)은 `cancelled` | 워크플로 실행 목록 |

- **읽지 못한 것**: Dependabot alerts 토글 자체, 열린 알림 건수와 심각도, Code scanning alerts 건수, Secret scanning alerts 건수. 해당 조회는 "Resource not accessible by integration"(403) 또는 프록시 차단으로 거절됐다. Dependabot security updates가 켜져 있으면 alerts도 켜져 있을 가능성이 높지만 이는 추정이고 §2-2에서 소유자가 확인한다.
- **대체 점검(알림 목록을 대신하지 않는다)**: 의존성은 OSV 일괄 조회, 소스는 semgrep(`p/security-audit`·`p/owasp-top-ten`·`p/secrets` 등)으로 훑었다. 이번 점검 과정에서 고친 것은 AES-GCM 복호화 3곳의 인증 태그 길이 명시, 포맷 게이트웨이 입력 예외 4건, creator-inference의 `accelerate` 하한이다. GitHub Security 탭의 알림과 1:1로 일치한다고 주장하지 않는다.
- **2차 대체 점검 (2026-10-22, 같은 403 제약)**: Cargo.lock 7개·pnpm/npm 잠금(패키지 1,990개)·Python 요구사항·GitHub Actions 참조 13개를 OSV로 전수 대조했다. npm은 `pnpm audit`과 같이 0건, Rust는 `paste`(RUSTSEC-2024-0436, 유지보수 중단 공지라 GHSA 없음)뿐이었다. 새로 고친 것은 `actions/download-artifact@v4` 2곳(GHSA-cxww-7g56-2vh6, 영향 범위가 4.0.0~4.1.2라 메이저만 적은 `@v4`는 영향권으로 평가될 수 있어 `@v6`으로 올림)과 `transformers` 하한(4.53.0)이다. PR 체크런으로 읽은 코드 스캐닝 결과 중 새 알림은 PR #2388의 높은 심각도 `js/redos` 1건뿐이고, 그 정규식은 이미 `4f2df714`에서 바뀌어 있다. 최근 닫힌 PR 60건 중 37건은 `main`에서 기준 분석을 찾지 못해(예: JS/TS·Rust 구성 없음) 신규 알림을 판정하지 못했다. 같은 기간 `main` push CodeQL 실행 30건 중 26건이 `cancelled`라 그 영향으로 보이지만 원인은 확정하지 않았다. 이 목록도 Security 탭과 1:1로 일치한다고 주장하지 않는다.
- **판단이 남은 항목**: `transformers`는 4.x 전체가 영향권이고 수정본이 5.10 이상뿐이라(huggingface-hub 1.5 이상 필요) 5.x로 올리지 않았다. 2026-10-22에 하한을 4.53.0으로 올려 4.x에서 고쳐지는 11건은 벗어났고, 5.x 전용 5건(GHSA-29pf-2h5f-8g72·GHSA-69w3-r845-3855·GHSA-fgcw-684q-jj6r·GHSA-x9r9-c232-4q39·GHSA-xrqw-3rrv-vx5w)이 남는다. 해당 알림이 열려 있으면 근거(`services/creator-inference/requirements-models.txt` 주석)를 보고 "사용하지 않는 코드 경로"로 닫을지 GPU 자격 검증을 거쳐 5.x로 올릴지 소유자가 정한다.

## 2. 소유자가 확인할 4건

### 2-1. CodeQL 분석 성공 여부

- **경로**: 저장소 상단 **Actions** 탭 → 왼쪽 워크플로 목록에서 **CodeQL** → 가장 최근 실행. 이어서 **Security** 탭 → **Code scanning alerts**.
- **볼 것**:
  1. 최근 실행(특히 `main` push 또는 목요일 스케줄 실행)의 결론이 언어 5종 모두 `Success`인지.
  2. Security 탭에 "Code scanning is not configured"나 도구 설정 오류 경고가 남아 있지 않은지.
- **정상 기준**: 최근 스케줄 실행이 5개 언어 모두 성공하고, Code scanning alerts 화면이 (알림 0건이어도) 정상으로 열린다.
- **이상 시 조치**: `codeql.yml` 머리 주석대로 javascript-typescript 분석이 180분을 넘겨 취소되면 SARIF가 올라가지 않아 설정 오류처럼 보인다. 실패한 언어가 있으면 그 실행의 로그에서 실패 단계(timeout인지 분석 오류인지)를 적어 §5 양식에 남긴다. 워크플로를 고치는 작업은 그 기록을 근거로 별도 항목으로 연다 — 이 확인 작업에서 임의로 고치지 않는다.
- **기록할 것**: 최근 성공 실행 날짜(UTC)·대상 커밋 SHA 앞 7자·언어별 결과·Code scanning alerts 건수.

### 2-2. Dependabot alerts (취약점 알림)

- **경로**: **Settings** → **Security and analysis**(또는 Code security) → **Dependabot alerts**. 상태는 **Security** 탭 → **Dependabot** 목록에서도 보인다.
- **볼 것**: 아래 3개는 서로 다른 토글이라 따로 기록한다.
  1. **Dependabot alerts** — 켜짐/꺼짐.
  2. **Dependabot security updates** (취약점 자동 수정 PR) — 켜짐/꺼짐.
  3. Security 탭의 Dependabot 알림 건수와 심각도(critical/high) 건수. (`.github/dependabot.yml`의 버전 업데이트 PR은 이 셋과 별개로 이미 파일로 설정돼 있다.)
- **정상 기준**: alerts가 켜져 있고, critical/high 알림이 있으면 §5 양식에 건수를 남겨 후속 조치 항목으로 넘긴다. 알림이 0건이면 "켜짐 + 0건"으로 기록한다 — 꺼진 상태의 0건과 구분해야 한다.
- **이상 시 조치**: 꺼져 있으면 그 자리에서 켠다(공개 저장소에서는 무료). 켠 날짜를 기록한다.
- **기록할 것**: alerts 토글 상태·security updates 토글 상태·알림 총건수와 critical/high 건수·확인일.

### 2-3. Secret scanning / Push protection

- **경로**: **Settings** → **Security and analysis** → **Secret scanning**과 그 아래 **Push protection**.
- **볼 것**: 두 토글을 따로 기록한다. `.github/secret_scanning.yml`은 제외 경로 설정일 뿐 켜짐 증거가 아니라는 점을 기준으로 삼는다.
  1. **Secret scanning** — 켜짐/꺼짐. 켜져 있으면 **Security** 탭 → **Secret scanning alerts** 건수도 본다.
  2. **Push protection** (비밀값이 포함된 커밋의 push 차단) — 켜짐/꺼짐.
- **정상 기준**: 둘 다 켜짐. Secret scanning alerts에 건수가 있으면 해당 건이 실제 비밀인지 테스트 fixture 오탐인지 판정해 §5 양식에 남긴다(값을 문서에 옮겨 적지 않는다).
- **이상 시 조치**: 꺼져 있으면 그 자리에서 켠다(공개 저장소에서는 무료로 제공된다). 만약 저장소를 비공개로 전환할 계획이 있으면 이 기능은 GitHub Advanced Security(유료) 영역이 될 수 있으니, 전환 판단과 함께 별도 비용 항목으로 분리한다 — 이 확인 작업에서 전환하지 않는다.
- **기록할 것**: 두 토글 상태·Secret scanning alerts 건수(있으면 실제/오탐 판정)·확인일.

### 2-4. Private vulnerability reporting (비공개 취약점 제보)

- **경로**: **Settings** → **Security and analysis** → **Private vulnerability reporting**. 확인은 **Security** 탭에서 **Report a vulnerability** 버튼이 보이는지로도 대조한다.
- **볼 것**:
  1. 토글이 켜짐/꺼짐인지.
  2. Security 탭(또는 Advisories 영역)에 비공개 제보 진입 버튼이 실제로 보이는지.
- **정상 기준**: 켜져 있고 버튼이 보인다. 이 상태가 확인되면 `SECURITY.md`의 안내 문구("소유자 활성화 필요")를 실상태로 갱신하는 후속 문서 작업이 가능해진다.
- **이상 시 조치**: 꺼져 있으면 그 자리에서 켠다(무료). 켜지 못하는 사유(권한 등)가 있으면 그 문구를 그대로 §5 양식에 적는다.
- **기록할 것**: 토글 상태·버튼 노출 여부·확인일.

## 3. 확인 순서 (한 번에 끝내는 동선)

1. **Settings → Security and analysis** 한 화면에서 2-2(alerts·security updates), 2-3(secret scanning·push protection), 2-4(private vulnerability reporting) 토글 5개를 한꺼번에 본다.
2. **Actions 탭 → CodeQL** 최근 실행으로 2-1을 본다.
3. **Security 탭**에서 Code scanning·Dependabot·Secret scanning 알림 건수를 본다.
4. 아래 §5 양식을 채워 이 문서에 직접 적거나, 같은 내용을 회신으로 남긴다.

## 4. 확인 뒤 반영 절차

- 소유자 기록이 도착하면: 이 문서의 상태 줄을 "확인 완료 (날짜)"로 바꾸고 §5 표를 채운 채로 둔다. `SECURITY.md`와 `.github/dependabot.yml`의 "소유자 확인 대상" 문구는 그 기록을 근거로만 실상태 문구로 갱신한다(확인 없이 먼저 고치지 않는다 — 2026-10-22 H1 정합 원칙).
- 알림 건수가 있으면 건수만으로 닫지 말고, 심각도 높은 것부터 별도 후속 항목으로 연다.

## 5. 기록 양식 (소유자 작성)

| # | 항목 | 확인일 | 상태 (켜짐/꺼짐/성공/실패) | 수치·증거 | 비고·후속 조치 |
| --- | --- | --- | --- | --- | --- |
| 1 | CodeQL 최근 실행 |  |  | 최근 성공 실행: ____ / SHA: ____ / 언어별: ____ / Code scanning alerts: __건 |  |
| 2 | Dependabot alerts |  |  | 알림 총 __건 (critical __ / high __) |  |
| 3 | Dependabot security updates |  |  |  |  |
| 4 | Secret scanning |  |  | 알림 __건 (실제 __ / 오탐 __) |  |
| 5 | Push protection |  |  |  |  |
| 6 | Private vulnerability reporting |  |  | Report 버튼 노출: 예/아니오 |  |

### 회신 문안 (복사해 채워서 보내면 그대로 기록된다)

```text
GitHub 보안 설정 확인 (toonstudio)
확인일: 2026-__-__ / 확인자: 소유자

1. CodeQL: 최근 실행 ____ (성공/실패), 대상 SHA ____, 실패 언어 ____, Code scanning alerts __건
2. Dependabot alerts: 켜짐/꺼짐, 알림 총 __건 (critical __건, high __건)
   Dependabot security updates: 켜짐/꺼짐
3. Secret scanning: 켜짐/꺼짐, 알림 __건 / Push protection: 켜짐/꺼짐
4. Private vulnerability reporting: 켜짐/꺼짐, Report a vulnerability 버튼 보임/안 보임
이상·후속 조치: ____
```
