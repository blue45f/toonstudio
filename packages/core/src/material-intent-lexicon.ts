/**
 * 자연어 소재 계획기(material-intent-plan)의 단서 어휘 사전.
 *
 * 이 모듈은 "어떤 낱말이 어느 검색 렌즈를 가리키는가"만 정의한다. 한글→영문 번역어는
 * 새로 만들지 않는다. reference-query-language 의 공개 함수(resolveReferenceQuery)가 이미
 * 아는 낱말은 그 결과를 그대로 쓰고, 그 사전에 없는 낱말(야경·질감·지명 등)만 항목 안에
 * `=영문` 으로 보강한다. 두 사전이 같은 낱말을 다르게 번역하는 일이 없도록 테스트가 고정한다.
 *
 * 순수 데이터 + 빌더다. 네트워크·AI·시간·난수에 의존하지 않는다.
 *
 * 항목 문법 (한 줄 안에서 `|` 로 항목을 나눈다):
 *   표면형[,표면형…][=영문검색어][@축값][#마켓태그][~영문별칭,영문별칭…]
 *   - 첫 표면형이 대표 한글 표기다(칩 이름·마켓·내 라이브러리 키워드로 쓴다).
 *   - `=영문` 을 생략하면 표면형을 앞에서부터 reference-query-language 에 물어 처음 풀린 값을 쓴다.
 *   - `@값` 은 충돌 검사 축(시간·날씨·계절·시대)의 값이다.
 *   - `#태그` 는 마켓에서 확인된 공개 태그(배경·소품·학교·3D)다.
 */
import { resolveReferenceQuery } from "./reference-query-language";

export type MaterialLensId =
  | "3d-material"
  | "reference-art"
  | "photo-archive"
  | "korean-place"
  | "weather-light"
  | "creature"
  | "font"
  | "market-resource"
  | "my-library";

export type MaterialCueKind =
  | "place" | "nature" | "material" | "state" | "texture" | "prop" | "armor" | "costume" | "figure"
  | "art" | "myth" | "creature" | "plant" | "weather" | "time" | "light" | "season" | "era" | "style"
  | "mood" | "heritage" | "city" | "foreign-place" | "historic" | "photo" | "font" | "font-style"
  | "market" | "license" | "three-d" | "library" | "noun";

/** 충돌 검사 축. 같은 축에서 서로 양립하기 어려운 값이 함께 나오면 충돌로 본다. */
export type MaterialCueAxis = "time" | "weather" | "season" | "era" | "market-kind" | "license";

/** packages/contracts 의 CREATOR_MARKETPLACE_RESOURCE_KINDS 와 같은 값이다(웹 쪽에서 대입 가능성으로 고정한다). */
export type MaterialMarketKind =
  | "template" | "asset" | "3d-asset" | "3d-preset" | "brush" | "palette" | "filter";
/** packages/contracts 의 CREATOR_MARKETPLACE_RESOURCE_LICENSES 중 문장으로 가리킬 수 있는 값이다. */
export type MaterialMarketLicense = "cc0-1.0" | "cc-by-4.0" | "cc-by-nc-4.0";

export type MaterialLensWeights = Readonly<Partial<Record<MaterialLensId, number>>>;

export interface MaterialCueConcept {
  /** `종류:대표표면형` 형태의 안정 식별자. */
  readonly id: string;
  readonly kind: MaterialCueKind;
  /** 대표 한글 표기. 칩 이름과 한글 네이티브 제공처 검색어에 쓴다. */
  readonly ko: string;
  /** 영문 인덱스 제공처에 보내는 검색어. */
  readonly term: string;
  /** 이 단서가 각 렌즈를 얼마나 강하게 가리키는지(1~5). 5 는 렌즈 이름을 직접 말한 단서다. */
  readonly feeds: MaterialLensWeights;
  readonly axis?: MaterialCueAxis;
  readonly value?: string;
  readonly marketTag?: string;
  readonly marketKind?: MaterialMarketKind;
  readonly marketLicense?: MaterialMarketLicense;
  /** 분위기처럼 검색어에는 쓰지 않는 보조 단서. */
  readonly neutral?: boolean;
}

interface CategoryDef {
  readonly kind: MaterialCueKind;
  readonly feeds: MaterialLensWeights;
  readonly words: string;
  readonly axis?: MaterialCueAxis;
  readonly tag?: string;
  readonly marketKind?: MaterialMarketKind;
  readonly marketLicense?: MaterialMarketLicense;
  readonly neutral?: boolean;
}

const D3 = "3d-material";
const REF = "reference-art";
const PHOTO = "photo-archive";
const KP = "korean-place";
const WL = "weather-light";
const CRT = "creature";
const FONT = "font";
const MKT = "market-resource";
const LIB = "my-library";

/**
 * 범주별 단서. 같은 표면형은 한 번만 정의한다(중복은 MATERIAL_LEXICON.issues 로 드러나고 테스트가 막는다).
 * 시대 숫자 표현(1980년대·19세기 등)은 사전이 아니라 계획기의 규칙으로 처리한다.
 */
