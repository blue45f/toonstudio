# Comic video director

The existing `/create/promo` and `/showcase/promo` editor now supports a browser-local motion-comic workflow. No paid API, hosted rendering service, new application dependency, database migration, or artwork upload is introduced. Existing text-AI story planning remains explicit and optional.

## Workflow

1. Upload PNG/JPEG/WebP artwork. Long vertical manuscripts can be split into 2/3/4/6/12 equal-height images **before** downscaling; this is not automatic panel detection. Files sort naturally by filename. Review speech balloons at split boundaries.
2. Apply one of six editable local templates: anime opening, cinematic trailer, romance teaser, mystery teaser, launch short, or story recap. Original panel order and nonempty captions are preserved. Duration weights use a deterministic text-length heuristic, not inference.
3. Refine each shot: 11 camera motions, four transitions, rain/snow/embers/speed-line overlays, intensity, and crop focal point. Upload a separately prepared transparent foreground for genuine two-layer parallax. The editor does not infer depth or remove backgrounds.
4. Style captions (classic/boxed/typewriter, top/center/bottom), ending branding, and portrait-safe margins. Platform interfaces vary: check the destination platform before publishing. Low-motion mode disables camera motion, particle overlays, animated transitions and typewriter reveal.
5. Add an audio file or generate an original local synthesized pad (ambient/pulse/suspense). A separate uploaded narration track has independent volume and start time. It plays once, ends at the video boundary and ducks the BGM while active. No voice cloning or TTS service is called.
6. Export a native 720/1080-short-side browser video, portable Remotion render kit, project JSON, SRT, WebVTT, generic frame-based shot-list JSON, first-shot poster or storyboard contact sheet. WebM is finalized with duration and keyframe cues without transcoding. Browser-supported MIME determines the native extension; WebM is never renamed MP4. The optional Remotion kit retains its separate license notice.

> 2026-10-15 갱신(current): 영상 길이에 **10초**가 추가되었고, 10초 영상의 컷 상한은 **6개**입니다. 자세한 규칙과 아직 구현하지 않은 범위는 아래 「숏폼 확장」을 보세요.

The existing bounds remain for 15/30/60 seconds: 12 shots, a two-second ending included in the length, and 9:16/16:9/1:1. Native recording is real-time: keep the tab visible. The frame-accurate optional local Remotion composition can render H.264 independently of wall-clock browser playback.

## Reliability and privacy

- The declared 30fps recording now requests 30fps rather than the previous 5fps capture rate. Real-time recording can still drop frames under machine load; the frame renderer itself is deterministic.
- 30-step undo/redo shares immutable media strings rather than copying raw image buffers on each edit.
- IndexedDB stores one local draft with debounced writes and explicit restore/save/error status. A transactional revision check prevents another open tab silently overwriting a newer draft. Removing every shot also persists. Keep a project JSON backup: browser storage may be cleared or exhausted.
- Loading and composition/export do not require AI. Browser E2E verifies video export with the network disabled **after the page has loaded**; this does not claim an uncached offline route can be opened from scratch.
- Imported projects reject remote URLs, SVG/script sources, invalid numeric/enumerated settings, duplicate identities, oversized embedded media and malformed voice/presentation settings. Raster decoding is sequential and budgeted. Cancellation, hidden tabs and encoder failures never result in a success download.
- This creates motion-comic animation from supplied artwork. It does not introduce a generative character-acting, lip-sync, interpolation or video-diffusion model.

## Verification

Commands used (the standard repository hooks remain enabled):

```sh
pnpm exec vitest run apps/web/src/domains/creator/promo apps/web/src/domains/creator/animatic/studio-animatic-recorded-webm.test.ts
node tools/verify-studio-promo-recording.mjs
node tools/verify-studio-promo-preview.mjs
python3 tools/verify-studio-promo-output.py --self-test
python3 tools/verify-studio-promo-director-output.py --results test-results --remotion /path/to/director/out/promo.mp4
pnpm exec eslint apps/web/src/domains/creator/promo e2e/studio-promo.spec.ts --max-warnings=0
pnpm exec playwright test --config playwright.promo.config.ts --project=chromium
```

