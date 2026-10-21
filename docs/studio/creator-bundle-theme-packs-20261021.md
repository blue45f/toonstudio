# Creator Bundle 테마 팩 — bg3d 제품 배선 (2026-10-21)

상태: current (배포 경로는 migration — 아래 "배포" 절). 대상 표면은 bg3d 에셋 라이브러리뿐이며 그리기·셰이퍼 등 무관한 표면은 건드리지 않는다.

2026-10-22 정정: 생성기의 배치 가능 판정이 런타임 검증기의 external-resource-uri
거부(buffers/images의 uri 속성)를 반영하지 않아, 외부 텍스처를 참조하는 Godot판
모듈 GLB 9,362개가 배치 가능으로 과대 집계돼 있었다. 생성기에 같은 판정을 넣고
theme-packs.json을 재생성해 배치 가능은 5,303개로, 보류(deferred)는 11,721개로
정정했다. 외부 참조 GLB는 텍스처 임베드 재익스포트가 끝나야 편입할 수 있다.

## 구조

- 데이터: `apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json`
  - `scripts/generate-creator-bundle-theme-packs.mjs`가 인제스션 매니페스트 v2
    (`toonstudio.asset-bundle.v2`)에서 생성한다. 수신 완료·런타임 가능(GLB) 에셋만
    확정 데이터에 들어가고, 회수 중(부분 수신)인 팩은 `pendingPacks`로만 표기한다.
    회수가 끝나면 재생성 한 번으로 자동 편입된다.
  - 배치 가능 판정은 bg3d 모바일 검증 예산(바이트·노드·삼각형·드로우콜·머티리얼·
    텍스처·애니메이션·스킨)을 GLB 헤더 실측으로 적용한 결과다. 예산 초과·쌍둥이
    GLB 없음(FBX/glTF 단독)은 `deferred`로 집계해 패널에 사유와 함께 보여준다.
  - 프리빌트 프리셋은 단독 병합 GLB(스토어형 변형)만 쓴다. 데모 씬 파일
    (.unity/.tscn)은 런타임에서 읽을 수 없어 프리셋으로 만들지 않는다.
  - 배경 군중 캐릭터 팩은 배치 가능 에셋에 넣지 않고 `crowdPacks`(렌더 전용)로
    분리한다. 셰이퍼 마네킹과 혼합하지 않는다.
- 코드:
  - `studio-bg3d-bundle-theme-packs.ts` — 스키마·엄격 파서·캐시 로더·조회.
    파서는 `inServiceOnly: true`/`downloadable: false` 선언이 없거나 다운로드
    동선 필드(`downloadUrl` 등)가 있으면 데이터 전체를 거부한다.
  - `studio-bg3d-bundle-asset-loader.ts` — 배포 바이트 로더 + 검증 레코드 해석.
    검증 준비 함수(`prepareVerifiedBg3dModelRecord`)는 순환 import를 피하려고
    모델 라이브러리가 주입한다.
  - `StudioBg3dBundleThemePackPanel.tsx` — 테마/소품 그룹 칩, 검색, 프리셋,
    에셋 카드, 군중 렌더 전용 뷰, 준비 중 팩 표기. 기존 에셋 라이브러리 패널
    합성(`StudioBg3dAssetLibraryPanelWithPresets`)에 섹션으로 붙는다.
  - `bg3d-model-library.ts` — `getStoredBg3dModelV12`의 환경 팩 미스 분기가
    번들 해석으로 폴백하고, 해시 해석 2곳과 첨부 출처 판정
    (`resolveStudioBg3dModelAttachmentSource` → `"bundled"`)에도 번들을 편입했다.

## 라이선스 구조 (서비스 안에서만 사용)

- 에셋 파일 다운로드/내보내기 경로는 신설하지 않는다. 패널에는 추가(배치)
  동선만 있고, 장면은 에셋 id·콘텐츠 해시 참조로 저장된다. 밖으로 나가는 것은
  렌더된 이미지뿐이다.
- 레코드 권리는 `licensed / commercialUse: true / attributionRequired: false`,
  라이선스명은 "Creator Bundle: Volume 1 (EmaceArt · RG Poly)"로 고정한다.
- GLB 실파일은 매니페스트 v2 서빙 루트(`/assets/studio/bundle-v2/`)에서 참조로
  서빙된다 (다포맷 설계 문서 `asset-multiformat-native-support-design-20261020.md`와
  같은 루트).

