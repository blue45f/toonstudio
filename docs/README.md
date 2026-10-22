# ToonStudio 문서 안내

- 상태: **현재 문서 체계**
- 최종 갱신: **2026-10-15**

## 문서 권위 순서

```text
소스·테스트·manifest
  > 기계 원장과 ratchet
  > 현재 아키텍처 문서
  > 승인된 ADR
  > 역사적 보고서·감사·벤치마크
  > OpenWiki 탐색 문서
```

문서가 소스와 다르면 소스를 우선하고 문서를 즉시 갱신한다.

## 디렉터리 분류

| 경로 | 성격 | 현재 사실의 권위 여부 |
| --- | --- | --- |
| `docs/architecture/` | 현재 구조, 목표 구조, 장기 설계 | 현재 표시 문서만 권위 있음 |
| `docs/adr/` | 결정 시점의 맥락과 선택 | 결정 기록으로 권위 있음 |
| `docs/operations/`, `DEPLOY.md` | 운영·배포 정책 | 현재 표시 문서만 권위 있음 |
| `docs/engineering/` | 코드 구조·번들 경계 등 개발 패턴과 가드레일 해설 | 현재 표시 문서만 권위 있음(가드레일 규칙의 권위는 스크립트와 기준선) |
| `docs/engines/` | 엔진 역할·핀·품질 계약 | 생성 원장과 현재 표시 문서 우선 |
| `docs/reports/`, `docs/evidence/` | 특정 commit·실험의 증거 | 해당 시점의 증거이며 현재 구조 문서가 아님 |
| `docs/rewrite/` | 과거 재구성 감사·계획 | 역사 자료 |
| `docs/benchmarks/`, `tests/benchmarks/` | 비교 방법과 결과 | 측정 조건 안에서만 유효 |
| `openwiki/` | 빠른 탐색과 설명 | 보조 문서 |

## 현재 구조를 읽는 순서