Local verification used an isolated worktree, its own Vite cache/port and installed Chrome. Unit tests: 59 passed. Recorder/preview lifecycle tests: 17 + 5 passed. The two browser scenarios use production UI, real canvas, real local audio and real native encoding; only the optional text-AI HTTP responses are fixtures. They exercise split import, templates, foregrounds, history, narration, captions, exports, local draft restoration, mobile overflow and offline-after-load recording.

The browser-exported enhanced Remotion ZIP was installed separately and actually rendered at quarter scale: H.264, 450 video frames, 30fps, 15-second video track, AAC audio. Native output: 720×1280, VP8/Opus, 30fps. Audio analysis detected the scheduled test narration at 2 seconds and BGM attenuation near 28% in both encoded outputs. Poster output was 1080×1920; the four-scene contact sheet was 720×852. Machine/font/codec differences can affect rendering and encoder padding.

## Recording-quality follow-up (2026-09-13)

The failed hosted video gate produced only 146 native frames in its enhanced
15-second fixture. The 338-frame minimum remains unchanged. This follow-up
addresses product rendering overhead and separates video testing from the 3D
suite's forced SwiftShader flags; it does not waive video or audio checks.

- Bounded text raster tiles avoid repeating text shaping and shadow rendering.
  Per-canvas LRU caches are limited to 16 tiles / 2,000,000 pixels, and are
  released on preview unmount and recording cleanup. Typography is preserved.
- Recording progress updates at most five times per second rather than
  rerendering the editor on every frame. Capture still requests 30fps.
- Music fades and narration ducking use linear ramps scheduled on the Web
  Audio clock. Source nodes stop at the timeline boundary, independent of UI.
- `playwright.promo.config.ts` uses an isolated cache/port and fresh browser,
  without unrelated 3D renderer flags. Both full editor workflows and the new
  raster-quality scenario remain mandatory alongside real encoded-media tests.

Run browser verification with:

```sh
pnpm exec playwright test --config playwright.promo.config.ts --project=chromium
```

Local validation of this follow-up:

- 62 unit tests (project/model/director/audio automation/shared WebM finalizer).
- 19 recording-lifecycle and 5 preview-lifecycle regression tests.
- Two full browser workflows passed. A third real browser test compares
  cached versus uncached text in 45 combinations of ratio, style, frame and
  nonsequential seek, and checks 150 edits, bounded cache size and cleanup.
- Actual native output: basic 443 frames, director 452 frames (including the
  final capture flush), VP8/Opus, finalized duration 15 seconds. These are
  local measurements, not an exact frame-count guarantee on every device.
- Both newly exported Remotion kits were installed and rendered independently.
  Enhanced H.264/AAC output: exactly 450 video frames at 30fps / 15 seconds.
- Encoded-audio analysis verified narration at 2 seconds and BGM attenuation
  ratios of 0.295 (native) / 0.296 (Remotion). The basic output also passed
  audio/video timing and visible title/CTA ending-card validation.

No new application dependency, hosted renderer, paid API, database operation,
neural character animation, voice cloning or artwork upload is introduced.
Repository CI and production deployment status must be checked separately
from these local measurements.

## 숏폼 확장 (2026-10-15)

세 가지를 더했습니다. 모두 브라우저 안에서 동작하며 새 런타임 의존성, 유료 API, 호스팅 렌더링, 데이터베이스 마이그레이션, 작품 업로드를 쓰지 않습니다. 각 항목은 **current**(구현·테스트됨)와 **target**(아직 구현하지 않음)을 나누어 적습니다.

### 1. 10초 트레일러 프리셋 (틱톡·쇼츠)

**current**

