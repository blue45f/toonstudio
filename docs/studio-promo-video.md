# Webtoon promo motion studio

Entry: `/create/promo`, lazy-loaded independently from the drawing editor. The Studio AI production launchpad opens it in a new tab to preserve unsaved drawing work.

## Available workflow
Upload up to 12 PNG/JPEG/WebP panels (6 for a 10-second trailer), write descriptions, choose 10/15/30/60 seconds and 9:16/16:9/1:1. Edit captions, motion, fit, timing weights and order. The selected duration includes the final two-second CTA. Each cut receives at least half a second. Four local style templates remain available without AI.

AI planning reuses `completeStudioServerText` with the existing authenticated, quota-controlled `composition` task and a unique idempotency key. Only text is sent; media never enters the AI prompt. Responses are allowlist-validated, cannot change media, and must include each existing panel ID exactly once. Malformed responses do not overwrite the project. External AI generation was not invoked as part of the automated fixtures.

## Outputs
- Browser canvas + MediaRecorder: actual supported WebM/MP4 MIME, 720/1080 short side, real-time recording. Keep the tab visible. Cancellation, visibility loss and errors stop tracks and close the audio context.
- Remotion ZIP: embedded local assets extracted to public/, shared deterministic frame renderer, Composition, SRT, project.json and pinned matching Remotion CLI/runtime versions. Extract, `npm install`, then `npm run render` for H.264 MP4. No hosted rendering infrastructure is provisioned.
- SRT and complete JSON project save/restore. Work remains in tab memory; save JSON before leaving.

This is animated still-panel motion comics, not generative character acting, lip sync, voice cloning or newly synthesized video frames. BGM is supplied by the user, looped and faded; it is not AI-generated. Confirm artwork/audio rights and applicable Remotion licensing before use. No paid license or cloud resource is purchased automatically.

## Limits and validation
Raster uploads: 10MB each, normalized to a maximum 2048px edge. Project JSON: 80MB. Audio: 20MB upload, maximum three-minute decoded audio for browser recording. Only embedded base64 raster/audio sources are accepted on import; remote URLs and SVG are rejected. Image decode is sequential and pixel-budgeted.

## Verification
`pnpm exec vitest run src/domains/creator/promo/promo-model.test.ts`

`PLAYWRIGHT_CHANNEL='' pnpm exec playwright test e2e/studio-promo.spec.ts --project=chromium`

The scoped Studio promo video quality workflow runs contract tests, lint, the production component in the browser harness, real native recording/downloads, JSON restoration, invalid-AI recovery and cancel behavior. It then extracts the actual browser-exported ZIP and renders an H.264 MP4, asserting 450 frames / 30fps / 15s and an audio stream. Desktop/mobile screenshots and render evidence are uploaded. AI HTTP responses are fixtures; this is not a paid-provider availability test. Existing core/verify release gates are not changed or bypassed. A workflow's presence is not proof it has passed; consult the PR's exact-head results.

## 숏폼 확장 (2026-10-15)
- 영상 길이는 10/15/30/60초입니다. 10초 영상은 컷을 6개까지 담고, 15/30/60초는 12개까지입니다. 마지막 2초 안내 카드는 길이에 포함됩니다.
- Studio 내보내기 메뉴의 「홍보 쇼츠용 컷 묶음」을 불러와 문서의 컷을 샷 초안으로 만들 수 있습니다(확인·수정 후 적용). 이 브라우저의 창작 생태계 작업대(`/studio/ecosystem`)에 저장된 대사 번역(원문 개정에 묶인 번역·승인·오래됨 판정)이나 번역 초안 JSON으로 로케일별 SRT·WebVTT·프로젝트 JSON을 ZIP 하나로 저장할 수 있습니다. 음성은 이 기기의 브라우저 음성으로 미리듣기만 합니다.
- 규칙, 현재 구현과 미구현 범위는 [Comic video director](features/comic-video-director.md)의 「숏폼 확장」을 보세요.
