# 통합 후보 검증 체크포인트 (2026-11-05)

- 상태: current. 작업 위치 `/workspace/scratch/toonstudio-commercial-main-validation`, 시작/종료 HEAD `abd691ee218a49a92b6ef170c152fa7415d23cf0`, 미커밋 feature 병합 대상 `5165e4faf796cebe255460ab38d1c13fde8972c4`.
- 검증 담당자는 소스·설정·모델·Remotion·Mixbox·Git ref를 수정하지 않았고 PR·main 병합·게시·배포·인증 작업을 수행하지 않았다. 정상 `pnpm prebuild` 생성 절차만 실행했다. 증거는 이 `/tmp` 디렉터리에 작성했다.

| 검증 | 명령/범위 | 실제 종료 | 결과 |
| --- | --- | --- | --- |
| 집중 Vitest | `pnpm exec vitest run --maxWorkers=2` + `focused-vitest.command.json`의 22개 명시 대상 | 0 | 22개 파일·357개 테스트 통과 |
| 집중 Node | `node --test --test-concurrency=1` + controller/model/notice 3개 파일 | 0 | 13개 테스트 통과 |
| 현재 CI 사전 설치 계약 전체 | `.github/workflows/ci.yml:156`의 13개 파일, `--test-concurrency=1` | 0 | 157개 테스트 통과, skip 0 |
| 사전 생성 | `pnpm prebuild` | 0 | 운영 호환성·workspace 링크·catalog/i18n 생성 통과 |
| 사전 원본 Program inventory | `node --max-old-space-size=8192 scripts/typecheck-shards-worker.mjs` + job JSON | 0 | 새 전체 Program 26,272개 파일·16,966개 roots·27,075개 읽기 입력 |
| 정상 정식 하네스 | `pnpm harness:verify --base=origin/main` | 0 | 변경 445개 파일 범위, ESLint 175개 파일·Secretlint·구조 검증·전체 웹 타입·API 3개 TS 프로젝트 통과 |
| 최종 증거 검토 | `python3 review-canonical.py` | 0 | fresh report·strict·원본 Program identity·전체 중복 없는 coverage·최종 지문 및 소스 동결 전부 일치 |

각 실행의 정확한 argv·cwd·환경 override·시작 시각은 `<label>.command.json`, 시작/종료 시각은 `index.jsonl`, stdout/stderr는 `<label>.log`, 실제 외부 프로세스 종료 코드는 `<label>.exit`와 `<label>.outer.exit`에 보존했다. `canonical-report-review.log`와 `canonical-web-summary.json`에 원본/최종 Program 검토 결과가 있다.

새 canonical report: `complete:true`, 26,272/26,272개 파일, 진단 0개, worker 16개, 재시도 0개. TypeScript 6.0.3, strict/noEmit 유지, 단일 worker·8192MiB heap·12MiB source budget. 최대 worker RSS 8,651,100,160바이트. Program fingerprint는 사전 inventory/최종 report에서 모두 `471df5034f6389575901d72bf7761c56cda825c947ccc354b0839e61ba2395bb`. report SHA-256은 `77bb1e54cf45dd47c7eef7b6bdea41676b49a08aeff5e905df59c24e796def13`이다. cgroup `oom_kill`은 기존 2에서 증가하지 않았다.

사전 생성 후 확장 소스·설정 해시 31,143개를 검사 전후 비교했다. 추가·삭제·변경은 모두 0개이며 JSON SHA-256은 `96a51e4fbe32f469cfed658d5b6f890d3e5affba70c5f59934fcc5b5d660385d`로 같다. .mts/.cts도 포함한다. 검증 중 원본 Program 입력 identity 전체도 일치했다.

실패한 검증은 없다. **Vite 빌드 전에 중단했다.** 다음 단계는 부모 작업의 feature 병합 커밋 후 실제 새 HEAD와 소스 지문 확인이다. 새 Vite/build:bundle/postbuild, bundle/CSP/Remotion/model/residue 검사, native browser probe, security/license audit는 아직 실행하지 않았다. 과거 dist나 이전 결과를 새 통과로 표시하지 않았다. 정상 harness는 typed identifier `check:type-coverage`나 저장소 전체 `lint:strict`를 자동 실행하지 않으므로 이 검증에서도 실행했다고 주장하지 않는다.

모델 권리의 Tag2Pix/Paprika 2개 차단과 FacePaint 1개 검토는 기술 검증 통과로 해소되지 않는다.