- 영상 길이 선택이 10/15/30/60초가 되었습니다. 10초는 본편 8초 + 마지막 2초 엔딩 카드입니다. 엔딩 2초는 길이에 포함되며 뒤에 덧붙지 않습니다.
- 10초 영상은 컷을 **6개까지** 담습니다(15/30/60초는 기존대로 12개). 컷이 7개 이상인 프로젝트는 10초로 바꿀 수 없고, 이유를 알리며 컷은 지우지 않습니다. 업로드(여백 자동 분할·균등 분할 포함, 분할 결과가 남은 컷 수를 넘으면 거절)·복제·문서 컷 가져오기도 같은 상한을 따릅니다.
- 컷 하나의 최소 길이는 모든 길이에서 0.5초(15프레임)입니다. 6컷이면 본편 8초 안에서 최소 3초를 먼저 깔고 남은 5초를 가중치로 나눕니다. 컷당 1초 미만이면 점검 단계가 경고합니다(10초 쇼츠는 컷당 1초 이상을 권장).
- 컷 상대 길이(가중치)는 10초에서만 읽기 시간 기준으로 다시 계산합니다: 컷마다 초당 12자, 최소 1초(마지막 컷은 여운 0.25초)를 읽기 시간으로 보고, 본편 8초를 그 비율로 나눈 뒤 0.5초 하한을 반영해 0.5~3 범위로 제한합니다. 15/30/60초의 글자 수 비례 공식은 바뀌지 않았습니다.
- 「10초 쇼츠 트레일러」 템플릿 버튼은 길이를 10초, 비율을 9:16으로 맞추고 연출을 적용합니다: 첫 컷 후킹 → 핵심 장면 → 엔딩, 하드 컷 전환, 빠른 모션(임팩트·푸시인·팬), 박스 자막, 속도선. 컷이 7개 이상이면 버튼이 비활성화되고 이유를 `role="alert"`로 알립니다.
- 미리보기·내보내기·Remotion 키트가 같은 규칙을 씁니다. `promo-model.ts`는 키트에 원본 소스로 들어가며, README에 길이·프레임 수·컷 상한을 적습니다. `promo-kit-portability.test.ts`가 키트에 들어가는 소스만으로 편집기와 같은 타임라인·SRT·샷 리스트·연출 계획이 나오는지 비교합니다.
- 하위 호환: 15/30/60초 프로젝트 JSON은 값 그대로 읽히고 다시 저장해도 같습니다(고정한 예시 JSON으로 테스트). 이 브라우저에 자동 저장되는 초안(IndexedDB `toonstudio-promo-drafts`)도 같은 규칙으로 읽으므로, 10초 지원 이전에 저장된 15/30/60초 초안은 그대로 복원되고 10초 초안은 저장·복원됩니다(`fake-indexeddb`로 실제 저장소 경로를 테스트). 10/15/30/60이 아닌 값(5, 9, 11, 20, 61, 문자열 `"10"`, `null`, `NaN` 등)은 계속 거절합니다. 10초 프로젝트에 컷이 7개 이상이면 읽기 단계에서 거절합니다.
- AI 계획(텍스트 전용)은 10초일 때만 짧은 호흡 안내를 프롬프트에 더합니다. 미디어는 여전히 AI에 보내지 않습니다.

**target / 미구현**

- 10초 영상의 실제 브라우저 녹화·Remotion 렌더 검증(Playwright, 실제 인코딩)은 이번 작업에서 실행하지 않았습니다. `tools/verify-studio-promo-output.py --self-test`만 10초 합성 데이터로 확장했습니다(10초 계약은 통과하고 15초 계약은 실패해야 함).
- 틱톡·쇼츠의 화면 안전 영역은 플랫폼마다 다르므로 기존처럼 게시 전에 대상 플랫폼에서 확인해야 합니다.

### 2. Studio 문서의 컷 → 샷 초안

