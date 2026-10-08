import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · web-platform · WebCodecs 한 장(프레임 정확한 영상 인코딩). 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 한 파일이 1,000줄을 넘지 않도록 engineering-atlas-web-platform-runtime.ts 에서 나눴고, 그쪽에서 이 배열을 이어 붙인다.
 */

export const ENGINEERING_ATLAS_WEB_PLATFORM_CODECS: readonly EngineeringAtlasEntry[] = [
  {
    id: "webcodecs-selected-pipeline",
    category: "web-platform",
    name: "WebCodecs",
    title: t("프레임 정확한 영상 인코딩, 코덱은 직접 물어서", "Frame-exact video encoding, asking the browser for the codec"),
    status: "live",
    tagline: t(
      "프레임을 인코더에 직접 넘겨 재생 시간만큼 기다리지 않고 같은 결과를 만듭니다.",
      "Frames go straight to the encoder, so export neither waits for playback time nor varies.",
    ),
    background: [
      t(
        "영상을 내보내는 기존 방법은 화면을 실시간으로 녹화하는 것(MediaRecorder)이었습니다. 코드 주석이 지적한 문제는 두 가지입니다. 60초 영상이면 내보내기도 60초가 걸렸고, 느린 기기에서는 프레임이 빠져 같은 문서인데도 매번 다른 파일이 나왔습니다. WebCodecs 는 브라우저의 영상 인코더에 프레임과 시각을 직접 넘기는 도구라서, 재생 시간만큼 기다리지 않고 장치가 허락하는 속도로 같은 결과를 만들 수 있습니다.",
        "The older way to export video was to record the screen in real time (MediaRecorder). A code comment names two problems: a 60-second video took 60 seconds to export, and on slow devices frames dropped, so the same document gave a different file each time. WebCodecs hands frames and timestamps directly to the browser's video encoder, so export need not wait for playback time and can give the same result at the speed the device allows.",
      ),
      t(
        "동작은 이렇습니다. 내보내기 전에 VideoEncoder.isConfigSupported() 로 이 해상도·fps 로 이 코덱을 지금 인코딩할 수 있는지 브라우저에 직접 묻습니다(MIME 문자열 추측보다 정확하다고 코드가 설명합니다). 하드웨어 가속이 되는 코덱을 먼저 찾고, 소프트웨어뿐이면 VP9 → VP8 → AV1 순입니다. 프레임 시각은 벽시계가 아니라 순수 계산으로 정하고, 인코더가 내놓은 조각은 직접 만든 WebM·MP4 포장기(muxer)로 감쌉니다.",
        "It works like this. Before exporting, VideoEncoder.isConfigSupported() asks the browser directly whether this codec can be encoded now at this resolution and fps (the code explains this beats guessing from MIME strings). Codecs with hardware acceleration are tried first, and if everything is software the order is VP9, VP8, AV1. Frame times come from pure calculation, not a wall clock, and the chunks the encoder emits are wrapped by in-house WebM and MP4 muxers.",
      ),
      t(
        "'선택 고정'이 이 설계의 원칙입니다. 모션 웹툰 내보내기는 포맷을 시작 전에 계획으로 한 번 정하고, 폴백이 걸리면 이유를 사용자에게 문장으로 보여 줍니다(예: H.264 인코더가 없어 WebM 으로 대신 만들어요). MP4 는 H.264 가 필요한데 WebM 컨테이너에는 H.264 를 넣을 수 없어 별도 포장기를 만들었고, 마지막 수단인 GIF 는 어디서나 만들 수 있습니다.",
        "Fixing the choice is the principle. Motion-webtoon export decides the format once, as a plan, before starting, and when a fallback applies it tells the user why in plain words (for example, no H.264 encoder, so WebM is used instead). MP4 needs H.264, which cannot go into a WebM container, so a separate muxer was written; GIF, the last resort, works everywhere.",
      ),
      t(
        "한계: prefer-hardware 설정이 수락됐다는 것은 하드웨어를 실제로 쓴다는 영수증이 아닙니다. 코덱 지원은 브라우저마다 달라 코드 주석은 Safari 를 H.264 만 인코딩하는 환경으로 다룹니다(최신 현황은 MDN 에서 확인). 더 엄격한 '자동 전환 없음' 계약(studio-webcodecs-plan)은 구현과 테스트만 있고 호출처가 없으며, 타임랩스 등 다른 영상 내보내기는 아직 MediaRecorder 를 씁니다.",
        "Limits: an accepted prefer-hardware setting is not a receipt that hardware is really used. Codec support differs by browser, and a code comment treats Safari as an environment that encodes only H.264 (check MDN for the latest). The stricter no-automatic-switch contract (studio-webcodecs-plan) has code and tests but no caller, and other video exports such as the timelapse still use MediaRecorder.",
      ),
    ],
    keyPoints: [
      t("프레임을 직접 넘겨 재생 시간만큼 기다리지 않는다", "Frames go straight in; no waiting for playback"),
      t("코덱 지원은 isConfigSupported 로 직접 묻는다", "Ask isConfigSupported instead of guessing"),
      t("포맷은 시작 전 계획으로 고정, 폴백은 사유와 함께", "Format fixed up front; fallbacks come with a reason"),
      t("WebM·MP4 포장기는 순수 TypeScript 로 직접 구현", "WebM and MP4 muxers are in-house TypeScript"),
    ],
    diagram: {
      id: "webcodecs-selected-pipeline-diagram",
      kind: "graph",
      title: t("영상 내보내기 파이프라인", "The video export pipeline"),
      caption: t(
        "계획을 먼저 고정하고, 프레임은 인코더에 직접 넣고, 포장은 직접 만든 코드가 합니다.",
        "Fix the plan first, feed frames straight to the encoder, and wrap them with in-house code.",
      ),
      alt: t(
        "회차의 프레임 계획을 순수 계산으로 만들고, 브라우저에 코덱 지원을 직접 물은 뒤 내보낼 포맷을 하나로 고정합니다. 이후 VideoEncoder 가 프레임을 인코딩하고 순수 TypeScript 포장기가 WebM 이나 MP4 로 감싸 영상 파일이 됩니다. 코덱이 없으면 GIF 인코더가 마지막 수단입니다.",
        "A frame plan for the episode is computed purely, the browser is asked directly which codecs it supports, and one export format is fixed. VideoEncoder then encodes the frames and an in-house TypeScript muxer wraps them as WebM or MP4 into a video file. Without a usable codec, the GIF encoder is the last resort.",
      ),
      nodes: [
        {
          id: "plan",
          label: t("프레임 계획", "Frame plan"),
          sub: t("순수 계산, 벽시계 없음", "pure math, no wall clock"),
          tone: "local",
          shape: "pill",
          at: [0, 0],
        },
        {
          id: "ask",
          label: t("코덱 직접 묻기", "Ask the browser"),
          sub: t("isConfigSupported", "isConfigSupported"),
          tone: "local",
          at: [1, 0],
        },
        {
          id: "fix",
          label: t("포맷 계획 고정", "Fix the format"),
          sub: t("MP4 → WebM → GIF", "MP4, WebM, then GIF"),
          tone: "warn",
          at: [2, 0],
        },
        {
          id: "enc",
          label: t("VideoEncoder", "VideoEncoder"),
          sub: t("장치가 허락하는 속도", "as fast as the device allows"),
          tone: "local",
          at: [3, 0],
        },
        {
          id: "mux",
          label: t("순수 TS 포장기", "In-house muxer"),
          sub: t("WebM · MP4", "WebM and MP4"),
          tone: "local",
          at: [4, 0],
        },
        { id: "file", label: t("영상 파일", "Video file"), tone: "good", shape: "pill", at: [5, 0] },
        {
          id: "gif",
          label: t("GIF 인코더", "GIF encoder"),
          sub: t("코덱이 없을 때 마지막 수단", "last resort without a codec"),
          tone: "warn",
          at: [2, 1],
        },
      ],
      edges: [
        { from: "plan", to: "ask" },
        { from: "ask", to: "fix" },
        { from: "fix", to: "enc" },
        { from: "enc", to: "mux" },
        { from: "mux", to: "file" },
        { from: "fix", to: "gif", label: t("코덱 없음", "no codec"), style: "dashed" },
        { from: "gif", to: "file", style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("모션 웹툰 내보내기 (MP4 · WebM · GIF)", "Motion-webtoon export (MP4, WebM, GIF)"),
        role: t(
          "회차를 프레임으로 다시 그려 VideoEncoder 로 인코딩하고, 형식 폴백은 시작 전에 계획으로 정해 사유와 함께 보여 줍니다.",
          "Redraws the episode as frames and encodes them with VideoEncoder; any format fallback is planned before the start and shown with its reason.",
        ),
        paths: [
          "apps/web/src/domains/creator/motion-webtoon/motion-webtoon-export.ts",
          "apps/web/src/domains/creator/export/studio-webcodecs-video-export.ts",
          "apps/web/src/domains/creator/export/studio-webcodecs-mp4-export.ts",
          "apps/web/src/domains/creator/motion-webtoon/MotionWebtoonExportPanel.tsx",
        ],
        route: "/studio/motion-webtoon",
      },
      {
        feature: t("순수 TypeScript 포장기", "In-house TypeScript muxers"),
        role: t(
          "WebM(EBML)과 MP4(ISO-BMFF) 컨테이너를 외부 라이브러리 없이 조립하며, 같은 입력이면 같은 바이트가 나옵니다.",
          "Assembles WebM (EBML) and MP4 (ISO-BMFF) containers without outside libraries, and the same input yields the same bytes.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-webcodecs-webm.ts",
          "apps/web/src/domains/creator/studio-webcodecs-mp4.ts",
          "apps/web/src/domains/creator/studio-webcodecs-timeline.ts",
        ],
      },
      {
        feature: t("애니메이션 이미지 가져오기 (GIF·APNG·WebP·AVIF)", "Importing animated images (GIF, APNG, WebP, AVIF)"),
        role: t(
          "ImageDecoder 가 있으면 프레임별로 풀어 편집 가능한 프레임 애니메이션(최대 60장)으로 가져오고, 없으면 기존 이미지 가져오기로 물러납니다.",
          "With ImageDecoder, animated images are decoded frame by frame into an editable frame animation (up to 60 frames); without it the older import path is used.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-webcodecs-image-decode.ts",
          "apps/web/src/domains/creator/canvas/studio-canvas-image-io.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("지원되는 인코더 설정을 직접 묻기", "Asking which encoder config is supported"),
        language: "ts",
        ...sampleSource([
          ["export async function pickEncoderConfig(width: number, height: number, framerate: number) {"],
          ['  if (typeof VideoEncoder === "undefined") return null;', "미지원이면 호출부가 미리 고른 다른 경로를 쓴다", "unsupported: the caller uses a route chosen beforehand"],
          ['  for (const codec of ["vp09.00.40.08", "vp8", "av01.0.08M.08"]) {'],
          ["    const config: VideoEncoderConfig = {"],
          ['      codec, width, height, framerate, bitrate: 4_000_000, hardwareAcceleration: "prefer-hardware",'],
          ["    };"],
          ["    const { supported } = await VideoEncoder.isConfigSupported(config);"],
          ["    if (supported) return config;", "MIME 문자열 추측 대신 브라우저에 직접 묻는다", "ask the browser instead of guessing from MIME strings"],
          ["  }"],
          ["  return null;"],
          ["}"],
        ]),
        explain: t(
          "코덱 문자열의 수준(level) 계산, 하드웨어/소프트웨어 순위, 비트레이트 권장값은 실제 코드(studio-webcodecs-capability.ts)가 맡습니다. 여기서는 isConfigSupported 로 묻는 핵심만 남겼습니다.",
          "Codec level calculation, hardware and software ranking and bitrate advice live in the real code (studio-webcodecs-capability.ts). This keeps only the core idea of asking with isConfigSupported.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("시작 전에 포맷을 한 번 정하는 순수 함수", "A pure function that fixes the format before starting"),
        language: "ts",
        ...sampleSource([
          ['export type Format = "mp4" | "webm" | "gif";'],
          ["export interface Caps { avc: boolean; vp: boolean }"],
          [""],
          ["export function planExport(requested: Format, caps: Caps) {"],
          ["  const pick = (format: Format, reason: string) => ({ format, fellBack: format !== requested, reason });"],
          ['  if (requested === "gif") return pick("gif", "gif-everywhere");'],
          ['  const first = requested === "mp4" ? caps.avc : caps.vp;'],
          ['  if (first) return pick(requested, "as-requested");'],
          ['  const second = requested === "mp4" ? caps.vp : caps.avc;'],
          ['  if (second) return pick(requested === "mp4" ? "webm" : "mp4", "other-video-format");', "요청한 코덱이 없으면 다른 영상 형식", "no requested codec: the other video format"],
          ['  return pick("gif", "gif-last-resort");', "마지막 수단은 어디서나 되는 GIF", "last resort is GIF, which works everywhere"],
          ["}"],
        ]),
        explain: t(
          "입력(요청 형식, 탐지 결과)이 같으면 항상 같은 계획이 나오는 순수 함수이고, reason 값이 사용자에게 보여 줄 문장의 열쇠가 됩니다. 실제 resolveMotionExportPlan 은 사유를 한국어·영어 문장으로 함께 돌려줍니다.",
          "A pure function: the same input (requested format, detected capabilities) always gives the same plan, and the reason value keys the sentence shown to the user. The real resolveMotionExportPlan returns the reason as Korean and English sentences.",
        ),
        source: "apps/web/src/domains/creator/motion-webtoon/motion-webtoon-export.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · WebCodecs API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API",
        kind: "docs",
        note: t("개념과 브라우저 호환성 표", "Concepts and the browser compatibility table"),
      },
      {
        title: "W3C · WebCodecs",
        url: "https://www.w3.org/TR/webcodecs/",
        kind: "spec",
      },
      {
        title: "MDN · VideoEncoder.isConfigSupported()",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static",
        kind: "docs",
      },
      {
        title: "MDN · ImageDecoder",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder",
        kind: "docs",
        note: t("애니메이션 이미지를 프레임으로 푸는 API", "The API that decodes animated images into frames"),
      },
      {
        title: "MDN · MediaRecorder",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder",
        kind: "docs",
        note: t("실시간 녹화 방식의 비교 대상", "The real-time recording approach for comparison"),
      },
    ],
    chapterIds: ["browser-local-compute", "performance"],
    talk: {
      pitch: t(
        "영상을 내보낼 때 화면을 실시간으로 녹화하지 않고, 프레임을 하나씩 브라우저의 인코더에 직접 넘깁니다. 60초 영상을 60초 걸려 녹화하던 방식과 달리 장치가 허락하는 속도로, 같은 문서면 같은 결과를 만듭니다. 어떤 코덱이 되는지는 추측하지 않고 브라우저에 직접 묻고, 안 되면 시작 전에 정한 순서대로 다른 형식으로 안내합니다.",
        "When exporting video, it does not record the screen in real time; it feeds frames one by one straight to the browser's encoder. Unlike the old way of taking 60 seconds to record a 60-second video, it runs as fast as the device allows and the same document gives the same result. It asks the browser which codecs work instead of guessing, and if one does not, it follows an order fixed before starting and explains the switch.",
      ),
      analogy: t(
        "공연을 보면서 손으로 받아 적는 것(실시간 녹화)과, 대본을 인쇄소에 넘겨 바로 책으로 찍는 것(프레임을 인코더에 직접 전달)의 차이입니다.",
        "It is the difference between copying a performance by hand as it plays (real-time recording) and sending the script to a print shop to be bound at once (frames to the encoder).",
      ),
      questions: [
        {
          question: t("모든 브라우저에서 MP4 가 되나요?", "Does MP4 work in every browser?"),
          answer: t(
            "아닙니다. H.264 인코더가 없으면 WebM, 그것도 없으면 GIF 로 대신 만들고 그 이유를 화면에 보여 줍니다. 지원 현황은 MDN 호환성 표로 확인하세요.",
            "No. Without an H.264 encoder it makes WebM, and without that GIF, and it shows the reason on screen. Check the MDN compatibility table for support.",
          ),
        },
        {
          question: t("왜 포장기를 직접 만들었나요?", "Why write the muxers in-house?"),
          answer: t(
            "인코더는 조각(chunk)만 내놓고 파일로 묶는 일은 따로 해야 합니다. 직접 만든 포장기는 같은 입력이면 같은 바이트를 내고 외부 의존이 없어 바이트 단위로 테스트할 수 있습니다.",
            "The encoder only emits chunks; wrapping them into a file is a separate job. In-house muxers give the same bytes for the same input, have no outside dependency, and can be tested byte by byte.",
          ),
        },
        {
          question: t("하드웨어 가속을 쓰나요?", "Does it use hardware acceleration?"),
          answer: t(
            "가능한 코덱에서는 prefer-hardware 를 먼저 시도합니다. 다만 그 설정이 수락됐다는 것이지 하드웨어를 실제로 썼다는 보증은 아닙니다.",
            "Where possible it tries prefer-hardware first, but acceptance of that setting is not a guarantee that hardware was actually used.",
          ),
        },
      ],
      pitfall: t(
        "'모든 영상 내보내기가 WebCodecs'는 사실이 아닙니다. 모션 웹툰 내보내기가 WebCodecs 를 쓰고, 타임랩스 등은 아직 MediaRecorder 입니다. 더 엄격한 '자동 전환 없음' 계약(studio-webcodecs-plan)은 호출처가 없습니다. 이 카드는 실제 브라우저에서 인코딩 속도를 측정하지 않았습니다.",
        "It is not true that every video export uses WebCodecs: motion-webtoon export does, while the timelapse and others still use MediaRecorder. The stricter no-automatic-switch contract (studio-webcodecs-plan) has no caller. No encoding speed was measured in a real browser for this card.",
      ),
    },
    technologies: ["WebCodecs", "VideoEncoder", "ImageDecoder", "MediaRecorder", "WebM", "MP4"],
    facts: [
      {
        value: "avc1.640033 → 42001f",
        label: t("MP4(H.264) 후보를 높은 수준부터 시험하는 순서", "Order in which MP4 (H.264) candidates are tried, highest level first"),
        source: "apps/web/src/domains/creator/export/studio-webcodecs-mp4-export.ts",
      },
      {
        value: "60",
        label: t("애니메이션 이미지를 가져올 때 프레임 상한", "Frame cap when importing an animated image"),
        source: "apps/web/src/domains/creator/studio-frame-animation.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
];
