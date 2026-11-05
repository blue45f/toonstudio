# 상용 권리 대체 작업 후속 검증 — 2026-11-05

상태: **current / 후속 구현·main 통합 검증 완료, 모델 대체는 미해결**. 이전 감사의 wasm-vips 대체를 보존하고, 사용자가 지적한 Remotion 적격성과
검증 실패·자원 한계를 처리한다. 제한 모델이 여전히 있으므로 상용화 완료로 표시하지 않는다.

## Remotion은 무료 자격 전제로 유지

개인 및 조건을 충족하는 소규모 조직은 무료로 상용 사용할 수 있다. 실제 사용 버전은 웹 4.0.536,
브랜드 도구 4.0.514, 생성 promo ZIP 4.0.487이다. 정확한 버전 license·현재 FAQ·4.x와 예정 5.0 약관을
구분한 근거는 `remotion-retention-decision-2026-11-05.md`와 관련 evidence를 따른다.
실제 조직 총인원을 독립 확인한 것은 아니며, 사용자가 설명한 개인·1인 사용 전제를 기록한다.

이전 수학 대체는 동작 테스트는 통과했지만 실측 성능 이점이 없었고 독립적으로 유지할 계약이
늘어났다. 원본 6개 파일을 HEAD 바이트로 복구하고 새 수학 파일 3개를 제거했다. 원본 대체 코드,
테스트·baseline·patch·SHA-256은 `/tmp/toonstudio-remotion-math-preserve-20261105/`와 앞선 archive에
보존했다. 과거 보고서는 SUPERSEDED/history로 남겼다. Remotion의 나머지 제거를 목표로 삼지 않는다.

## 기존 실패를 고치고 최신 main에서 재검증

기존 LT 테스트의 고정 4-role 설명을 실제 설정별 출력과 선택형 6-pass 구조에 맞게 수정했다.
검증을 삭제·skip하지 않고 실제 6-role 순서·렌더러 분기·양언어 설명의 대조를 강화했다.
기존 Worker 개수 문서도 최신 main의 정확한 72개로 맞췄다. 관련 세미나 60개가 통과한다.

원본 `/workspace/toonstudio`는 HEAD `8d315c85d6fde4a3a30255612c756d3e299a95b0`와 dirty 작업을
보존한다. 최신 확인 main `2c626df4000fcfc32318faa793a61bea3ef0901b`는 별도 detached worktree
`/workspace/scratch/toonstudio-commercial-main-validation`에 checkout했다. 9개 겹치는 문서의 원격
수정과 이번 사실·권리 고지를 함께 보존한 검토 패치를 적용했다. 원본 branch를 merge/reset하지 않았다.

통합 worktree의 frozen install·lock 검증·diff 검사·하네스 구조 및 **Vitest 277개, Node 검사 12개**가
모두 통과했다. 앞서 실패한 1개는 이제 재현되지 않는다. 12개 Node 검사는 새 전체 타입 검사기의
동등성·중복/누락·입력 변경·OOM 분할·CLI 실패 전달과 기존 고지/모델 해시 검증을 포함한다.

## 전체 타입 검사의 메모리 제약 처리

16GiB cgroup에서 monolithic tsc는 exit 137, 11GiB 순차 V8 heap에서도 exit 134가 발생했다.
새 검증기는 strict 옵션·전체 Program·ambient/module augmentation 문맥을 유지하고, 의미 진단을
요청할 파일만 순차 worker로 나눈다. 선언 파일의 skipLibCheck는 원래 옵션을 그대로 적용하며
명시적인 검사 누락이나 파일 없는 지연 전역 진단을 버리지 않는다. 옵션·전역·구문 검사와 마지막
입력 fingerprint 검증도 한다. 일부 결과는 반드시 complete:false로 남긴다.

기본 `typecheck:web`를 8GiB heap·12MiB 소스 그룹으로 연결했고 `typecheck`는 기존 workspace link와
API 검사 체인을 보존한다. `build`도 같은 웹 타입 검사 후 기존 Vite 빌드를 수행하도록 바꿨다.
따라서 설명서에만 다른 명령을 적고 기존 명령이 계속 OOM 나는 상태로 두지 않는다.

canonical 연결 전 3,603개 파일 probe는 진단 0이었지만 partial 결과로 보존했다. package.json이
입력 fingerprint에 포함되므로 canonical 연결·prebuild 후 **처음부터 실제 pnpm run typecheck**를
다시 실행한다. 이 통합 main의 루트는 16,936개이고 전체 closure는 26,231개다.
실제 통합 main 검사는 **26,231/26,231개·16그룹·진단 0개**, 최종 입력 snapshot 일치,
최대 RSS 8,639,463,424 bytes(약 8.05GiB), OOM 재분할 0회로 완료됐다. API 본체·browser 작업 도구·
Postgres 도구의 3개 tsc도 종료 코드 0으로 확인했다. 첫 canonical session의 종료코드 출력 누락은
동일한 API 단계만 명시적 exit 파일을 남겨 재확인했다. 웹 전체 검사는 불필요하게 반복하지 않았다.
구현·fixture 동등성 검증과 이 증거 수집 한계는 `docs/engineering/full-typecheck-shards.md`를 따른다.