const CATEGORIES: readonly CategoryDef[] = [
  // ── 장면·공간 ────────────────────────────────────────────────────────────
  {
    kind: "place", feeds: { [D3]: 3, [MKT]: 2, [PHOTO]: 1 }, tag: "배경",
    words: "골목,골목길,좁은 골목,뒷골목~alleyway,back alley|거리,길거리,큰길|번화가=busy street|도심=downtown|도시~urban|마을|건물|건축"
      + "|성|궁전|오두막|등대|항구|시장|광장|지하실|옥상,옥탑,옥탑방|온실|병원|카페|식당|호텔|공항"
      + "|도서관|박물관|미술관|극장|교회|절|터널|동굴|실내,인테리어,내부|방|정원|다리|계단|문|창문~windows|지하"
      + "|기차역=train station~railway station|지하철=subway|버스정류장=bus stop|편의점=convenience store"
      + "|아파트=apartment|주차장=parking lot|놀이터=playground|공원=park|운동장=schoolyard|사무실=office"
      + "|부엌=kitchen|침실=bedroom|거실=living room|욕실=bathroom|다락방=attic|창고=warehouse|공장=factory"
      + "|폐허=ruins|폐가=abandoned house|폐건물=abandoned building|감옥=prison|성당|신전,사원|탑|기둥|회랑|천장|분수"
      + "|동양 건축|일본 정원|바닷가|숲속|옥상 정원=rooftop garden|전통시장,재래시장=traditional market"
      + "|체육관=gym|수영장=swimming pool|놀이공원=amusement park|학원=academy|사거리=intersection|횡단보도=crosswalk"
      + "|철길=railroad track|골동품점=antique shop|서점=bookstore|빵집=bakery|노점=street stall"
      + "|창가=window side|장터=marketplace|저잣거리=old market street|주막=tavern|서당=village school|관아=government office|마당=courtyard|처마=eaves"
      + "|집=house|길=road|역=station|비닐하우스=greenhouse|정류장=bus stop|습지=wetland|갯벌=tidal flat|밭=farm field|과수원=orchard|목장=ranch|농장=farm|모스크=mosque|댐=dam"
      + "|상점,가게=shop|마트=supermarket|백화점=department store|은행=bank|우체국=post office|경찰서=police station|소방서=fire station|약국=pharmacy|영화관=cinema"
      + "|공연장=concert hall|경기장=stadium|동물원=zoo|수족관=aquarium|농구장,농구 코트=basketball court|축구장=soccer field|야구장=baseball stadium|응급실=emergency room"
      + "|수술실=operating room|교무실=teachers office|강당=auditorium|도로=road|시골길=country road|산길=mountain trail"
      + "|오솔길=forest path|벚꽃길=cherry blossom path|돌담길=stone wall road|우주정거장=space station|창밖,창 밖=window view",
  },
  {
    kind: "place", feeds: { [D3]: 3, [MKT]: 2, [PHOTO]: 1 }, tag: "학교",
    words: "학교|교실=classroom|복도=hallway|교문=school gate|도서실=school library|급식실=school cafeteria",
  },
  {
    kind: "nature", feeds: { [D3]: 3, [PHOTO]: 1, [REF]: 1, [MKT]: 1 }, tag: "배경",
    words: "숲|산~mountains|바다~ocean|파도|강|호수|연못|늪|폭포|해변|사막|정글|초원|들판|언덕|절벽|계곡|협곡|빙하|섬|화산"
      + "|하늘=sky|구름~cloudy sky|무지개|별|은하|우주|행성|밤하늘|풀|이끼|덩굴|갈대|달"
      + "|설원,눈밭=snowfield|논=rice field|바위=rock|해안=coast|평야=plain|동산=small hill|바다 풍경=seascape"
      + "|땅=ground|불=fire|물=water|얼음=ice|꽃잎=petals|낙엽=fallen leaves|나뭇잎=leaves|뿌리=roots|씨앗=seeds|이슬=dew|먼지=dust|진흙=mud"
      + "|물방울=water drops|거품=bubbles|불꽃=flames|폭발=explosion|열매=fruit",
  },
  // ── 재질·소품 ────────────────────────────────────────────────────────────
  {
    kind: "material", feeds: { [D3]: 3, [MKT]: 1 },
    words: "나무 질감,나무질감,나무 텍스처,나무결=wood~wood texture|벽돌|콘크리트|대리석|타일|원목,목재,우드=wood~wooden|통나무|판자=planks~plank"
      + "|돌|흙|모래|자갈=gravel|금속=metal|철,쇠=iron~steel|가죽|천=fabric|직물|유리|종이|플라스틱=plastic|고무=rubber|아스팔트=asphalt"
      + "|잔디=lawn|벽=wall|바닥=floor|지붕=roof|담벼락,담장=fence wall|벽지=wallpaper|카펫=carpet|연기"
      + "|돌바닥=stone floor|나무 바닥=wood floor|철문=iron door|기와",
  },
  {
    kind: "state", feeds: { [D3]: 2 },
    words: "낡은,오래된,허름한=worn|녹슨,녹=rusty|깨진=broken|젖은=wet|이끼 낀=mossy|금이 간=cracked|먼지 쌓인=dusty|그을린=charred",
  },
  {
    kind: "texture", feeds: { [D3]: 2 },
    words: "질감,텍스처,재질=texture~textures,material,pbr",
  },
  {
    kind: "prop", feeds: { [D3]: 3, [REF]: 2, [MKT]: 2 }, tag: "소품",
    words: "의자|탁자,테이블=table|책상|침대|거울|등불|촛대|책|그릇|항아리|꽃병|주전자|잔,컵=cup|부채|악기"
      + "|램프,조명등=lamp|양초|촛불|횃불|지도|나침반|열쇠|자물쇠|상자|병|접시|우산|가면|인형|피아노|바이올린|기타=guitar"
      + "|종|시계|조각상|깃발|돛|닻|바퀴|마차|보석|가구|소파=sofa|자전거=bicycle|자동차=car~automobile|오토바이=motorcycle"
      + "|가로등=street lamp|우체통=mailbox|자판기=vending machine|신호등=traffic light|간판=signboard|화분=flower pot"
      + "|선풍기=electric fan|전화기=telephone|카메라=camera|도자기|돛단배|배|기차|수레=cart|항아리 뚜껑=jar lid"
      + "|칠판=blackboard|노트북=laptop|스마트폰,핸드폰,휴대폰=smartphone|커피잔=coffee cup|파라솔=parasol|장작=firewood"
      + "|형광등=fluorescent lamp|좌석=seat|비행기=airplane|우주선=spaceship|로봇=robot|컴퓨터=computer|텔레비전=television"
      + "|냉장고=refrigerator|농구공=basketball|축구공=soccer ball"
      + "|책장=bookshelf|서랍=drawer|옷장=wardrobe|신발장=shoe rack|이불=blanket|베개=pillow|커튼=curtain|달력=calendar|액자=picture frame"
      + "|전등=ceiling light|스탠드=desk lamp|에어컨=air conditioner|세탁기=washing machine|전자레인지=microwave oven|가스레인지=gas stove"
      + "|싱크대=kitchen sink|욕조=bathtub|변기=toilet|샤워기=shower head|세면대=washbasin"
      + "|버스=bus|택시=taxi|트럭=truck|헬기,헬리콥터=helicopter|열차=train|전봇대=utility pole|맨홀=manhole|표지판=road sign|벤치=bench"
      + "|쓰레기통=trash can|공중전화=public telephone|연필=pencil|펜=pen|지우개=eraser|공책=notebook|교과서=textbook|분필=chalk"
      + "|책가방=school bag|도시락=lunch box|사물함=locker|철봉=horizontal bar|그네=swing|미끄럼틀=slide|지팡이=walking cane|마법봉=magic wand"
      + "|두루마리=scroll|보물=treasure|금화=gold coin|풍선=balloon|선물=gift|편지=letter|폭탄=bomb"
      + "|음식=food|밥=rice|김치=kimchi|라면=ramen|빵=bread|케이크=cake|커피=coffee|맥주=beer|와인=wine|우유=milk|물병=water bottle"
      + "|과일=fruit|채소=vegetables|사과=apple|포도=grapes|수박=watermelon|귤=mandarin",
  },
  {
    kind: "armor", feeds: { [REF]: 3, [D3]: 2, [MKT]: 1 },
    words: "갑옷,갑주|중세 갑옷|서양 갑옷|투구|검,칼|방패|활|화살|총|대포|무기|창=spear|도끼=axe|단검=dagger",
  },
  // ── 복식·인물·미술 ────────────────────────────────────────────────────────
  {
    kind: "costume", feeds: { [REF]: 3, [PHOTO]: 1 },
    words: "한복,한복 입은|저고리|치마|바지|두루마기|도포|기모노|드레스|의상,복식|옷|전통 의상|한국 전통 의상"
      + "|교복=school uniform|군복=military uniform|정장=suit|모자|신발|장신구|목걸이|왕관|귀걸이|반지|비녀|망토|목도리|장갑|부츠"
      + "|갓=gat hat|댕기=daenggi hair ribbon"
      + "|가방=bag|배낭=backpack|지갑=wallet|안경=glasses|선글라스=sunglasses|양말=socks|운동화=sneakers|구두=dress shoes|슬리퍼=slippers"
      + "|셔츠=shirt|티셔츠=t-shirt|패딩=padded jacket|수영복=swimsuit|잠옷=pajamas|앞치마=apron",
  },
  {
    kind: "figure", feeds: { [REF]: 2, [MKT]: 1 },
    words: "인물|캐릭터=figure|소녀=girl|소년=boy|학생=student|군인=soldier|무사=warrior|마법사=wizard|왕=king|공주=princess"
      + "|선비=scholar|상인=merchant|농부=farmer|어부=fisherman|할머니=grandmother|할아버지=grandfather|아기=baby"
      + "|기사=knight|용사=hero|왕자=prince|여왕=queen|해적=pirate|닌자=ninja|사무라이=samurai|검객=swordsman|궁수=archer|도적=thief"
      + "|스님=monk|도사=Taoist sage",
  },
  {
    kind: "figure", feeds: { [REF]: 3, [MKT]: 1 },
    words: "포즈,자세|초상화|얼굴|손|두 손|손 포즈|손가락|인체|해부학|근육|동세|옆모습|뒷모습|전신"
      + "|춤|달리는 사람|걷는 사람|앉은 자세|누운 자세|인물 눈|눈동자|눈썹|입술|머리카락|옷 주름,천 주름"
      + "|아이=child|노인=elderly person|여인,여자=woman|남자=man|군중=crowd",
  },
  {
    kind: "figure", feeds: { [REF]: 3, [MKT]: 1 },
    words: "달리는,뛰는,달려가는=running|걷는=walking|점프하는,뛰어오르는=jumping|싸우는=fighting|춤추는=dancing"
      + "|무릎 꿇은,무릎꿇은=kneeling|앉아 있는,앉아있는,앉은=sitting|서 있는,서있는=standing|누워 있는,누워있는,누운=lying down"
      + "|웅크린=crouching|뒤돌아보는=looking back|팔짱 낀=arms crossed",
  },
  {
    kind: "art", feeds: { [REF]: 3 },
    words: "회화,그림|선화,드로잉|일러스트=illustration|스케치=sketch|수채화|유화|판화|조각|수묵화|민화|백자|청자|분청사기|문양,패턴|장식|자수"
      + "|병풍=folding screen|서예=calligraphy|불화=Buddhist painting|풍속화=genre painting|산수화=landscape painting"
      + "|도예=pottery|공예=craft",
  },
  {
    kind: "myth", feeds: { [REF]: 3 },
    words: "용|도깨비=goblin|봉황=phoenix|해태=haetae|유니콘=unicorn|요괴=yokai|귀신,유령=ghost|천사=angel|악마=demon"
      + "|괴물=monster|좀비=zombie|뱀파이어=vampire|늑대인간=werewolf|마녀=witch|외계인=alien",
  },
  // ── 생물·식물 ────────────────────────────────────────────────────────────
  {
    kind: "creature", feeds: { [CRT]: 3, [REF]: 1 },
    words: "고양이|강아지,개|새|말|호랑이|나비|여우|늑대|사자|곰|토끼|사슴|돼지|소|양|염소|닭|오리|독수리|부엉이,올빼미|까마귀|갈매기"
      + "|벌|개미|거미|뱀|개구리|물고기|상어|고래|돌고래|문어|해파리|원숭이=monkey|코끼리=elephant|기린=giraffe|판다=panda"
      + "|펭귄=penguin|참새=sparrow|비둘기=pigeon|잠자리=dragonfly|사마귀=mantis|반딧불이=firefly|두루미,학=crane"
      + "|거북이=turtle|악어=crocodile|박쥐=bat|다람쥐=squirrel|고슴도치=hedgehog|수달=otter|표범=leopard|치타=cheetah"
      + "|하마=hippopotamus|낙타=camel|앵무새=parrot|공작=peacock|백조=swan|금붕어=goldfish|잉어=carp|오징어=squid|게=crab"
      + "|새우=shrimp|붉은여우=red fox|금빛독수리=golden eagle|곤충=insect|모기=mosquito|바퀴벌레=cockroach",
  },
  {
    kind: "plant", feeds: { [CRT]: 1, [D3]: 3, [REF]: 1, [MKT]: 1 }, tag: "배경",
    words: "꽃|나무|장미|튤립|해바라기|단풍|은행나무|벚꽃|대나무|소나무|연꽃|코스모스=cosmos|국화=chrysanthemum|매화=plum blossom"
      + "|동백=camellia|선인장=cactus|버섯=mushroom|야자수=palm tree|억새=silver grass|꽃밭=flower field",
  },
  // ── 날씨·시간·빛 ─────────────────────────────────────────────────────────
  {
    kind: "weather", feeds: { [WL]: 2, [D3]: 1 }, axis: "weather",
    words: "비,비 오는,비오는,비가 오는,비 내리는,비내리는,비 오는 날,빗속,빗물@rain~rain,rainy,raining"
      + "|소나기,장마,폭우,이슬비=heavy rain@rain|눈,눈 오는,눈오는,눈 내리는,눈내리는,눈 오는 날,폭설,함박눈@snow~snow,snowy,snowing"
      + "|눈보라@snow|서리@snow|안개,안개 낀,안개낀,짙은 안개@fog~fog,foggy,misty,mist"
      + "|흐린,흐림,흐린 날,구름 낀=overcast@overcast~overcast,cloudy|맑은,맑음,화창한,화창,맑은 날=clear sky@clear~sunny,clear"
      + "|바람,바람 부는=wind@wind~windy|태풍,폭풍=storm@storm~storm,stormy|번개@storm|천둥@storm|홍수@storm",
  },
  {
    kind: "time", feeds: { [WL]: 2, [D3]: 2 }, axis: "time",
    words: "밤,한밤,한밤중,심야,야간,늦은 밤,밤거리,달밤@night~night,nighttime|야경,야간 풍경=night@night~night view,nightscape"
      + "|낮,한낮,대낮,낮시간,오후=daytime@day~day,afternoon|정오=noon@day"
      + "|새벽,동틀 녘,이른 아침@dawn~dawn,sunrise|일출,해돋이@dawn|아침=morning@dawn"
      + "|노을,노을 지는@dusk~sunset glow|일몰,해질녘,해 질 녘,해 질 무렵,석양@dusk~sunset|황혼@dusk~dusk|저녁=evening@dusk",
  },
  {
    kind: "light", feeds: { [WL]: 3, [D3]: 2 },
    words: "빛=light|조명=lighting|역광=backlight|그림자|어둠,어두운|달빛|햇빛,햇살|네온=neon|스포트라이트=spotlight"
      + "|실루엣=silhouette|빛줄기=light rays|태양=sun|골든아워=golden hour|블루아워=blue hour|스튜디오 조명=studio light|숲속 빛=forest light",
  },
  {
    kind: "season", feeds: { [WL]: 1, [D3]: 1 }, axis: "season",
    words: "봄=spring@spring~spring|여름=summer@summer~summer|가을=autumn@autumn~autumn,fall|겨울=winter@winter~winter",
  },
  // ── 시대 ────────────────────────────────────────────────────────────────
  {
    kind: "era", feeds: { [REF]: 3, [KP]: 2, [PHOTO]: 1 }, axis: "era",
    words: "조선,조선시대,조선 시대@joseon|고려,고려시대=Goryeo@goryeo~goryeo"
      + "|삼국시대=Three Kingdoms@three-kingdoms|신라=Silla@silla~silla|백제=Baekje@baekje~baekje|고구려=Goguryeo@goguryeo~goguryeo"
      + "|가야=Gaya@gaya~gaya",
  },
  {
    kind: "era", feeds: { [PHOTO]: 3, [REF]: 2, [KP]: 1 }, axis: "era",
    words: "대한제국=Korean Empire@korean-empire|일제강점기=Korea under Japanese rule@colonial-korea"
      + "|한국전쟁,6.25,육이오=Korean War@korean-war|개화기=late Joseon@gaehwa",
  },
  {
    kind: "era", feeds: { [REF]: 3, [PHOTO]: 1 }, axis: "era",
    words: "고대=ancient@ancient~ancient|중세,중세시대@medieval~medieval|르네상스@renaissance~renaissance"
      + "|바로크@baroque~baroque|로코코@rococo~rococo|빅토리아,빅토리아 시대@victorian~victorian"
      + "|에도,에도시대=Edo@edo~edo|메이지=Meiji@meiji~meiji|쇼와=Showa@showa~showa|다이쇼=Taisho@taisho~taisho"
      + "|헤이안=Heian@heian~heian|전국시대=Sengoku period@sengoku|당나라=Tang dynasty@tang|송나라=Song dynasty@song"
      + "|명나라=Ming dynasty@ming|청나라=Qing dynasty@qing|이집트@egypt|그리스@greece|로마@rome"
      + "|근대=early modern period@modern|현대=contemporary@contemporary",
  },
  // ── 스타일·분위기 ────────────────────────────────────────────────────────
  {
    kind: "style", feeds: { [REF]: 2, [D3]: 1, [PHOTO]: 1 },
    words: "고딕|아르누보|아르데코|모던|레트로|빈티지|사이버펑크|스팀펑크|판타지|공포|미니멀|미래,미래적인~future"
      + "|동양풍=Asian style|서양풍=Western style|일본풍=Japanese style|중국풍=Chinese style|한국풍=Korean style|클래식=classic"
      + "|전통|전쟁|전투|축제|결혼식|연회장|무도회",
  },
  {
    kind: "mood", feeds: {}, neutral: true,
    words: "아늑한|신비로운|음산한|웅장한|평화로운|화려한|몽환적인|고요한|쓸쓸한=lonely|따뜻한=warm|차가운=cold|로맨틱한=romantic"
      + "|긴장감 있는=tense|줄무늬|체크무늬|꽃무늬|기하학|추상"
      + "|귀여운=cute|아기자기한=cozy and cute|오싹한=chilling|으스스한=eerie|포근한=snug|청량한=refreshing|상쾌한=fresh|우울한=gloomy mood|감성적인=sentimental",
  },
  // ── 지역·장소 이름 ───────────────────────────────────────────────────────
  {
    kind: "heritage", feeds: { [KP]: 3, [REF]: 1, [PHOTO]: 1 },
    words: "궁궐,궁|한옥~hanok|한옥마을=hanok village|사찰=Buddhist temple|서원=seowon academy|향교=hyanggyo|성곽=fortress wall"
      + "|산성=mountain fortress|고분=tumulus|초가집,초가=thatched house|기와집=tile-roofed house|정자=pavilion|돌담=stone wall"
      + "|장독대=jar terrace|장승=jangseung|석탑=stone pagoda|불상=Buddha statue|경복궁=Gyeongbokgung|창덕궁=Changdeokgung"
      + "|창경궁=Changgyeonggung|덕수궁=Deoksugung|종묘=Jongmyo|불국사=Bulguksa|석굴암=Seokguram|수원화성=Hwaseong Fortress"
      + "|해인사=Haeinsa|첨성대=Cheomseongdae|남한산성=Namhansanseong|하회마을=Hahoe Village|광화문=Gwanghwamun"
      + "|숭례문,남대문=Sungnyemun|동대문=Dongdaemun|북촌=Bukchon|서촌=Seochon|인사동=Insadong|익선동=Ikseon-dong",
  },
  {
    kind: "city", feeds: { [KP]: 3, [PHOTO]: 2 },
    words: "서울=Seoul|부산=Busan|인천=Incheon|대구=Daegu|대전=Daejeon|광주=Gwangju|울산=Ulsan|제주,제주도=Jeju|경주=Gyeongju"
      + "|전주=Jeonju|강릉=Gangneung|속초=Sokcho|수원=Suwon|여수=Yeosu|안동=Andong|춘천=Chuncheon|목포=Mokpo|통영=Tongyeong"
      + "|군산=Gunsan|성수동=Seongsu-dong|홍대=Hongdae|이태원=Itaewon|강남=Gangnam|명동=Myeongdong|종로=Jongno"
      + "|한강=Han River|청계천=Cheonggyecheon|남산=Namsan|여의도=Yeouido|잠실=Jamsil|신촌=Sinchon|연남동=Yeonnam-dong"
      + "|을지로=Euljiro|세운상가=Sewoon Sangga|한국|대한민국=South Korea"
      + "|해운대=Haeundae|광안리=Gwangalli|경성=Gyeongseong|북한산=Bukhansan|설악산=Seoraksan|한라산=Hallasan|독도=Dokdo|남이섬=Nami Island",
  },
  {
    kind: "foreign-place", feeds: { [PHOTO]: 2, [REF]: 1 },
    words: "도쿄=Tokyo|오키나와=Okinawa|런던=London|파리=Paris|뉴욕=New York|오사카=Osaka|교토=Kyoto|일본|중국|유럽|미국=United States"
      + "|영국=England|프랑스=France|독일=Germany|이탈리아=Italy|베이징=Beijing|상하이=Shanghai",
  },
  // ── 명시 단서: 사진·기록 ─────────────────────────────────────────────────
  {
    kind: "photo", feeds: { [PHOTO]: 5 },
    words: "사진,사진첩,옛날 사진,옛 사진~photo,photographs,photography,photos|흑백,흑백 사진=black and white photograph",
  },
  {
    kind: "historic", feeds: { [PHOTO]: 3, [REF]: 1 },
    words: "기록,기록물,사료,아카이브=archive~archives|옛날,옛,옛 모습,옛날 모습,과거=historic~historical|역사,역사적=history"
      + "|신문=newspaper|엽서=postcard|포스터=poster|고지도=antique map|잡지=magazine|광고=advertisement|삽화=illustration",
  },
  // ── 명시 단서: 폰트 ──────────────────────────────────────────────────────
  {
    kind: "font", feeds: { [FONT]: 5 },
    words: "폰트,글꼴,서체,글자체=font~fonts,typeface|레터링,말풍선 글씨,대사 글씨,제목 글씨,로고 글씨=lettering|캘리그라피=calligraphy"
      + "|타이포,타이포그래피=typography",
  },
  {
    kind: "font-style", feeds: { [FONT]: 4 },
    words: "고딕체,산세리프=sans-serif@sans-serif~sans-serif,sans serif|명조체,명조,세리프=serif@serif~serif"
      + "|손글씨,필기체,손글씨체,붓글씨,붓글씨체,궁서체=handwriting@handwriting~handwriting,handwritten"
      + "|장식체,디스플레이체=display@display~display|고정폭=monospace@monospace~monospace",
  },
  // ── 명시 단서: 마켓 ──────────────────────────────────────────────────────
  {
    kind: "market", feeds: { [MKT]: 5 }, marketKind: "template", axis: "market-kind",
    words: "템플릿,탬플릿,컷 구성,콘티 템플릿=template~templates",
  },
  {
    kind: "market", feeds: { [MKT]: 5 }, marketKind: "brush", axis: "market-kind",
    words: "브러시,붓,지펜,G펜,펜촉=brush~brushes",
  },
  {
    kind: "market", feeds: { [MKT]: 5 }, marketKind: "palette", axis: "market-kind",
    words: "팔레트,색 조합,색감,컬러 팔레트=palette~color palette",
  },
  {
    kind: "market", feeds: { [MKT]: 5 }, marketKind: "filter", axis: "market-kind",
    words: "필터,보정,색보정,이펙트,효과=filter~filters,effect",
  },
  {
    kind: "market", feeds: { [MKT]: 5, [D3]: 2 }, marketKind: "3d-preset", axis: "market-kind",
    words: "프리셋,3D 프리셋,카메라 프리셋=preset~presets",
  },
  {
    kind: "market", feeds: { [MKT]: 5 }, marketKind: "asset", axis: "market-kind",
    words: "스티커,2D 에셋,2d 에셋,배경 이미지,배경 소스=sticker~2d asset",
  },
  {
    kind: "market", feeds: { [MKT]: 3 }, tag: "소품",
    words: "소품,소품들=props~prop",
  },
  {
    kind: "market", feeds: { [MKT]: 4 },
    words: "에셋,리소스,마켓,스토어,마켓에서=asset~assets,resource,resources,market place",
  },
  {
    kind: "market", feeds: { [MKT]: 4 }, tag: "배경",
    words: "배경,배경으로,배경용~background,backgrounds",
  },
  // ── 명시 단서: 라이선스 ──────────────────────────────────────────────────
  {
    kind: "license", feeds: { [MKT]: 3 }, marketLicense: "cc0-1.0", axis: "license",
    words: "CC0,씨씨제로,퍼블릭 도메인,공개 도메인,저작권 없는,저작권 걱정 없는,저작권 프리,로열티 프리=cc0~public domain,copyright free,royalty free",
  },
  {
    kind: "license", feeds: { [MKT]: 3 }, marketLicense: "cc-by-4.0", axis: "license",
    words: "CC BY,CC-BY,출처 표시,저작자 표시=cc by~cc-by,attribution",
  },
  {
    kind: "license", feeds: { [MKT]: 3 }, marketLicense: "cc-by-nc-4.0", axis: "license",
    words: "CC BY-NC,CC-BY-NC,CC BY NC,비상업=cc by-nc~cc-by-nc,non-commercial,noncommercial",
  },
  // ── 명시 단서: 3D · 내 라이브러리 ────────────────────────────────────────
  {
    kind: "three-d", feeds: { [D3]: 4, [MKT]: 3 }, marketKind: "3d-asset", tag: "3D", axis: "market-kind",
    words: "3D,3D 모델,3D 에셋,3D 소품,3D 배경,입체=3d model~3d,3d models",
  },
  {
    kind: "library", feeds: { [LIB]: 5 },
    words: "내 소재,내소재,내 자료,내 에셋,내 라이브러리,내 보드,내 리소스,내 브러시,내 템플릿,내가 만든,내가 저장한,내가 구매한"
      + ",저장한,구매한,보유한,가지고 있는,이미 있는,다운로드한,설치한,찜한,즐겨찾기한=my library",
  },
];