## 재생성

실행 위치는 레포 루트다. 전제: 인제스션 v2 산출(`manifest-v2.json`과 그 파일 트리)이
로컬에 있어야 한다. 부작용은 출력 파일 1개 교체뿐이며 `--dry-run`으로 쓰지 않고
집계만 확인할 수 있다.

```bash
node scripts/generate-creator-bundle-theme-packs.mjs \
  --manifest-v2 <manifest-v2.json 경로> \
  [--asset-root <파일 트리 루트>] \
  [--themes <bundle-v1 manifest 경로>] \
  [--out <출력 경로>] [--dry-run]
```

`--asset-root` 기본값은 `manifest-v2.json`이 있는 폴더, `--themes`와 `--out`의
기본값은 각각 bundle-v1 `manifest.json`과 같은 폴더의 `theme-packs.json`이다.
생성기는 실물 파일의 sha256을 전수 대조해 매니페스트와 어긋나는 에셋을 제외하고,
그 건수를 실행 로그에 남긴다.

## 배포 (bundle-v2 → R2) — migration (2026-10-22 레포 측 완성, 실배포는 소유자 실행 대기)

- 서빙 경로: `/assets/studio/bundle-v2/<theme-packs 에셋 path>`. 실물은 레포·
  Static Assets가 아니라 R2 버킷 `toonspectrum-public-assets`에만 두고,
  Cloudflare Static Worker가 바인딩(`LARGE_ASSETS`)으로 서빙한다
  (`deploy/cloudflare-static/src/large-static-assets.ts`의 bundle-v2
  디스크립터 + `wrangler.jsonc`의 run_worker_first `/assets/studio/bundle-v2/*`).
  파일명에 공백·`+`·`&`가 있어 요청 URL은 조각별 퍼센트 인코딩으로 도착하고,
  Worker는 조각마다 디코드한 값을 R2 키로 쓴다 (로더의
  `studioBg3dBundleAssetUrl` 인코딩과 대칭).
- 객체 목록 정본: `deploy/cloudflare-static/bundle-v2-deploy-manifest.json`
  (2026-10-22 산출: GLB 5,303개·588,132,208바이트 + 배포 인덱스 1개 =
  5,304객체·588,132,367바이트). `scripts/plan-creator-bundle-deploy.mjs`가
  theme-packs와 실물 트리를 전수 대조(실재·바이트·sha256·외부 uri 게이트)해
  재생성한다. GLB 중 1개(35.5MiB 프리셋)가 Static Assets 파일 상한(25MiB)을
  넘는 것도 R2 단일 경로를 택한 이유다.
- 완료 신호: 배포 인덱스 `assets/studio/bundle-v2/manifest.json`은 업로드
  마지막 객체로만 올라간다. 패널은 이 인덱스의 files/bytes 합계가 테마 팩
  데이터와 맞을 때만 배치를 열고, 아니면 "배포 미완료" 빈 상태를 보여준다.
- 실행 (승인 주체: 저장소 소유자, 입력: 인제스션 v2 산출 트리가 있는 기기와
  wrangler 로그인):

```bash
# 1) 계획 검증 (쓰기·업로드 없음)
pnpm run plan:creator-bundle-deploy -- --asset-root <output-v2 트리>
# 2) 매니페스트 재생성 (theme-packs가 바뀌었을 때만)
pnpm run write:creator-bundle-deploy-manifest -- --asset-root <output-v2 트리>
# 3) 정적 웹 배포로 Worker 경로를 먼저 반영한 뒤 (deploy-cloudflare-static 절차)
# 4) 실업로드 (GLB → 인덱스 순서, 중단 시 같은 명령 재실행으로 이어감)
pnpm run deploy:creator-bundle-assets -- --asset-root <output-v2 트리>
```

- 성공 기준: 업로드 완료 로그 + 패널에서 배포 상태가 "가능"으로 바뀌고 임의
  에셋 1개가 장면에 배치되는 것. 실패 시: 인덱스가 없거나 합계가 어긋나면
  패널은 자동으로 미배포 상태로 남는다 (부분 업로드가 배치 가능으로
  오인되지 않는다). 롤백은 R2 객체 삭제가 아니라 인덱스 객체 삭제만으로
  배치를 닫을 수 있다.
