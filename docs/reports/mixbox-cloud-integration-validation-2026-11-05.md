# Mixbox 클라우드 통합 검증 — 2026-11-05

상태: **migration / draft**. 이 기록은 원격에 보존된 내부 안료 브랜치와 구체적인 타입 교정을 검증한 결과다. 별도 로컬 후속 수신·대조가 남아 있어 main 병합 준비 완료를 뜻하지 않는다.

## 변경과 기준

외부 Mixbox 의존성 제거와 과거 획의 명시적 이주·원본 보관을 구현한 `7d1ef53c01d2eb76777b72d14534434ff91491c0`을 main `63dcf937ca8658fbae52396595416daa1a796043`과 통합했다. 기존 원격 커밋을 보존했고 필수 테스트는 양쪽 합집합 918개로 유지했다. 검사·허용 오차·필압 기준은 낮추지 않았다.

통합 뒤 실제 TypeScript 검사에서 발견한 오류 5파일·9건을 다음과 같이 보완했다.

- CRDT 메타데이터의 기존 `kind`·`mode` 키를 타입에 포함하고, 보관 출처를 계약 parser로 검증한다. 보관 원문을 임의 변환하거나 입력 객체를 공유하지 않는다.
- 누락된 구조화 오류 코드와 한국어·영어 표시 문구를 등록한다.
- 6패스 복원에서는 활성 보정 출처를 parser로 좁힌다. 보관 획은 활성 index에서 제외하되 원본 frontier는 그대로 둔다.
- SVG 이주 회귀는 실제 획 타입과 숨김 상태를 확인한다. 벤치마크는 내부 provider와 해당 노드를 사용한다.

구현 코드 기준은 로컬 `9680b345c1681618f041fcb6328074d1b6569602`, tree `c1de3a84ff2e956823bc6ee847b9a338aeb43fea`다. 이 보고서와 JSON은 후속 문서 증거이며 해당 코드 검사에 영향을 주지 않는다.

## 실제 실행 결과

| 검사 | 결과 |
| --- | --- |
| 관련 Vitest | 55파일·1,151개 통과, exit 0 |
| 전체 Web·API TypeScript | 각각 exit 0 |
| 운영용 Vite bundle와 prebuild/postbuild | exit 0 |
| Studio bundle / Remotion gate | 각각 exit 0 |
| 변경 ESLint·Secretlint, i18n 생성물 검사 | exit 0 |
| eager graph, security, license audit | 각각 exit 0 |
| 서비스워커 critical precache | 82 URL·2,585,652 B, 기존 2,588,672 B 상한 유지 |
| 안료 app·Worker 모듈 감사 | 앱 2,664청크·12,857모듈 및 Worker 감사 65건, 금지 모듈 0 |

최초 전체 하네스는 타입 오류로 exit 2였으며 통과로 계산하지 않는다. 교정 후 Web/API 타입 검사와 관련 검증을 개별 재실행했다. 위 테스트 수에 별도로 실행한 집중 회귀를 더하지 않았다.

빌드 로그에는 `wasm-vips`의 eval과 `three-vrm`에서 사용하는 `three.webgpu`의 `tslFn` export 경고가 남아 있다. 빌드 성공을 해당 3D 실행 경로의 검증으로 확대하지 않는다.

실제 Chromium fixture에서 브러시 23종, CPU·WebGL 및 WebGPU 계산과 합성 PointerEvent 입력을 검증했다. WebGPU는 SwiftShader 소프트웨어 어댑터의 32개 사례이며 최대 오차는 `3.305472267012277e-7`이다. 물리 GPU·펜 결과가 아니다. console error와 소스 drift는 없었고, fixture closure의 188개 모듈이 타입 교정 뒤에도 같은 bytes임을 확인했다. 앱 전체의 권한·검수·다기기 여정을 대신하는 검사는 아니다.

재현 가능한 결과와 코드 해시는 [검증 JSON](../qa/evidence/2026-11-05-cloud-mixbox-validation.json)에 기록했다. 원시 로컬 로그에는 별도 실행 환경 정보가 있어 공개 증거에 복사하지 않았다.

## 병합 전에 남은 항목

1. 별도 로컬 안료 후속 `b24df26646ef4ada96aea286a156aa97df11edb5` / 통합 HEAD `994171298d3cd8462c4c740798472eb2c4054ade`의 원본을 받아 GPU·WebGL1·sketch 변경을 대조해야 한다. 현재 원격 조회에서는 찾지 못했다. 같은 해결을 임의로 재작성하지 않았다.
2. sketch가 있는 과거 획의 새 회귀 3건은 서버 root schema 거절로 실패했다. 투영 단계 전의 실패이며, 이 후보에서 해결됐다고 주장하지 않는다. 시험 패치·실패 기록은 별도로 보존하고 로컬 후속 수신 전까지 중복 수정을 멈췄다.
3. 별도 CRDT 후속 `2bd75726f83aaa1647373863167056f45a627c3a`의 채용·문서 집계·viewport·필압 진단을 기존 클라우드 변경과 대조해야 한다. 필압 기준 변경은 포함하지 않았다.
4. 새 archive bridge 회귀의 필수 선택자 등록·최종 집계는 로컬 후속과 정합한 뒤 확정한다. 전체 앱의 반응형·실제 중심 터치·구버전 peer UI/내보내기 검증과 원격 Core/Full CI도 별도로 남아 있다.

안료 수치·렌더링 보정과 무관한 배포 설정 PR이나 수채화 semantic 교정 파일은 변경하지 않았다. 운영 배포·DB migration은 수행하지 않았다. 병합은 최신 base와 필수 검사, 조정된 순서를 확인한 뒤 진행한다.
