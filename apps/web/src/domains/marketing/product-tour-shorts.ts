/**
 * 제품 투어 페이지 하단의 세로 쇼츠 46편.
 * 마흔여섯 편 모두 생성형 AI로 만든 개념 영상이라 실제 제품 화면 캡처가 아니다.
 * 화면에서도 그 성격을 밝힌다(섹션 안내 문구와 카드의 '개념 영상' 배지).
 * 1~4편은 29초 안팎, 5~36편은 14초 안팎, 37편은 11초 안팎, 38편은 8초
 * 안팎, 39~46편은 14초 안팎, 48편도 14초 안팎이라 길이를 편마다 따로 적는다.
 * 47편(나침반)은 다이얼의 로마 숫자가 읽히는 품질 이슈가 있어 쇼츠 섹션에
 * 걸지 않고 홍보 영상 자료실에만 보관한다.
 */
export interface ProductTourShort {
  readonly id:
    | "drawing-autocolor"
    | "bg3d-collab"
    | "serial-deadline"
    | "shaper-3d"
    | "plan-sketch"
    | "space-collab"
    | "assist-autocolor"
    | "finish-publish"
    | "brush-doodles"
    | "panel-layers"
    | "storyboard-panels"
    | "compare-review"
    | "device-handoff"
    | "asset-library"
    | "tone-finish"
    | "expression-wardrobe"
    | "camera-angles"
    | "version-rewind"
    | "manuscript-send"
    | "serial-schedule"
    | "desk-tour"
    | "pastel-colors"
    | "night-deadline"
    | "reader-phone"
    | "handcam-work"
    | "episode-alert"
    | "library-shelves"
    | "deadline-dawn"
    | "team-table"
    | "sketch-walk"
    | "ink-closeup"
    | "eraser-closeup"
    | "pencil-sharpen"
    | "paint-palette"
    | "fresh-note"
    | "coffee"
    | "rain-ink"
    | "morning-desk"
    | "book-stack"
    | "tea-cup"
    | "candlelight"
    | "fountain-pen"
    | "plant-water"
    | "seashell"
    | "steam-kettle"
    | "hourglass";
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly durationLabel: string;
  readonly ko: { readonly title: string; readonly body: string };
  readonly en: { readonly title: string; readonly body: string };
}