/** 날씨·빛 예보를 지원하는 도시. 서버 met-weather-provider 의 PLACES 표와 같은 키다. */
export const MATERIAL_WEATHER_CITIES: readonly string[] = Object.freeze([
  "서울", "부산", "제주", "도쿄", "오키나와", "런던", "파리", "뉴욕",
]);

/** 의미를 더하지 않는 기능어. 미지원 낱말(unresolved)로 올리지 않는다. */
const FUNCTIONAL_WORDS: ReadonlySet<string> = new Set((
  "찾아줘 찾아줘요 찾아주세요 찾아 찾아봐 찾아봐줘 찾고 찾기 찾는 찾을 검색 검색해줘 보여줘 보여주세요 알려줘 알려주세요 추천 추천해줘 추천해주세요"
  + " 필요 필요해 필요해요 필요한 원해 원해요 원하는 원합니다 싶어 싶어요 싶은 싶다 주세요 줘 줘요 해줘 해주세요 해요 하고 하는 한 할 해"
  + " 되는 되어 있는 있어 있어요 있는데 없는 없이 같은 같이 처럼 느낌 느낌의 분위기 스타일 풍 풍의 장면 장면에 장면의 컷 씬 이미지 자료 참고 참고용"
  + " 레퍼런스 용 용도 위한 위해 대한 관련 정도 약간 조금 좀 아주 매우 많이 너무 그리고 또는 혹은 및 와 과 랑 이랑 에 에서 으로 로 의 가 이 은 는 을 를 도 만"
  + " 그냥 그런 이런 저런 어떤 무슨 하나 두 세 네 다섯 여러 몇 입은 입고 입는 쓴 쓰는 든 들고 앉아 앉은 서 서있는 서 있는 오는 내리는 나오는 나는"
  + " 초기 전기 중기 후기 말기 초 중반 말 후반 마리 명 개의 정말 진짜 가장 제일 다른 새로운 멋진 예쁜 좋은 큰 작은 많은 어느 모든 각 위에 아래 앞 뒤 옆 속 안 밖"
  + " 감성 웹툰 만화 풍경 소재 사용 만들기 만들고 만든 만들어진 그리기 그릴 그리고 싶은 쓰고 쓸 위주 중심 하기 하게 해서 에서의 으로의 에서는 이미지의 사진의"
).split(/\s+/u).filter(Boolean));

