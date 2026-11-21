# Onpod 활용 증빙 보완 기록 — 2026-11-21

- 상태: **current — 증빙 연결 문서**. 아래 관측값은 각 실행 시점의 역사 자료이며 실시간 운영 상태가 아니다.
- 확인 기준: **2026-11-21 22:17 KST**. GitHub의 `main`과 수동 실행 목록을 조회했다.
- 기준 `main`: [`4aebc4f56fdb6b3c20aba94ed00515bbd2b8a67c`](https://github.com/blue45f/toonstudio/commit/4aebc4f56fdb6b3c20aba94ed00515bbd2b8a67c)
- 증빙 원장: [`../evidence/onpod-utilization-2026-11-21.json`](../evidence/onpod-utilization-2026-11-21.json)
- 구성·승인 정책: [인프라 지도](../operations/infrastructure-map.md), [서울 origin ADR](../adr/0030-seoul-origin-hybrid-infrastructure.md)

## 1. 보고서에 반영할 판정

2026-11-18 활동보고서 이후 확보된 GitHub 기록은 **Core API의 Onpod 배포 성공과 특정 시점의 가동 확인**을 뒷받침한다. **실사용자 이용량, 지원 크레딧 차감액, 비용 절감액, 성능 개선율은 미확인**이다. 기존 보고서의 지급 확인 및 과거 콘솔 조회 기록은 원래 관찰 날짜와 함께 유지하고, 아래 내용을 후속 증빙으로 추가한다.

| 구분 | 확인된 사실 | 보고서에 적용할 범위 |
| --- | --- | --- |
| 배포 성공 | 2026-11-20의 두 실행에서 필수 CI·SHA 검증, GHCR Core API 이미지 빌드·게시, 서울 Onpod `toonstudio-api` 배포 작업 성공 | 해당 커밋의 API 배포 성공. 정적 웹·R2·Worker 작업은 두 실행 모두 `skipped` |
| 특정 시점의 운영 | 마지막 성공 배포의 origin health 검사 성공, 이후 읽기 전용 감사에서 앱 `running`과 배포 이미지 확인 | 배포 직후의 상태와 2026-11-20 23:55 KST의 가동 확인. 상시 가용성·전체 사용자 흐름 완료를 뜻하지 않음 |
| 실제 이용량 | 요청량·활성 사용자·가동 시간·자원 사용량을 확정할 운영 집계 미확보 | **미확인**. 감사의 테이블 행 수를 사용자 수로 해석하지 않음 |
| 크레딧·비용 | 배포·감사 결과에 `plan: free`, `freeTier: true` 기록 | 조회된 앱의 플랜 표기만 확인. 계정 전체 청구·지원 크레딧 차감·잔액·절감액은 **미확인** |
| 성능 개선 | 동일 조건의 변경 전후 측정 자료 미확보 | 응답속도·처리량·비용 대비 성능의 개선 수치 **미확인** |

각 판정의 직접 출처는 2~4절의 실행·artifact·job 로그와 증빙 원장에 연결한다. 과금 원장이나 개인 정산 자료는 이 공개 기술 기록에 포함하지 않는다.

## 2. 배포 실행과 커밋 연결

아래 시각은 KST이며, 종료 열은 GitHub 실행의 `updated_at`이다.

| 증거 ID | 실행 | 대상 SHA | 시작 → 최종 갱신 | 확인 결과 |
| --- | --- | --- | --- | --- |
| D1 | [#44729470779](https://github.com/blue45f/toonstudio/actions/runs/44729470779) | `277200bfb2f637c71526a084815aba3b673361e1` | 2026-11-20 20:40:10 → 20:51:20 | CI·SHA 검증, GHCR 이미지, Onpod 배포 성공. Cloudflare 정적 웹·R2·Worker 건너뜀 |
| D2 | [#44730113606](https://github.com/blue45f/toonstudio/actions/runs/44730113606) | 요청 `277200b…` | 2026-11-20 20:45:00 → 20:53:47 | 검증 시 `main`이 `e4bc321…`로 바뀌어 SHA 검증 실패. 이미지 빌드와 모든 배포 작업 건너뜀 |
| D3 | [#44734735467](https://github.com/blue45f/toonstudio/actions/runs/44734735467) | `e4bc3215097cbd6c0578f6b14a644b9430b8f203` | 2026-11-20 21:18:53 → 21:30:57 | 확인 기준 시점의 마지막 성공 배포. CI·SHA 검증, GHCR 이미지, Onpod 배포 성공. Cloudflare 정적 웹·R2·Worker 건너뜀 |

D2는 [배포 전 검증 단계](https://github.com/blue45f/toonstudio/actions/runs/44730113606/job/136270294324)에서 차단된 실행이다. 이 실패를 기존 운영 앱의 장애나 D1 배포의 취소로 기록하지 않는다. 기준 시점의 `main`은 D3의 배포 SHA와 다르며, `main` 갱신이나 이 문서의 병합만으로 최신 코드의 운영 반영을 주장할 수 없다.

## 3. 배포 직후 origin 검사

| 증거 ID | 출처 | 원본에 기록된 확인 결과 |
| --- | --- | --- |
| H1 | D1의 [Onpod job](https://github.com/blue45f/toonstudio/actions/runs/44729470779/job/136268589069), [artifact 14625494079](https://github.com/blue45f/toonstudio/actions/runs/44729470779/artifacts/14625494079) | 20:51:04.333 `/api/health/live` 503 후 20:51:14.613 live 200, 20:51:15.061 ready 200. 최종 앱 `running`, 이미지 SHA `277200b…` |
| H2 | D3의 [Onpod job](https://github.com/blue45f/toonstudio/actions/runs/44734735467/job/136287060824), [artifact 14628078733](https://github.com/blue45f/toonstudio/actions/runs/44734735467/artifacts/14628078733) | 21:30:42.308 `/api/health/live` 503 후 21:30:52.562 live 200, 21:30:53.043 ready 200. 최종 앱 `running`, 이미지 SHA `e4bc321…` |

두 artifact의 `onpod-verification.json`에는 `result: success`, `plan: free`, `freeTier: true`, `directAuthStatus: 403`이 기록되어 있다. 검증 대상은 `https://toonstudio-api.onpod.ai`이다. 원장은 공개 가능한 원본 필드의 발췌, 다운로드한 ZIP의 SHA-256, 원본 링크와 만료 시각을 보관한다. 발췌 JSON은 원본 ZIP 전체를 대체하지 않으며 artifact는 로그인 또는 보존 기간의 영향을 받을 수 있다.

검증 범위의 해석은 해당 배포 SHA의 [Onpod 배포 검증 스크립트](https://github.com/blue45f/toonstudio/blob/e4bc3215097cbd6c0578f6b14a644b9430b8f203/scripts/cloud-deploy-onpod.mjs)와 [origin 검증 스크립트](https://github.com/blue45f/toonstudio/blob/e4bc3215097cbd6c0578f6b14a644b9430b8f203/scripts/verify-render-core-origin.mjs)를 따른다.

- 첫 503과 재시도 후 성공을 함께 남긴다. 검사 전 구간이 무중단이었다는 증거는 없다.
- `healthAttempts.elapsedMs`는 재시도 대기를 포함한 검증 경과 시간이다. 이를 API 응답 지연이나 성능 개선율로 사용하지 않는다.
- 직접 origin의 비인증 `/api/auth/providers` 403 확인은 접근 경계 검사다. 로그인·저장·AI 기능 전체의 종단 간 성공을 입증하지 않는다.
- 웹 엣지의 `/api/health/live` 응답만으로 Onpod origin의 가동을 대신 입증하지 않는다.

## 4. 배포 이후 읽기 전용 운영 감사

증거 O1은 [Onpod admin read-only audit #44758053210](https://github.com/blue45f/toonstudio/actions/runs/44758053210)과 [job 136362924643 로그](https://github.com/blue45f/toonstudio/actions/runs/44758053210/job/136362924643)다. 실행은 2026-11-20 23:55:00에 시작했고 23:55:22.650의 결과 JSON을 확인했다. 별도 artifact는 없으므로 결과의 직접 출처는 job 로그다.

- 감사 코드 SHA는 `7a6339dc635333d48a814a64f41a9d14646fd2fe`, 실제 앱 이미지 SHA는 `e4bc3215097cbd6c0578f6b14a644b9430b8f203`이다. 감사의 `head_sha` 또는 `releaseSha`를 배포된 이미지 SHA로 바꾸어 적지 않는다.
- 앱 `running`, 플랜 `free`, `freeTier: true`, 감사 결과 `ok`가 기록되었다.
- DB 읽기 결과는 `hostMatched`, `readOnly`, `rolledBack`, `connectionClosed`가 모두 `true`였다.
- migration 비교 132건은 모두 `applied`이며 `integrity: verified`, `orderValid: true`, `unknownRowsCount: 0`, `truncated: false`였다. 이 결과는 해당 감사의 비교 범위에 한정한다.
- Cloudflare는 `tokenConfigured: false`, `status: not-configured`였다. 이 감사에서 웹 배포 버전이나 웹 운영 상태를 확인했다고 주장하지 않는다.

O1에는 HTTP health 응답, 실사용자의 기능 실행 로그, 이용량 집계, 과금 내역이 없다. 또한 DB TLS 항목은 `authorized: false`, `hostnameMatches: false`, `configuredMode: no-verify`, `migrationTransportVerified: false`다. 따라서 감사 `ok`를 전체 서비스 기능 또는 DB 보안·TLS 검증 완료로 확대하지 않는다.

## 5. 활동보고서에 추가할 문구

> 2026-11-18 보고서 작성 이후 Onpod 활용에 관한 기술 증빙을 추가 확인하였다. 2026-11-20 GitHub Actions 실행 #44729470779에서 커밋 277200bfb2f637c71526a084815aba3b673361e1의 필수 CI·SHA 검증, GHCR Core API 이미지 빌드·게시 및 서울 Onpod의 toonstudio-api 배포 작업이 성공하였다. 이후 실행 #44734735467에서는 커밋 e4bc3215097cbd6c0578f6b14a644b9430b8f203의 API 배포가 성공했으며, 직접 origin의 live·ready 검사가 초기 503 이후 재시도에서 200으로 완료되고 앱 상태가 running으로 기록되었다. 두 실행의 Cloudflare 정적 웹·R2 및 Worker 배포는 건너뛰었다. 같은 날 23:55 KST 읽기 전용 감사 #44758053210에서도 e4bc321… 이미지의 앱 가동과 DB 읽기·migration 대조 결과를 확인하였다. 이는 API 배포와 해당 관측 시점의 운영 증빙이며, 최신 main 전체의 배포 완료나 상시 가용성·전체 사용자 흐름의 성공을 의미하지 않는다.
>
> 배포·감사 기록에는 앱 플랜이 free, freeTier가 true로 표시되었으나, 이 값만으로 지원 크레딧 차감 여부나 계정 전체 비용을 확인할 수 없다. 실제 운영 사용량, 누적 크레딧 차감액, 현재 잔액, 비용 절감액 및 동일 조건의 전후 성능 개선 효과는 미확인으로 유지한다. 기존 보고서의 지원 지급 확인과 과거 콘솔 조회 사실은 해당 날짜의 기록으로 유지하며, 최신 과금·운영·비교 측정 자료 확보 후 별도로 보완한다.

문구의 첫 단락은 D1·D3·H1·H2·O1, 두 번째 단락의 플랜 표기는 H1·H2·O1에 연결한다. 기존 지급·과거 콘솔 확인의 출처는 원 보고서의 기존 증빙을 유지한다. 이 문서가 그 비공개 원증빙을 새로 대체하는 것은 아니다.

## 6. 추가로 필요한 증빙

| 미확인 항목 | 필요한 자료 | 확인 시 기록할 값 |
| --- | --- | --- |
| 실사용량 | Onpod 사용량 화면·내보내기, 해당 앱의 운영 모니터링·요청 집계 | 계정·앱 범위, 집계 시작·종료, 시간대, 요청 수·가동 시간·자원 사용량과 단위 |
| 크레딧 차감·잔액 | 지원 크레딧 거래 원장, 청구·사용 상세, 동일 시점의 잔액 | 지급액과 별도로 실제 차감액·적용 자원·조정 내역·기준 시각. 사용액 0원도 원증빙 확보 후 확정 |
| 비용 절감 | 지원 적용 전후의 같은 사용량에 대한 비용 근거 | 비교 기간·자원·단가·세금 처리·지원 적용 금액. 지원 지급액을 절감액으로 간주하지 않음 |
| 성능 개선 | 동일 환경·작업·부하의 전후 반복 측정 | 표본 수, 성공률, p50·p95 지연, 처리량, 자원 사용량과 측정 조건 |
| 이후 운영 버전 | 후속 배포 실행과 실제 앱 이미지, 관측 시각이 있는 상태 기록 | `main` SHA·배포 SHA·감사 코드 SHA·실제 이미지 SHA를 각각 기록 |

이 기록 작성 과정에서는 기존 GitHub 실행과 자료를 조회했다. 새 운영 배포, 앱 설정 변경, 유료 서비스 이용, 실서비스 기능 실행 또는 부하 측정을 수행하지 않았다.
