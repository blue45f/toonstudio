# 경쟁 역량 원장 로컬 사전 검증 실측 리포트 (6/12)

- 실행 시각: `2026-11-20T19:12:30.951Z`
- 원장 기준선: 전체 `57`건 중 구현 검증 `45`건, 외부 검증 대기 `12`건, 미완료 `0`건
- 로컬 사전 검증 완료: **`6/12`** (실패 `0`건)
- 외부 전용 경계 보존: **`6/12`** (`external-only-boundary-preserved`)
- 대체 주장 허용 여부(`replacementClaimAllowed`): **`false`** (변경 금지 경계 유지)

> [!IMPORTANT]
> 로컬 사전 검증 6건은 합성 코퍼스·로컬 엔진·장애 주입·정적/정책 감사의 실측 증거이며, 라이선스 실파일·실제 OAuth 테넌트·실기기 하드웨어·외부 독립 감사·프로 작가 최종 서명을 대체하지 않는다. replacementClaimAllowed=false 경계를 그대로 유지한다.

## 1. 로컬 사전 검증 실측 결과 (6건)

| 번호 | 역량 ID | 상태 | 소요(ms) | 실측 요약 |
| ---: | --- | --- | ---: | --- |
| #31 | `psd-advanced` | `local-prevalidated` | 9.08 | 합성 다중레이어 PSD(53062B) 왕복 검증 완료: 래스터 7/7 픽셀 일치, 블렌드모드 7/7, 마스크 3/3, 조정 레이어 8/8 대칭 왕복, 8K(7680×4320) 헤더 사전 검사 통과. |
| #32 | `psb-large-document` | `local-prevalidated` | 5.69 | PSB v2 바이너리(140618B, 2레이어) 왕복 및 8K/초과치수·16비트·CMYK fail-closed 가드(차단 코드 4종)와 메모리 예산 회계 검증 완료. |
| #33 | `clip-migration` | `local-prevalidated` | 60.93 | CSP .clip(472268B, 4계층 레이어·마스크 픽셀 100% 일치) 및 .sut(12288B, 브러시 IR 1건·내장 PNG 1건) 파서 실측 완료. |
| #54 | `file-roundtrip-lab` | `local-prevalidated` | 11.02 | 합성 골든 코퍼스 왕복 완료: SVG(2029자 → SceneIR 5노드), CMYK 인쇄 PDF(8815B, 도련/재단마크/중철), 벡터 PDF 1.7(794B), 위험 확장자(.exe) 차단 확인. |
| #55 | `collaboration-fault-lab` | `local-prevalidated` | 269.84 | 3노드 Yjs CRDT 파티션 재연결 0-충돌 수렴(SHA-256 일치), V12 장애주입(GPU 100회·워커 1000회·저널복구 64회·유실 0건), SQLite 손상 LKG 복구 및 3-Way 병합 실측 완료. |
| #56 | `accessibility-security-audit` | `local-prevalidated` | 9.32 | 접근성 WCAG 감사(준수 pass·위반 6건 차단), 보안 자문 예외 0건·핀 6종·CodeQL 회귀 0건, Rights BOM 락파일 정상 통과 및 위반 4건 차단 검증 완료. |

## 2. 외부 전용 경계 보존 목록 (6건 — 로컬 허위 통과 금지)

| 번호 | 역량 ID | 상태 | 외부 근거 경로 | 외부 필수 사유 |
| ---: | --- | --- | --- | --- |
| #49 | `desktop-sync-agent` | `external-only-boundary-preserved` | `docs/evidence/external/desktop-sync-agent.json` | Signed desktop builds and OS watcher soak evidence are required. |
| #50 | `local-folder-binding` | `external-only-boundary-preserved` | `docs/evidence/external/local-folder-binding.json` | Browser permission and desktop filesystem matrices require real-device validation. |
| #51 | `google-drive-adapter` | `external-only-boundary-preserved` | `docs/evidence/external/google-drive-adapter.json` | A real Google OAuth tenant and upload/download round trip are required. |
| #52 | `dropbox-adapter` | `external-only-boundary-preserved` | `docs/evidence/external/dropbox-adapter.json` | A real Dropbox OAuth tenant and upload/download round trip are required. |
| #53 | `performance-lab` | `external-only-boundary-preserved` | `docs/evidence/external/performance-lab.json` | Representative pen devices and long-running hardware evidence are required. |
| #57 | `professional-creator-validation` | `external-only-boundary-preserved` | `docs/evidence/external/professional-creator-validation.json` | A professional creator must complete and sign off an end-to-end production episode. |

## 3. 재현 명령

```bash
pnpm exec tsx scripts/run-local-capability-prevalidation.mts
```
