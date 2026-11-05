# 2026-11-05 main CI 후속 검증 실행 기록

상태: `current` 검증 기록. 운영 미적용. 기록 시각: 2026-11-05 14:35 KST.

제품 실행부의 검증 체크포인트는 `3c8acca8d55bdfea88b571a40f063b537f038c01`, 비교 기준 main은 `84ea914a449e3123eef6948939f6207e3f6289c6`입니다. `/private/tmp/toonstudio-sixpass-final.uKAUb2`의 검증 시작·종료 상태는 clean입니다. 아래는 그 시점의 고정 실행 기록이며, 이후 원격 CI·병합 상태의 정본은 해당 PR의 Checks·GitHub 병합 메타데이터입니다.

원래 요청의 PR·main 상태와 후속 수정의 이유는 다음과 같습니다.

- [PR #2712](https://github.com/blue45f/toonstudio/pull/2712)는 main `534ee5b1`에 병합됐으며, [PR 실행 41914697748](https://github.com/blue45f/toonstudio/actions/runs/41914697748)과 [main 실행 41917134015](https://github.com/blue45f/toonstudio/actions/runs/41917134015)는 각각 실제 13개 검사 성공을 확인했습니다.
- [PR #2713](https://github.com/blue45f/toonstudio/pull/2713)은 `e2cce5c3`에서 외부 경로로 main `a5224fb2`에 병합됐습니다(병합 실행 경로 미확인). 당시 static precache 190 B 초과와 갈필 live 품질 실패가 있었고, 실행 중 취소된 Full Test는 통과로 계산하지 않습니다.
- 기준 main `84ea914a`의 [Core 실행 41964653471](https://github.com/blue45f/toonstudio/actions/runs/41964653471)은 실제 13개 검사 성공이지만 static 빌드를 포함하지 않습니다. 아래 후속 로컬 증거로 해당 범위를 따로 확인했습니다.

| 3c8acca8에서 실제 확인한 항목 | 결과 |
| --- | --- |
| 하네스·타입 검사 | 실제 exit 0. lint·Secretlint·아키텍처·문서·크기·eager graph, Web 및 API 3개 TypeScript 설정 통과 |
| 회귀 | 일반 73파일·939테스트 + 전용 성능 1파일·1테스트 = 74파일·940테스트 통과 |
| 별도 Node 협업 검사 | 81개 통과. Vitest에도 포함된 동일 항목으로 940과 중복 합산하지 않음 |
| static production 빌드 | 1회 exit 0. critical 82 URL·2,588,403 B, 예산 2,588,672 B 대비 269 B 여유. warm 54 URL·297,214 B |
| 번들 검사 | Studio·Remotion exit 0. 공개 CWV 실측을 뜻하지 않음 |
| 실제 갈필 | 기존 50ms 검사 exit 0, 1프리셋 저장 6/6·Undo 복원·품질 실패 0 |
| 실제 Hokusai | 명시적 charcoal 변환·Undo/Redo·같은 ID/PNG 재열기 및 새 진단 전체 exit 0. source와 dist 바인딩 유지 |
| 후속 CI 배선 패치 | 누락 8개 추가로 필수 855개. Node 27개·Vitest 18파일 323개·lint·Secretlint 통과. 940개와 중복 합산하지 않음 |
| 실제 API·두 계정 검증 | peer의 교정된 3c8 context에서 Canvas editor·viewer 2/2와 직군·담당 HTTP 1/1 통과, skip 0·exit 0. 원격 후속 PR·CI·병합은 이 기록 이후 확인 |

후속 메타데이터는 CI 대상 목록·배선 검사·해설 집계 숫자를 다루는 3파일과 이 검증 기록 1파일입니다. CI 배선 패치는 3c8 기준 별도 작업 폴더에서 검증됐으며 대상 삭제·serial 경계·임계값·제품 실행 코드 변경은 없습니다. 제품 빌드·화면 결과는 3c8에, 855개 배선 결과는 해당 패치에 각각 귀속하며 최종 커밋 전체의 동일 산출물 검증으로 합치지 않습니다.

peer Canvas의 첫 실행은 wrapper의 `VITE_API_BASE=/api`가 `/api/api` 요청을 만든 환경 실패였습니다. `passed=false` 원문을 보존하고 제품 오류 확정이나 성공으로 세지 않았습니다. 로컬 검사 서버를 모두 종료한 뒤 빈 prefix·새 context로 재실행해 2/2 Canvas와 1/1 HTTP 검사가 통과했습니다. 포인터 22 samples의 편집·공동 저장·인계·승인 뒤 REST 403/live forbidden·refresh/relogin을 확인했습니다. 기존 행·권한 8개 지문과 관련 소스 435개, 실행 전후 3c8 SHA·clean 상태가 같았고 시험 서버·소유 브라우저는 종료했습니다. 이 검증은 별도 시험 DB/API의 권한 경계 증거이며 Hokusai 정적 preview의 API 미검증을 대신하지 않습니다.

갈필 live→released는 원시 변경 0픽셀·중심 이동 0px로 일치했습니다. live/released→settled에는 원시 변경 6,248픽셀·최대 채널 차이 46·중심 이동 0.547197px·에너지 비율 1.018209가 남으며 기존 soft-wet-continuous 기준을 통과했습니다. 라이브 침착 표면은 메모리 전용이고, 최종 40스텝 저장 결과·RGBA와 분리합니다. 활성 획만 새 미리보기를 만들며 재열기는 최종 계산만, 커밋 대기는 정확히 같은 기존 미리보기만 재사용합니다.

Hokusai는 로컬 production preview에서 선택한 획의 명시적 변환을 검증했습니다. 기본 선반 3종은 벡터 경로를 유지하며 Hokusai live 시작은 0입니다. `apiVerified=false`인 선택적 API 부재 원문 67건을 별도 보존했으므로 실제 API 서버·협업 통합 성공으로 확대하지 않습니다. 분리 대상 외 진단 오류와 issues는 0입니다.

선행 `82e61b11`에서는 UI 12개가 통과했고 Hokusai 변환·Undo/Redo·자동 재열기 ID/PNG 시나리오는 완주했지만 전체 exit 1이었으므로 전체 통과로 세지 않습니다. 현재 Hokusai 전체 exit 0과는 별개 증거입니다. 선행 UI의 drag·lock·reload는 실제 변경값 보존을 확인했으며, 기본값과 같은 명시적 reset은 이전 custom 저장값을 갱신하지 않아 재열기 시 돌아올 수 있는 선행 한계가 남아 있으므로 같은 세션 표시 보존·자동 쓰기 0을 영구 reset 통과로 표시하지 않습니다.

원래 precache 190 B 초과는 SVG 두 개의 구조 공백 459 B 감축으로 보완했습니다. 선행 `82e61b11`의 82 URL·2,588,403 B와 별도로, 현재 `3c8acca8` 빌드에서도 같은 수치를 실제 확인했습니다. 원본 SVG 그림·문자·라이선스·URL과 예산 상한은 유지합니다.

협업 계약은 Node·Vitest 양쪽에서 검사하며, 기술 해설은 기본 LT의 설정별 역할과 선택형 6패스를 구분합니다. 기존 3D 도형 삽입·카메라 적용·문서 저장 계약은 바꾸지 않았습니다. 외부 SketchUp·Blender 파일 호환성·기능 동등성 및 Higgsfield API 연동은 별도 미검증입니다.

canonical 보존 재검사는 기존 dirty source 9개의 SHA-256 일치를 확인했습니다. canonical은 다른 경로에서 main `84ea914a`로 이동했고 별도 `.codex/config.toml` dirty 1개가 있으나 이 채팅의 canonical 변경은 0입니다. 운영 DB 적용·배포도 이 채팅에서 0이며 다른 담당 채팅의 승인을 확대하지 않습니다.

근거: `/tmp/main-followup-3c8-validation-summary.json`, `/tmp/main3c8-dry-brush-quality-summary-20261105.json`, `/tmp/main3c8-hokusai-live-verified-20261105/{source-binding-after.json,studio-hokusai-live-integration.json}`, `/tmp/main-ci-canonical-preservation-final-20261105.json`. CI 배선 근거는 `/tmp/main-followup-core-pins-855-20261105.{patch,json}`입니다. 이 문서는 검증 시점의 기록으로 유지하며 원격 CI·병합 결과가 나올 때마다 문서 수정 커밋을 추가하지 않습니다. 최종 상태는 해당 PR Checks·병합 메타데이터와 별도 실행 산출물로 확인합니다.
