# 모델 배포 검사기·Face Paint 권리 분류 독립 검토

후속 상태: 아래 P2·P3는 이후 수정되어 독립 재검토에서 해결을 확인했다.
`/tmp/toonstudio-model-checker-fix-confirmation-2026-11-05.md`와 같은 이름의 JSON이 최종 근거다.
아래 초기 code read와 hash 수집 사이에 부모의 수정이 진행되어, 초기 source hash를 수정 전 코드 식별자로
사용하면 안 된다. 최종 확인에서는 내용을 다시 읽고 검사 전후 hash가 같음을 확인했다.

상태: current, 2026-11-05 읽기 전용 검토. 기존 checkout·모델·Git ref를 수정하지 않았다.
제한 가중치를 복사하지 않았으며 테스트에는 직접 만든 짧은 바이트만 사용했다.

검토한 원본 스냅샷:

- `scripts/check-restricted-model-distribution.mjs`: SHA-256 `d6b55ceac944619eb53e09bb54e385ce6e0e39da04fccf381a5d1265116d386f`
- `scripts/check-restricted-model-distribution.test.mjs`: SHA-256 `11ae523e10b6604e522cf88e3f565a5f60f1af1caf242cd76d3fe46fc3b8d9ab`
- `docs/reports/facepaint-rights-followup-2026-11-05.md`: SHA-256 `fc2e69f51b971655826b6074d5b9b43296a9812563a008d143c4b0380d4cca6e`

## 수정 권고

**P2 — 검사 루트의 symlink 검증 누락.** 검사기44–45행은 `resolve`만 적용하고55–60행의
symlink 거부는 디렉터리 안의 항목에만 적용한다. `assets`를 가리키는 `root-link`를 CLI 입력으로 주면
정상 검사·exit0이 나오지만, 같은 종류의 링크를 하위 항목에 두면 exit2다.
모든 링크를 검사 전에 해소하도록 안내하는 현재 계약과 다르다. `lstat(root)`로 직접 입력한 루트도
symlink·비디렉터리인지 확인하고 거부하는 테스트를 추가하는 것이 적절하다.
루트 링크가 가리키는 실제 파일 내용이 누락되는 것을 관측한 것은 아니며, 경로 처리 계약의 불일치다.

**P3 — 중복 SHA-256 정책이 마지막 항목으로 덮어써짐.** 49행의 `new Map`은 같은 digest가
차단과 검토 항목에 중복될 때 마지막 항목을 선택한다. 합성 fixture로 `[block, review]` 순서의
동일 digest를 넘기면 `blockingMatches:0`, `reviewMatches:1`을 재현했다.
현재 실제3개 hash는 서로 달라 지금 발생하는 배포 오판은 아니다. 향후 정책 입력 오류가 차단을
조용히 해제하지 않도록 중복 digest·유효하지 않은 SHA-256을 거부하는 방어와 테스트를 권한다.
동일 **크기**의 모델 두 개는 서로 다른 full SHA-256으로 정상 구별한다.

## 통과한 동작과 검사의 한계

- `.bin`·확장자 없는 파일도 알려진 크기와 같으면 전체 바이트를 해시한다.
- 알려진 크기가 아니어도 대소문자 무관 `.onnx`는 해시하여 기존 ONNX inventory를 유지한다.
- 실제 제품 모델을 열거나 복사하지 않고 `stat`만 확인했다. Tag2Pix79,269,994 bytes,
  Paprika8,702,673 bytes, Face Paint8,702,673 bytes가 선언된 크기와 모두 일치한다.
- 같은 길이의 다른 바이트는 발견으로 오인하지 않는다. 알려진 byteLength는 후보 선택용이며 일치 판정은 full SHA다.
- CLI block은1, review만 있으면0, 누락 경로·파일 루트·잘못된 flag·하위 symlink는2를 반환했다.
  발견 전체 목록을 유지하면서 `blockingMatches`와 `reviewMatches`를 분리하는 구현은 일관된다.
