# 상용 라이선스 후속 구현·PR 준비 기록 — 2026-11-05

상태: **current / 구현 보존·권리 재분류 완료, 최신 base 검증·draft PR 진행 중**.
이 기록은 같은 날짜의 이전 감사·2c626df4 검증 보고서보다 후속 상태다. 기존 모델의
권리 문제 또는 전체 상용화가 해결됐다는 뜻이 아니다. 이전 통과 기록의 SHA를 바꾸어 적지 않는다.

## 작업 기준과 소유권

원본 `/workspace/toonstudio`의 HEAD `8d315c85d6fde4a3a30255612c756d3e299a95b0`와 dirty
작업을 보존한다. 별도 통합 worktree의 작업 변경을 보존한 채
`codex/commercial-model-license-audit-20261105`를 main
`63dcf937ca8658fbae52396595416daa1a796043`에서 만들었다. 원격 main에 대한 병합은 아직 없다.

사용자는 미완료 코드의 완료·검증·PR·순차 병합을 요청했다. draft PR 게시까지 진행하고,
main 병합은 조정자가 순서를 배정할 때까지 대기한다. 별도 운영 설정 PR #2720이 첫 순서이며,
main의 brush semantic 실패는 별도 담당 영역이다. UX·운영 설정·Mixbox 구현을 편집하지 않는다.
Remotion은 설명된 개인 무료 자격 전제로 유지한다.

Mixbox 브랜치 `codex/mixbox-internalization-ci-20261105`의 head는
`7d1ef53c01d2eb76777b72d14534434ff91491c0`, 공통 base는 `994e5ba3`다.
이번 변경과 13개 경로가 겹친다. 주로 legal 문서·테스트와 `package.json`, `pnpm-lock.yaml`,
고지 생성기이며 같은 변경이라는 뜻은 아니다. 병합 순서가 바뀌면 각 담당의 hunk를 보존해 대조해야 한다.
상세 목록과 읽기 전용 비교는
[소유권 기록](../evidence/commercial-model-rights-2026-11-05/mixbox-branch-coordination.json)에 있다.

## 세 모델의 구분과 실제 변경

| 모델 | 이번에 확인한 근거 | 현재 분류·조치 |
| --- | --- | --- |
| Tag2Pix | 원저자의 README와 release 본문 모두 code MIT / weights 비상업·재배포 제한을 구분 | 상용 배포 차단. 별도 허가 미확인, 동등 대체 미검증이므로 기존 기능·가중치 유지 |
| Paprika | 원본 AnimeGANv2 비상업·상용 허가 조건과 MIT PyTorch 포트의 변환 계보 | 원본 조건 충돌 미해결. 정확한 변환 epoch·tensor 전량은 재검증하지 않았으며 권리 해결을 주장하지 않음 |
| FacePaint v2 | MIT LICENSE와 함께 실제 체크포인트가 저자 관리 저장소에 포함되고 공식 로더가 사용. 원저자 학습 설명도 확인 | `MIT (repository checkpoint)` / `declared-permissive`로 고지 정밀화. 학습 출처 검토를 별도로 유지하며 자동 비상업 제한을 주장하지 않음 |

[Tag2Pix 후속](tag2pix-rights-followup-2026-11-05.md),
[Paprika 후속](paprika-rights-followup-2026-11-05.md),
[FacePaint 후속](facepaint-rights-followup-2026-11-05.md)에 고정 revision·해시·원저자 링크·확인 한계가 있다.
FacePaint 조사 JSON의 기존 notice hash는 후속 고지 정정 **이전 snapshot**이다.
정확한 모델 바이트 해시는 고지 정정 전후 동일하며 모델 삭제·추론 동작 변경은 없다.

Tag2Pix의 공개 API는 115개 multi-hot 태그를 지원한다. 현재 패널은 65개 선택지·7개 그룹을
노출한다. UI가 더 작다는 이유로 API의 나머지 기능을 제거하지 않는다. 패널의 code/weights를
구분하지 않은 MIT 주석도 정정했다. 의미 부위 색 반영·선화·alpha·원해상도·layer/PSD·취소·실패·
offline/no-key·lazy load 계약을 대체 수락 조건으로 유지한다.

