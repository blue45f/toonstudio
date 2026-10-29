# Creator Bundle 네이티브 GLB 검증 — 2026-10-28

공개 카탈로그의 8팩 1,764개 GLB, 합계 1,893,423,580바이트를 제품의 실제
`prepareVerifiedBg3dModelRecord`에 넣어 `expectedSha256`·`profile: "mobile"`·
`executionBackend: "worker"` 조건으로 모두 검증했다. 원장과 팩별 권리를 대조하는 기존
배포 계획기를 먼저 실행하고, 브라우저가 요청한 SHA URL에만 검증된 private 바이트를
응답했다. 각 응답 직전에 크기와 SHA-256을 다시 확인했다.

이 증거는 로컬 기술 검증과 대표 화면 검수다. 원본 GLB를 public에 복사하거나 원격에
업로드하지 않았으며 운영 3D 서빙·배포를 수행하지 않았다. 모델별 모바일 예산을 검증한
결과이며, 장면의 누적 예산과 실제 모바일 기기의 GPU 성능은 별도 검증 범위다.

## 기록과 실제 결과

- [summary.json](summary.json): 로컬 절대 경로와 localhost origin을 제거한 최종 성공 요약.
- 최종 PNG 8개의 본문 SHA-256과 바이트 수는 요약의 `renders`에 기록했다.
- [native-validation.json](native-validation.json): 1,764개 각각의 ID·SHA·바이트·모바일 프로필·CC0 권리·검증 메트릭.
- 전수 검증 성공 1,764개, 실패 0개. 잘못된 예상 SHA는 제품의 `hash-mismatch`로 거부했다.
- 전수 실행의 실제 검증 Worker는 1,780개 요청과 성공 응답을 기록했다. 모델별 준비
  1,764회와 당시 대표 8개에 대한 준비·렌더 admission 재검증 16회를 포함한다.
- 최종 대표 검수는 같은 카탈로그와 모든 원본 SHA를 다시 대조한 뒤 전수 성공 증거를
  재사용했다. 이 실행에서 8개 대표 모델의 준비·재검증 Worker 요청·성공 응답 16회,
  Worker 오류·프로필 불일치·거부 응답 0회를 확인했다.
- Chromium `156.0.8078.4`의 실행 바이너리를 CDP로 확인했다. 8개 실제 WebGL context의
  식별값은 모두 `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)`이다.
  실행 인자도 요약에 남겼으며, GPU 판정은 실제 context 식별값을 기준으로 했다.
- 제품의 `loadVerifiedStudioBg3dGlbWithThree`로 내장 재질을 불러오고 제품의 정규화 함수를
  적용했다. 모든 대표 모델의 최대 변은 2m이며, 바운딩 박스의 8개 모서리는 카메라 안쪽에 있다.
  셰이더 오류 0건, 드로우 오류 0건, 모델의 화면 점유율 최소 1% 조건을 모두 통과했다.
- 8개 PNG를 직접 열어 내장 텍스처·색상·실루엣·프레이밍을 확인했다. 처음 실패한 검수의
  임시 산출물은 이 디렉터리에 포함하지 않았다.

| 팩 | 대표 모델 | 실제 화면에서 확인한 내용 |
| --- | --- | --- |
| Cute Park Pack | Bench_1_1 | 목재 좌판과 금속 지지대·볼트 재질 |
| Cute Dungeon Megapack | Chair_1 | 목재 면의 색상 구분과 다리·등받이 형태 |
| Cute Graveyard | Tombstone_1 | 회색 석재 면과 묘비 실루엣 |
| Medieval Weapons | BattleAxe_1_1_A | 금속 날·목재 자루·붉은 손잡이 구분 |
| Sci-Fi Arena: Blue Base | PilarP_1_A | 주황 표식과 회색 기둥의 원본 색상 |
| Cartoon Car Megapack | PoliceCar | 차체·창문·경광등·문양·바퀴의 내장 텍스처 |
| Cartoon Cars 2 | Car_Ambulance_MC_1_B | 붉은 지붕·밝은 차체·창문·구급 표식 |
| Army Pack | Heli_1_B | 녹색 동체·회색 로터·창문과 착륙 장치 |

## 무결성과 재현

카탈로그 SHA-256은 `d48538cf7f5a2ca9210447a4afee654ce4bdf624558e755c9cf25af3c6c145b2`다.
전수 결과 본문의 SHA-256은 `d3ebf867e063fc10b1b8f68a43a836d7ab99351f9d6f10ec8669288a12f12fd7`이며,
`summary.json`의 `validationRowsSha256` 및 재사용 증거의 `rowsSha256`과 일치한다.
실물 배포 계획은 로컬 증거 폴더에 보존했다. 이 디렉터리에는 모델 바이트가 없다.

아래 변수는 사용자가 보유한 private 라이브러리, 새 private 출력 폴더, 현재 체크아웃의
로컬 Vite origin, 새 로컬 증거 폴더로 정한다. 재현 CLI는 원본과 inode를 공유하지 않는
복사본만 만들며 기존 디렉터리를 덮어쓰지 않는다.

```sh
node scripts/rebuild-creator-bundle-local-ingest.mjs --library-root "$BUNDLE_LIBRARY_ROOT" --dry-run
node scripts/rebuild-creator-bundle-local-ingest.mjs --library-root "$BUNDLE_LIBRARY_ROOT" --output-root "$BUNDLE_NATIVE_INPUT_ROOT"
node scripts/rebuild-creator-bundle-local-ingest.mjs --library-root "$BUNDLE_LIBRARY_ROOT" --output-root "$BUNDLE_NATIVE_INPUT_ROOT" --check
node scripts/verify-creator-bundle-native.mjs --asset-root "$BUNDLE_NATIVE_INPUT_ROOT" --base-url "$BUNDLE_LOCAL_ORIGIN" --out "$BUNDLE_NATIVE_EVIDENCE"
node --test scripts/creator-bundle-native-proof.test.mjs
```

`--base-url`은 자격증명 없는 localhost HTTP origin만 허용한다. 검수 브라우저는 기존
Chrome·IAB와 분리한 Playwright Chromium context를 사용하고 원격·API 요청을 차단한다.
대표 화면만 다시 검수하려면 같은 카탈로그에서 실제 전수 검증에 성공한 원본 증거 폴더를
`--reuse-validation`으로 지정한다. 카탈로그 SHA, 모든 모델 ID·본문 SHA·크기·권리·프로필,
기존 실제 Worker 성공 기록 중 하나라도 다르면 재사용을 거부한다.

관련 지침은 로컬 설치 스킬 `gpu-headless-truth`를 적용했다. 실제 renderer를 식별하고
셰이더 오류와 화면 픽셀을 함께 확인했으며 성능 수치는 주장하지 않는다.