- 기존 단위 테스트2개가 통과했다. 합성 파일로 수행한 별도 CLI 사례8개와 결과는
  `/tmp/toonstudio-model-checker-independent-review-2026-11-05.json`에 기록했다.
  block/review CLI 사례는 독립된 Node process 안에서 기대 policy hash와 크기만 fixture 값으로
  바꿨다. 저장소 파일과 실제 가중치는 바꾸지 않았다.
- 스크립트는 known original bytes의 제한적 검사다. gzip/ZIP 내부, 변환·양자화·패딩된 모델,
  임의 신규 모델 또는 상용 적합성 전체를 검증하지 않는다. 현재 주석·CLI 범위 설명은 이를 숨기지 않는다.
- `filesVisited`는 regular 파일 수, `inspected`는 실제 해시한 후보 수다. 두 수가 달라도 누락 오류를 뜻하지 않는다.
  변경 중인 배포 디렉터리의 snapshot 일관성이나 파일 교체 경쟁 상태를 보증하는 도구는 아니다.
- 심볼릭 링크 외의 비regular 항목은 검사하지 않는다. 파일을 복원해 둔 안정된 정적 배포 트리가 전제다.
- 다른 production consumer는 없고 root `audit:restricted-models` 명령이 이 CLI를 호출한다.
  전체 앱 타입 검사·빌드·배포는 이번 검토에서 실행하지 않았다.

## Face Paint 판단

현재의 **declared-permissive + training provenance review** 구분에 추가 차단 사유를 발견하지 못했다.
저장소에 관리되는 exact checkpoint와 공식 로더가 root MIT 아래 함께 배포되는 점은 MIT 적용 추론의
유의미한 근거다. 다만 exact checkpoint에 대한 별도의 명시적 권리 문장을 찾았다는 증거와는 다르며,
이 추론을 전체 제3자 권리의 해결로 바꾸면 안 된다. 현재 보고서는 이 차이를 밝힌다.
[고정 root MIT](https://raw.githubusercontent.com/bryandlee/animegan2-pytorch/25d7b017267208dfaf34026aa3425e518372aa2f/LICENSE),
[고정 README](https://raw.githubusercontent.com/bryandlee/animegan2-pytorch/25d7b017267208dfaf34026aa3425e518372aa2f/README.md).

원 저자는 Face Portrait v1/v2에 private data와 FFHQ-trained StyleGAN2에서 생성한 얼굴을 썼다고
설명한다. 이 사실은 생성 데이터·teacher 출처의 검토 근거이며 기존 Paprika 가중치를 직접 변환했다는
증거는 아니다. 보고서가 checkpoint 업로드 기여자와 저장소 owner의 발언을 구별하는 것도 적절하다.
[저자 issue30 답변](https://github.com/bryandlee/animegan2-pytorch/issues/30#issuecomment-982134241).

확인한 NVIDIA 조건은 Work와 derivative works의 비상업 사용을 규정한다. 읽은 본문에는 생성 이미지
또는 그 이미지로 학습한 별도 모델에 대한 명시적 output clause가 없어, 해당 Face Paint가 자동으로
비상업이라고 결론짓는 것은 자료보다 강한 주장이다. 반대로 생성 데이터·private 자료의 권리까지 모두
정리됐다고 해석하는 것도 근거가 없다. 보고서의 추가 provenance 검토와 UI의 유보 표현을 유지해야 한다.
[고정 NVIDIA LICENSE](https://raw.githubusercontent.com/NVlabs/stylegan2-ada-pytorch/d72cc7d041b42ec8e806021a205ed9349f87c6a4/LICENSE.txt).

위 네1차 웹 출처를 직접 열어 확인했다. 법률 결론의 독립적인 확정을 주장하지 않는다.
현재 코드의2개 작은 보완 이후 범위가 같은 정적 byte detector로 사용할 수 있으며,
Face Paint의 review-only 분류가 상용 준비 완료를 뜻한다는 문구를 추가해서는 안 된다.