export const PRODUCT_TOUR_SHORTS: readonly ProductTourShort[] = [
  {
    id: "drawing-autocolor",
    src: "/brand/promo-shorts/shorts-1-drawing-autocolor.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:29",
    ko: {
      title: "그리고, 색까지",
      body: "펜으로 선을 긋는 순간부터 AI 자동 채색으로 컷이 완성되는 흐름을 담았습니다.",
    },
    en: {
      title: "From line to color",
      body: "From the first pen stroke to a finished panel with AI auto-coloring.",
    },
  },
  {
    id: "bg3d-collab",
    src: "/brand/promo-shorts/shorts-2-bg3d-collab.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:29",
    ko: {
      title: "3D 배경과 함께 만드는 협업",
      body: "3D로 구도를 잡은 배경 위에 여러 창작자가 함께 컷을 다듬는 모습을 그렸습니다.",
    },
    en: {
      title: "3D backgrounds, made together",
      body: "A scene composed in 3D, refined by several creators working on the same panel.",
    },
  },
  {
    id: "serial-deadline",
    src: "/brand/promo-shorts/shorts-3-serial-deadline.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:29",
    ko: {
      title: "연재와 마감, 놓치지 않게",
      body: "에피소드 캘린더에 마감을 채우고 스토리보드를 쌓아 가며 연재를 이어 가는 흐름을 담았습니다.",
    },
    en: {
      title: "Deadlines on the calendar",
      body: "Filling the episode calendar and stacking storyboards to keep a series on schedule.",
    },
  },
  {
    id: "shaper-3d",
    src: "/brand/promo-shorts/shorts-4-shaper.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:29",
    ko: {
      title: "포즈는 3D로 잡는다",
      body: "턴테이블 위 3D 캐릭터 마네킹의 포즈를 바꿔 가며 컷의 구도를 잡는 모습을 그렸습니다.",
    },
    en: {
      title: "Posing in 3D first",
      body: "A 3D character mannequin on a turntable, shifting poses to lock in each panel's composition.",
    },
  },
  {
    id: "plan-sketch",
    src: "/brand/promo-shorts/shorts-5-plan.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "노트에서 살아나는 기획",
      body: "기획 노트 속 캐릭터 스케치가 눈을 뜨고 포즈를 잡으며 첫 장면으로 이어지는 모습을 담았습니다.",
    },
    en: {
      title: "Sketches that wake up",
      body: "Character sketches in a planning notebook open their eyes, strike a pose and step into the first scene.",
    },
  },
  {
    id: "space-collab",
    src: "/brand/promo-shorts/shorts-6-space.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "함께 모이는 가상 스튜디오",
      body: "아바타로 작업 공간에 모여 같은 컷을 보며 이야기를 나누는 가상 스튜디오의 한때를 그렸습니다.",
    },
    en: {
      title: "One studio, every avatar",
      body: "Creators gather as avatars in one shared space, talking over the same panel.",
    },
  },
  {
    id: "assist-autocolor",
    src: "/brand/promo-shorts/shorts-7-assist.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "반복 작업은 AI에게",
      body: "밑색 채우기 같은 반복 작업을 AI 보조가 거들고 창작자는 마무리에 집중하는 흐름을 담았습니다.",
    },
    en: {
      title: "Let AI handle the repeats",
      body: "AI assistance takes on repetitive fills so the creator can focus on the finish.",
    },
  },
  {
    id: "finish-publish",
    src: "/brand/promo-shorts/shorts-8-finish.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "게시하면, 연재가 된다",
      body: "완성한 원고를 게시하는 순간 스마트폰 속 연재 목록에 새 회차가 오르는 모습을 담았습니다.",
    },
    en: {
      title: "Publish, and it is a series",
      body: "The moment a finished episode is published, it lands in the series list on a reader's phone.",
    },
  },
  {
    id: "brush-doodles",
    src: "/brand/promo-shorts/shorts-9-brush.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "살아나는 브러시 낙서",
      body: "붓과 펜이 지나간 자리마다 낙서 캐릭터가 눈을 뜨고 뛰어오르는 모습을 담았습니다.",
    },
    en: {
      title: "Brush strokes, alive",
      body: "Wherever a brush or pen passes, a doodle character wakes up and hops off the page.",
    },
  },
  {
    id: "panel-layers",
    src: "/brand/promo-shorts/shorts-10-layers.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "한 장이 쌓이는 순서",
      body: "스케치 선 위에 잉크와 채색, 명암이 한 겹씩 쌓여 한 장의 컷이 완성되는 과정을 담았습니다.",
    },
    en: {
      title: "Layer by layer",
      body: "Sketch, ink, color, then shade — layers stacking up until one panel is complete.",
    },
  },
  {
    id: "storyboard-panels",
    src: "/brand/promo-shorts/shorts-11-storyboard.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "격자로 채우는 콘티",
      body: "빈 칸으로 시작한 콘티 보드에 연필 패널이 한 칸씩 그려지며 이야기의 뼈대가 잡히는 과정을 담았습니다.",
    },
    en: {
      title: "A storyboard, panel by panel",
      body: "Pencil panels fill an empty storyboard grid one cell at a time until the story's skeleton stands.",
    },
  },
  {
    id: "compare-review",
    src: "/brand/promo-shorts/shorts-12-compare.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "두 버전을 나란히 검수",
      body: "같은 컷의 두 버전을 나란히 놓고 가운데 경계를 움직이며 달라진 곳을 확인하는 검수 장면을 담았습니다.",
    },
    en: {
      title: "Two takes, side by side",
      body: "Two versions of the same panel side by side, the divider sliding across to check what changed.",
    },
  },
  {
    id: "device-handoff",
    src: "/brand/promo-shorts/shorts-13-continuity.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "어디서든 이어 그리기",
      body: "스마트폰에서 그리던 그림을 큰 화면에서 그대로 이어 그리는 장면을 담았습니다.",
    },
    en: {
      title: "Pick up where you left off",
      body: "A drawing started on a phone, picked up and continued on the big screen just as it was left.",
    },
  },
  {
    id: "asset-library",
    src: "/brand/promo-shorts/shorts-14-assets.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "라이브러리에서 꺼내는 배경",
      body: "라이브러리에서 3D 배경을 꺼내 컷에 배치해 구도를 완성하는 과정을 담았습니다.",
    },
    en: {
      title: "A background from the library",
      body: "A 3D background pulled from the library and placed into a panel to finish the composition.",
    },
  },
  {
    id: "tone-finish",
    src: "/brand/promo-shorts/shorts-15-tone.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "톤으로 입히는 질감",
      body: "흑백 컷 위에 스크린톤과 효과선이 입혀지며 장면의 질감이 살아나는 과정을 담았습니다.",
    },
    en: {
      title: "Texture from screentones",
      body: "Screentones and effect lines settle onto a black-and-white panel until the scene gains texture.",
    },
  },
  {
    id: "expression-wardrobe",
    src: "/brand/promo-shorts/shorts-16-expression.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "표정도, 의상도 한 번에",
      body: "같은 캐릭터의 표정과 의상을 차례로 바꿔 보며 장면에 맞는 얼굴과 옷차림을 고르는 모습을 담았습니다.",
    },
    en: {
      title: "Faces and outfits, swapped",
      body: "One character cycling through expressions and outfits while the creator picks the right look for the scene.",
    },
  },
  {
    id: "camera-angles",
    src: "/brand/promo-shorts/shorts-17-camera.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "앵글은 카메라로 찾는다",
      body: "3D 배경 공간 안에서 카메라를 이리저리 움직이며 컷마다 맞는 앵글을 찾는 과정을 담았습니다.",
    },
    en: {
      title: "Finding the angle",
      body: "A camera moving through a 3D background set, hunting for the angle each panel needs.",
    },
  },
  {
    id: "version-rewind",
    src: "/brand/promo-shorts/shorts-19-rewind.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "아니면, 되돌리면 된다",
      body: "작업 버전을 거슬러 올라가 마음에 들던 단계로 되돌리는 모습을 담았습니다.",
    },
    en: {
      title: "Not right? Rewind",
      body: "Stepping back through versions of a work to return to the stage that felt right.",
    },
  },
  {
    id: "manuscript-send",
    src: "/brand/promo-shorts/shorts-20-send.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "완성 원고, 보내는 순간",
      body: "마침표를 찍은 원고를 전송해 연재 목록에 올리는 마지막 순간을 담았습니다.",
    },
    en: {
      title: "Sending the finished pages",
      body: "The final moment a finished manuscript is sent off and lands in the series list.",
    },
  },
  {
    id: "serial-schedule",
    src: "/brand/promo-shorts/shorts-21-schedule.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "색으로 채우는 연재 일정",
      body: "빈 격자 칸이 하나씩 색으로 채워지며 다음 회차의 일정이 잡혀 가는 모습을 담았습니다.",
    },
    en: {
      title: "A schedule filling with color",
      body: "Empty grid cells filling with color one by one as the next episodes fall into place.",
    },
  },
  {
    id: "desk-tour",
    src: "/brand/promo-shorts/shorts-22-desk-tour.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "책상 가까이, 줌인",
      body: "조용한 방 전경에서 창작자의 책상 위로 천천히 다가가는 줌인 장면을 담았습니다.",
    },
    en: {
      title: "Zooming in on the desk",
      body: "A slow zoom from a quiet room's wide view down onto the creator's desk.",
    },
  },
  {
    id: "pastel-colors",
    src: "/brand/promo-shorts/shorts-23-pastel.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "색연필 파스텔의 결",
      body: "색연필과 파스텔이 종이 위를 스치며 부드러운 색이 한 겹씩 번져 나가는 채색 과정을 담았습니다.",
    },
    en: {
      title: "Pastel, layer by layer",
      body: "Colored pencils and pastels sweeping across paper as soft color blooms layer by layer.",
    },
  },
  {
    id: "night-deadline",
    src: "/brand/promo-shorts/shorts-24-nightwork.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "밤의 마감 작업",
      body: "고요한 밤 램프 불빛 아래 마지막 컷을 다듬으며 마감을 향해 가는 작업의 공기를 담았습니다.",
    },
    en: {
      title: "Night work, deadline bound",
      body: "A quiet night under lamplight, polishing the last panels on the way to a deadline.",
    },
  },
  {
    id: "reader-phone",
    src: "/brand/promo-shorts/shorts-25-reader.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "독자의 손에서 열리는 회차",
      body: "스마트폰을 든 독자의 시점에서 새 회차가 열리고, 화면을 스크롤하며 읽어 내려가는 모습을 담았습니다.",
    },
    en: {
      title: "A new episode, in the reader's hands",
      body: "From a reader's point of view: a new episode opens on a phone and scrolls by as they read.",
    },
  },
  {
    id: "handcam-work",
    src: "/brand/promo-shorts/shorts-26-handcam.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "손캠으로 본 작업대",
      body: "작업자의 손과 펜이 오가는 모습을 위에서 내려다본 손캠 앵글로 담았습니다.",
    },
    en: {
      title: "The desk, hands-on",
      body: "A top-down hand-cam angle on the creator's hands and pen moving across the desk.",
    },
  },
  {
    id: "episode-alert",
    src: "/brand/promo-shorts/shorts-27-alert.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "새 회차, 알림이 울리면",
      body: "연재 알림이 울리는 순간 새 회차가 도착하고, 독자들이 하나둘 모여드는 설렘을 담았습니다.",
    },
    en: {
      title: "A new episode just dropped",
      body: "The moment a serial alert rings, a new episode lands and readers start to gather.",
    },
  },
  {
    id: "library-shelves",
    src: "/brand/promo-shorts/shorts-28-library.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "내 서재에 꽂아 두는 즐거움",
      body: "마음에 드는 작품을 북마크해 서재에 차곡차곡 꽂아 두고, 언제든 다시 꺼내 읽는 모습을 담았습니다.",
    },
    en: {
      title: "Shelved in my library",
      body: "Bookmarking favorite works onto library shelves, ready to pull out and read again anytime.",
    },
  },
  {
    id: "deadline-dawn",
    src: "/brand/promo-shorts/shorts-29-dawn.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "마감을 넘긴 새벽",
      body: "긴 밤 작업 끝에 마감을 넘기고, 창밖이 밝아 오는 새벽의 고요를 담았습니다.",
    },
    en: {
      title: "Dawn after the deadline",
      body: "The quiet dawn outside the window after a long night of work finally meets its deadline.",
    },
  },
  {
    id: "team-table",
    src: "/brand/promo-shorts/shorts-30-team.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "함께 둘러앉은 작업 테이블",
      body: "여럿이 한 테이블에 둘러앉아 스케치를 주고받으며 작업하는 팀의 온기를 담았습니다.",
    },
    en: {
      title: "Around the team table",
      body: "A team gathered around one table, passing sketches back and forth as the work comes together.",
    },
  },
  {
    id: "sketch-walk",
    src: "/brand/promo-shorts/shorts-31-sketchwalk.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "산책길에서 여는 스케치북",
      body: "공원 산책길에 멈춰 서서 눈앞의 풍경을 스케치북에 옮겨 담는 순간을 담았습니다.",
    },
    en: {
      title: "A sketchbook opens on the path",
      body: "Pausing on a park path to move the view ahead onto the pages of a sketchbook.",
    },
  },
  {
    id: "ink-closeup",
    src: "/brand/promo-shorts/shorts-32-ink.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "펜촉에 맺히는 잉크",
      body: "펜촉 끝에 잉크가 맺혔다가 종이 위로 흘러 선이 살아나는 순간을 가까이에서 담았습니다.",
    },
    en: {
      title: "Ink gathering on the nib",
      body: "Ink beads at the tip of a nib, then flows onto the paper as a line comes alive — caught up close.",
    },
  },
  {
    id: "eraser-closeup",
    src: "/brand/promo-shorts/shorts-33-eraser.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "지우개가 닦아 내는 선",
      body: "지우개가 종이 위를 지나며 선을 지우고 가루가 쌓이는 순간을 가까이에서 담았습니다.",
    },
    en: {
      title: "An eraser wiping the line away",
      body: "An eraser passing over the paper, lifting the line away as the crumbs gather — caught up close.",
    },
  },
  {
    id: "pencil-sharpen",
    src: "/brand/promo-shorts/shorts-34-sharpen.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "뾰족해지는 색연필심",
      body: "색연필을 깎을수록 심이 뾰족해지고 나무 부스러기가 쌓이는 순간을 가까이에서 담았습니다.",
    },
    en: {
      title: "A colored pencil, sharpened to a point",
      body: "A colored pencil turning in the sharpener, its core coming to a point as wood shavings pile up — caught up close.",
    },
  },
  {
    id: "paint-palette",
    src: "/brand/promo-shorts/shorts-35-palette.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "팔레트에서 개어지는 색",
      body: "물감 팔레트 위에서 색이 개어지고 붓이 색을 머금는 순간을 가까이에서 담았습니다.",
    },
    en: {
      title: "Colors mixing on the palette",
      body: "Paint being mixed on a palette as the brush gathers the color — caught up close.",
    },
  },
  {
    id: "fresh-note",
    src: "/brand/promo-shorts/shorts-36-freshnote.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "새 노트의 첫 장",
      body: "새 노트를 펼쳐 첫 장에 첫 선이 그어지는 순간을 가까이에서 담았습니다.",
    },
    en: {
      title: "The first page of a fresh notebook",
      body: "A fresh notebook opening, the first line landing on its first page — caught up close.",
    },
  },
  {
    id: "coffee",
    src: "/brand/promo-shorts/shorts-37-coffee.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:11",
    ko: {
      title: "김 오르는 커피 한 잔",
      body: "작업 책상 위에서 김이 천천히 오르는 커피 잔을 가까이에서 담았습니다.",
    },
    en: {
      title: "A cup of coffee, still steaming",
      body: "Steam curling slowly off a cup of coffee on the work desk — caught up close.",
    },
  },
  {
    id: "rain-ink",
    src: "/brand/promo-shorts/shorts-38-rainink.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:08",
    ko: {
      title: "비 내리는 날의 잉크병",
      body: "빗방울이 맺힌 창가에서 잉크병과 펜을 가까이에서 담았습니다.",
    },
    en: {
      title: "An ink bottle on a rainy day",
      body: "An ink bottle and a pen by a rain-speckled window — caught up close.",
    },
  },
  {
    id: "morning-desk",
    src: "/brand/promo-shorts/shorts-39-morningdesk.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "아침의 작업 책상",
      body: "아침 햇살이 드는 작업 책상의 풍경을 가까이에서 담았습니다.",
    },
    en: {
      title: "The work desk in the morning",
      body: "Morning light falling across the work desk — caught up close.",
    },
  },
  {
    id: "book-stack",
    src: "/brand/promo-shorts/shorts-40-bookstack.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "쌓인 책 더미",
      body: "책상 한켠에 쌓인 책 더미를 가까이에서 담았습니다.",
    },
    en: {
      title: "A stack of books",
      body: "A stack of books piled at the corner of the desk — caught up close.",
    },
  },
  {
    id: "tea-cup",
    src: "/brand/promo-shorts/shorts-41-teacup.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "김 오르는 찻잔",
      body: "작업 책상 위에서 김이 천천히 오르는 찻잔을 가까이에서 담았습니다.",
    },
    en: {
      title: "A teacup, still steaming",
      body: "Steam curling slowly off a teacup on the work desk — caught up close.",
    },
  },
  {
    id: "candlelight",
    src: "/brand/promo-shorts/shorts-42-candlelight.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "촛불 아래의 책상",
      body: "촛불이 흔들리는 빛 아래의 작업 책상을 가까이에서 담았습니다.",
    },
    en: {
      title: "The desk by candlelight",
      body: "The work desk in the flickering light of a candle — caught up close.",
    },
  },
  {
    id: "fountain-pen",
    src: "/brand/promo-shorts/shorts-43-fountainpen.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "만년필 클로즈업",
      body: "종이 위를 미끄러지는 만년필의 펜촉을 가까이에서 담았습니다.",
    },
    en: {
      title: "The fountain pen, up close",
      body: "A fountain pen nib gliding across the page — caught up close.",
    },
  },
  {
    id: "plant-water",
    src: "/brand/promo-shorts/shorts-44-plantwater.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "화분에 물 주기",
      body: "창가의 화분에 천천히 물을 주는 손길을 가까이에서 담았습니다.",
    },
    en: {
      title: "Watering the plant",
      body: "Slowly watering the plant by the window — caught up close.",
    },
  },
  {
    id: "seashell",
    src: "/brand/promo-shorts/shorts-45-seashell.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "모래 위의 조개껍데기",
      body: "모래 위에 놓인 조개껍데기를 가까이에서 담았습니다.",
    },
    en: {
      title: "A seashell on the sand",
      body: "A seashell resting on the sand — caught up close.",
    },
  },
  {
    id: "steam-kettle",
    src: "/brand/promo-shorts/shorts-46-steamkettle.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "김이 오르는 주전자",
      body: "김이 모락모락 피어오르는 주전자를 가까이에서 담았습니다.",
    },
    en: {
      title: "The steaming kettle",
      body: "A kettle with steam curling up — caught up close.",
    },
  },
  {
    id: "hourglass",
    src: "/brand/promo-shorts/shorts-48-hourglass.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "모래가 떨어지는 모래시계",
      body: "모래가 가만히 떨어지는 모래시계를 가까이에서 담았습니다.",
    },
    en: {
      title: "The hourglass",
      body: "Sand slipping quietly through an hourglass — caught up close.",
    },
  },
];