const ENGLISH_STOP_WORDS: ReadonlySet<string> = new Set(
  "the a an of in on at and with for to by near from style scene image looking find show me some any is are".split(" "),
);

export function isMaterialFunctionalWord(token: string): boolean {
  return FUNCTIONAL_WORDS.has(token);
}

export function isMaterialEnglishStopWord(token: string): boolean {
  return ENGLISH_STOP_WORDS.has(token);
}

/** reference-query-language 가 한 항목으로 통째로 푼 낱말만 영문으로 돌려준다(쪼개져 풀린 결과는 쓰지 않는다). */
function dictionaryTerm(word: string): string | undefined {
  const resolved = resolveReferenceQuery(word);
  if (resolved.status !== "translated" || resolved.matched.length !== 1) return undefined;
  return resolved.providerQuery;
}

export interface MaterialLexicon {
  readonly concepts: readonly MaterialCueConcept[];
  /** 소문자 한글/영문 표면형(공백 포함) → 단서 */
  readonly bySurface: ReadonlyMap<string, MaterialCueConcept>;
  /** 공백을 뺀 표면형 → 단서 (띄어쓰기 없이 입력한 경우) */
  readonly byCompact: ReadonlyMap<string, MaterialCueConcept>;
  /** 소문자 영문 검색어·별칭 → 단서 */
  readonly byEnglish: ReadonlyMap<string, MaterialCueConcept>;
  /** 사전 구성 중 생긴 문제(번역어 누락·표면형 중복). 비어 있어야 정상이다. */
  readonly issues: readonly string[];
}

