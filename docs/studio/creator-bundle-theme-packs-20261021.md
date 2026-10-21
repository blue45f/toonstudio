# Creator Bundle 테마 팩 — bg3d 제품 배선 (2026-10-21)

상태: current. 대상 표면은 bg3d 에셋 라이브러리뿐이며 그리기·셰이퍼 등 무관한 표면은 건드리지 않는다.

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
