# ToonStudio Remotion 브랜드 영상

- 상태: **결정적 media authoring project**
- 최종 갱신: **2026-10-08**

저장소의 오리지널 artwork로 만드는 무음 24초 브랜드 영상이다. 6초 chapter 4개로 구성하며 live editor
화면 녹화가 아니라 설명용 연출이다.

## 재현

Node 24와 한국어 system font(Ubuntu의 `fonts-noto-cjk`)를 준비한다.

```sh
npm --prefix tools/media/brand-film ci
npm --prefix tools/media/brand-film run typecheck
npm --prefix tools/media/brand-film run render -- all
```

첫 render에서 Remotion이 Chrome Headless Shell을 받을 수 있다. `all` 대신 `landscape`, `portrait`,
`square`, `header`를 선택할 수 있다.

출력은 `apps/web/public/brand`에 생성한다.

- H.264 MP4: 1280×720, 720×1280, 1080×1080
- route header용 1920×768 고품질 MP4
- poster JPG, 1200×630 sharing PNG
- KO/EN VTT
- SHA-256 manifest

선택 format 실행은 해당 rendition과 poster/sharing artwork를 교체한다. 선택하지 않은 rendition entry는
기존 생성 파일을 계속 설명한다.

```sh
npm --prefix tools/media/brand-film run studio
```

Remotion editing preview를 연다. system font는 build dependency이며 font file을 repository 산출물로
공유하지 않는다.

## 웹사이트와의 관계

Remotion은 두 가지 방식으로 쓰이며 하나로 말하지 않는다.

- **사전 렌더 산출물**: 24초 브랜드 필름(`/brand-film`)은 이 package가 렌더한 MP4·poster·VTT를
  `apps/web/public/brand`에서 그대로 서빙한다. Website는 이 package(`tools/media/brand-film`)를 import하지 않는다.
  기술 영상(`render:technology`)도 같은 package의 수동 검토 산출물이며 파이프라인이 게시하지 않는다.
- **브라우저 실시간 합성**: 8분 24초 제품 투어(`/product-tour`)는 웹앱이 `remotion`·`@remotion/player`와
  공유 composition `@toonstudio/product-tour-film`(`packages/product-tour-film`)을 직접 import해 `<Player>`로
  합성한다. 같은 composition을 이 package의 `render:product-tour`가 MP4로도 렌더하고, 웹앱은 그 MP4를
  "호환 재생"(`?player=mp4`)으로 제공한다.

따라서 "웹사이트는 Remotion을 쓰지 않는다"가 아니라 "웹사이트는 제품 투어 재생기에만 Remotion runtime을 쓰고,
이 authoring package는 import하지 않는다"가 정확하다.

## 권리와 검토

Remotion은 개인·소규모 팀·대규모 조직에 서로 다른 license 조건이 있다. 운영 조직은 공식 licensing
문서를 직접 검토해야 하며 이 저장소는 유료 license 보유나 보편적 무료 상업 사용을 주장하지 않는다.
Scene SVG는 자체 제작한 설명 artwork이며 stock photo, music, 외부 사용자 작품 권리를 포함하지 않는다.

release 전에 각 rendition의 한국어 가독성과 layout을 시각 검토한다. CI는 duration, dimension, codec,
hash, playback, responsive homepage 동작을 검사하지만 사람이 하는 최종 시각 검토를 대체하지 않는다.