**current**

- 흐름: Studio 내보내기 메뉴 「홍보 쇼츠로 보내기」 → 「홍보 쇼츠용 컷 묶음 저장」(JSON) → 홍보 영상 편집기의 「Studio 문서에서 컷 가져오기」 → 컷 선택·자막 후보·순서를 **미리보기에서 확인하고 고친 뒤** 적용(현재 컷 교체 또는 뒤에 추가, 실행 취소 가능). 두 화면 사이는 파일로 전달합니다.
- 컷 이미지는 내보내기 메뉴가 이미 쓰는 페이지 캡처(선택한 페이지 범위, 내보내기 배율·색보정 합성)에서 문서의 컷(프레임) 영역을 잘라 만듭니다. 긴 변은 2048px 이하, 컷 이미지 하나는 6MB(data URL 길이) 이하이며 넘으면 단계적으로 줄입니다. WebP로 인코딩하고 브라우저가 지원하지 않으면 PNG/JPEG를 씁니다. 묶음은 60컷·90MB까지입니다. 워터마크 설정이 켜져 있으면 컷마다 찍습니다. 이 묶음은 이미지에서 컷을 새로 찾지 않습니다.
- 읽기 순서는 대사 일괄 편집과 같은 규칙입니다: 페이지 → 컷(명시 order → 위→아래 → 왼→오른). 숨기거나 24px 미만인 프레임은 컷이 아닙니다.
- 자막 후보: 컷 안의 보이는 말풍선·텍스트에서 만듭니다. 말풍선마다 후보 하나, 둘 이상이면 모두 이은 후보를 더합니다. 기호뿐인 말풍선과 같은 문구의 반복은 후보에서 빼고, 120자(UTF-16 길이, 프로젝트 검증과 같은 기준)를 넘으면 문장 끝이나 말줄임표로 줄이며 줄였음을 알립니다. 번역하거나 고쳐 쓰지 않으며, 말풍선이 없는 컷의 자막은 비워 둡니다(지어내지 않음). 컷 밖에 놓인 말풍선은 후보에서 빼고 개수를 알립니다.
- 컷 수와 가중치: 길이별 상한(10초 6컷, 그 외 12컷)을 지키고, 상대 길이는 로컬 연출 규칙(10초는 쇼트폼 가중치)으로 정합니다. 컷 이미지에는 말풍선이 그려진 채 들어가므로 자막이 겹쳐 보이면 자막을 비우도록 화면이 안내합니다.
- 검증: 묶음은 만들 때와 읽을 때 같은 규칙으로 검사합니다(원격 URL·SVG·스크립트 이미지, 중복 ID, 범위를 벗어난 값 거절). Studio 쪽이 만든 묶음이 홍보 편집기에서 읽히고 `parsePromoProject`를 통과하는지 테스트합니다.

**target / 미구현**

- 이미지에서 컷을 자동으로 찾는 기능은 이 작업의 범위가 아닙니다(별도 작업). 문서에 프레임이 없는 페이지는 컷이 되지 않습니다.
- Studio에서 홍보 편집기로 한 번에 넘기는 기능(앱 간 핸드오프)은 없습니다. JSON 파일을 저장하고 불러옵니다.
- 오른쪽→왼쪽으로 읽는 만화의 컷 순서는 지원하지 않습니다. 미리보기의 앞으로·뒤로 버튼으로 바꿉니다. 직사각형이 아닌 컷 모양이나 회전된 프레임은 직사각형으로 잘라 냅니다.

### 3. 로케일별 자막·음성 일괄 출력

**current**

