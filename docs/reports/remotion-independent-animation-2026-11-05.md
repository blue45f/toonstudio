# Remotion 사용면과 독립 영상 수학 전환

상태: **SUPERSEDED / history — 독립 수학 전환은 2026-11-05에 되돌렸다.**
기준 HEAD: `8d315c85d6fde4a3a30255612c756d3e299a95b0`, 2026-11-05.

## 현재 결정 — Remotion 유지

2026-11-05 사용자 지시와 공식 버전별 라이선스 확인에 따라, 1인 개인의 자격 있는 상용 사용은
Remotion을 유지한다. 설치된 4.0.536 LICENSE와 4.0.514의 공식 LICENSE는 개인 및 직원 3명 이하
영리 조직에 무료 자격을 부여하고, 허용된 영상·이미지 제작의 상용 이용도 허용한다.
향후 버전 5의 예고 조건을 현재 4.x에 무조건 적용하지 않는다. 개인/조직 규모·자동화에 관한
최신 FAQ와 정확한 설치 버전 조건은 함께 확인하되, 모든 사용자·법인의 자격을 일반화하지 않는다.

기존 Remotion 전체 API의 기능 범위가 더 넓고, 자체 수학 구현의 성능 우위는 측정하지 않았으며
일부 spring 옵션만 다루는 구현을 별도로 유지할 이점이 입증되지 않았다. 따라서 불필요한 대체를
되돌렸다. 아래 내용은 되돌리기 전 조사·검증의 역사 기록이며 현재 구현 상태 설명이 아니다.

- 기존 파일 6개를 현재 HEAD 내용과 byte-for-byte 일치하도록 복구했다.
- 새 수학 구현·테스트·baseline 3개만 제거했다. 새 core/runtime/barrier는 생성하지 않았다.
- root manifest·lockfile·모델·vips·Mixbox는 이 복구에서 수정하지 않았다.
- 복구 전 정확한 파일 10개와 patch·해시 보존본: `/tmp/toonstudio-remotion-math-preserve-20261105/`.
- 보존 `sha256.json` SHA-256: `df2af7b6af6fd7a62a0573b345f98993ef5d2dfed3e5fb4c3daba9d6f7377e78`.
- 보존 `tracked.patch` SHA-256: `2158944bec88af0354dffcf75965a48f8e6f64790b505e9774fc83accb53fd26`.

