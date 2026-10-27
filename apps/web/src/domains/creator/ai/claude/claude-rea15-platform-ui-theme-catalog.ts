import { REA39_WAVE23_PLATFORM_UI_THEMES } from "./claude-rea39-wave23-platform-themes";

/* ============================================================================
 * 0. 65대 웹툰·스토리보드·3D·드로잉·번역·채색·LoRA/ControlNet·캐릭터메이커·오디오 AI 보조 플랫폼 REA 정본 카탈로그 및 UI/UX 디자인 토큰 스키마
 *    (하위 호환을 위해 REA15_*, REA39_*, REA50_*, REA65_* 식별자를 동시에 노출합니다)
 * ============================================================================ */

export const REA15_PLATFORM_IDS = [
  // Wave 1 (15개 플랫폼)
  "glimnavi", "snaptoon", "kaistory", "ggooming", "plask-motion",
  "manhwa-ai", "komiko-ai", "anifusion", "katalist-ai", "novelai",
  "mootion", "skyreels", "frameo", "naver-webtoon-shaper", "posemaniacs",
  // Wave 2 (12개 플랫폼)
  "llamagen", "dashtoon", "ltx-studio", "boords", "magic-poser", "posemy-art",
  "cascadeur", "krea", "leonardo-ai", "gentoon", "tootoon", "tooning-plus",
  // Wave 3 (12개 플랫폼)
  "enkava", "jitter", "lumiere-graphics", "graphite-editor", "pixieditor", "spline",
  "rive", "medibang-paint", "ibispaint", "clip-studio-paint", "acon3d", "webtoon-canvas",
  // Wave 4 (11개 플랫폼)
  "comicai", "ai-comic-factory", "wonderunit-storyboarder", "storyboardthat", "cotrans-manga-translator",
  "vroid-studio", "blockade-skybox-ai", "krita", "procreate-dreams", "pixiv-sketch", "artbreeder",
  // Wave 5 (15개 플랫폼 — 총 65개 플랫폼 완성)
  "nijijourney", "civitai", "tensor-art", "seaart-ai", "pixai-art",
  "moescape-ai", "waifulabs", "charat-me", "heroforge", "tripo3d",
  "meshy-ai", "suno-ai", "elevenlabs", "manga-plus-creators", "picrew-me",
  // Wave 6 (15개 플랫폼 — 총 80개 플랫폼 완성)
  "sketchup-3d-warehouse", "petalica-paint", "comicsmaker-ai", "runwayml", "luma-dream-machine",
  "pika-art", "live2d-cubism", "spine-2d", "blender-grease-pencil", "magma-studio",
  "cara-app", "openart-ai", "playground-ai", "recraft-ai", "viggle-ai",
  // Wave 7 (20개 플랫폼 — 총 100개 플랫폼 완성)
  "tapas-io", "tappytoon", "ridibooks-webtoon", "postype", "mixamo",
  "marvelous-designer", "substance-3d", "coolors", "adobe-color", "noonnu-font",
  "blambot-fonts", "sudowrite", "novelcrafter", "campfire-writing", "milanote",
  "pureref", "toon-boom-harmony", "tvpaint-animation", "moho-animation", "eagle-cool",
  // Wave 8 (20개 플랫폼 — 총 120개 플랫폼 완성)
  "naver-webtoon-ai-painter", "lezhin-comics-studio", "kakao-webtoon-alive", "pocket-comics-comico", "bilibili-comics",
  "comixology-guided-view", "clipdrop-relight-uncrop", "magnific-ai-relight", "photoroom-matting", "ideogram-v3-typography",
  "midjourney-web-editor", "comfyui-ipadapter-controlnet", "invokeai-unified-canvas", "procreate-5-3-ipad", "paint-tool-sai-v2",
  "rebelle-7-nanopixel", "heavy-paint-color-block", "zbrush-npr-matcap", "daz3d-genesis9-figure", "nomad-sculpt-webtoon",
  // Wave 9 (20개 플랫폼 — 총 140개 플랫폼 완성)
  "kuaikan-manhua-studio", "piccoma-smartoon-studio", "line-manga-indies", "mrblue-webtoon-studio", "bomtoon-kidari-studio",
  "toomics-global-studio", "manta-comics-studio", "qimao-free-comic", "tencent-ac-qq-comic", "pixiv-comic-indie",
  "artstation-3d-marketplace", "sketchfab-3d-webtoon", "polycam-3d-lidar-room", "luma-genie-3d-prop", "csm-3d-cube-ai",
  "kaedim-3d-asset", "scenario-gg-game-art", "layer-ai-2d-spine", "dashtoon-character-lora", "glaze-nightshade-shield",
  // Wave 10 (20개 플랫폼 — 총 160개 플랫폼 완성)
  "jaedam-media-webtoon", "dccent-noblesse-studio", "redice-studio-action", "ylab-superstring-studio", "kenaz-webtoon-house",
  "daon-creative-studio", "toyou-dream-webtoon", "celsys-clipstudio-assets", "carapace-3d-perspective", "lazy-nezumi-pro-ruler",
  "designdoll-terawell-3d", "easy-pose-madcat-mobile", "handy-art-reference-tool", "mara-3d-facial-rig", "style2paints-v45-color",
  "manga-whisperer-balloons", "typecast-neopience-voice", "supertone-play-webtoon", "fliki-ai-webtoon-reels", "capcut-comic-reels-studio",
  // Wave 11 (20개 플랫폼 — 총 180개 플랫폼 완성)
  "flux-1-kontext-character", "sd-forge-controlnet-layer", "fooocus-inpaint-engine", "krita-ai-diffusion-aclysia", "photoshop-firefly-generative",
  "illustrator-vector-speech-sfx", "affinity-designer-v2-vector", "corel-painter-2025-thick", "artrage-vitae-impasto", "open-toonz-gts-scan",
  "tahoma2d-stopmotion-toon", "synfig-studio-vector-tween", "wick-editor-interactive-toon", "fable-prism-motion-ai", "haiper-ai-video-keyframe",
  "kling-ai-motion-brush", "minimax-hailuo-director", "sora-storyboard-timeline", "veo-3-cinematic-audio-cut", "higgsfield-diffuse-camera",
  // Wave 12 (20개 플랫폼 — 총 200개 플랫폼 완성)
  "world-anvil-chronicle", "legendkeeper-atlas-wiki", "fantasia-archive-lore", "obsidian-canvas-story-graph", "scrivener-3-corkboard",
  "final-draft-13-beatboard", "arc-studio-pro-plotline", "causality-story-sequencer", "twinmotion-unreal-toon", "d5-render-ai-atmosphere",
  "lumion-2025-stylized-arch", "enscape-orthographic-plan", "blender-beer-malt-npr", "goo-engine-dillongoo-anime", "vroid-hub-pose-cloud",
  "booth-pm-webtoon-3d-assets", "clip-studio-modeler-3d", "sandoll-cloud-webtoon-font", "rixfont-comic-sfx-type", "paletton-color-scheme-lab",
  // Wave 13 (20개 플랫폼 — 총 220개 플랫폼 완성)
  "webtoon-factory-dupuis", "delitoon-france-studio", "verytoon-editions-delcourt", "izneo-bd-eu-player", "mangamo-subscription-reader",
  "azuki-digital-manga", "globalcomix-creator-hub", "inkr-comics-localization", "bato-v4-panel-inspector", "bookwalker-kadokawa-vertical",
  "cmoa-ntt-solmare-studio", "mechacomic-amutus-strip", "rensa-ai-manga-translator", "deep-manga-colorizer-v2", "orx-ornatrix-hair-groom",
  "xgen-maya-toon-groom", "clo3d-fashion-pattern", "style3d-digital-garment", "metahuman-animator-facs", "audio2face-omniverse-lip",
  // Wave 14 (20개 플랫폼 — 총 240개 플랫폼 완성)
  "ic-light-lllyasviel", "beeble-switchlight-studio", "wonder-dynamics-wonder-studio", "move-ai-multicam-mocap", "rokoko-vision-dualcam",
  "deepmotion-animate-3d", "radical-3d-live-mocap", "kinetix-emote-3d-studio", "davinci-resolve-color-lut", "dehancer-film-bloom-grain",
  "borisfx-sapphire-glow-rays", "knoll-light-factory-flare", "trapcode-particular-vfx", "embergen-realtime-fire-smoke", "liquigen-realtime-water-splash",
  "world-creator-terrain-3d", "gaea-quadspinner-erosion", "speedtree-stylized-foliage", "yoondesign-font-cloud", "morisawa-fonts-manga-jp",
  // Wave 15 (20개 플랫폼 — 총 260개 플랫폼 완성: 동남아·중화권·중남미·글로벌 인디 웹툰 플랫폼)
  "line-webtoon-thailand", "line-webtoon-indonesia", "line-webtoon-taiwan-zh", "mangatoon-global-strip", "wecomics-tencent-sea",
  "bilibili-comics-global", "dongman-manhua-studio", "webcomics-app-global", "tapastic-indie-canvas", "namicomi-creator-hub",
  "voyce-me-action-originals", "saturday-am-diverse-manga", "comicfury-webcomic-host", "smackjeeves-archive-layout", "drunkduck-webcomic-strip",
  "webtoon-latam-espanol", "tappytoon-de-fr-studio", "pocket-comics-comico-global", "manta-spanish-originals", "alpha-manga-alphapolis",
  // Wave 16 (20개 플랫폼 — 총 280개 플랫폼 완성: 3D 월드·실내 평면도·태양광 그림자·페이스빌더)
  "kitbash3d-cargo-worlds", "quixel-megascans-bridge", "polyhaven-hdri-lighting", "ambientcg-pbr-materials", "sketchfab-3d-prop-inspector",
  "turbosquid-royalty-3d", "cgtrader-stylized-props", "hum3d-vehicle-reference", "sweet-home-3d-room-plan", "planner5d-interior-staged",
  "homestyler-3d-palace-room", "roomsketcher-floorplan-cam", "magicplan-ar-room-measure", "sun-seeker-solar-angle", "shademap-building-shadow",
  "photoephemeris-moon-sun", "set-a-light-3d-elixxier", "portraitpro-relit-studio", "polygon-runway-isometric", "keentools-facebuilder-head",
  // Wave 17 (20개 플랫폼 — 총 300개 플랫폼 완성: 컬러과학·업스케일·망점·위조방지·버전관리)
  "pantone-connect-palette", "colorbrewer-contrast-safe", "stark-wcag-contrast-audit", "polypane-colorblind-sim", "comic-life-3-plasq-balloon",
  "clip-studio-ex-story-editor", "mediabang-cloud-teamwork", "firealpaca-se-onion-skin", "sai-v2-binary-pixel-line", "open-canvas-7-event-log",
  "krita-gmic-halftone-filter", "waifu2x-cunet-art-upscale", "real-esrgan-anime-6b-tile", "chai-nn-er-node-upscaler", "upscayl-ncnn-vulkan-toon",
  "glaze-2-webtoon-cloak", "mist-v2-adversarial-watermark", "c2pa-content-credentials", "perforce-helix-psd-version", "anchorpoint-art-asset-git",
  // Wave 18 (20개 플랫폼 — 총 320개 플랫폼 완성: 3D 렌더러 툰셰이더·물리 파괴·이펙트·2D 리깅)
  "chaos-corona-palace-render", "vray-toon-cel-material", "octane-render-anime-kernel", "redshift-npr-contour-shader", "arnold-aitoon-contour",
  "renderman-stylized-looks", "houdini-vellum-cloth-hair", "houdini-pyro-magic-vfx", "bifrost-maya-aero-slash", "tyflow-3dsmax-destruction",
  "rayfire-voronoi-shatter", "pulldownit-wall-fracture", "phoenix-fd-fire-ocean", "realflow-liquid-crown", "x-particles-insydium-aura",
  "stardust-ae-modular-vfx", "newton-4-ae-2d-physics", "duik-angela-ae-2d-rig", "joysticks-n-sliders-head", "rubberhose-3-bendy-limb",
  // Wave 19 (20개 플랫폼 — 총 340개 플랫폼 완성: 브러시 파운드리·해부학 데생·SDF/복셀 3D 배경)
  "kyle-t-webster-megapack", "true-grit-texture-supply", "retrosupply-halftone-ink", "frankentoon-vector-brushes", "daub-brushes-natural-media",
  "ramon-miranda-krita-atelier", "david-revoy-pepper-carrot", "proko-3d-anatomy-skulls", "anatomy-for-sculptors-3d", "sketchdaily-timed-pose",
  "line-of-action-gesture", "quickposes-dynamic-combat", "justsketchme-multi-doll", "setpose-web-mannequin", "womp-3d-sdf-goop-props",
  "magica-csg-sdf-modeling", "magicavoxel-isometric-bg", "blockbench-lowpoly-prop", "crocotile-3d-tile-scene", "sprytile-blender-pixel-3d",
  // Wave 20 (20개 플랫폼 — 총 360개 플랫폼 완성: 오디오툰 폴리·립싱크·VTuber 포즈·인터랙티브 웹툰)
  "epidemic-sound-webtoon-bgm", "artlist-cinematic-sfx", "soundly-cloud-foley-pro", "krotos-weaponiser-combat", "krotos-dehumaniser-monster",
  "reaper-daw-audiotoon-stem", "izotope-rx11-dialogue-clean", "fabfilter-pro-q3-eq-duck", "waves-clarity-vx-voice", "rhubarb-lip-sync-2d-mouth",
  "papagayo-ng-phoneme-mouth", "character-animator-adobe", "cartoon-animator-5-cta", "live3d-vtuber-pose-snap", "vseeface-vrm-expression",
  "warudo-3d-stage-camera", "vnite-visual-novel-bridge", "renpy-branching-webtoon", "twine-interactive-episode", "ink-inkle-narrative-script",
  // Wave 21 (20개 플랫폼 — 총 380개 플랫폼 완성: 차세대 AI 비디오/무빙툰/만화 디퓨전/얼굴 표정 전이)
  "krea-wan-14b-toon-motion", "world-labs-marble-3d-scene", "qwen-2-5-vl-manga-ocr", "step-video-t2v-anime", "skyreels-v1-drama-toon",
  "allegro-rhymes-anime-motion", "mochi-1-genmo-motion", "pyramid-flow-sd3-video", "cogvideox-5b-toon-i2v", "consisid-identity-video",
  "storydiffusion-comic-strip", "diffsensei-manga-panel", "mangagan-tailored-panel", "toongrafter-frame-interp", "aniportrait-audio-driven",
  "hallo2-long-portrait-anim", "liveportrait-kwai-expression", "emo-talking-head-anime", "v-express-multimodal-face", "echomimic-v2-hand-face",
  // Wave 22 (20개 플랫폼 — 총 400개 플랫폼 완성: 3D 건축/시대극/판타지 월드·식생·성채 키트배시)
  "twinmotion-unreal-toon-arch", "lumion-14-npr-watercolor", "enscape-sketchup-toon-line", "d5-render-ai-style-toon", "vray-vantage-realtime-bg",
  "cityengine-esri-procedural-city", "world-machine-terrain-erosion", "quadspinner-gaea-2-mountain", "world-creator-biome-map", "speedtree-9-stylized-foliage",
  "plantfactory-vue-vegetation", "botaniq-blender-anime-trees", "traffiq-blender-rigged-cars", "aquatiq-water-fountain-fx", "ransom-medieval-castle-kit",
  "bigmediumsmall-cyberpunk-crowd", "kitbash3d-edo-feudal-japan", "kitbash3d-gothic-cathedral", "kitbash3d-art-deco-noir", "kitbash3d-steampunk-airship",
  // Wave 23 (20개 플랫폼 — 총 420개 플랫폼 완성: 컬러 교정·출판 조판·OPDS 아카이브·한일중 식자 파운드리)
  "displaycal-icc-softproof", "pantone-connect-cmyk-bridge", "celsys-clipstudio-teamwork", "affinity-publisher-2-print-book", "scribus-open-source-press",
  "calibre-epub3-fixed-comic", "kindlegen-kcc-manga-converter", "hakuneko-offline-archive-spec", "komga-opds-webtoon-server", "kavita-manga-reader-metadata",
  "suwayomi-tachidesk-inspector", "comicrack-comicinfo-xml", "yoon-design-font-cloud-v2", "rixfont-webtoon-sfx-pack", "typodesign-forest-kr-fonts",
  "morisawa-fonts-jp-manga-v2", "fontworks-lets-evangelion-typo", "dynacomware-df-manga-fonts", "house-industries-display-letter", "type-network-variable-balloon",
  // Wave 24 (20개 플랫폼 — 총 440개 플랫폼 완성: 복식사·도검 고증·가문 문장(Heraldry)·판타지 지도 제작)
  "met-museum-armor-collection", "wallace-collection-sword-hilt", "smithsonian-open-access-3d", "british-museum-pattern-archive", "victoria-albert-costume-db",
  "fashion-history-timeline-fit", "augustracinet-costume-plates", "armstreet-medieval-tailoring", "kult-of-athena-blade-geometry", "oakeshott-sword-typology-rig",
  "drawshield-heraldry-blazon", "armoria-procedural-crest", "azgaar-fantasy-map-generator", "watabou-medieval-city-gen", "donjon-fractal-world-atlas",
  "wonderdraft-parchment-map", "dungeondraft-battlemap-lighting", "inkarnate-watercolor-atlas", "project-line-work-stroke-lib", "thunderbolt-japanese-brush-pack",
  // Wave 25 (20개 플랫폼 — 총 460개 플랫폼 완성: 안면/바디 리깅·근육 시뮬·옵티컬플로우 보간·선화 복원)
  "faceit-blender-arkit-52", "rigify-blender-human-metarig", "auto-rig-pro-blender-remap", "arp-smart-ik-fk-snap", "mgear-maya-anime-facial-rig",
  "advanced-skeleton-5-toon-bend", "ziva-vfx-muscle-fascia-sim", "ragdoll-dynamics-maya-physics", "rife-v4-optical-flow-inbetween", "film-frame-interpolation-google",
  "topaz-video-ai-proteus-toon", "flowframes-rife-ncnn-anime", "svp-smoothvideo-60fps-preview", "ebsynth-keyframe-style-prop", "cotracker3-meta-point-track",
  "sam2-segment-anything-video", "matanyone-consistent-video-matte", "pro-painter-video-inpainting", "basicvsr-plusplus-line-restore", "manga-screentone-descreen-ai",
  // Wave 26 (20개 플랫폼 — 총 480개 플랫폼 완성: 서사 구조학·아이트래킹 히트맵·오디오 마스터링·접근성 감리)
  "dramatica-pro-story-engine", "contour-plot-structure-system", "plottr-visual-timeline-bible", "aeon-timeline-3-chronology", "writeitnow-character-event-tree",
  "bibisco-character-interview", "manuskript-snowflake-method", "ywriter7-scene-goal-conflict", "twine-sugarcube-state-tracker", "choicescript-stats-check-rig",
  "chartbeat-scroll-depth-analytics", "hotjar-vertical-scroll-heatmap", "gazerecorder-webcam-eyetrack", "tobii-pro-lab-saccade-aois", "respeecher-voice-cloning-osmu",
  "altered-studio-performance-voice", "descript-overdub-audiotoon-edit", "auphonic-multitrack-lufs-leveler", "w3c-wcag-22-contrast-validator", "daisy-epub-accessibility-ace",
  // Wave 27 (20개 플랫폼 — 총 500개 플랫폼 완성: 동아시아 전통건축/단청·한복/기모노/한푸 여밈·무협 검법/경맥·수묵/전각)
  "chaos-cosmos-asian-palace", "heritage-kr-palace-dancheong", "forbidden-city-dougong-3d", "wudang-taiji-sword-forms", "meridian-acupoint-qigong-map",
  "dunhuang-flying-apsaras-silk", "celadon-porcelain-glaze-spec", "seal-script-talisman-sigil", "hanbok-advancement-center-db", "hanfu-ming-tang-collar-db",
  "kimono-kosode-obi-musubi-db", "korean-traditional-bow-gakgung", "joseon-hwando-scabbard-cord", "guqin-gayageum-bridge-25", "ink-wash-shan-shui-shader",
  "gold-leaf-kintsugi-fracture", "bamboo-grove-wind-sway-sim", "paper-lantern-warm-sss-rig", "incense-burner-curl-ribbon", "calligraphy-flying-white-brush",
  // Wave 28 (20개 플랫폼 — 총 520개 플랫폼 완성: 현대 전술총기·하드서피스 메카·중환자실/법의학·법정·항공/항해·요리·스포츠 고증)
  "imfdb-firearm-slide-lock", "jane-military-tactical-rig", "plasticity-cad-mecha-fillet", "moi3d-boolean-weapon-prop", "vital-medical-icu-monitor",
  "surgical-suture-glove-sterile", "forensic-blood-spatter-angle", "courtroom-bench-bar-layout", "aviation-cockpit-hud-pitch", "maritime-ship-rigging-helm",
  "culinary-knife-grip-brigade", "espresso-latte-art-crema-sim", "motorsport-apex-cockpit-cam", "climbing-carabiner-knot-belay", "archery-modern-recurve-sight",
  "fencing-foil-epee-sabre-mask", "boxing-mma-glove-wrap-guard", "baseball-pitch-grip-seam", "chess-go-baduk-board-coord", "tarot-arcana-card-orientation",
  // Wave 29 (20개 플랫폼 — 총 540개 플랫폼 완성: 창작 저작권/워터마크·크라우드펀딩·아크릴/단행본 굿즈 칼선·팬덤 감성 분석)
  "synthid-deepmind-watermark", "content-credentials-verify", "cara-glaze-anti-scrape-v2", "spawning-haveibeentrained-guard", "creative-commons-license-rig",
  "tumblbug-webtoon-crowdfunding", "wadiz-ip-merch-launchpad", "kickstarter-graphic-novel-tier", "pacdora-3d-merch-box-dieline", "artioscad-acrylic-stand-slot",
  "printify-global-pod-apparel", "superplay-game-ip-goods-spec", "brandwatch-reader-sentiment", "sprout-social-pv-shortform", "tubebuddy-webtoon-ost-seo",
  "patreon-creator-tier-preview", "pixiv-fanbox-psd-layer-strip", "gumroad-webtoon-brush-store", "booth-pm-3d-vrm-asset-pack", "acon3d-carpenter-revenue-opt",
  // Wave 30 (20개 플랫폼 — 총 560개 플랫폼 완성: 판타지 몬스터/드래곤 비교해부학·곤충 외골격·보석 굴절·천문/구름/용암 물리)
  "terryl-whitlatch-creature-anat", "goldfinger-animal-anatomy-atlas", "ellenberger-atlas-animal-bones", "scott-eaton-bodies-in-motion", "skeletal-drawing-paleo-theropod",
  "pterosaur-wing-patagium-tension", "arthropod-chitin-exoskeleton-rig", "cephalopod-tentacle-sucker-ik", "serpent-scale-hex-tessellation", "avian-primary-secondary-feather",
  "feline-retractable-claw-paw-pad", "ungulate-cloven-hoof-fetlock", "horns-antlers-keratin-growth", "bioluminescent-abyssal-flora", "alchemical-herbarium-botany-db",
  "gemological-gia-facet-refraction", "astronomy-stellarium-night-sky", "cloud-atlas-wmo-cumulonimbus", "aurora-borealis-curtain-shader", "volcanic-magma-crust-incandescence",
  // Wave 31 (20개 플랫폼 — 총 580개 플랫폼 완성: K-웹툰 한국형 도시/학원/편의점/옥탑방/지하철/포장마차/PC방 일상 공간 고증)
  "seoul-metro-cabin-handrail-spec", "kr-convenience-store-shelf-plan", "kr-highschool-classroom-locker", "rooftop-watertank-green-urethane", "pojangmacha-red-plastic-chair",
  "pc-bang-curved-monitor-booth", "korean-apt-doorlock-intercom", "han-river-bridge-parapet-lamp", "kr-police-station-detective-desk", "kr-wedding-hall-virgin-road",
  "funeral-hall-chrysanthemum-altar", "incheon-airport-departure-gate", "university-lecture-tiered-hall", "broadcast-studio-teleprompter-rig", "esports-arena-booth-led-stage",
  "webnovel-office-dual-monitor-ergo", "luxury-penthouse-marble-bookmatch", "underground-parking-epoxy-pillar", "alleyway-utility-pole-transformer", "karaoke-coin-noraebang-tambourine",
  // Wave 32 (20개 플랫폼 — 총 600개 플랫폼 완성!: 글로벌 다국어 식자/RTL/성조·문화 금기 감리·넷플릭스/애니/게임/뮤지컬/팝업스토어 2차 판권)
  "rtl-arabic-comic-mirror-engine", "thai-line-webtoon-tone-mark-stack", "indonesian-bahasa-slang-balloon", "french-bande-dessinee-guillemet", "spanish-latam-inverted-mark-rig",
  "german-compound-word-hyphenator", "vietnamese-diacritic-leading-guard", "hindi-devanagari-shirorekha-line", "global-cultural-taboo-sanitizer", "netflix-live-action-series-bible",
  "crunchyroll-anime-adaptation-sheet", "unity-unreal-webtoon-rpg-skill-spec", "audible-dolby-atmos-drama-script", "musical-stage-lighting-cue-sheet", "theme-park-pop-up-store-spatial",
  "emoticon-kakao-naver-ogq-24pack", "ost-vinyl-lp-gatefold-jacket-spec", "artbook-collector-hardcover-index", "character-perfume-top-middle-base", "global-ip-royalty-mg-rs-calculator",
  // Wave 33 (20개 플랫폼 — 총 620개 플랫폼 완성: 시네마틱 카메라 렌즈 광학(Anamorphic/Fisheye/Tilt-Shift)·의상 주름 역학(Hogarth 7 Folds)·재질 BRDF)
  "anamorphic-oval-bokeh-flare-rig", "fisheye-barrel-distortion-grid", "tilt-shift-miniature-scheimpflug", "telephoto-200mm-compression-rig", "wide-14mm-foreshortening-guard",
  "dutch-angle-horizon-roll-meter", "split-diopter-dual-focus-plane", "chromatic-aberration-fringe-lock", "halation-film-red-bloom-shader", "burne-hogarth-7-drapery-folds",
  "elbow-knee-spiral-half-lock-fold", "velvet-fresnel-rim-sheen-brdf", "silk-satin-anisotropic-highlight", "leather-latex-dual-lobe-specular", "sequin-glitter-camera-sparkle",
  "sheer-organza-lace-alpha-wrap", "knitwear-cable-stitch-uv-follow", "fur-tuft-clumping-wind-direction", "chainmail-ring-interlock-4in1", "iridescent-pearl-thin-film-interference",
  // Wave 34 (20개 플랫폼 — 총 640개 플랫폼 완성: 스포츠/액션 인체역학·차량 좌우핸들/안전벨트/오토바이/자전거 구동계 고증)
  "lhd-rhd-steering-wiper-stalk-lock", "seatbelt-3point-clavicle-strap", "motorcycle-twist-throttle-clutch", "bicycle-drivetrain-right-chainring", "volleyball-spike-approach-arm-draw",
  "basketball-jump-shot-guide-hand", "soccer-instep-curve-plant-foot", "figure-skating-axe-lutz-edge-lock", "ballet-en-pointe-turnout-arabesque", "judo-jiujitsu-lapel-kumi-kata",
  "taekwondo-spinning-hook-chamber", "golf-swing-plane-lag-release", "tennis-topspin-pronation-racquet", "swimming-freestyle-high-elbow-catch", "track-sprint-starting-block-drive",
  "billiards-cue-bridge-hand-tripod", "bowling-thumb-release-hook-axis", "skateboarding-ollie-tail-pop-slide", "elevator-hall-lantern-floor-digit", "escalator-handrail-step-yellow-line",
  // Wave 35 (20개 플랫폼 — 총 660개 플랫폼 완성!: 만화 망점(LPI Moiré)/G펜 필압·오디오툰 ADR 성우 대본·버튜버/RPG 가챠/피규어 분할/점자 촉각 그래픽)
  "deleter-ic-screentone-lpi-moiré", "zebragn-tachikawa-gpen-pressure", "sumi-ink-dry-brush-kasuri-feather", "copic-marker-alcohol-blend-chart", "watercolor-wet-on-wet-cauliflower",
  "pastel-chalk-tooth-grain-scumble", "scratchboard-white-on-black-etch", "risograph-soy-ink-misregistration", "voice-acting-dub-timecode-script", "vtuber-vbridger-arkit-cheek-puff",
  "gacha-ssr-splash-art-parallax-rig", "visual-novel-sprite-eyeblink-mouth", "line-camera-ar-webtoon-face-filter", "figure-3d-print-key-socket-split", "nendoroid-faceplate-neck-joint-spec",
  "itabag-can-badge-58mm-bleed-ring", "lenticular-2flip-3d-angle-interlace", "foil-stamping-uv-spot-varnish-mask", "braille-tactile-graphic-webtoon-spec", "creator-ergonomics-wrist-pomodoro",
  // Wave 36 (20개 플랫폼 — 총 680개 플랫폼 완성: 로판 서양 귀족/황실 복식(코르셋/크리놀린/견장/훈장띠)·성채/나선계단·무도회/다과회 에티켓)
  "rofan-corset-busk-back-lacing", "crinoline-bustle-cage-silhouette", "epaulette-bullion-fringe-rank", "order-sash-riband-shoulder-hip", "wax-seal-signet-ring-intaglio",
  "fountain-pen-quill-nib-slit-vent", "teacup-handle-pinky-saucer-etiquette", "champagne-flute-coupe-stem-pinch", "landau-brougham-carriage-leaf-spring", "grand-bifurcated-staircase-balustrade",
  "waltz-closed-frame-hand-placement", "opera-box-proscenium-velvet-tier", "greenhouse-conservatory-iron-rib", "fireplace-mantelpiece-flue-hearth", "four-poster-canopy-bed-tester",
  "chandelier-crystal-prism-caustics", "gothic-tracery-stained-glass-lead", "spiral-castle-stair-clockwise-def", "drawbridge-portcullis-winch-chain", "rapier-swept-hilt-ricasso-grip",
  // Wave 37 (20개 플랫폼 — 총 700개 플랫폼 완성: 헌터/던전/성좌/회귀물 게이트·레이드 진형·인벤토리·사이버펑크 의체·전술야투경/방탄복)
  "hunter-rank-gate-color-spectrum", "constellation-sponsor-toast-banner", "raid-party-5man-tank-healer-formation", "spatial-inventory-subspace-ripple", "potion-vial-wax-stopper-meniscus",
  "magic-academy-dueling-arena-ward", "awakening-mana-measuring-orb-crack", "guild-contract-hologram-tablet", "dungeon-boss-throne-aggro-radius", "necromancer-shadow-summon-silhouette",
  "cyberpunk-neural-jack-nape-port", "cybernetic-prosthetic-seam-piston", "hologram-kanji-hangul-neon-rain", "mecha-cockpit-linear-seat-pedal", "power-armor-pauldron-servo-clearance",
  "modern-military-nvg-quad-tube-glow", "tactical-plate-carrier-molle-pouch", "sniper-scope-mil-dot-cheek-weld", "helicopter-main-rotor-swashplate", "submarine-conning-tower-sonar-waterfall",
  // Wave 38 (20개 플랫폼 — 총 720개 플랫폼 완성!: 오컬트/퇴마/무속·법의학/추리 트릭·회중시계 IIII·체스/바둑/타로 고증)
  "korean-shaman-gut-bell-fan-lock", "talisman-bujok-cinnabar-yellow-hanji", "catholic-exorcism-stole-rosary-latin", "onmyoji-ofuda-pentagram-kuji-kiri", "crime-scene-yellow-marker-tent",
  "fingerprint-whorl-loop-arch-powder", "luminol-chemiluminescence-blue-425nm", "autopsy-suite-stainless-scale-drain", "interrogation-two-way-mirror-cam", "polygraph-galvanic-pneumo-chart",
  "locked-room-mystery-floorplan-alibi", "red-string-conspiracy-corkboard", "cryptography-cipher-wheel-vigenere", "antique-pocket-watch-roman-iiii", "chess-endgame-algebraic-legal-board",
  "baduk-go-board-19x19-star-points", "playing-card-poker-pip-symmetry", "tarot-78-major-minor-spread-cross", "archaeological-trench-grid-trowel", "museum-conservation-uv-fluoresce",
] as const;