이후 Vite·고지 생성·CSP와 구조 검사도 통과했다. Studio 448 chunks, 8373.8KiB raw /
2741.4KiB gzip이며 기존 startup 측정은 오래된 기록이므로 현재 런타임 보증으로 사용하지 않는다.
격리된 Chromium에서 실제 native export·피라미드·원본 보존을 다시 확인했고 외부 vips 요청은 없었다.
제거한 WASM 4개 해시와 일치하는 배포물 및 외부 wasm-vips manifest 항목도 각각 0개다.
최종 license audit 597행·446개 고지, security audit 알려진 취약점 없음이다.
빌드와 후속 증거 동기화 이후에도 전체 프로그램 fingerprint
`0a2a58e565069979a257b124fe95c8f213606c4ba74c5aad61470bd8c4f96b91`가 일치함을 다시 확인했다.
검사 뒤 코드가 바뀐 상태를 이전 타입 통과로 표시하지 않았다.

## 제한 모델의 실제 대체 후보 평가

저자 자체 학습 light_paprika를 공식 Apache 소스·checkpoint와 구별해 확인하고 실제 ONNX로 변환했다.
생성 파일은 3,824,883 bytes, SHA-256 `431f2b1c7a3ab31fbee32fcae193e4e65b2304484e0a646a481d1a61351a17a8`이다.
기존 `image`→`anime` float32 [1,3,512,512] 계약, TF↔CPU 오차는 통과했고 브라우저도 실행됐다.
하지만 두 입력에서 색조 변화·세부 흐림·grid artifact가 보였고, 브라우저↔CPU 최대 오차 0.04380이
기준 2/255를 넘었다. CPU 1.20.1·브라우저 1.30.0 버전 차이는 추가 변수로 남는다.
Conv kernel 44개는 raw checkpoint와 SavedModel 양쪽에서 바이트가 일치하지만 모든 norm/scalar까지
확인한 것은 아니다. RGB·단일 정규화·공식 graph 사용은 재확인했다.

따라서 이 후보를 제품에 넣거나 기존 제한 모델을 지우지 않았다. 단순 필터·미검증 신경망을 동등
대체라고 표시하지 않는다. 실제 변환 코드·license·자체 checkpoint·ONNX·PD 입력 증명·PNG·실패
영수증은 `/workspace/scratch/toonstudio-light-paprika-evaluation-artifacts.tar.gz`에 보존했다.
52개 파일·12,388,496 bytes, SHA-256 `f06f13e944518a8e01150ff1db7f317442adfe634b9fbe821c7f2e8873bb5253`.
venv/cache·제한 가중치·생산 자산은 포함하지 않는다.

Tag2Pix 전체 semantic tag 기능, Paprika 품질 동등성 및 Face Paint 별도 권리는 여전히 미해결이다.
Mixbox는 수정하지 않았다. 배포·push·PR·main 병합·구매·외부 연락을 수행하지 않았다.

## 최종 main 확인과 클라우드 참조

최종 fetch 시 원격 main은 `994e5ba34df98b6bcf1cb46c567456924a89dd68`로 전진했다.
검증한 2c626df4 이후의 CRDT 변경 16개 경로는 이번 tracked 수정과 겹치지 않고, 새 파일 충돌도 없다.
현재 task patch는 해당 최신 main의 임시 index에서 적용성 exit 0이다. **새 main 994e5ba3를 빌드·
타입 검사했다고 주장하지 않는다.** 실제 번들·전체 타입 결과는 2c626df4 + 검증한 task 수정 기준이다.
main 병합은 하지 않았으며 실제 통합 시 기준 SHA와 CI를 다시 확인해야 한다.

별도 요청의 클라우드 배포·CI·env 참조는 `cloud-validation-environment-2026-11-05.md`에 정리했다.
양쪽 cloud checkout의 `.env.deployment-reference.local`은 비밀값 없는 주석 파일이며 mode 600,
Git ignored·미추적 상태를 확인했다. 기존 secret 파일을 읽거나 덮어쓰지 않았다.
Pilates Flow의 이 환경 내 주소·checkout·SHA·변수명은 검증되지 않아 미확인으로 남겼다.
이 문서화 요청 때문에 새 인증·빌드·배포를 시작하지 않았다.
