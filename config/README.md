# config/ 인덱스 — 설정·정책 정본 지도 (충돌 해결용이 아님)

> 이 파일은 새로 추가된 인덱스이다. 설정 파일을 삭제하거나 합치지 않는다.
> 아래 "정본" 표시는 이 인덱스가 제안하는 방향이지, 본문을 대조해 확정된 사실이 아니다.
> 두 파일이 충돌할 때는 이 인덱스가 아니라, 실제 로더 코드와 배포 현황이 정본이다.

## 파일 목록 (상위 디렉토리 기준)

| 파일 | 역할 (이름·크기 기준) | 주의 사항 |
|---|---|---|
| `architecture-boundary-ratchet.json` (423B) | 아키텍처 경계 래칫 | `scripts/validate-app-boundaries.mjs`와 함께 경계를 기계적으로 강제한다. 이 규칙을 유지한다 |
| `architecture-source-ratchet.json` (758B) | 소스 경계 래칫 | 경계 래칫과 함께 본문 대조 필요 |
| `http-response-headers.json` (10,770B) | HTTP 응답 헤더 장부 | 중앙집중화의 좋은 예시이다. 다른 Cloudflare 단위와 헤더가 겹치는지 확인 필요 |
| `documentation-authority.json` (5,402B) | 문서 정본 정책 | 루트 문서·`docs/` 정본과 어떻게 연결되는지 본문 대조 필요 |
| `production-migration-baseline.json` (13,373B) | 운영 마이그레이션 베이스라인 | 운영 기준과 무료 티어 정책이 충돌하면 어느 쪽이 이기는지 명시되지 않았다 |
| `free-database-federation.json` (26,762B) | 무료 티어 데이터베이스 연합 정책 | `deploy/gcp-free-data/`와 정책 겹침 확인 필요 |
| `free-infrastructure-policy.json` (25,437B) | 무료 티어 인프라 정책 | 위 파일과 역할 구분이 본문으로 확정되지 않았다 |
| `creator-bundle-pack-rights.json` (107,725B) | 크리에이터 번들 팩 권리 | 크기가 크다. 요청 시점 로딩인지, 빌드·검증 시점 로딩인지 로더 추적 전에는 성능 주장 금지 |
| `site-original-ost.production.json` (42,335B) | 사이트 OST 운영 설정 | 운영 설정과 예시 파일 간 드리프트 확인 필요 |
| `studio-production-toolchain.json` (22,728B) | 스튜디오 운영 툴체인 | 툴체인 정책과 실제 빌드·배포 경로 일치 여부 확인 필요 |
| `blender/` | Blender 관련 설정 | 하위 목록 미확인. 본문 확인 전에는 용도를 단정하지 않는다 |

## 데이터 쪽 큰 파일 (참고, config는 아님)

- `data/related-info.json` (257,497B): 크기가 크다. 로딩 시점 미확인으로, 분할·지연 로딩은 로더 추적 뒤에만 검토한다.

## 정본 원칙 (제안, 확정 아님)

1. 헤더는 `http-response-headers.json`이 정본이다.
2. 경계는 두 래칫 파일 + 검증 스크립트가 정본이다.
3. 운영·무료 티어·마이그레이션 베이스라인·번들 권리 간 충돌 해결 규칙은 아직 없다.
   이 인덱스의 다음 단계는 충돌 규칙을 만드는 것이지, 파일을 합치는 것이 아니다.
4. 큰 JSON 파일에는 스키마 검증을 CI에 넣는다. 스키마가 없으면 크기만으로 문제를 단정하지 않는다.
5. 이 인덱스에 없는 설정(루트 `.env.example` 계열, `deploy/*.env.example`,
   `pnpm-workspace.yaml`의 overrides)은 이 파일의 범위가 아니다. 각각의 정본은 해당 파일에서 다룬다.
