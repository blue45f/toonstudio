/** 액션 느와르 · 일상 코미디 · 심리 스릴러 장르 서사·캐릭터·OST 팩. */
import {
  IDEA_PROMPT_PRESETS,
  PAL,
  type WebtoonGenreSpec,
} from "./idea-to-episode-catalog-shared";

export const NOIR_COMEDY_THRILLER_GENRE_PACKS: Readonly<Pick<Record<"action-noir" | "slice-of-comedy" | "thriller", WebtoonGenreSpec>, "action-noir" | "slice-of-comedy" | "thriller">> = {
  "action-noir": {
    id: "action-noir",
    label: { ko: "액션 느와르", en: "Action Noir" },
    tagline: { ko: "빗속 항만·암흑가 거래·근접 타격", en: "Rain harbors, syndicate ledgers, close combat" },
    defaultLogline: IDEA_PROMPT_PRESETS[3].logline,
    titlePrefix: { ko: "우천 항만", en: "Rain Harbor" },
    timeProgression: ["dusk", "night", "night", "midnight", "midnight"],
    characters: [
      {
        idSuffix: "taesan",
        role: "protagonist",
        name: { ko: "한태산", en: "Taesan Han" },
        appearanceAnchors: [
          { ko: "젖은 흑발과 눈썹 끝 흉터", en: "Rain-slick dark hair, notched brow scar" },
          { ko: "오른손 마디에 감은 흰 붕대", en: "Taped knuckles on right hand" },
        ],
        lockedOutfitId: "outfit-noir-raincoat-v1",
        lockedOutfitLabel: { ko: "검은 방수 트렌치·회색 터틀넥", en: "Black Rain Trench & Slate Turtleneck" },
        signaturePaletteTokens: [
          PAL.raised("빗젖은 코트 암부", "Wet Trench Shadow"),
          PAL.warn("나트륨 가로등 반사", "Sodium Streetlamp Rim"),
          PAL.accent("황동 라이터 불꽃", "Brass Lighter Spark"),
        ],
        speechRegister: "casual",
        speechRegisterRule: {
          ko: "짧고 건조한 느와르 반말, 수식어 배제",
          en: "Clipped dry noir cadence with zero filler",
        },
        propsInventory: [
          { ko: "암호 칩이 숨겨진 황동 라이터", en: "Encrypted Brass Flip Lighter" },
        ],
        relationToIndex: [
          { targetIdx: 1, relationType: "foil", summary: { ko: "장부를 쫓는 강력계 형사", en: "Homicide detective chasing the ledger" } },
          { targetIdx: 2, relationType: "rival", summary: { ko: "항만 밀수 조직의 보스", en: "Harbor syndicate boss" } },
        ],
      },
      {
        idSuffix: "jimin",
        role: "deuteragonist",
        name: { ko: "오지민 형사", en: "Detective Jimin Oh" },
        appearanceAnchors: [
          { ko: "단발 흑발 · 어깨에 건 무전기", en: "Cropped dark bob, shoulder radio mic" },
          { ko: "비에 젖지 않은 차분한 시선", en: "Unflinching gaze in pouring rain" },
        ],
        lockedOutfitId: "outfit-noir-detective-jacket-v1",
        lockedOutfitLabel: { ko: "네이비 가죽 필드 재킷", en: "Navy Leather Field Jacket" },
        signaturePaletteTokens: [
          PAL.cool("순찰등 청색 반사", "Patrol Beacon Blue"),
          PAL.raised("필드 재킷 네이비", "Field Jacket Navy"),
          PAL.fgMuted("수첩·배지 스틸", "Badge Steel Neutral"),
        ],
        speechRegister: "formal",
        speechRegisterRule: {
          ko: "단호한 수사관 존댓말, 직설 화법",
          en: "Direct investigator tone, formal and sharp",
        },
        propsInventory: [
          { ko: "방수 사건 수첩", en: "Waterproof Case Notebook" },
          { ko: "경광 신호등", en: "Tactical Signal Flare" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "ally", summary: { ko: "불신 속 임시 공조 파트너", en: "Reluctant temporary ally" } },
        ],
      },
      {
        idSuffix: "gukcheol",
        role: "antagonist",
        name: { ko: "마국철 이사", en: "Director Gukcheol Ma" },
        appearanceAnchors: [
          { ko: "은테 선글라스와 굵은 시가", en: "Silver-frame shades and heavy cigar" },
          { ko: "목선 문신이 비치는 오픈 셔츠", en: "Collar tattoo peeking above open shirt" },
        ],
        lockedOutfitId: "outfit-noir-fur-overcoat-v1",
        lockedOutfitLabel: { ko: "검은 캐시미어 롱코트", en: "Black Cashmere Long Overcoat" },
        signaturePaletteTokens: [
          PAL.bad("경고 적색 네온", "Warning Crimson Neon"),
          PAL.raised("캐시미어 다크 베이스", "Cashmere Dark Base"),
          PAL.warn("시가 엠버 글로우", "Cigar Ember Glow"),
        ],
        speechRegister: "casual",
        speechRegisterRule: {
          ko: "느긋하고 위협적인 반말, 명령조",
          en: "Unrushed menacing imperatives",
        },
        propsInventory: [
          { ko: "컨테이너 봉인 마스터키", en: "Container Yard Master Key" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "rival", summary: { ko: "태산의 기억을 지운 배후", en: "Boss who erased Taesan's past" } },
        ],
      },
    ],
    bg3dPresets: [
      { presetId: "bg3d-busan-rain-dockyard", label: { ko: "비 내리는 컨테이너 부두 3D", en: "Rainy Container Dockyard 3D" }, lightingMood: { ko: "나트륨등 젖은 아스팔트 반사", en: "Sodium wet asphalt reflections" } },
      { presetId: "bg3d-abandoned-warehouse-catwalk", label: { ko: "폐창고 철골 캣워크 3D", en: "Warehouse Steel Catwalk 3D" }, lightingMood: { ko: "역광 실루엣 스포트", en: "Backlit silhouette spotlights" } },
      { presetId: "bg3d-neon-alley-rain", label: { ko: "항구 뒤골목 빗길 3D", en: "Harbor Back-Alley Rain 3D" }, lightingMood: { ko: "저채도 시안·주홍 대비", en: "Muted cyan and amber contrast" } },
    ],
    sfxPool: {
      setup: [{ ko: "후두둑…", en: "PATTER..." }, { ko: "찰칵", en: "CLICK" }],
      development: [{ ko: "끼익", en: "CREAK" }, { ko: "터벅", en: "STOMP" }],
      turn: [{ ko: "퍽!", en: "THUD!" }, { ko: "와장창!", en: "SMASH!" }],
      climax: [{ ko: "콰앙!", en: "CRACK!" }, { ko: "부우웅!", en: "ROAR!" }],
      cliffhanger: [{ ko: "치익…", en: "HISS..." }],
    },
    actDialogues: {
      setup: [
        { ko: "빗소리가 굵어지면 꼭 옛 거래가 돌아온다.", en: "Heavy rain always brings back old debts." },
        { ko: "7번 부두 컨테이너. 약속 시간 2분 남았어.", en: "Pier Seven container. Two minutes left." },
      ],
      development: [
        { ko: "한태산 씨, 그 라이터 안에 든 게 명단 맞죠?", en: "Taesan, that lighter holds the ledger, right?" },
        { ko: "형사님은 빠져. 이 판은 법으로 안 끝나.", en: "Stay out, Detective. Law won't close this." },
      ],
      turn: [
        { ko: "기억을 지웠는데도 손이 먼저 움직이더군.", en: "Wiped your memory, yet your hands still fight." },
        { ko: "네 목소리만은 지워지지 않았거든.", en: "Your voice was the one thing that stayed." },
      ],
      climax: [
        { ko: "불빛 꺼! 철골 위로 올라타!", en: "Kill the floodlights! Up the steel catwalk!" },
        { ko: "장부는 내가 회수한다. 전원 막아!", en: "Recover the ledger now. Seal every exit!" },
      ],
      cliffhanger: [
        { ko: "라이터가 열리자 형사의 사진이 나왔다.", en: "The lighter opened—holding the cop's photo." },
      ],
    },
    beatTitles: {
      setup: { ko: "폭우 속 7번 부두의 거래 현장", en: "Downpour Rendezvous at Pier Seven" },
      development: { ko: "형사의 추적과 임시 공조", en: "Detective Intercept and Fragile Truce" },
      turn: { ko: "지워진 기억의 배후와 매복", en: "Ambush by the Syndicate Architect" },
      climax: { ko: "철골 캣워크 암전 근접전", en: "Blackout Close-Quarters Catwalk Brawl" },
      cliffhanger: { ko: "라이터 속에서 나온 충격의 사진", en: "Unexpected Photo Hidden Inside the Lighter" },
    },
    hookQuestion: {
      ko: "왜 암흑가 라이터 안에 형사의 사진이 들어 있었는가?",
      en: "Why was the detective's photograph sealed inside the syndicate lighter?",
    },
    ost: {
      baseBpm: 88,
      keysByAct: { setup: "C minor", development: "G minor", turn: "F minor", climax: "Bb minor", cliffhanger: "C minor" },
      calmInstruments: [{ ko: "빗소리 텍스처", en: "Rain Ambience" }, { ko: "뮤트 트럼펫", en: "Muted Trumpet" }, { ko: "업라이트 베이스", en: "Upright Bass" }],
      tensionInstruments: [{ ko: "브러시 스네어", en: "Tense Snare" }, { ko: "로-파이 기타", en: "Gritty Electric Guitar" }, { ko: "저음 첼로 드론", en: "Low Cello Drone" }],
      climaxInstruments: [{ ko: "헤비 톰 퍼커션", en: "Heavy Tom Percussion" }, { ko: "오버드라이브 베이스", en: "Overdrive Bass" }, { ko: "브라스 스탭", en: "Brass Stabs" }],
    },
  },

  "slice-of-comedy": {
    id: "slice-of-comedy",
    label: { ko: "일상 코미디", en: "Slice-of-Life Comedy" },
    tagline: { ko: "생활 공감·텐션 급변·반전 펀치라인", en: "Relatable chaos, snappy timing, punchline twists" },
    defaultLogline: {
      ko: "마감 3시간 전 고양이 두 마리가 태블릿 펜을 숨겨 버린 웹툰 작가의 대환장 수색전.",
      en: "Three hours before deadline, two cats hide a webtoon artist's stylus across the apartment.",
    },
    titlePrefix: { ko: "마감 3시간 전", en: "Three Hours to Deadline" },
    timeProgression: ["morning", "morning", "noon", "noon", "dusk"],
    characters: [
      {
        idSuffix: "boram",
        role: "protagonist",
        name: { ko: "김보람 작가", en: "Boram Kim" },
        appearanceAnchors: [
          { ko: "연필로 대충 올린 사과머리", en: "Messy topknot pinned with a pencil" },
          { ko: "동그란 뿔테 안경과 하품 표정", en: "Round horn-rim glasses, frantic eyes" },
        ],
        lockedOutfitId: "outfit-comedy-hoodie-v1",
        lockedOutfitLabel: { ko: "오버핏 크림 후드·드로잉 장갑", en: "Oversized Cream Hoodie & Drawing Glove" },
        signaturePaletteTokens: [
          PAL.warn("따뜻한 머스타드 포인트", "Warm Mustard Accent"),
          PAL.good("민트 드로잉 장갑", "Mint Drawing Glove"),
          PAL.raised("후드 소프트 뉴트럴", "Soft Hoodie Neutral"),
        ],
        speechRegister: "casual",
        speechRegisterRule: {
          ko: "리듬감 있는 생활 반말과 과장된 감탄사",
          en: "Punchy everyday banter with exaggerated exclamations",
        },
        propsInventory: [
          { ko: "배터리 4% 액정 태블릿", en: "4%-Battery Pen Display" },
          { ko: "식어 버린 아이스 아메리카노", en: "Watered-Down Iced Coffee" },
        ],
        relationToIndex: [
          { targetIdx: 1, relationType: "foil", summary: { ko: "마감을 재촉하는 칼같은 담당 PD", en: "Punctual editor tracking every minute" } },
          { targetIdx: 2, relationType: "rival", summary: { ko: "펜을 물고 도망친 치즈 고양이", en: "Orange tabby holding the stylus hostage" } },
        ],
      },
      {
        idSuffix: "minsoo",
        role: "deuteragonist",
        name: { ko: "박민수 PD", en: "Editor Minsoo Park" },
        appearanceAnchors: [
          { ko: "단정한 가르마와 스마트워치 알림", en: "Neat parted hair, buzzing smartwatch" },
          { ko: "미소 짓지만 흔들리지 않는 눈빛", en: "Polite smile with relentless eyes" },
        ],
        lockedOutfitId: "outfit-comedy-cardigan-v1",
        lockedOutfitLabel: { ko: "단정한 니트 카디건·메신저백", en: "Neat Knit Cardigan & Messenger Bag" },
        signaturePaletteTokens: [
          PAL.cool("편집부 차분한 블루", "Editorial Calm Blue"),
          PAL.raised("카디건 뉴트럴", "Cardigan Neutral"),
          PAL.good("체크리스트 OK 포인트", "Checklist OK Green"),
        ],
        speechRegister: "formal",
        speechRegisterRule: {
          ko: "극도로 상냥하지만 압박감 넘치는 존댓말",
          en: "Ultra-polite formal speech carrying deadline dread",
        },
        propsInventory: [
          { ko: "마감 카운트다운 태블릿", en: "Deadline Countdown Tablet" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "ally", summary: { ko: "원고를 살리려 간식을 들고 온 구원자", en: "Savior arriving with snacks and backup pen" } },
        ],
      },
      {
        idSuffix: "cheese",
        role: "antagonist",
        name: { ko: "대장 치즈냥", en: "Boss Tabby Cheese" },
        appearanceAnchors: [
          { ko: "통통한 턱살과 당당한 꼬리 각도", en: "Chubby cheeks, proud upright tail" },
          { ko: "목에 걸린 작은 방울 리본", en: "Tiny brass bell collar" },
        ],
        lockedOutfitId: "outfit-comedy-bell-collar-v1",
        lockedOutfitLabel: { ko: "황금 방울 목걸이", en: "Golden Bell Collar" },
        signaturePaletteTokens: [
          PAL.accent("치즈 줄무늬 포인트", "Ginger Stripe Accent"),
          PAL.warn("방울 골드 포인트", "Bell Gold Accent"),
          PAL.fgMuted("배털 크림 톤", "Cream Belly Neutral"),
        ],
        speechRegister: "casual",
        speechRegisterRule: {
          ko: "고양이 속마음 내레이션(오만한 반말)",
          en: "Smug feline inner monologue",
        },
        propsInventory: [
          { ko: "훔쳐 둔 스타일러스 펜", en: "Stolen Digital Stylus" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "foil", summary: { ko: "간식 협상을 요구하는 집 안 서열 1위", en: "Household ruler demanding treat tribute" } },
        ],
      },
    ],
    bg3dPresets: [
      { presetId: "bg3d-sunlit-studio-desk", label: { ko: "햇살 드는 원룸 작업 책상 3D", en: "Sunlit Home Studio Desk 3D" }, lightingMood: { ko: "밝은 오전 창가 자연광", en: "Bright morning window daylight" } },
      { presetId: "bg3d-livingroom-cat-tower", label: { ko: "거실 캣타워·소파 코너 3D", en: "Living Room Cat Tower 3D" }, lightingMood: { ko: "포근한 실내 확산광", en: "Soft warm indoor bounce" } },
      { presetId: "bg3d-doorway-delivery-hall", label: { ko: "현관문 앞 인터폰 복도 3D", en: "Apartment Entryway Hall 3D" }, lightingMood: { ko: "경쾌한 하이키 조명", en: "Crisp high-key lighting" } },
    ],
    sfxPool: {
      setup: [{ ko: "부스럭", en: "RUSTLE" }, { ko: "띵동!", en: "DING-DONG!" }],
      development: [{ ko: "후다닥!", en: "SCURRY!" }, { ko: "딸랑!", en: "JINGLE!" }],
      turn: [{ ko: "띠리링!", en: "BUZZ!" }, { ko: "두둥!", en: "BA-DUM!" }],
      climax: [{ ko: "우다다다!", en: "ZOOMIES!" }, { ko: "번쩍!", en: "SPARKLE!" }],
      cliffhanger: [{ ko: "야옹—", en: "MEOW—" }],
    },
    actDialogues: {
      setup: [
        { ko: "완벽해! 이제 마지막 3컷만 선 따면 끝이야!", en: "Almost done! Just three panels left to ink!" },
        { ko: "잠깐… 방금 여기 뒀던 펜 어디 갔어?!", en: "Wait... where did my stylus just vanish?!" },
      ],
      development: [
        { ko: "작가님, 마감까지 2시간 50분 남으셨어요!", en: "Boram, two hours fifty left until upload!" },
        { ko: "치즈야, 제발 캣타워 꼭대기에서 내려와 줘!", en: "Cheese, please come down off the cat tower!" },
      ],
      turn: [
        { ko: "(속마음) 츄르 두 개면 협상해 주지, 집사.", en: "(Thought) Two treat sticks, then we negotiate." },
        { ko: "방금 츄르 봉지 흔들었더니 눈빛이 바뀌었어!", en: "I shook the treat pouch—his eyes locked on!" },
      ],
      climax: [
        { ko: "펜 잡았다! 지금부터 광속 마감 모드 돌입!", en: "Got the pen! Entering hyper-ink sprint mode!" },
        { ko: "대단하세요! 저장 버튼도 꼭 눌러 주세요!", en: "Amazing pace! Please hit save right now!" },
      ],
      cliffhanger: [
        { ko: "전송 버튼 위로… 치즈의 앞발이 내려왔다.", en: "Over the upload key... a fluffy paw fell." },
      ],
    },
    beatTitles: {
      setup: { ko: "마감 3시간 전, 사라진 스타일러스", en: "Missing Stylus Three Hours Before Cutoff" },
      development: { ko: "담당 PD 알림과 캣타워 대치", en: "Editor Check-In and Cat Tower Standoff" },
      turn: { ko: "간식 협상 결렬과 기습 추격전", en: "Treat Negotiation and Living-Room Chase" },
      climax: { ko: "펜 탈환과 초고속 막판 작화", en: "Stylus Recovery and Final Ink Sprint" },
      cliffhanger: { ko: "전송 버튼 위의 운명적 앞발", en: "The Fateful Paw Above the Upload Key" },
    },
    hookQuestion: {
      ko: "치즈가 누른 키는 '업로드'였을까, '전체 삭제'였을까?",
      en: "Did Cheese stomp 'Publish Episode' or 'Clear Layer'?",
    },
    ost: {
      baseBpm: 118,
      keysByAct: { setup: "C major", development: "G major", turn: "F major", climax: "D major", cliffhanger: "G major" },
      calmInstruments: [{ ko: "피치카토 현악", en: "Pizzicato Strings" }, { ko: "마림바", en: "Marimba" }, { ko: "어쿠스틱 기타", en: "Acoustic Guitar" }],
      tensionInstruments: [{ ko: "클라리넷 스타카토", en: "Staccato Clarinet" }, { ko: "우드블록", en: "Woodblock" }, { ko: "워킹 베이스", en: "Walking Bass" }],
      climaxInstruments: [{ ko: "브라스 빅밴드", en: "Big-Band Brass" }, { ko: "스네어 드럼", en: "Snappy Snare" }, { ko: "실로폰 런", en: "Xylophone Runs" }],
    },
  },

  thriller: {
    id: "thriller",
    label: { ko: "심리 스릴러", en: "Psychological Thriller" },
    tagline: { ko: "밀실 미스터리·신뢰 붕괴·반전 복선", en: "Closed-room mystery, broken trust, twist clues" },
    defaultLogline: {
      ko: "폭설로 고립된 산장 CCTV에서 내일 날짜의 내 모습이 먼저 걸어 들어오는 영상이 재생된다.",
      en: "In a snowbound lodge, the CCTV replays footage of yourself entering tomorrow's date.",
    },
    titlePrefix: { ko: "내일의 녹화본", en: "Tomorrow's Footage" },
    timeProgression: ["dusk", "night", "night", "midnight", "midnight"],
    characters: [
      {
        idSuffix: "yujin",
        role: "protagonist",
        name: { ko: "서유진", en: "Yujin Seo" },
        appearanceAnchors: [
          { ko: "단정한 흑발 단발 · 왼쪽 손목 아날로그 시계", en: "Dark chin-length bob, analog wrist watch" },
          { ko: "예민하게 초점이 좁아진 눈동자", en: "Pinpoint vigilant gaze" },
        ],
        lockedOutfitId: "outfit-thriller-wool-coat-v1",
        lockedOutfitLabel: { ko: "아이보리 울 니트·다크 코트", en: "Ivory Wool Knit & Dark Overcoat" },
        signaturePaletteTokens: [
          PAL.fgMuted("아이보리 울 니트", "Ivory Wool Knit"),
          PAL.cool("모니터 청백 반사", "CRT Monitor Glow"),
          PAL.raised("산장 그림자 베이스", "Lodge Shadow Base"),
        ],
        speechRegister: "formal",
        speechRegisterRule: {
          ko: "차분한 관찰자 존댓말, 의심 순간 질문형 증가",
          en: "Measured observant tone turning into sharp questions",
        },
        propsInventory: [
          { ko: "타임코드 인쇄 CCTV 스틸컷", en: "Timestamped CCTV Printout" },
          { ko: "객실 402호 황동 열쇠", en: "Room 402 Brass Key" },
        ],
        relationToIndex: [
          { targetIdx: 1, relationType: "ally", summary: { ko: "유일하게 타임스탬프를 믿어 준 투숙객", en: "Fellow guest verifying the timestamps" } },
          { targetIdx: 2, relationType: "rival", summary: { ko: "녹화 서버 열쇠를 쥔 산장 관리인", en: "Caretaker guarding the archive room" } },
        ],
      },
      {
        idSuffix: "hyunwoo",
        role: "deuteragonist",
        name: { ko: "정현우 기자", en: "Reporter Hyunwoo Jung" },
        appearanceAnchors: [
          { ko: "금테 안경과 낡은 보이스 레코더", en: "Wire-frame glasses, worn voice recorder" },
          { ko: "눈이 묻은 회색 머플러", en: "Snow-dusted gray scarf" },
        ],
        lockedOutfitId: "outfit-thriller-parka-v1",
        lockedOutfitLabel: { ko: "다크 올리브 방한 파카", en: "Dark Olive Winter Parka" },
        signaturePaletteTokens: [
          PAL.good("레코더 녹음 LED", "Recorder LED Green"),
          PAL.raised("방한 파카 베이스", "Winter Parka Base"),
          PAL.warn("손전등 웜 빔", "Flashlight Warm Beam"),
        ],
        speechRegister: "formal",
        speechRegisterRule: {
          ko: "취재원 인터뷰식 침착한 존댓말",
          en: "Calm investigative questioning",
        },
        propsInventory: [
          { ko: "소형 디지털 녹음기", en: "Pocket Digital Recorder" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "ally", summary: { ko: "함께 알리바이를 대조하는 파트너", en: "Partner cross-checking alibis" } },
        ],
      },
      {
        idSuffix: "caretaker",
        role: "antagonist",
        name: { ko: "관리인 강노인", en: "Caretaker Kang" },
        appearanceAnchors: [
          { ko: "백발 눈썹과 묵직한 열쇠 꾸러미", en: "White brows, heavy iron key ring" },
          { ko: "깜박임이 적은 건조한 시선", en: "Unblinking cold stare" },
        ],
        lockedOutfitId: "outfit-thriller-vest-v1",
        lockedOutfitLabel: { ko: "짙은 갈색 퀼팅 작업 조끼", en: "Dark Brown Quilted Work Vest" },
        signaturePaletteTokens: [
          PAL.bad("녹화 REC 적색등", "Camera REC Red"),
          PAL.raised("퀼팅 조끼 암부", "Quilted Vest Dark"),
          PAL.fgMuted("열쇠 스틸 톤", "Key Ring Steel"),
        ],
        speechRegister: "archaic",
        speechRegisterRule: {
          ko: "나직하고 속삭이는 예스러운 하오체",
          en: "Hushed archaic warnings",
        },
        propsInventory: [
          { ko: "지하 보안실 마스터 열쇠", en: "Basement Security Master Key" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "rival", summary: { ko: "녹화 날짜 조작을 감추는 감시자", en: "Watcher hiding the altered timeline" } },
        ],
      },
    ],
    bg3dPresets: [
      { presetId: "bg3d-snow-lodge-lobby", label: { ko: "폭설 산장 목조 로비 3D", en: "Snowbound Timber Lobby 3D" }, lightingMood: { ko: "창밖 설경 청색광과 벽난로", en: "Cold snow blue and fireplace flicker" } },
      { presetId: "bg3d-cctv-security-room", label: { ko: "지하 CCTV 보안 관제실 3D", en: "Basement CCTV Control Room 3D" }, lightingMood: { ko: "모니터 스캔라인 냉광", en: "Cold CRT scanline light" } },
      { presetId: "bg3d-corridor-402-shadow", label: { ko: "산장 4층 복도 402호 앞 3D", en: "Fourth-Floor Hall Room 402 3D" }, lightingMood: { ko: "긴 그림자 비상등", en: "Long-shadow corridor sconces" } },
    ],
    sfxPool: {
      setup: [{ ko: "윙—…", en: "HUM..." }, { ko: "끼이익", en: "CREAK" }],
      development: [{ ko: "치직…", en: "STATIC..." }, { ko: "똑, 똑", en: "KNOCK..." }],
      turn: [{ ko: "딸깍!", en: "SNAP!" }, { ko: "쿵!", en: "THUMP!" }],
      climax: [{ ko: "삐이이—!", en: "SCREECH!" }, { ko: "쾅!", en: "SLAM!" }],
      cliffhanger: [{ ko: "찰칵…", en: "CLICK..." }],
    },
    actDialogues: {
      setup: [
        { ko: "모니터 날짜 좀 보세요. 내일 새벽 2시예요.", en: "Check the timestamp. It reads 2 AM tomorrow." },
        { ko: "폭설로 통신이 끊겼는데… 저건 분명 저예요.", en: "Lines are dead in the storm... yet that is me." },
      ],
      development: [
        { ko: "관리인님, 지하 서버실 문이 왜 열려 있죠?", en: "Caretaker, why is the archive door unlocked?" },
        { ko: "이 산장에선 시계가 가끔 하루 먼저 가오.", en: "Clocks in this lodge sometimes run a day ahead." },
      ],
      turn: [
        { ko: "잠깐, 영상 속 내 손목엔 시계가 없어!", en: "Wait—my wrist in the footage has no watch!" },
        { ko: "그렇다면 지금 로비에 있는 건 누구죠?", en: "Then who is standing down in the lobby now?" },
      ],
      climax: [
        { ko: "402호 문 뒤에서 발소리가 멈췄어요!", en: "Footsteps just halted outside Room 402!" },
        { ko: "불 끄지 마세요, 녹화본이 다시 돌아갑니다!", en: "Keep lights on—the playback just resumed!" },
      ],
      cliffhanger: [
        { ko: "화면을 확대하자… 카메라엔 현우가 비쳤다.", en: "Zooming in... Hyunwoo held the camera." },
      ],
    },
    beatTitles: {
      setup: { ko: "폭설 고립과 내일 날짜 CCTV 재생", en: "Snowbound Isolation and Future CCTV Tape" },
      development: { ko: "지하 보안실 잠입과 관리인의 경고", en: "Archive Intrusion and Caretaker Warning" },
      turn: { ko: "사라진 손목시계, 조작된 시간의 단서", en: "Missing Wristwatch Exposes the Paradox" },
      climax: { ko: "402호 복도 대치와 실시간 재생", en: "Room 402 Corridor Standoff and Live Feed" },
      cliffhanger: { ko: "프레임 밖 카메라를 든 진짜 공범", en: "The True Accomplice Behind the Lens" },
    },
    hookQuestion: {
      ko: "현우 기자는 언제부터 이 산장에 머물고 있었는가?",
      en: "How long had Reporter Hyunwoo truly been inside the lodge?",
    },
    ost: {
      baseBpm: 76,
      keysByAct: { setup: "D minor", development: "C# minor", turn: "G# minor", climax: "F minor", cliffhanger: "C# minor" },
      calmInstruments: [{ ko: "저음 워터폰", en: "Low Waterphone" }, { ko: "준비된 피아노", en: "Prepared Piano" }, { ko: "테이프 히스", en: "Tape Hiss Drone" }],
      tensionInstruments: [{ ko: "심박 서브 펄스", en: "Heartbeat Sub Pulse" }, { ko: "불협 트레몰로 현악", en: "Dissonant Tremolo Strings" }, { ko: "메탈 스크래치", en: "Metallic Scrape" }],
      climaxInstruments: [{ ko: "불협 브라스 클러스터", en: "Brass Cluster Swell" }, { ko: "신스 라이저", en: "Sub-Bass Riser" }, { ko: "공명 타악 히트", en: "Resonant Stinger Hit" }],
    },
  },
};