## 대체 후보의 검증 결과

기존 독자 Lanczos 리사이즈와 wasm-vips 제거는 유지한다. Remotion의 불필요한 수학 대체는
이미 되돌리고 원본을 보존했다. 새 모델 adapter·placeholder를 넣거나 제한 가중치를 학습·증류하지 않았다.

light_paprika는 CPU ORT 1.30.0 / Web 1.30.0으로 버전을 맞춰 실제 재평가했다. CPU는 기존
1.20.1과 두 입력 모두 바이트 동일했다. 브라우저 최대 오차는 사진 0.0437966 / 도시 0.0656611로
기존 `2/255` 기준을 넘는다. 3회 결정성·finite·shape는 통과하지만 수치·화질 동등성은 통과하지 않았다.
상세 실행·공식 wheel hash는 [동일 버전 재검증](light-paprika-parity-followup-2026-11-05.md)에 있다.

ControlNet anime lineart + SD1.5는 checkpoint OpenRAIL-M 근거를 확인한 추가 후보지만 핵심 fp16만
2.855 GB이며 115태그를 단일 77-token prompt에 담을 수 없다. ONNX Model Zoo의 BSD 스타일망은
미술 스타일 후보이지 Paprika 애니메이션풍 동등성이 입증된 대체가 아니다. 후보 weights·서버·
새 요금제·운영 인증을 제품에 도입하지 않았다.

## 배포 잔재 검사 보강

`audit:restricted-models`는 `.onnx`와 알려진 모델 크기에 맞는 일반 파일의 SHA-256을 검사한다.
확장자를 `.bin`으로 바꾸거나 없애도 원본 바이트를 찾으며, 크기만 같은 다른 파일은 차단하지 않는다.
Tag2Pix/Paprika는 `blockingMatches`, FacePaint의 학습 출처 검토는 `reviewMatches`로 분리한다.
차단 항목이 있을 때 exit 1, 경로·정책 오류는 exit 2다. 원본 크기·SHA의 중복 정책, 루트 및
하위 심볼릭 링크도 거부한다. 압축·수정·재변환된 모델이나 모든 외부/CDN 자산의 권리를 보증하지 않는다.

독립 검토에서 찾은 루트 링크와 중복 SHA 문제를 고치고 회귀 테스트·독립 CLI 사례로 재확인했다.
[검토·해결 증거](../evidence/commercial-model-rights-2026-11-05/review/)를 보존한다.

## 검증·게시 단계

이전 `2c626df4 + task`의 전체 웹 26,231개 진단 0·API 3개 검사·Vitest 277·Node 12·빌드 통과는
그 당시 입력에 대한 기록이다. 현재 `63dcf937 + task` 검증을 별도로 실행 중이며 이전 결과로
새 SHA의 CI를 통과 처리하지 않는다. 새 검사·draft PR·CI의 exact SHA와 결과는 후속 영수증에 남긴다.

보호 브랜치의 required status checks API 읽기는 HTTP 403 `Resource not accessible by integration`으로
실패했다. 동일 작업을 재시도하지 않았다. 소스 workflow의 `core`·`verify`와 실제 PR check 결과를
확인하되 현재 보호 설정을 독립 조회한 것처럼 표현하지 않는다. main 병합·운영 반영은 미실행이다.

## 환경 밖 복구

이전 검증 보존본 22,228,586 bytes를 비공개 ChatGPT Library에 저장했다. SHA-256은
`22ce7831d20896297b960f8ac70e7f42af3e331bd92efa6dfb62e6a5255b0912`다.
[저장 영수증](../evidence/commercial-model-rights-2026-11-05/recovery-library-receipt.json)을 보존한다.
현재 후속 결과는 다음 보존 버전에 포함한다. 복구 절차·정확한 base·도구·한계는
[복구 안내](../engineering/commercial-checkpoint-recovery.md)를 따른다.

보존본에는 실제 env·secret·세 제품 모델 binary가 없다. 별도 실패 후보의 허용된 평가 weights는
포함되며 제품 채택본이 아니다. 원본 checkout의 새 `:memory:.ses` 파일은 출처 불명 임시 파일로
내용을 읽지 않고 보존했으며 PR·복구 overlay에 포함하지 않는다.