공식 근거: [4.0.536 LICENSE](https://github.com/remotion-dev/remotion/blob/v4.0.536/LICENSE.md),
[4.0.514 LICENSE](https://github.com/remotion-dev/remotion/blob/v4.0.514/LICENSE.md),
[현재 FAQ](https://www.remotion.dev/docs/license/faq).

## 복구 검증

- 복구 직전 동일 focused suite: 3 files, **33 tests 통과** (수학 전용 6 tests 포함).
- 복구 후 남은 ProductTourRemotionComposition·ProductTourPage suite: **2 files, 26 tests 통과**.
  삭제된 수학 6 tests와 전환 전용 1 test는 복구 후 suite에 존재하지 않는다.
- 공유 ProductTourFilm·브랜드·기술 도구의 focused strict TypeScript: **통과**.
- 기존 6개 파일의 SHA-256은 모두 현재 HEAD의 해당 파일과 일치한다. 상세 결과는 보존본의
  `post-revert-verification.json`에 기록했다.
- `apps`, `packages`, `tools`의 TS/TSX/JSON을 검색해 활성 `filmInterpolate`,
  `filmEntranceSpring`, `product-tour-film/animation`, `film-animation` 참조가 없음을 확인했다.
- 보고서 Secretlint·하네스 구조 검사·`git diff --check`: **통과**.

## 이하: 되돌리기 전 기록


## 현재 배포·실행 경로

웹 runtime 및 공유 composition의 `remotion`, `@remotion/player`는 4.0.536이다.
반면 별도 npm 도구인 `tools/media/brand-film/package.json`과 package-lock은
`remotion`, `@remotion/cli` 4.0.514를 고정한다. 이 도구는 루트 workspace importer로
설치되는 앱이 아니므로 루트 production inventory만으로 authoring 의존성이 완전히 감사되지 않는다.
생성 promo ZIP의 Remotion 버전은 `promo-remotion.ts`의 상수로 별도 관리한다.

| 실제 소비자 | 사용 API / 관찰 동작 | 현재 대체 여부 |
| --- | --- | --- |
| `apps/web/src/domains/marketing/ProductTourPlayer.tsx` | Player/PlayerRef: frame clock, play/pause/toggle/seekTo, volume/mute, fullscreen, play/pause/ended/waiting/resume/timeupdate/mutechange/volumechange/error 이벤트, 오류 경계와 MP4 fallback | 미완료 |
| `ProductTourRemotionComposition.tsx` | AbsoluteFill, Html5Audio, useBufferState, useCurrentFrame, useVideoConfig. narration+BGM, Blob audio readiness, buffer delay/unblock, 시간별 gain, 음소거·오류 전달 | 미완료 |
| `product-tour-remotion-timeline.ts` | piecewise linear interpolation으로 narration attack/release gain 계산, 겹친 cue의 최소 gain | **독립 구현 전환 완료** |
| `packages/product-tour-film/src/ProductTourFilm.tsx` | frame/config, AbsoluteFill, Img/staticFile 및 구간별 interpolation·entrance spring. 장면/챕터·타이틀·여러 이미지·진행률 | **수학만 독립 전환 완료**, rendering/context/image 미완료 |
| `tools/media/brand-film/src/ToonStudioFilm.tsx` | AbsoluteFill, Img, staticFile, frame/config, 독립 보간·spring | **수학 전환 완료**, 나머지 미완료 |
| `tools/media/brand-film/src/ToonStudioRouteHeaderFilm.tsx` | AbsoluteFill, Img, staticFile, frame | 미완료 |
| `tools/media/brand-film/src/TechnologyStoryFilm.tsx` | AbsoluteFill, frame/config, 독립 보간·spring | **수학 전환 완료**, 나머지 미완료 |
| `tools/media/brand-film/src/index.tsx` | Composition/registerRoot로 9개 composition·dimension·fps·duration 등록 | 미완료 |
| `tools/media/brand-film/render*.mjs`, `package.json` | remotion CLI render/still/studio, H.264 CRF 및 pixel format, public-dir, frame 선택, concurrency, 오디오 후처리 | 미완료 |
| `apps/web/src/domains/creator/promo/promo-remotion.ts` | 생성 ZIP의 CLI dependency, Composition/registerRoot, AbsoluteFill/Sequence, Html5Audio, frame/config, delayRender/continueRender/cancelRender. 캔버스 image readiness, BGM loop/duck, 일정 내 voiceover | 미완료 |

`domains/legal/technology`의 import 문자열은 기술 설명 예제이며 추가 runtime call site가 아니다.
`ProductTourPage.test.tsx` 등은 기존 Remotion 사용 경로를 의도적으로 확인하는 테스트라 삭제하지 않았다.
기존 MP4 fallback만 남기면 실시간 composition·독립 audio mix·generated render kit를 잃으므로 동등 대체가 아니다.

## 이번 독립 구현과 실제 전환

새 `packages/product-tour-film/src/film-animation.ts`는 Remotion 구현 소스를 읽거나 복사하지 않고
공개 선형 보간식과 감쇠 조화 진동자의 해석식으로 작성했다. 새 package export는
`@toonstudio/product-tour-film/animation`이며 의존성 변경은 없다.

- `filmInterpolate`: 유한한 strictly-increasing input knots, 길이가 같은 output knots,
  구간별 선형 보간, clamp/extend 양끝 정책. 현재 call site가 사용하는 기능만 제공한다.
- `filmEntranceSpring`: 초기 위치 0·속도 0, 목표 1인 entrance. 기존 영화의 관찰된 출력에
  맞춰 임계 감쇠 초과 damping을 임계 감쇠로 제한한다. 이 동작은 일반적인 over-damped
  oscillator 전체 해와는 구별되며 기존 사용면 보존을 위한 명시적 정책이다.
- 웹 BGM timeline의 interpolation import와 공유 ProductTourFilm의 interpolation/spring import를
  독립 구현으로 교체했다. ToonStudioFilm·TechnologyStoryFilm의 같은 수학 사용면도 전환했다.
  나머지 Remotion hooks·image readiness·Player는 그대로 보존했다.

관찰 기준 fixture는 전환 직전 공개 API 실행에서 얻었다. 원본 소스의 복제가 아니다.
`film-animation-baseline.json`은 HEAD, fps, 범위 및 출력 digest를 기록한다.
9자리 소수로 고정한 비교이므로 이 검증은 bit-for-bit Float64 동일성이나 화면의 모든 픽셀 동일성 주장이 아니다.

## 검증

- `node node_modules/vitest/vitest.mjs run packages/product-tour-film/src/film-animation.test.ts apps/web/src/domains/marketing/ProductTourRemotionComposition.test.ts apps/web/src/domains/marketing/ProductTourPage.test.tsx`: **33 tests 통과**.
- 558초·30fps 전체 **16,741 frame**의 BGM gain과 한·영 자막 결과 digest 보존.
- 실제 영화에서 쓰는 spring 설정 3종, 각 **301 frame**의 결과 digest 보존.
- clamp/extend 경계·중간 knot·오류 입력·초기 frame·fps 변환 검증.
- `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2020 --module ESNext --moduleResolution Bundler --jsx react-jsx --esModuleInterop packages/product-tour-film/src/film-animation.ts packages/product-tour-film/src/ProductTourFilm.tsx`: **통과**.
- 위 focused tsc 명령에 `--resolveJsonModule`을 추가해 `tools/media/brand-film/src/{ToonStudioFilm,TechnologyStoryFilm}.tsx`도 **통과**.
- 변경 TS/TSX 7개 ESLint, 변경 파일 Secretlint, `git diff --check`: **통과**.
- 전체 tsc/build/harness: 부모 에이전트가 cgroup 메모리 한도에 맞춰 순차 수행한다. 이 작업에서 중복 실행하지 않았다.

## 전체 제거까지 남은 완료 조건

1. frame/config context, image/font readiness, render barrier·실패 전달을 제공하는 독립 composition runtime.
2. 영상 clock과 두 audio element를 동기화하는 Player, buffering·seek·mute·volume·fullscreen·a11y·fallback 동등성 검증.
3. explicit frame 설정→readiness 대기→capture/encode를 수행하는 offline render/still CLI와 preview UI.
   이때 Chromium/FFmpeg 및 codec의 별도 배포 라이선스까지 확인해야 한다.
4. 생성 promo ZIP을 포함한 모든 소비자 전환, 실제 이미지/오디오를 사용한 재생·seek·buffer·최종 영상 검증.
5. 그 후 runtime/authoring/generated kit dependency 제거, lock 재생성, bundle·ZIP 잔재 확인.

Remotion은 자격 조건에 따른 계약 라이선스이며 보편적 상용 금지가 아니다. 이 변경으로 그 계약 요건이
해소됐다고 주장하지 않는다. dependency·lockfile 제거, commit·push·PR·배포는 하지 않았다. Mixbox는 수정하지 않았다.

공개 동작 문서: [interpolate](https://www.remotion.dev/docs/interpolate),
[spring](https://www.remotion.dev/docs/spring), [Sequence](https://www.remotion.dev/docs/sequence),
[Img readiness](https://www.remotion.dev/docs/img).
