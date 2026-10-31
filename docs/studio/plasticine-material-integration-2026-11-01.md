# Plasticine 원본 재질 연결 — 2026-11-01

## 현재 후보

구매한 `toon-plasticine-pbr-material`의 11개 재질을 BG3D 표면 선택·프리미티브·커스텀 모델의
`surfaceMaterialId` 경로에 연결한다. 기존 CC0 82종과 공급자·UI 목록을 구분하며 구매 원본을
CC0로 표시하지 않는다. 이 문서는 구현 후보의 상태다. 운영 반영이나 실제 브라우저 검증 완료를 뜻하지 않는다.

| 구분 | 확보 원본 | 채널 | 기본 선택 |
| --- | --- | --- | --- |
| 01–08 | 8192×8192 native + 2048×2048 Godot | native: BaseColor·Normal·Roughness·Metallic / Godot: 앞의 3맵 | 8K native |
| 09–11 | 2048×2048 Godot | BaseColor·Normal·Roughness | 2K Godot |

총 19개 원본 변형·65개 논리 맵이다. 원문 SHA가 같은 맵 6개를 공유해 물리 파일은 59개이며,
픽셀 변환·재압축·해상도 축소는 하지 않는다. 논리 원본 1,939,211,459바이트에 대응하는 물리 파일은
1,938,819,011바이트다. 09–11의 native 8K 원본은 확보되지 않았으므로 해당 선택지를 만들지 않는다.

목록 프리뷰는 확보한 Godot 2K BaseColor를 사용한다. 목록을 펼치기 전에는 프리뷰를 만들지 않고,
선택한 원본의 실제 PBR 채널은 적용 시점에 요청한다. 8K를 기본값으로 선택한 재질에 2K 맵을 자동 적용하지 않는다.

구매 재질은 중립 흰색·노멀 강도 1·UV 반복 1을 사용한다. native Metallic 맵을 적용할 때는
금속성 곱셈 계수 1을 사용하고, 해당 맵이 없는 Godot 원본은 금속성 0을 보존한다.
AO·Height·Displacement처럼 확보되지 않은 채널은 만들지 않는다.

## 원본 준비와 재생성

`config/studio-plasticine-materials-source.json`이 팩 내부 상대 경로·채널·해상도·SHA·바이트의
정본이다. 공개 제품 카탈로그에는 로컬 절대 경로를 넣지 않는다.

```sh
node scripts/prepare-studio-plasticine-materials.mjs --generate-catalog
node scripts/prepare-studio-plasticine-materials.mjs --write --source-root <구매_팩_디렉터리>
node scripts/prepare-studio-plasticine-materials.mjs --check --source-root <구매_팩_디렉터리>
```

`--write`는 검증한 바이트를 로컬 public 디렉터리의 content address로 준비한다. 원본 파일과
기존의 다른 출력은 덮어쓰지 않는다. 원본·출력의 심볼릭 링크, 경로 탈출, SHA·크기 불일치는 거부한다.
구매 PNG payload는 `.gitignore`로 제외하며 소스 recipe·채널 메타데이터·코드·테스트만 커밋한다.

서비스 URL은 기존 R2 미디어가 제공하는 `/assets/virtual-studio/purchased-materials-v1/plasticine/`
아래를 사용한다. **59개 payload의 실제 준비·대상 대조와 R2 업로드를 마치기 전에 이 후보의 정적 웹을
운영 배포하지 않는다.** PR 병합과 파일 준비는 R2 업로드·운영 배포가 아니다.

## 실제 확인한 범위

- 2026-11-01 원본 PNG 65개를 Pillow `Image.verify()`와 재열기 `Image.load()`로 실제 검사했다.
  구조·전체 픽셀 디코딩·원본 크기·색 모드·SHA가 정상이며 원본 변환은 없다.
- 원본 준비 도구의 7개 Node 회귀가 통과했다. 변조 거부, 바이트 보존, 중복 제거, 링크·경로 경계,
  기존 출력 보존, 읽기 검사 무쓰기 및 실제 카탈로그 재생성을 검사한다.
- 실제 원본의 `--write`는 59개 payload를 준비했고, 뒤의 `--check`는 원본 65개와 출력 59개의
  바이트·SHA를 다시 대조해 통과했다. 두 명령의 실제 종료 코드는 0이다.
- Node 24.22.1·pnpm 11.4.0에서 `harness:doctor`와 `harness:check`가 통과했다.
- 동결 후보의 관련 Vitest 8개 파일·60사례가 단일 worker에서 통과했다. 실패·skip·todo·취소는 0개이며,
  구매 채널 바인딩·재질 복원·프리미티브/페인트 우선순위·장면 ID 왕복·선택기 및 기존 CC0 경로를 검사했다.
  같은 실행자에서 소스·설정 36개, HEAD·브랜치·20개 파일 상태와 원래 Git index의 불변을 확인했다.
- 원본 준비 도구의 같은 7개 회귀를 Node와 저장소 기본 Vitest에서 각각 다시 수집해 모두 통과했다.
  등록 방식만 기존 이중 runner 패턴에 맞췄으며 7개 검증 본문은 보존했다. 두 실행의 실패·skip·todo·취소는 0개다.
- `pnpm harness:verify --base=7e81584c3b6682b0cd89fbbad1b21c795cde3272`가 실제 종료 코드 0으로 통과했다.
  변경 파일 lint·Secretlint, 아키텍처 검사와 전체 Web/API 타입 검사를 수행했다.
  해당 실행 동안 소스·설정 36개와 원래 Git index가 유지되었으며 실제 브라우저·운영 검증은 포함하지 않는다.

## 남은 검증과 한계

원본 해상도 재질의 실제 Chrome·Safari Technology Preview 표시, 장면 저장 후 다시 열기,
메모리·성능·화면 품질 및 운영 R2 응답은 아직 검증하지 않았다.

GLB 재질 팩토리에는 같은 원본 채널을 전달하지만 **원본 8K 전체 GLB 내보내기 완료를 보장하지 않는다.**
현재 desktop GLB 검증은 100MiB 상한이고, 내보내기 이미지 경로는 RGBA 캡처와 PNG 재인코딩을 사용한다.
8192² RGBA 한 장은 256MiB이며 일부 원본 압축 PNG도 100MiB보다 크다. 이번 후보는 전역 예산과 인코더를
바꾸지 않으며, 자동 2K 축소로 이 제한을 감추지 않는다. 전체 8K GLB는 별도 원문 보존·메모리 검증이 필요하다.

기존 CC0 재질·원본 모델 복원·페인트 우선순위를 유지해야 한다. 5,434개 모델의 전체 Worker 검사와
8개 가상 스튜디오 테마의 실제 브라우저 검증은 이 재질 후보와 별도이며 완료로 합산하지 않는다.