- 입력은 번역 초안이며 두 곳에서 읽습니다. ① **이 브라우저의 창작 생태계 작업대**(`/studio/ecosystem` 「번역 관리」): 대사 번역이 **원문 개정(`sourceRevision`)에 묶여** 있고 승인 여부를 가집니다. 원문을 고치면 개정이 올라가 기존 번역이 오래됨(stale)이 됩니다. 「이 브라우저의 창작 생태계 번역 불러오기」 버튼이 파일 없이 저장소(`localStorage`)에서 바로 읽고, 창작 생태계 쪽 검증(`normalizeCreatorEcosystemState`)을 거칩니다. ② **파일**: Studio 내보내기 「번역 초안 JSON」(문서 대사 번역 `dialogueI18n`과 검수 승인), 창작 생태계 제작 기록의 `translations`, 초안 배열, 작업대 기록 `{ version: 1, dialogue }`. 두 방식 모두 창작 생태계 `TranslationDraft`/`DialogueRecord`와 같은 모양이고, 저장된 기록을 읽기만 하며 바꾸지 않습니다.
- 판정 규칙은 창작 생태계와 같습니다(모든 조합에서 같은 결과임을 테스트로 확인): 번역 없음 → 번역한 시점의 원문이 지금 원문과 다르면 오래됨(stale) → 승인 전 초안 → 승인. 개정 번호가 양쪽에 있으면 `translationStatus`처럼 **개정 번호**로, 없으면 `translationState`처럼 **원문 글자**로 비교합니다.
- 컷 자막이 어느 원문 대사(문서 말풍선·작업대 대사)인지는 자막과 글자까지 같은 연속 대사로 찾습니다(공백 차이는 무시, 같은 문구가 여러 번 나오면 읽기 순서대로 짝짓기, 말풍선을 이은 자막은 연속 구간으로 풀기). 찾지 못하면 「원문과 연결 안 됨」으로 표시하고 한국어 원문 자막을 씁니다.
- 기본값은 **승인된 번역만** 쓰는 것입니다. 승인된 번역만으로 모든 자막이 채워지는 로케일이 기본 선택되고, 승인 전 초안·오래된 번역은 체크박스로 켤 때만 쓰며 경고가 남습니다. 번역이 없는 컷은 한국어 원문 자막을 쓰고 경고합니다.
- 출력은 ZIP 하나입니다: 로케일 폴더마다 `captions.srt`·`captions.vtt`·`project.json`, 그리고 `manifest.json`(컷 번호가 붙은 경고 목록, 시각 없음이라 같은 입력이면 같은 내용)과 `README.txt`. 제목과 마지막 2초 안내 문구는 로케일마다 입력하며 비우면 원문을 쓰고 안내합니다.
- 프로젝트 JSON은 `parsePromoProject`로 다시 검증해야만 담깁니다. 컷 이미지·BGM이 들어 있으니 공유 대상을 확인하세요. 한국어 내레이션 음원과 음성 스튜디오 대사는 이 로케일의 소리가 아니므로 뺍니다. 자막이 120자를 넘으면 JSON에서만 줄이고 SRT·VTT에는 전체가 들어갑니다.
- 글자 넘침은 기존 `studio-localization-overflow-gate`(축소 없이 `minFontScale: 1`)로 자막 영역(3줄)에 들어가는지 검사해 경고합니다. 자막 영역 값은 `promo-canvas.ts`와 같고, 테스트가 그 소스의 상수를 직접 읽어 어긋나면 실패합니다.
- 음성은 **미리듣기만** 합니다. 이 기기에 설치된(`localService`) 브라우저 음성이 그 로케일에 있을 때만 번역 자막을 한 컷씩 들려 주고, 없으면 이유를 안내합니다. 오디오 파일을 만들지 않고, 외부 TTS·클라우드 음성은 쓰지 않습니다. 한국어 발음 보정은 거치지 않고 문구를 그대로 읽습니다.
- 오래됨(stale) 판정의 범위: 판정에는 "지금 원문"이 필요합니다. 작업대 기록은 대사마다 현재 원문과 개정을 가지므로 항상 판정합니다. Studio 내보내기는 행(`rows`)에 **지금 원문**을, 초안에 **번역 시점의 원문 스냅샷**을 담으므로 번역한 뒤 원문을 고친 컷은 「오래됨」으로 나옵니다. 캔버스가 번역 언어를 보여 주는 채로 내보낸 컷은 자막이 번역문이 되어 「원문과 연결 안 됨」으로 나타나고(내보내기 화면이 미리 알립니다) 한국어 원문이 쓰입니다. 창작 생태계 제작 기록(`EcosystemRecord`)에는 `rows`가 없어 오래됨을 판정할 수 없고(승인 여부만 구분하며 화면이 알림), 낡은 번역이 조용히 쓰이지는 않습니다.