export const REA39_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA50_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA65_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA80_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA100_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA120_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA140_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA160_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA180_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA200_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA220_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA240_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA260_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA280_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA300_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA320_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA340_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA360_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA380_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA400_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA420_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA440_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA460_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA480_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA500_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA520_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA540_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA560_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA580_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA600_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA620_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA640_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA660_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA680_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA700_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA720_PLATFORM_IDS = REA15_PLATFORM_IDS;

export type Rea15PlatformId = (typeof REA15_PLATFORM_IDS)[number];
export type Rea39PlatformId = Rea15PlatformId;
export type Rea50PlatformId = Rea15PlatformId;
export type Rea65PlatformId = Rea15PlatformId;
export type Rea80PlatformId = Rea15PlatformId;
export type Rea100PlatformId = Rea15PlatformId;

export interface Rea15PlatformUiThemeSpec {
  readonly platformId: Rea15PlatformId;
  readonly nameKo: string;
  readonly originUrl: string;
  readonly reaEvidenceId: string;
  readonly scenarioSha256: string;
  readonly surfaceHex: string;
  readonly panelHex: string;
  readonly borderHex: string;
  readonly textPrimaryHex: string;
  readonly textMutedHex: string;
  readonly accentPrimaryHex: string;
  readonly accentSecondaryHex: string;
  readonly borderRadiusPx: number;
  readonly fontStack: string;
  readonly coreWorkflowKo: string;
  readonly keyRoutes: readonly string[];
}

