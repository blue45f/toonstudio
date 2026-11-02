# API 빌드용 Git 소스 내보내기

`scripts/stage-api-linux-source-context.py`는 현재 checkout의 Git HEAD와 clean 상태를 확인하고, 고정한 40자리 SHA의 blob으로 API용 source context를 만든다. 기본은 계획 출력만 수행하며, 실제 파일 생성에는 `--export-context`와 앞서 확인한 계획 SHA가 필요하다. Python 표준 라이브러리만 사용한다.

API 소스·데이터·workspace·patches·root lockfile·스크립트를 유지하면서 정확한 `apps/web/public/` 디렉터리 prefix만 추가 제외한다. 이름이 비슷한 `publicity`, `public-assets`, 다른 앱의 public과 루트 public은 이 규칙으로 제외하지 않는다. 기존 환경 파일·개인 설정·호스트 생성물 제외도 유지한다. Git 원본이나 다른 작업 자료를 삭제하지 않는다.

저장소 루트에서 아래를 실행한다. 출력 경로의 부모는 존재해야 하며, 출력·manifest·journal은 아직 없어야 한다. 심볼릭 링크가 포함된 출력 경로는 거절한다.

```sh
export API_CONTEXT_OUT=/absolute/path/to/new-api-context
python3 scripts/stage-api-linux-source-context.py \
  --expected-sha "$(git rev-parse HEAD)" \
  --out "$API_CONTEXT_OUT"
```

계획 JSON의 `planSha256`을 확인한 뒤 같은 입력으로 실행한다. `PLAN_SHA256`은 확인한 64자리 값으로 바꾼다.

```sh
python3 scripts/stage-api-linux-source-context.py \
  --expected-sha "$(git rev-parse HEAD)" \
  --out "$API_CONTEXT_OUT" \
  --export-context --expected-plan-sha256 PLAN_SHA256
```

계획과 manifest는 원 Git SHA/tree, API 전용 선택 범위·파일 수·바이트, 18개 필수 계약 경로의 현재 blob OID/SHA-256을 기록한다. 실제 내보내기는 Git batch stream의 OID·크기·내용 SHA를 검증하고 선택 목록과 manifest를 대조한다. 경로를 벗어나는 소스 symlink, LFS pointer, 기존 출력 덮어쓰기는 거절한다. 중간 실패의 partial·journal은 남기며 자동 재시도하거나 삭제하지 않는다.

Dockerfile 지문도 함께 묶으려면 `--dockerfile`, `--expected-dockerfile-sha256`, `--expected-ignore-sha256`을 함께 전달한다. 이때 Dockerfile 옆 전용 `.dockerignore`를 검증한다. 생략하면 순수 source export만 가능하며 Docker나 VM을 실행하지 않는다.

순수 경계 회귀는 다음으로 확인한다. synthetic Git batch와 자기 임시 폴더만 사용하며 실제 저장소 변경·Node·Docker·VM·네트워크는 사용하지 않는다.

```sh
python3 -B scripts/test_stage_api_linux_source_context.py
```

이 문서와 도구는 source context 준비 범위다. 실제 API 이미지·WebGPU·BG3D 추가 검증은 아직 완료되지 않았으며, 이 도구의 계획이나 순수 회귀를 그 통과 근거로 확대하지 않는다. 비공개 메모리·FIFO·GC 실험은 게시 범위에 포함하지 않는다. 운영 배포·image push·과금 설정 변경도 수행하지 않는다.