**target / 미구현**

- 로케일별 **오디오 일괄 렌더**와 외부 음성 합성은 하지 않습니다(범위 밖).
- Studio 문서에는 작업대의 `sourceRevision` 같은 원문 개정 번호가 없어, Studio 내보내기 파일은 원문 스냅샷 글자 비교로 오래됨을 판정합니다. 창작 생태계 작업대와 Studio 문서 대사를 하나의 번역 기록으로 합치는 일은 하지 않았습니다.
- 작업대의 대사 번역은 같은 브라우저 프로필에서만 읽습니다. 다른 기기·브라우저로 옮기려면 작업대 기록 파일(`{ version: 1, dialogue }`)로 만들어 불러와야 하는데, 작업대에 그 내보내기 버튼은 아직 없습니다.
- 기호뿐인 말풍선이 끼어 있는 이어 붙인 자막은 문서 대사와 이어지지 않을 수 있습니다(개별 말풍선 자막은 이어집니다).

### 검증 (2026-10-15)

저장소 루트에서 실행하는 읽기 전용 검증입니다(파일을 쓰지 않고 외부 네트워크·브라우저가 필요 없습니다).

```sh
pnpm exec vitest run apps/web/src/domains/creator/promo apps/web/src/domains/creator/export/studio-promo-cuts.test.ts apps/web/src/domains/creator/export/studio-promo-translations.test.ts apps/web/src/domains/creator/export/studio-promo-handoff.test.ts apps/web/src/domains/creator/export/StudioPromoHandoffSection.test.tsx
node tools/verify-studio-promo-recording.mjs
node tools/verify-studio-promo-preview.mjs
python3 tools/verify-studio-promo-output.py --self-test
node tools/verify-creator-workflow-upgrades.mjs
```

- 단위·컴포넌트 테스트: 하위 호환(15/30/60 고정 JSON, IndexedDB 저장 초안, 잘못된 길이 거절), 10초 타임라인·엔딩 2초·최소 컷 길이, 키트 이식성, 업로드 분할의 컷 수 상한, 문서 컷 초안 규칙·UI 상태(처음/읽는 중/준비/오류/빈 묶음/상한/적용/취소), 번역 초안 읽기·원문 개정 판정 일치, 로케일 치환·경고·ZIP 결정성, 음성 선택·미리듣기, Studio 쪽 컷 나열·캡처 영역 계산·묶음 생성·번역 초안 파일·섹션 UI와 내보내기 잠금 공유를 다룹니다.
- 화면 문구: 홍보 편집기 쪽 새 문구는 이 폴더의 이웃 파일처럼 인라인 한/영 쌍(`useBilingual`)을 쓰고, Studio 내보내기 섹션은 이웃 파일처럼 한국어 문구를 씁니다. 영어 화면에서 Studio 내보내기 섹션 문구가 한국어로 보일 수 있습니다(i18n 키 등록은 하지 않았습니다).
- 브라우저(Playwright)·실제 인코딩 검증은 이 작업에서 실행하지 않았습니다. 화면의 시각 확인(밝은/어두운 테마, 모바일·데스크톱)은 별도 UI/UX 단계에서 합니다. 위 목록은 로컬 단위 검증이며 CI 결과와 운영 배포 상태는 따로 확인해야 합니다.