/**
 * 항목 문법 `표면형[,표면형…][=영문][@축값][#태그][~영문별칭]` 해석.
 * 이름 붙인 캡처 그룹은 웹 앱 타입 검사 대상(ES2017)에서 쓸 수 없어 번호 그룹을 쓴다:
 * 1 표면형 · 2 영문 · 3 축값 · 4 태그 · 5 영문 별칭
 */
const ENTRY_PATTERN = /^([^=@#~]+?)(?:=([^@#~]+))?(?:@([^#~]+))?(?:#([^~]+))?(?:~(.+))?$/u;

/** 일치하지 않은 선택 그룹은 런타임에 undefined 이므로 타입도 그렇게 좁혀 읽는다. */
function entryGroup(match: RegExpExecArray | null, index: number): string | undefined {
  const value: string | undefined = match?.[index];
  return value;
}

function buildLexicon(): MaterialLexicon {
  const concepts: MaterialCueConcept[] = [];
  const bySurface = new Map<string, MaterialCueConcept>();
  const byCompact = new Map<string, MaterialCueConcept>();
  const byEnglish = new Map<string, MaterialCueConcept>();
  const issues: string[] = [];

  for (const category of CATEGORIES) {
    for (const rawEntry of category.words.split("|")) {
      const entry = rawEntry.trim();
      if (!entry) continue;
      const match = ENTRY_PATTERN.exec(entry);
      const surfaces = entryGroup(match, 1)?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
      const canonical = surfaces[0];
      if (!match || !canonical) {
        issues.push(`항목을 해석하지 못함: ${entry}`);
        continue;
      }
      const explicitTerm = entryGroup(match, 2)?.trim();
      const term = explicitTerm || surfaces.map(dictionaryTerm).find((value) => Boolean(value)) || "";
      if (!term) {
        issues.push(`영문 검색어 없음: ${canonical}`);
        continue;
      }
      const value = entryGroup(match, 3)?.trim();
      const tag = entryGroup(match, 4)?.trim() ?? category.tag;
      const axisValue = value ?? category.marketKind ?? category.marketLicense;
      const concept: MaterialCueConcept = {
        id: `${category.kind}:${canonical}`,
        kind: category.kind,
        ko: canonical,
        term,
        feeds: category.feeds,
        ...(category.axis && axisValue ? { axis: category.axis, value: axisValue } : {}),
        ...(tag ? { marketTag: tag } : {}),
        ...(category.marketKind ? { marketKind: category.marketKind } : {}),
        ...(category.marketLicense ? { marketLicense: category.marketLicense } : {}),
        ...(category.neutral ? { neutral: true } : {}),
      };
      concepts.push(concept);
      for (const surface of surfaces) {
        const key = surface.toLowerCase();
        const previous = bySurface.get(key);
        if (previous && previous.id !== concept.id) issues.push(`표면형 중복: ${surface} (${previous.id} / ${concept.id})`);
        else if (!previous) bySurface.set(key, concept);
        const compact = key.replace(/\s+/gu, "");
        if (compact !== key && !byCompact.has(compact)) byCompact.set(compact, concept);
      }
      const english = [term, ...(entryGroup(match, 5)?.split(",") ?? [])]
        .map((alias) => alias.trim().toLowerCase())
        .filter(Boolean);
      for (const alias of english) if (!byEnglish.has(alias)) byEnglish.set(alias, concept);
    }
  }
  return { concepts, bySurface, byCompact, byEnglish, issues };
}

export const MATERIAL_LEXICON: MaterialLexicon = buildLexicon();

/**
 * 이 사전에 없지만 reference-query-language 가 아는 낱말(예: 비녀·토끼 …)을 일반 명사 단서로 올린다.
 * 번역어는 그 사전의 것을 그대로 쓴다.
 */
export function genericDictionaryConcept(word: string): MaterialCueConcept | null {
  const term = dictionaryTerm(word);
  if (!term) return null;
  return {
    id: `noun:${word}`,
    kind: "noun",
    ko: word,
    term,
    feeds: { [REF]: 1, [D3]: 1 },
  };
}