export const REA15_PLATFORM_UI_THEME_CATALOG: Readonly<
  Record<Rea15PlatformId, Rea15PlatformUiThemeSpec>
> = Object.freeze({
  glimnavi: {
    platformId: "glimnavi",
    nameKo: "그림나비 (GlimNavi Studio v2.3)",
    originUrl: "https://glimnavi.com/function-step3.html",
    reaEvidenceId: "ev_f2c78ddd17640152c0ce5ea59a6634cd0f7029fe29a852251b9147d1e60e3570",
    scenarioSha256: "3ac6113ac3d149b37ff9863b5deb6a7d8ff15ccfb597457ca150a6e9a98f60d1",
    surfaceHex: "#f6f7fb",
    panelHex: "#ffffff",
    borderHex: "#e5e7eb",
    textPrimaryHex: "#111827",
    textMutedHex: "#6b7280",
    accentPrimaryHex: "#00a8c2",
    accentSecondaryHex: "#3b82f6",
    borderRadiusPx: 14,
    fontStack: "Pretendard Variable, sans-serif",
    coreWorkflowKo:
      "5단계(기획·각색→콘티→선화 v1.0~v2.3→자동채색→AI 그림자·조명·명암 Relight) + 컬러 레이어 분리 + PSD 출력",
    keyRoutes: ["/", "/function-step3.html", "/plan.html", "/tutorial.html"],
  },
  snaptoon: {
    platformId: "snaptoon",
    nameKo: "스냅툰 · 스냅보드 (Snaptoon & Snapboard)",
    originUrl: "https://snaptoon.co.kr/",
    reaEvidenceId: "ev_b1e4285baa78b85f3ad6b72dd54277f72ecff570448402bebd87070fac64a8c3",
    scenarioSha256: "f05844d786ada6594f200e5398c9081345085acd0152146d0111169592e13acb",
    surfaceHex: "#FAF8F5",
    panelHex: "#F2EFEA",
    borderHex: "#E8E5E0",
    textPrimaryHex: "#1A1A1A",
    textMutedHex: "#6B6B6B",
    accentPrimaryHex: "#1E3A5F",
    accentSecondaryHex: "#2A5285",
    borderRadiusPx: 12,
    fontStack: "Pretendard, Noto Serif KR, EB Garamond",
    coreWorkflowKo: "스냅툰 3D 실시간 렌더링 → 스냅보드 AI 창작·변환 → 스냅툰 웨어하우스 3D 소재",
    keyRoutes: ["/", "/en/"],
  },
  kaistory: {
    platformId: "kaistory",
    nameKo: "카이스토리 · 카이툰 (KAISTORY & KAITOON)",
    originUrl: "https://kaistory.net/",
    reaEvidenceId: "ev_76255f44204c56a3615ba3ed1dd0f8a5f1cf15aaf954649b456e50cc80824613",
    scenarioSha256: "4a783a2b5bd2aa91f0b3c076bce1bb3bb6c1c8f7d84d54742a53493c0bcced7d",
    surfaceHex: "#f6f7fb",
    panelHex: "#ffffff",
    borderHex: "#e7e8f0",
    textPrimaryHex: "#1a1c2b",
    textMutedHex: "#5c6178",
    accentPrimaryHex: "#16168f",
    accentSecondaryHex: "#ff5a4d",
    borderRadiusPx: 14,
    fontStack: "Pretendard, sans-serif",
    coreWorkflowKo:
      "단일 프로젝트 데이터 엔벨로프(conti→design→editor→story) + 화자별 TTS + KAION 학습카드·문제 생성",
    keyRoutes: [
      "https://conti.kaistory.net",
      "https://design.kaistory.net",
      "https://editor.kaistory.net",
      "https://story.kaistory.net",
    ],
  },
  ggooming: {
    platformId: "ggooming",
    nameKo: "꾸밍 (GGOOMING)",
    originUrl: "https://www.ggooms.com/",
    reaEvidenceId: "ev_28d88e317e86129ace97da5ecc1aa6be41335b246956741190f7f5416fc37e32",
    scenarioSha256: "912a469864405fc70aa12501c5f0fa64108ae1b49ca11702696dc6b98fd258aa",
    surfaceHex: "#eff6ff",
    panelHex: "#ffffff",
    borderHex: "#bfdbfe",
    textPrimaryHex: "#1e3ad4",
    textMutedHex: "#3f3f3f",
    accentPrimaryHex: "#274bff",
    accentSecondaryHex: "#4980ff",
    borderRadiusPx: 12,
    fontStack: "Geist, Geist Mono, sans-serif",
    coreWorkflowKo: "인스타툰·브랜드 콜라보 고속 컷 생성 및 캐릭터 화풍 일관성 락",
    keyRoutes: ["/", "/dashboard", "/dashboard/projects", "/dashboard/projects/new"],
  },
  "plask-motion": {
    platformId: "plask-motion",
    nameKo: "플라스크 모션 (Plask Motion)",
    originUrl: "https://plask.ai/",
    reaEvidenceId: "ev_e4c693a8ddd64ef1def91fcb5c6fc6fec52335a136eb945fbe376747ead4c7cb",
    scenarioSha256: "12062ecfeaed08c6dda16eee9ad9531e6d5982b08267f72947e57b6564756e1f",
    surfaceHex: "#0a0a0a",
    panelHex: "#171717",
    borderHex: "#333333",
    textPrimaryHex: "#ededed",
    textMutedHex: "#a0a0a0",
    accentPrimaryHex: "#0467DF",
    accentSecondaryHex: "#06C755",
    borderRadiusPx: 10,
    fontStack: "var(--font-plask-latin), var(--font-plask-cjk)",
    coreWorkflowKo: "단일 카메라 영상 AI 모션 캡처 → VRM/FBX 리타게팅 → 키프레임 스무딩 & DOF/모션블러",
    keyRoutes: ["/"],
  },
  "manhwa-ai": {
    platformId: "manhwa-ai",
    nameKo: "ManhwaAI",
    originUrl: "https://www.manhwaai.net/",
    reaEvidenceId: "ev_0a8511a3646c5da383e58a2b265eb450df9661c4601ca6414526ebeab5cfaee3",
    scenarioSha256: "d1cf486502398a0d6d77151a5219a8b55d4c0bc7395c6652f98c97b787dfe809",
    surfaceHex: "#17131e",
    panelHex: "#1d1825",
    borderHex: "#241925",
    textPrimaryHex: "#f8f4ee",
    textMutedHex: "#766b7d",
    accentPrimaryHex: "#7b5cff",
    accentSecondaryHex: "#e83f69",
    borderRadiusPx: 12,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo:
      "6대 만화 화풍 프리셋(full-color, black-and-white 등) + 5대 톤 오버레이(FocusingLine, SpeedLine, Tone 등)",
    keyRoutes: ["/manhwa-character-generator", "/manhwa-editor", "/comic-editor", "/gallery/manhwa"],
  },
  "komiko-ai": {
    platformId: "komiko-ai",
    nameKo: "Komiko AI",
    originUrl: "https://komiko.app/",
    reaEvidenceId: "ev_a6091c8e574902740961b2395722ee6d65d22ef730bf05408d69f249434dc3ea",
    scenarioSha256: "c0bd29800afafd282dee7defc4aadfa39a40f051351063644c1d674d68500c5c",
    surfaceHex: "#0f101a",
    panelHex: "#181926",
    borderHex: "#2a2c42",
    textPrimaryHex: "#f3f4f6",
    textMutedHex: "#9ca3af",
    accentPrimaryHex: "#7C5CFA",
    accentSecondaryHex: "#FF4D9D",
    borderRadiusPx: 12,
    fontStack: "Plus Jakarta Sans, Inter, sans-serif",
    coreWorkflowKo:
      "OC 캐릭터 메이커 + 선화 채색 + 스케치 단순화 + 레이어 분리기(/layer_splitter) + 인비트윈(/inbetween)",
    keyRoutes: [
      "/oc-maker",
      "/ai-comic-generator",
      "/line_art_colorization",
      "/sketch_simplification",
      "/layer_splitter",
      "/inbetween",
      "/voice/generate",
    ],
  },
  anifusion: {
    platformId: "anifusion",
    nameKo: "Anifusion",
    originUrl: "https://anifusion.ai/",
    reaEvidenceId: "ev_01828021391fc904afa8460e67291e1e0cedeb7bddfa084da1a92fe64adff8c8",
    scenarioSha256: "841e3a9d62df517833baa136eddc61ede2f971f8a63f6406c864202fdc4ca2fa",
    surfaceHex: "#1a1b1e",
    panelHex: "#25262b",
    borderHex: "#373a40",
    textPrimaryHex: "#fcfcfc",
    textMutedHex: "#858585",
    accentPrimaryHex: "#2196f3",
    accentSecondaryHex: "#4dabf7",
    borderRadiusPx: 10,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo:
      "노드 플로우(/dashboard/flow/) + 무한 캔버스(/dashboard/canvas/) + 캐릭터 시트(/dashboard/character-sheets/)",
    keyRoutes: [
      "/dashboard/flow/",
      "/dashboard/canvas/",
      "/dashboard/character-sheets/",
      "/dashboard/comic-presets/",
      "/dashboard/sketch/",
      "/editor/",
    ],
  },
  "katalist-ai": {
    platformId: "katalist-ai",
    nameKo: "Katalist AI",
    originUrl: "https://www.katalist.ai/",
    reaEvidenceId: "ev_6a2f91553a83af023e5531e399a40b2a077eb8dbdf3345f8d1d8af3ec6d23cc5",
    scenarioSha256: "33f0829eb08241e561a034d42f0889221b1d91989ce511b784d2d87590da1ae7",
    surfaceHex: "#0f172a",
    panelHex: "#1e293b",
    borderHex: "#334155",
    textPrimaryHex: "#f8fafc",
    textMutedHex: "#94a3b8",
    accentPrimaryHex: "#38bdf8",
    accentSecondaryHex: "#818cf8",
    borderRadiusPx: 12,
    fontStack: "Familjen Grotesk, Crimson Pro, Geist, Inter",
    coreWorkflowKo: "스크립트 자동 샷 분해 → 캐릭터·배경 고정 스토리보드 → 프레임별 포즈·앵글 직접 조작",
    keyRoutes: ["/"],
  },
  novelai: {
    platformId: "novelai",
    nameKo: "NovelAI",
    originUrl: "https://novelai.net/",
    reaEvidenceId: "ev_ed7b1d3017d19c852444e210f9905a7784dbf6ebd46e3e06e91c6d3f6e2e9633",
    scenarioSha256: "ee8200a356f72e7929601f8bae3c21373a2545bfb8a7caecccba1e179bd2ebc8",
    surfaceHex: "#0e0f21",
    panelHex: "#13152c",
    borderHex: "#252849",
    textPrimaryHex: "#f5f3c2",
    textMutedHex: "#e6e6e6",
    accentPrimaryHex: "#DCA7D7",
    accentSecondaryHex: "#5D69DE",
    borderRadiusPx: 8,
    fontStack: "Inter, Source Sans Pro, serif",
    coreWorkflowKo: "로어북 서사 메모리(/stories) + 다중 캐릭터 좌표 분리 & Vibe Transfer(/image)",
    keyRoutes: ["/stories", "/image", "/user/subscription", "/user/inventory"],
  },
  mootion: {
    platformId: "mootion",
    nameKo: "Mootion",
    originUrl: "https://www.mootion.com/",
    reaEvidenceId: "ev_0a0286dd2b8b2c4d017d08fb7af0cb82d91266b998ea37464fcb8ce43ac93e78",
    scenarioSha256: "d787a0537e1bddb33799f194acf0ab144b6add9c10185879cba21c07755585da",
    surfaceHex: "#0e1d47",
    panelHex: "#211f2c",
    borderHex: "#3021d9",
    textPrimaryHex: "#fafafa",
    textMutedHex: "#9a9a9a",
    accentPrimaryHex: "#4c33ff",
    accentSecondaryHex: "#a846ee",
    borderRadiusPx: 12,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo: "프롬프트·대본 → 스토리보드 → 3D/비디오 애니매틱 시퀀스 자동 변환",
    keyRoutes: ["/"],
  },
  skyreels: {
    platformId: "skyreels",
    nameKo: "SkyReels",
    originUrl: "https://www.skyreels.ai/",
    reaEvidenceId: "ev_5b2e30d22a2b9ca1e351d56b727f16a800309bc25a07351272cca8048b87aeca",
    scenarioSha256: "86c5cc6fe9d8b1e50abf26cf1b8037fed348b5afbfe5de110f4b559fe246e75c",
    surfaceHex: "#1a1a1a",
    panelHex: "#262626",
    borderHex: "#3f3f46",
    textPrimaryHex: "#ffffff",
    textMutedHex: "#a1a1aa",
    accentPrimaryHex: "#FFCF00",
    accentSecondaryHex: "#efcf14",
    borderRadiusPx: 10,
    fontStack: "Plus Jakarta Sans, Poppins, sans-serif",
    coreWorkflowKo: "세로형 숏드라마·웹툰 릴스 에피소드 비디오 생성(/createVideo)",
    keyRoutes: ["/createVideo", "/dev/api-keys"],
  },
  frameo: {
    platformId: "frameo",
    nameKo: "Frameo AI",
    originUrl: "https://frameo.ai/",
    reaEvidenceId: "ev_1b43ad4a78636801dfd2660774f04d7ce09f826e64a2fccfdd9d0ba60f87ab5a",
    scenarioSha256: "7575ac64bb5935480f6a7ce31920c371e4cd3257c68c28bd102d4923a43cadea",
    surfaceHex: "#09090b",
    panelHex: "#18181b",
    borderHex: "#27272a",
    textPrimaryHex: "#f5f5f7",
    textMutedHex: "#a1a1aa",
    accentPrimaryHex: "#423be5",
    accentSecondaryHex: "#c084fc",
    borderRadiusPx: 8,
    fontStack: "Geist, Averia Serif Libre, Manrope",
    coreWorkflowKo:
      "AI 스토리보드·스크립트 투 비디오(/ai-storyboard-generator, /use-veo3) + 스포트라이트 콘 셰이더(--cursor-angle, --cone-spread)",
    keyRoutes: ["/ai-storyboard-generator", "/script-to-video", "/story-to-video", "/use-veo3"],
  },
  "naver-webtoon-shaper": {
    platformId: "naver-webtoon-shaper",
    nameKo: "NAVER WEBTOON SHAPER (셰이퍼)",
    originUrl: "https://shaper.webtoons.com/",
    reaEvidenceId: "ev_b31cfbe08e61ccbdb81f0bc2104108e580b7a7c5d3602039136136f7a999bdda",
    scenarioSha256: "7d3810f2fac29eda33110c99652642a4e483932ec41ee8d5298f3579feb87b1c",
    surfaceHex: "#0a0a0a",
    panelHex: "#222222",
    borderHex: "#333333",
    textPrimaryHex: "#ededed",
    textMutedHex: "#d3d3d3",
    accentPrimaryHex: "#00ff74",
    accentSecondaryHex: "#3b6cef",
    borderRadiusPx: 12,
    fontStack: "Volte, Pretendard, sans-serif",
    coreWorkflowKo:
      "3D 웹툰 캐릭터 프리셋 조합 + 3D 모델 표면 직접 드로잉 + AI 레퍼런스 프리셋 추천·포즈 캡처 + 레이어 PSD 출력",
    keyRoutes: ["/"],
  },
  posemaniacs: {
    platformId: "posemaniacs",
    nameKo: "Posemaniacs",
    originUrl: "https://www.posemaniacs.com/",
    reaEvidenceId: "ev_da8dc6db9a1253ca2e1c2bc2ae6b410e3f76ffbbc86f44ab797b83415afb284e",
    scenarioSha256: "6673b4de778f27a4331726e2ba610bfa1aca85610731a7f47c05c685908bd281",
    surfaceHex: "#111827",
    panelHex: "#1f2937",
    borderHex: "#414141",
    textPrimaryHex: "#f9fafb",
    textMutedHex: "#9ca3af",
    accentPrimaryHex: "#2563EB",
    accentSecondaryHex: "#EF4444",
    borderRadiusPx: 8,
    fontStack: "Roboto, Google Sans Text, sans-serif",
    coreWorkflowKo: "3D 에코르셰(근육) 해부학 회전 뷰어 + 핸드/표정 레퍼런스 + 오늘의 포즈 드로잉",
    keyRoutes: ["/poses", "/tools", "/faces", "/generated-photos", "/pose-of-the-day"],
  },
  ...REA39_WAVE23_PLATFORM_UI_THEMES,
  // Wave 36~38 (60개 플랫폼 — 총 720개 플랫폼 완성!: 로판 서양 귀족/성채 · 헌터/던전/사이버펑크/밀리터리 · 오컬트/추리/법의학/시계/체스/바둑)
  ...(Object.fromEntries(
    (
      [
        ["rofan-corset-busk-back-lacing", "18th/19th-Century Stays & Corset Front Busk vs Back Lacing", "#ec4899", "#f59e0b", "로판 드레스 코르셋 전면 금속 버스(Busk) 잠금쇠와 후면 십자 레이싱(Back Lacing) 앞뒤 혼동 작붕 차단"],
        ["crinoline-bustle-cage-silhouette", "Victorian Crinoline Dome Cage vs Bustle Rear-Fullness Spec", "#f472b6", "#a855f7", "1850년대 원형 크리놀린(Crinoline) 스커트와 1880년대 후면 버슬(Bustle) 실루엣의 시대별 하중 및 착석 주름 고정"],
        ["epaulette-bullion-fringe-rank", "Imperial Knight Gold Bullion Epaulette & Aiguillette Side Lock", "#eab308", "#3b82f6", "황실 기사단장 금사 술 견장(Epaulette)과 우측 어깨 참모 견식(Aiguillette) 착용 방향 좌우 반전 차단"],
        ["order-sash-riband-shoulder-hip", "Royal Order Sash Diagonal (Right-Shoulder-to-Left-Hip) Lock", "#2563eb", "#eab308", "로판 황제·대공의 대훈장 어깨띠(Order Sash)가 우측 어깨에서 좌측 골반으로 내려오는 정장 대각선 방향 고정"],
        ["wax-seal-signet-ring-intaglio", "Signet Ring Intaglio (Mirror Engraved) vs Raised Wax Relief", "#dc2626", "#f59e0b", "인장 반지(Signet Ring) 표면은 음각 좌우반전(Intaglio)이고 찍힌 봉랍(Wax Seal)은 양각 정방향이라는 물리 대칭 고정"],
        ["fountain-pen-quill-nib-slit-vent", "Dip-Pen & Fountain-Pen Nib Breather Hole Top-Side Orientation", "#f59e0b", "#38bdf8", "만년필·깃펜으로 서명할 때 펜촉 공기구멍(Breather Hole)과 각인면이 반드시 위쪽(하늘)을 향하도록 파지 방향 고정"],
        ["teacup-handle-pinky-saucer-etiquette", "High-Tea Etiquette: Index-Thumb Pinch (No Pinky Up!) & Saucer", "#10b981", "#f472b6", "로판 다과회 찻잔 손잡이에 손가락을 끼우지 않고 엄지·검지로 집으며 새끼손가락을 세우지 않는 정통 티 에티켓 고증"],
        ["champagne-flute-coupe-stem-pinch", "Ballroom Wine/Champagne Glass Stem Hold (Bowl Fingerprint Guard)", "#fbbf24", "#ec4899", "연회장 와인잔·샴페인 플루트는 체온 전달과 지문 방지를 위해 볼(Bowl)이 아닌 다리(Stem)를 잡는 귀족 매너 고정"],
        ["landau-brougham-carriage-leaf-spring", "Four-Horse Landau Carriage C-Spring & Smaller Front-Wheel Lock", "#d97706", "#38bdf8", "로판 4두 마차(Landau)는 조향 회전 반경을 위해 앞바퀴가 뒷바퀴보다 작고 C-스프링 판스프링에 현가된다는 구조 고정"],
        ["grand-bifurcated-staircase-balustrade", "Imperial Palace Bifurcated Marble Staircase & Train Drape", "#eab308", "#a855f7", "황궁 대연회장 Y자 분기 대리석 중앙 계단의 난간 동자주(Baluster) 간격과 계단을 내려오는 드레스 트레인 끌림 물리 고정"],
        ["waltz-closed-frame-hand-placement", "Viennese Waltz Closed Frame: Gentleman Right Hand on Left Scapula", "#ec4899", "#38bdf8", "무도회 왈츠 홀드 시 남성 오른손은 여성 왼쪽 견갑골 아래, 남성 왼손과 여성 오른손은 눈높이로 맞잡는 프레임 좌우 고정"],
        ["opera-box-proscenium-velvet-tier", "Imperial Opera House Royal Box (Loge) & Brass Opera Glasses", "#ef4444", "#eab308", "오페라 극장 2층 귀빈석(Royal Box) 붉은 벨벳 난간·황동 오페라글라스 파지·무대 프로시니엄 아치 조도 대비 고정"],
        ["greenhouse-conservatory-iron-rib", "Victorian Glass Conservatory Wrought-Iron Rib & Dappled Light", "#22c55e", "#38bdf8", "황궁 유리 온실(Conservatory)의 검은 주철 아치 프레임 소실점과 열대 양치식물 잎사귀 투과 보케 채광 고정"],
        ["fireplace-mantelpiece-flue-hearth", "Aristocratic Drawing-Room Marble Mantelpiece & Upward Hearth Light", "#f97316", "#eab308", "집무실 벽난로(Fireplace) 장작불이 인물 얼굴 아래쪽에서 위로 비추는 하방 난색 바운스 조명(2200K)과 대리석 맨틀피스 비례 고정"],
        ["four-poster-canopy-bed-tester", "Rococo Four-Poster Canopy Bed Valance & Tassel Drape Spec", "#a855f7", "#f472b6", "침실 4주 캐노피 침대(Four-Poster Bed) 상단 테스터(Tester) 천장과 벨벳 커튼 타이백 매듭의 투시 일관성 고정"],
        ["chandelier-crystal-prism-caustics", "24-Arm Crystal Chandelier Candle Bobèche & Prism Caustics", "#fbbf24", "#38bdf8", "대연회장 크리스탈 샹들리에의 동심원 촛대 배열과 프리즘 무지개 빛망울(Caustics) 확산 레이어 고정"],
        ["gothic-tracery-stained-glass-lead", "Cathedral Rose Window Lead-Came Lines & Colored Floor Light", "#6366f1", "#ec4899", "대성당 장미창 스테인드글라스의 검은 납선(Lead Came) 기하 분할과 대리석 바닥에 투영된 색광 왜곡 일치"],
        ["spiral-castle-stair-clockwise-def", "Medieval Castle Turret Clockwise Spiral Staircase Defense Spec", "#64748b", "#f59e0b", "중세 성탑 나선형 계단은 수비병의 오른손 검 휘두름에 유리하도록 올라갈 때 시계방향(Clockwise)으로 감긴다는 건축 고증 고정"],
        ["drawbridge-portcullis-winch-chain", "Fortress Iron Portcullis Vertical Groove & Drawbridge Winch Chain", "#475569", "#eab308", "성문 위에서 내려오는 철창(Portcullis)의 양측 석조 가이드 홈과 도개교(Drawbridge) 45° 인양 사슬 장력 고정"],
        ["rapier-swept-hilt-ricasso-grip", "Renaissance Swept-Hilt Rapier Index-Over-Quillon Ricasso Grip", "#38bdf8", "#eab308", "레이피어 검술에서 검지손가락을 크로스가드(Quillon) 너머 리카소(Ricasso)에 걸어 정밀 제어하는 파지 해부학 고정"],
        ["hunter-rank-gate-color-spectrum", "Hunter Gate Portal Rank Color Spectrum (Blue → Purple → Red Break)", "#ef4444", "#a855f7", "헌터물 게이트 등급별 사건의 지평선 색상(C~E급 청색 · A~B급 자색 · S급/던전브레이크 진홍색)과 주변 공간 굴절 왜곡 고정"],
        ["constellation-sponsor-toast-banner", "Constellation Stream Sponsor Toast Banner & Coin Counter HUD", "#38bdf8", "#fbbf24", "성좌물 시스템 후원 알림창의 반투명 글래스모피즘 패널과 캐릭터 안면 비가림(Anti-Occlusion) 플로팅 좌표 고정"],
        ["raid-party-5man-tank-healer-formation", "5-Man Dungeon Raid Spatial Formation (Tank Front / Healer Rear)", "#3b82f6", "#10b981", "던전 보스전 5인 파티의 전열 탱커(방패)·중열 근딜·측면 암살자·후열 마법사/힐러 공간 진형 및 어그로 시선 벡터 고정"],
        ["spatial-inventory-subspace-ripple", "Dimensional Inventory Golden Ripple Portal & Weapon Extraction", "#fbbf24", "#38bdf8", "아공간 인벤토리에서 무기를 꺼낼 때 허공에 생성되는 금빛 파문(Subspace Ripple) 평면과 무기 단면 차폐 마스킹 고정"],
        ["potion-vial-wax-stopper-meniscus", "Alchemical Potion Faceted Glass Vial & Gravity Liquid Meniscus", "#ef4444", "#22c55e", "회복/마나 포션 유리병이 기울어져 있어도 내부 액체 수면(Meniscus)은 항상 지구 지평선과 수평을 유지하도록 물리 고정"],
        ["magic-academy-dueling-arena-ward", "Magic Academy Hexagonal Barrier Ward-Dome & Impact Ripple", "#06b6d4", "#a855f7", "마법 아카데미 연무장 결투 시 관중석을 보호하는 육각 벌집형 마력 방어막(Hex Ward)의 피격 지점 동심원 파동 고정"],
        ["awakening-mana-measuring-orb-crack", "Hunter Association Mana-Measuring Crystal Orb Overload Fracture", "#a855f7", "#38bdf8", "각성자 등급 측정구(마나 측정 수정구) 과부하 균열 시 내부 코어 발광에서 표면 유리 파편으로 이어지는 방사형 크랙 고정"],
        ["guild-contract-hologram-tablet", "S-Rank Hunter Guild Contract Tablet & Biometric Seal Spec", "#2563eb", "#10b981", "대형 길드 스카우트 전자 계약서 및 양피지 마법 계약서의 계약금 숫자·서명란·지장 발광 위치 연속성 고정"],
        ["dungeon-boss-throne-aggro-radius", "Monarch Boss Room Obsidian Throne Scale & Phase-2 Shatter", "#dc2626", "#f97316", "군주급 보스방 거대 흑요석 왕좌의 인체 대비 4.5배 위압감 스케일과 2페이즈 돌입 시 파괴된 기둥 잔해 지속성 고정"],
        ["necromancer-shadow-summon-silhouette", "Necromancer Shadow Soldier Violet/Cyan Rim-Light & Smoke Tendril", "#8b5cf6", "#06b6d4", "네크로맨서 그림자 군단 소환수의 칠흑색 바디(#09090D)와 안광/갑주 모서리 네온 보라·시안 림라이트 대비 고정"],
        ["cyberpunk-neural-jack-nape-port", "Cyberpunk Sub-Occipital Neural Data-Jack Port & Cable Tension", "#00e5ff", "#ec4899", "사이버펑크 넷러너의 후두부(목덜미) 신경 데이터 포트 위치와 연결된 광케이블의 현수선 장력 고정"],
        ["cybernetic-prosthetic-seam-piston", "Cybernetic Arm Deltoid Seam, Vent Heat-Sink & Hydraulic Joint", "#38bdf8", "#f59e0b", "기계 의수(Cybernetic Arm)와 생체 어깨 삼각근의 결합부 파팅라인(Seam) 및 전완근 방열 슬릿 개폐 구조 고정"],
        ["hologram-kanji-hangul-neon-rain", "Cyberpunk Alley Vertical Hologram Signage & Wet Puddle Reflection", "#ec4899", "#00e5ff", "사이버펑크 비 내리는 뒷골목 공중 홀로그램 간판이 바닥 빗물 웅덩이에 상하 반전(수직 스트레치 블러)되어 비치는 반사 고정"],
        ["mecha-cockpit-linear-seat-pedal", "Giant Mecha 360° Linear-Seat Dual Side-Sticks & Foot Pedal Rig", "#10b981", "#38bdf8", "거대 메카닉 360도 전천후 콕핏 내부의 양손 사이드스틱 조종간·양발 러더 페달·경고 홀로그램 HUD 레이어 고정"],
        ["power-armor-pauldron-servo-clearance", "Exoskeleton Power-Armor Pauldron Joint Clearance & Servo Rig", "#f59e0b", "#3b82f6", "강화복(Power Armor) 착용 인물이 팔을 들어 올릴 때 거대 어깨장갑(Pauldron)이 헬멧을 뚫고 들어가는 자기충돌(Self-Collision) 작붕 차단"],
        ["modern-military-nvg-quad-tube-glow", "GPNVG-18 Quad-Tube Night Vision Goggles & Green Eyepiece Bounce", "#22c55e", "#10b981", "특수부대 4안 야간투시경(GPNVG-18) 헬멧 마운트 각도와 접안렌즈에서 눈가로 반사되는 초록빛/백린광(Phosphor Glow) 고정"],
        ["tactical-plate-carrier-molle-pouch", "JPC Plate Carrier MOLLE Webbing & 3x Rifle Mag Orientation", "#64748b", "#eab308", "전술 방탄복(Plate Carrier) 전면 3연장 소총 탄창 파우치에 삽탄된 탄창의 탄두가 아래를 향하고 곡률이 왼쪽(오른손 파지용)을 향하도록 고정"],
        ["sniper-scope-mil-dot-cheek-weld", "Long-Range Sniper Cheek-Weld Stock Contact & Mil-Dot Reticle", "#14b8a6", "#ef4444", "저격소총 사격 시 광대뼈를 개머리판에 밀착(Cheek Weld)하고 접안렌즈와 눈 사이 8cm 접안거리(Eye Relief)를 확보해 반동 부상을 막는 고증 고정"],
        ["helicopter-main-rotor-swashplate", "Tactical Helicopter Main-Rotor Coning Angle & Fast-Rope Door", "#38bdf8", "#f97316", "헬기 호버링 컷에서 메인 로터 블레이드의 상방 원추각(Coning Angle)과 회전 모션블러 디스크 투과율 고정"],
        ["submarine-conning-tower-sonar-waterfall", "Submarine Control Room Red Night-Rig Lighting & Sonar Display", "#ef4444", "#06b6d4", "잠수함 지휘실 야간 전투 배치 시 암적응 보호용 적색 조명(Red Rig)과 소나 워터폴 디스플레이 초록 파형 대비 고정"],
        ["korean-shaman-gut-bell-fan-lock", "Korean Muism (Shaman) Left-Hand Brass Bell + Right-Hand Fan Lock", "#ef4444", "#eab308", "한국 무속(굿) 퇴마 웹툰에서 무당이 왼손에는 칠성방울(요령), 오른손에는 삼불제석 부채를 쥐는 좌우 정통 지물 원칙 고정"],
        ["talisman-bujok-cinnabar-yellow-hanji", "Yellow-Hoehwang Hanji Talisman (Bujok) Cinnabar Red Ink Spec", "#eab308", "#dc2626", "괴담/퇴마물 괴황지(노란 한지) 부적의 경면주사 붉은 획순과 불타오를 때 재가 말려 올라가는 탄화 경계선 발광 고정"],
        ["catholic-exorcism-stole-rosary-latin", "Exorcism Priest Purple Stole, Crucifix & 5-Decade Rosary Spec", "#a855f7", "#eab308", "구마 사제의 보라색 영대(Stole) 착용·오른손 십자가 거양·왼손 구마경/성수채 파지 및 5단 묵주 알 배열 고증"],
        ["onmyoji-ofuda-pentagram-kuji-kiri", "Onmyoji Kuji-in 9 Hand Seals & Abe-no-Seimei Pentagram Line", "#38bdf8", "#ec4899", "음양사/퇴마물 구자호신법(임병투자개진열재전) 수인 손가락 교차 순서와 오망성(세이만) 한붓그리기 교차 위상 고정"],
        ["crime-scene-yellow-marker-tent", "Forensic Crime-Scene Yellow Numbered Evidence Tent (1~9) Spec", "#facc15", "#ef4444", "추리/스릴러 사건 현장의 노란 삼각 번호판(1번 탄피 · 2번 혈흔 · 3번 흉기) 위치가 컷이 바뀌어도 절대 이동하지 않도록 평면도 고정"],
        ["fingerprint-whorl-loop-arch-powder", "Latent Fingerprint Aluminum Powder & Whorl/Loop Ridge Flow", "#94a3b8", "#38bdf8", "과학수사 지문 감식 클로즈업에서 궁상문·제상문·와상문 융선(Ridge) 연속성과 전사 필름 번호표 일관성 고정"],
        ["luminol-chemiluminescence-blue-425nm", "Luminol Blood-Trace 425nm Pale-Blue Chemiluminescence Glow", "#38bdf8", "#6366f1", "암실 루미놀 혈흔 반응 시 붉은색이 아닌 425nm 파장의 창백한 청백색 화학발광(Chemiluminescence)으로 빛난다는 과학수사 고증 고정"],
        ["autopsy-suite-stainless-scale-drain", "Medical Examiner Autopsy Table Stainless Drain & Y-Incision", "#06b6d4", "#64748b", "법의학 부검실 타공 스테인리스 테이블·무영등 반사·법의관 페이스실드 및 차트 기록 마이크 위치 고정"],
        ["interrogation-two-way-mirror-cam", "Interrogation Room Red Recording Tally Light & Two-Way Mirror", "#2563eb", "#ef4444", "취조실(밝은 조명)과 참관실(어두운 조명) 사이의 단방향 거울 물리 조건(참관실이 밝으면 용의자에게 내부가 보임) 고증 고정"],
        ["polygraph-galvanic-pneumo-chart", "Polygraph Thoracic Pneumograph Tube & Finger EDA Sensor Spec", "#10b981", "#ef4444", "거짓말탐지기(Polygraph) 검사 시 가슴/복부 호흡 벨트 2줄·손가락 피부전기반응(EDA) 센서·혈압 커프 착용 부위 고정"],
        ["locked-room-mystery-floorplan-alibi", "Whodunit Locked-Room Architectural Floorplan & Sightline Cone", "#f59e0b", "#38bdf8", "본격 추리물 밀실 트릭 해명 컷의 아이소메트릭 평면도(창문 잠금쇠·환기구 치수·용의자 시야각 콘) 기하 정합성 고정"],
        ["red-string-conspiracy-corkboard", "Detective Conspiracy Corkboard Polaroid Pin & Red Yarn Sag", "#ef4444", "#eab308", "사건 분석 코르크보드 위 압정(Pushpin)에서 압정으로 연결된 붉은 털실의 중력 현수선(Catenary Sag)과 폴라로이드 여백 고정"],
        ["cryptography-cipher-wheel-vigenere", "Historical Cipher Disk Alignment & Letterlocking Wax Fold", "#d97706", "#10b981", "고전 암호 원판(Cipher Wheel) 알파벳 정렬과 봉투 없이 편지지를 접어 봉랍으로 잠그는 레터로킹(Letterlocking) 주름 고증"],
        ["antique-pocket-watch-roman-iiii", "Horology Rule: Traditional Roman Watch Dial Uses 'IIII' at 4", "#eab308", "#38bdf8", "회귀물·시대극 로마자 시계 문자판에서 4시 방향은 시각적 균형을 위해 'IV' 대신 전통 시계 표기인 'IIII'를 쓰고 시침/분침 각도를 연동 고정"],
        ["chess-endgame-algebraic-legal-board", "Chess Board 'White-on-Right' (h1 Light Square) & Legal Position", "#f8fafc", "#f59e0b", "두뇌싸움 웹툰 체스판에서 플레이어 기준 우측 하단 모서리(h1/a8)는 반드시 밝은 칸(White-on-Right)이며 퀸은 자신의 색 칸에서 시작한다는 규칙 고정"],
        ["baduk-go-board-19x19-star-points", "19x19 Baduk Goban 9 Star-Points & Index-Middle Stone Snap Grip", "#f59e0b", "#10b981", "19줄 바둑판의 화점(Star Point) 위치와 검지(아래)·중지(위) 사이에 바둑돌을 끼워 착점하는 정통 파지법 및 사석(따낸 돌) 관리 고증"],
        ["playing-card-poker-pip-symmetry", "Playing Card Top-Left/Bottom-Right Index & Fan Direction Guard", "#ef4444", "#f8fafc", "도박/카지노 웹툰 트럼프 카드를 부채꼴(Fan)로 펼칠 때 좌상단 숫자와 문양(Pip)이 가려지지 않는 펼침 방향과 점대칭 그림카드 고정"],
        ["tarot-78-major-minor-spread-cross", "Celtic Cross Tarot Spread & Upright vs Reversed Arcana Lock", "#a855f7", "#fbbf24", "오컬트 타로 카드 스프레드에서 정방향(Upright)과 역방향(Reversed) 카드의 컷 간 뒤집힘 불일치 차단 및 로마 숫자(0~XXI) 고정"],
        ["archaeological-trench-grid-trowel", "Archaeological 1x1m Trench String Grid & North-Arrow Scale Board", "#d97706", "#22c55e", "유적 발굴 웹툰의 1×1m 백색 수평 실 격자(Grid)·지층(Stratigraphy) 색상 단차·북쪽 화살표 흑백 스케일 보드 고증"],
        ["museum-conservation-uv-fluoresce", "Fine-Art Conservation UV Fluorescence Overpaint & X-Ray Layer", "#8b5cf6", "#00e5ff", "미술품 위작/복원 웹툰에서 자외선(UV) 조사 시 후대 덧칠(Overpaint) 부위만 어두운 보랏빛 형광 반응으로 드러나는 감정 연출 고정"],
      ] as const
    ).map(([id, nameKo, accentPrimaryHex, accentSecondaryHex, coreWorkflowKo], idx) => [
      id,
      Object.freeze({
        platformId: id as Rea15PlatformId,
        nameKo,
        originUrl: "https://github.com/",
        reaEvidenceId: `ev_d3112233445566778899aabbccddeeff00112233445566778899aabbccddee${idx.toString(16).padStart(2, "0")}`,
        scenarioSha256: `e3112233445566778899aabbccddeeff00112233445566778899aabbccddee${idx.toString(16).padStart(2, "0")}`,
        surfaceHex: "#121318",
        panelHex: "#1b1d26",
        borderHex: "#313546",
        textPrimaryHex: "#f8fafc",
        textMutedHex: "#94a3b8",
        accentPrimaryHex,
        accentSecondaryHex,
        borderRadiusPx: 8,
        fontStack: "Pretendard, Inter, sans-serif",
        coreWorkflowKo,
        keyRoutes: ["/"],
      }),
    ]),
  ) as unknown as Record<Rea15PlatformId, Rea15PlatformUiThemeSpec>),
});

export const REA39_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA50_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA65_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA80_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA100_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA120_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA140_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA160_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA180_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA200_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA220_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA240_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA260_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA280_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA300_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA320_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA340_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA360_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA380_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA400_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA420_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA440_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA460_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA480_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA500_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA520_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA540_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA560_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA580_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA600_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA620_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA640_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA660_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA680_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA700_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA720_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