1. [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
2. [`architecture/README.md`](architecture/README.md)
3. [`architecture/modular-monorepo-target.md`](architecture/modular-monorepo-target.md)
4. 해당 애플리케이션·패키지의 README
5. 관련 ADR과 테스트

Studio는 다음 문서를 추가로 본다.

1. [`architecture/studio-current-boundaries.md`](architecture/studio-current-boundaries.md)
2. [`engines/renderer-roles.md`](engines/renderer-roles.md) — 기계 생성 파일
3. [`engineering/code-structure-and-bundle-patterns.md`](engineering/code-structure-and-bundle-patterns.md) — 파일 크기·진입 그래프 가드레일과 분해·지연 로딩 패턴
4. 관련 `docs/adr/` 결정

실험 앱(`apps/character-lab`, `apps/brush-lab`)은 다음 문서를 추가로 본다.

1. [`adr/0026-labs-experimental-apps-engine-selection-and-promotion.md`](adr/0026-labs-experimental-apps-engine-selection-and-promotion.md) — 위치·엔진 선택·라이선스·승격 절차
2. [`reports/character-lab-engine-alternatives-2026-10-01.md`](reports/character-lab-engine-alternatives-2026-10-01.md) — 엔진 대안 비교(역사 자료)
3. [`engines/labs-brush-engine-references-2026-10-01.md`](engines/labs-brush-engine-references-2026-10-01.md), [`engines/labs-character-engine-references-2026-10-01.md`](engines/labs-character-engine-references-2026-10-01.md) — 채택 기법·참고 코드·논문·라이선스·수치 목표 원장

Godot의 Studio 3D 적용 가능성 평가(2026-10-15, 제안 상태이며 현재 기능이 아니다)는 다음 문서를 추가로 본다.

1. [`reports/godot-3d-evaluation-2026-10-15.md`](reports/godot-3d-evaluation-2026-10-15.md) — 3D 한계 진단, 적용 모드 비교, 측정 해석(`target` 평가 보고서)
2. [`adr/0028-godot-3d-adoption-modes.md`](adr/0028-godot-3d-adoption-modes.md) — 모드별 채택 조건·롤백·공급망(Proposed)
3. [`evidence/godot-3d-poc/2026-10-15/README.md`](evidence/godot-3d-poc/2026-10-15/README.md) — 측정 원본 JSON과 읽는 법
4. [`../tools/godot-3d-poc/README.md`](../tools/godot-3d-poc/README.md) — PoC 재현 순서(운영 연결·배포 없음)

Mixbox 작동 원리 분석과 독립 구현 방침(2026-10-15, 역사 자료)은 다음 문서를 추가로 본다.

1. [`reports/mixbox-working-principle-analysis-2026-10-15.md`](reports/mixbox-working-principle-analysis-2026-10-15.md) — 잠재 안료 혼합의 구조, clean-room 구현 방침, 권리 상태와 미해결 항목
2. [`../third_party/mixbox/LICENSE-GRANT.md`](../third_party/mixbox/LICENSE-GRANT.md) — 제작사 서면 합의 기록(소유자 작성 대기)
3. [`features/latent-pigment-mixing.md`](features/latent-pigment-mixing.md) — 독립 구현(잠재 안료 혼합기 `toonstudio-latent-pigment-v1`)의 구조, 안료 선택과 출처, 적합 오차, 성능, 한계, 권리 상태(현재 구현)

참조 사이트(플로터·1toon) 분석과 도입 결정(2026-10-16, 역사 자료)은 다음 문서를 추가로 본다.

1. [`reports/reference-sites-plotr-1toon-benchmark-2026-10-16.md`](reports/reference-sites-plotr-1toon-benchmark-2026-10-16.md) — 외부 두 사이트의 관찰 기록, 우리 현황 대조 17행, 이번에 한 일과 다음 차례, 확인하지 못한 것

UI/UX 자동 측정 하니스와 기준선(2026-10-16, 역사 자료)은 다음 문서를 추가로 본다.

1. [`../scripts/ux-audit/README.md`](../scripts/ux-audit/README.md) — 측정 항목, 점수 규칙, 실행·보안 규칙(현재 구현)
2. [`reports/ux-audit-baseline-2026-10-16.md`](reports/ux-audit-baseline-2026-10-16.md) — 개발 서버 기준 합계 95.12 와 시간 지표 최악 가정 하한 89.71, 감점 유형별 회수 점수, 미측정 항목, 다시 재는 법

열린 편집기 접근성 1단계(2026-10-22, 현재 구현)는 다음 문서를 추가로 본다.

1. [`features/accessibility-stage1.md`](features/accessibility-stage1.md) — 패널을 열 때마다 하는 axe·키보드 순회·이름/역할 감사의 범위와 방법, 고친 것, 문서화된 예외, 미해결과 확인하지 못한 것(실제 화면 낭독기 낭독은 미확인), 실행 방법과 CI 편입 판단

## 문서 상태 표기

- **현재**: 소스와 테스트로 지금 검증 가능
- **마이그레이션**: 현재·레거시·목표 경로가 함께 존재
- **목표**: 아직 완료되지 않은 의도
- **역사 자료**: 특정 날짜·commit·실험을 기록하며 현재 사실을 주장하지 않음

## 작성 원칙

- 기본 언어는 한국어다.
- 명령, 식별자, API 이름, 원문 인용은 필요한 범위에서 영어를 유지한다.
- 경로는 저장소 루트 기준으로 적는다.
- 자주 변하는 수치는 원장 파일을 링크하고 산문에 중복하지 않는 것을 우선한다.
- “구현”, “검증”, “병합”, “배포”를 서로 다른 상태로 기록한다.
- 생성 파일은 직접 수정하지 않고 생성 원장을 수정한다.
- 일회성 작업 지시 프롬프트, 임시 연구 메모, 백업·복사본은 삭제한다.

## 검사

```sh
pnpm run validate:documentation
```

검사는 현재 문서의 존재, 한국어 본문, 폐기 경로, 오래된 아키텍처 경로와 내부 링크를 확인한다.
외부 vendor 문서, 법적 고지, 기계 생성 파일은 별도 예외로 관리한다.
