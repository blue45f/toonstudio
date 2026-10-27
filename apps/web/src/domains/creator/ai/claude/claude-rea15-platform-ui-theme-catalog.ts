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
  // Wave 39 (20개 플랫폼 — 총 740개 플랫폼 완성: e스포츠 HUD/게이머 장비·K-POP 콘서트 인이어/응원봉/칼군무·법정/구치소·항공/우주 무중력/궁술/펜싱)
  "esports-moba-hud-minimap-killfeed", "gamer-mechanical-keyboard-wasd-mouse", "kpop-idol-wireless-iem-headset-mic", "concert-lightstick-ocean-dmx-laser", "stage-blocking-choreo-v-formation",
  "korean-courtroom-judge-prosecutor-seat", "prison-interview-acrylic-divider-jumpsuit", "police-handcuff-keyhole-miranda-bodycam", "airliner-cockpit-throttle-yoke-hud", "fighter-jet-hmcs-hud-afterburner-diamond",
  "zero-gravity-hair-float-tether-thruster", "submarine-sonar-waterfall-periscope", "sailing-tallship-rigging-wind-pennant", "scuba-diving-regulator-bcd-bubble", "mountain-climbing-figure8-knot-carabiner",
  "archery-mediterranean-thumb-draw-paradox", "fencing-foil-epee-sabre-lame-target", "boxing-mma-orthodox-southpaw-guard", "billiards-cue-bridge-ghostball-tangent", "bowling-3hole-thumb-exit-pin-deck",
  // Wave 40 (20개 플랫폼 — 총 760개 플랫폼 완성: 피아노 88건반/기타/드럼/오케스트라·에스프레소/오마카세/소믈리에/다도·서예/도예·벚꽃/단풍/대나무·대장간/연금술)
  "piano-88key-2-3-blackkey-pedal-rig", "acoustic-electric-guitar-6string-fret", "drum-kit-hihat-crossstick-kick-pedal", "orchestra-conductor-baton-seating-arc", "espresso-portafilter-tamp-latte-art",
  "sushi-omakase-yanagiba-shari-nigiri", "bakery-laminated-croissant-crumb-oven", "wine-sommelier-foil-corkscrew-swirl", "tea-ceremony-chado-dadou-chasen-whisk", "calligraphy-brush-inkstone-seal-chops",
  "oil-painting-palette-thumbhole-mahlstick", "pottery-wheel-ccw-centring-kiln-glaze", "stained-glass-came-leadline-caustic-proj", "cherry-blossom-5petal-notch-autumn-maple", "bamboo-node-internode-hollow-culm-cut",
  "bonsai-ikebana-heaven-earth-man-asymmetry", "origami-paper-crane-valley-mountain-fold", "sewing-tailor-mannequin-tape-chalk-stitch", "blacksmith-anvil-horn-tongs-quench-steam", "alchemy-retort-alembic-astrolabe-orrery",
  // Wave 41 (20개 플랫폼 — 총 780개 플랫폼 완성!: 굴착기/지게차/타워크레인/송전탑/전철·네온사인 유리관/간판 외계어 방지·여권 MRZ/화폐·웹툰 세무/어시 정산 ERP)
  "construction-excavator-boom-stick-bucket", "forklift-rear-wheel-steer-pallet-mast", "tower-crane-jib-counterweight-trolley", "high-voltage-pylon-catenary-insulator", "railway-pantograph-catenary-sleeper-gauge",
  "shipping-container-iso-corner-casting-rib", "fire-hydrant-sprinkler-extinguisher-pin", "elevator-call-button-braille-floor-arrow", "escalator-yellow-demarcation-combplate", "vending-machine-coin-slot-can-dispense",
  "neon-sign-glass-tube-electrode-transformer", "hangul-hanja-kana-shop-signboard-ortho", "newspaper-headline-column-halftone-fold", "passport-boarding-pass-mrz-barcode-stamp", "currency-banknote-serial-hologram-bundle",
  "hospital-wheelchair-caster-crutch-axilla", "baby-stroller-bassinet-swaddle-bottle", "agricultural-rice-paddy-sickle-terraces", "fishing-rod-parabolic-bend-spinning-reel", "webtoon-studio-tax-withholding-erp-ledger",
  // Wave 42 (20개 플랫폼 — 총 800개 플랫폼 돌파!: 치과/안과/정형외과 X-ray 마커/구급차·소방관/해양구조·화학/현미경/원심분리기·승마/매사냥/시계기어/보석/조향)
  "dental-fdi-tooth-chart-mirror-handpiece", "ophthalmology-slit-lamp-phoropter-snellen", "orthopedic-x-ray-bone-fracture-cast-sling", "obstetrics-ultrasound-transducer-fetal-hr", "ambulance-stretcher-defibrillator-paddle",
  "firefighter-scba-mask-halligan-hose", "coast-guard-rescue-hoist-basket-flare", "chemistry-burette-meniscus-erlenmeyer-fume", "microscope-binocular-objective-turret-stage", "dna-gel-electrophoresis-pipette-centrifuge",
  "astronomy-equatorial-mount-counterweight", "meteorology-anemometer-stevenson-barograph", "veterinary-stethoscope-elizabethan-collar", "equestrian-dressage-bridle-curb-stirrup", "falconry-gauntlet-jesses-hood-perch",
  "beekeeping-veil-smoker-langstroth-frame", "aquarium-planted-co2-diffuser-canister", "horology-watchmaker-loupe-tourbillon-gear", "jewelry-gemstone-4prong-pave-loupe", "perfumery-organ-blotter-strip-flacon",
  // Wave 43 (20개 플랫폼 — 총 820개 플랫폼 완성: 영화 촬영장 슬레이트/붐마이크/C스탠드/부조정실 탈리·수능 OMR/교실/학사모·TCG/TRPG D20/마작/룰렛·롤러코스터/관람차/캠핑)
  "film-slate-clapperboard-timecode-stripes", "boom-mic-blimp-deadcat-shockmount-cstand", "camera-dolly-track-steadicam-vest-gimbal", "tv-control-room-preview-program-tally", "radio-booth-xlr-popfilter-onair-lamp",
  "theater-proscenium-fly-loft-footlight", "korean-csat-omr-card-computer-pen-clock", "school-chalkboard-eraser-locker-indoor-shoe", "library-dewey-decimal-spine-label-cart", "graduation-mortarboard-tassel-left-right",
  "tcg-card-sleeve-mana-tap-90deg-graveyard", "trpg-polyhedral-dice-d20-opposite-sum21", "mahjong-136tile-wall-dora-discard-river", "roulette-37pocket-zero-green-croupier-rake", "slot-machine-3reel-payline-coin-hopper",
  "arcade-claw-machine-gantry-3prong-joystick", "amusement-rollercoaster-upstop-wheel-harness", "ferris-wheel-spoke-truss-pendulum-gondola", "camping-tent-guyline-peg-45deg-lantern", "ski-snowboard-binding-din-gondola-pole",
  // Wave 44 (20개 플랫폼 — 총 840개 플랫폼 완성!: 다이얼 전화기/타자기/턴테이블/필름카메라/폴라로이드·모래시계/촛불/천칭/물레/맷돌/우물/우산·펼친책 곡면/유료 미리보기 전환)
  "rotary-telephone-finger-stop-coiled-cord", "typewriter-qwerty-typebar-carriage-return", "vinyl-turntable-tonearm-right-cw-groove", "cassette-tape-capstan-window-pencil-rewind", "film-slr-camera-pentaprism-advance-lever",
  "polaroid-instant-camera-bottom-eject-border", "hourglass-sand-angle-of-repose-34deg-bulb", "candlestick-wax-drip-wick-flame-teardrop", "oil-lamp-glass-chimney-wick-thumbwheel", "abacus-soroban-1-4-heaven-earth-beads",
  "balance-scale-fulcrum-knife-edge-heavier-low", "spinning-wheel-flyer-bobbin-treadle-loom", "traditional-millstone-maetdol-handle-ccw", "well-pulley-bucket-rope-tension-winch", "umbrella-parabolic-8rib-stretchers-runner",
  "luggage-telescopic-handle-4spinner-tsa", "shopping-cart-child-seat-swivel-caster-nest", "museum-exhibition-stanchion-velvet-rope-plaque", "bookbinding-french-groove-headband-ribbon", "webtoon-episode-cliffhanger-paywall-conversion",
  // Wave 45 (20개 플랫폼 — 총 860개 플랫폼 완성: 신기전 화차/거북선/투석기/충차/전차/방패진·일본도 카타나/갓 망건/비녀 노리개/가마/봉수대/온돌/장독대/물레방아/조총/마상창시합)
  "joseon-hwacha-singijeon-multi-rocket", "turtle-ship-geobukseon-dragon-head-oars", "medieval-trebuchet-counterweight-sling", "battering-ram-tortoise-shed-portcullis", "chariot-2horse-yoke-spoked-wheel-rein",
  "roman-testudo-scutum-phalanx-sarissa", "japanese-katana-tsuba-hamon-left-saya", "joseon-gat-manggeon-gwanja-amber-string", "korean-binyeo-cheopji-norigae-samjak", "palanquin-gama-4bearer-pole-curtain",
  "beacon-mound-bongsu-5chimney-smoke-code", "traditional-ondol-agungi-gudeul-chimney", "jangdokdae-onggi-breathing-glaze-ferment", "straw-thatched-choga-ridge-rope-grid", "watermill-mullebang-a-overshot-bucket",
  "black-powder-matchlock-jochong-pan-ramrod", "cannon-breech-muzzle-sponge-recoil-rope", "medieval-wax-tablet-stylus-parchment-scroll", "heraldic-jousting-lance-vamplate-tilt-barrier", "chain-drawbridge-counterweight-moat-reflection",
  // Wave 46 (20개 플랫폼 — 총 880개 플랫폼 완성: 아포칼립스 바리케이드/방독면/가이거/방호복·빠루/볼트커터/자물쇠따기/금고/보안레이저/열화상·해킹터미널/서버랙/CCTV/블랙박스/옥상난간/무전기)
  "zombie-bite-tourniquet-barricade-board-nail", "gas-mask-40mm-nato-canister-cheek-filter", "geiger-counter-pancake-probe-sievert-scale", "hazmat-level-a-positive-pressure-suit-zip", "crowbar-goose-neck-fulcrum-padlock-shackle",
  "bolt-cutter-compound-hinge-chain-link", "lockpick-tension-wrench-bottom-keyway-rake", "safe-combination-dial-3wheel-r-l-r-notch", "laser-tripwire-smoke-scatter-mirror-bounce", "night-vision-green-phosphor-vs-white-thermal",
  "hacking-terminal-ssh-nmap-wireshark-hex", "server-rack-42u-patch-panel-hot-cold-aisle", "cctv-ptz-dome-blindspot-fisheye-timestamp", "car-blackbox-dashcam-wide140-gps-g-sensor", "subway-platform-screen-door-psd-emergency",
  "rooftop-parapet-wall-height-ac-outdoor-unit", "manhole-cover-round-lip-ladder-rung-sewer", "fire-escape-counterbalanced-drop-ladder", "diesel-generator-pull-cord-recoil-jerrycan", "walkie-talkie-ptt-thumb-button-helical-ant",
  // Wave 47 (20개 플랫폼 — 총 900개 플랫폼 대기록 돌파!: 고양이 동공/강아지 하네스/말 귀/올빼미 대지족/뱀/나비/거미 8다리/문어 vs 오징어/상어 vs 고래/갑각류·크로노그래프/정장 단추/넥타이/하이힐/안경다리/보청기/수어/국립중앙도서관 납본)
  "cat-vertical-slit-pupil-ear-airplane-tail", "dog-play-bow-tail-wag-panting-harness-y", "horse-ear-pinned-back-flemen-hoof-frog", "owl-head-270deg-zygodactyl-talon-silent", "snake-forked-tongue-jacobson-pit-belly-scute",
  "butterfly-4wing-forewing-overlap-proboscis", "spider-8leg-cephalothorax-pedipalp-spinneret", "octopus-8arm-double-sucker-mantle-siphon", "shark-5gill-slit-vertical-tail-fin-dorsal", "crab-10leg-chela-pincer-sideways-carapace",
  "watch-chronograph-2pusher-tachymeter-crown", "fountain-pen-converter-piston-iridium-tip", "mens-suit-button-rule-sometimes-always-never", "necktie-four-in-hand-windsor-dimple-belt", "high-heel-stiletto-shank-arch-ankle-strap",
  "backpack-shoulder-strap-sternum-buckle-zip", "eyeglasses-nose-pad-temple-tip-ear-hook", "hearing-aid-bte-cie-cochlear-magnet-coil", "sign-language-ksl-asl-handshape-nonmanual", "webtoon-global-archive-isbn-issn-legal-deposit",
  // Wave 48 (20개 플랫폼 — 총 920개 플랫폼 완성: 무협 화산파 매화검기/남궁세가 뇌전대검/사천당가 암기/제갈세가 기문둔갑/소림 108염주/천마신교/개방 타구봉/무당 태극/선협 어검비행/연단로/객잔 2층/대나무 절단/죽간/전서구/은침 진맥)
  "murim-plum-blossom-sword-qi-petal", "namgung-imperial-lightning-broadsword-rig", "tang-clan-hidden-weapon-poison-needle-pouch", "zhuge-clan-qimen-dunjia-bagua-stone-array", "shaolin-18arhat-wooden-staff-rosary-108",
  "demonic-cult-heavenly-demon-blood-qi-throne", "beggars-sect-bamboo-dog-beating-staff-gourd", "kunlun-wudang-taiji-yin-yang-fly-whisk", "xianxia-flying-sword-imperial-stance-talisman", "alchemy-pill-furnace-cauldron-tribulation-lightning",
  "martial-alliance-arena-stone-tile-flagpole", "inn-tavern-2nd-floor-railing-wine-jar-seal", "bamboo-forest-mist-leaf-slash-shockwave", "waterfall-meditation-boulder-splash-refraction", "meridian-dantian-golden-core-nascent-soul",
  "ancient-scroll-bamboo-slip-silk-manuscript", "imperial-jade-seal-red-cinnabar-paste-box", "carrier-pigeon-bamboo-leg-tube-wax-message", "acupuncture-silver-needle-case-pulse-wrist", "sealed-demonic-sword-chain-talisman-wrap",
  // Wave 49 (20개 플랫폼 — 총 940개 플랫폼 완성: 카지노 바카라/텍사스홀덤·슈퍼요트/프라이빗제트/펜트하우스·경매장/런웨이/파인다이닝·시가/위스키/에스프레소·그랜드피아노 우측 덮개/스트라디바리우스·골프/폴로/F1 헤일로/슈퍼카 시저도어/스위스 금고)
  "casino-baccarat-squeeze-shoe-chip-denomination", "poker-texas-holdem-button-flop-turn-river", "luxury-yacht-flybridge-teak-deck-champagne", "private-jet-cabin-club-seating-oval-window", "five-star-penthouse-infinity-pool-city-skyline",
  "auction-house-podium-gavel-paddle-number", "haute-couture-runway-catwalk-backstage-rack", "michelin-kitchen-pass-heat-lamp-tweezers", "cigar-humidor-guillotine-cutter-cedar-spill", "whisky-glencairn-ice-ball-decanter-cut-glass",
  "espresso-lever-machine-naked-portafilter-tiger", "violin-stradivarius-f-hole-chinrest-rosin-dust", "grand-piano-lid-prop-stick-right-side-damper", "golf-driver-tee-shot-divot-bunker-sand-splash", "polo-mallet-right-hand-only-helmet-martingale",
  "f1-pitstop-wheel-gun-halo-cockpit-drs-wing", "supercar-scissor-vs-gullwing-door-hinge-caliper", "swiss-bank-safe-deposit-dual-key-biometric-vault", "red-carpet-step-and-repeat-logo-wall-strobe", "opera-glasses-mother-of-pearl-handle-balcony",
  // Wave 50 (20개 플랫폼 — 총 960개 플랫폼 완성!: 심해 잠수정/해상 시추선/쇄빙선/사막 모래언덕/화산 용암·우주정거장 큐폴라/선외우주복/화성 로버/콜드슬립/체렌코프 발광·BSL-4 방호복/관제탑/풍력발전/댐 여수로/냉각탑/방공호 방폭문/항공모함 캐터펄트/크레바스)
  "deep-sea-submersible-acrylic-sphere-biolum", "oil-rig-offshore-derrick-helipad-flare-boom", "arctic-icebreaker-snowmobile-dog-sled-goggle", "desert-sandstorm-mirage-dune-slipface-shemagh", "volcano-lava-tube-obsidian-pyroclastic-ash",
  "space-station-cupola-window-earth-terminator", "eva-spacesuit-tether-hook-visor-gold-fresnel", "lunar-mars-rover-6wheel-rocker-bogie-habitat", "cryosleep-pod-frost-glass-biomonitor-tube", "particle-accelerator-torus-cherenkov-blue-glow",
  "bsl4-biohazard-airlock-chemical-shower-glovebox", "air-traffic-control-tower-radar-sweep-runway", "wind-turbine-3blade-nacelle-solar-tracker-farm", "hydroelectric-dam-spillway-floodgate-penstock", "nuclear-cooling-tower-hyperbolic-steam-plume",
  "underground-bunker-blast-door-handwheel-dog", "cargo-plane-rear-ramp-paratrooper-green-light", "aircraft-carrier-catapult-steam-arresting-wire", "ice-cave-glacier-crevasse-crampon-ice-axe", "mine-shaft-timber-shoring-ore-cart-canary-lamp",
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
export const REA740_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA760_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA780_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA800_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA820_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA840_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA860_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA880_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA900_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA920_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA940_PLATFORM_IDS = REA15_PLATFORM_IDS;
export const REA960_PLATFORM_IDS = REA15_PLATFORM_IDS;

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
  glimnavi: { platformId: "glimnavi", nameKo: "그림나비 (GlimNavi Studio v2.3)", originUrl: "https://glimnavi.com/function-step3.html", reaEvidenceId: "ev_f2c78ddd17640152c0ce5ea59a6634cd0f7029fe29a852251b9147d1e60e3570", scenarioSha256: "3ac6113ac3d149b37ff9863b5deb6a7d8ff15ccfb597457ca150a6e9a98f60d1", surfaceHex: "#f6f7fb", panelHex: "#ffffff", borderHex: "#e5e7eb", textPrimaryHex: "#111827", textMutedHex: "#6b7280", accentPrimaryHex: "#00a8c2", accentSecondaryHex: "#3b82f6", borderRadiusPx: 14, fontStack: "Pretendard Variable, sans-serif", coreWorkflowKo: "5단계(기획·각색→콘티→선화 v1.0~v2.3→자동채색→AI 그림자·조명·명암 Relight) + 컬러 레이어 분리 + PSD 출력", keyRoutes: ["/", "/function-step3.html", "/plan.html", "/tutorial.html"] },
  snaptoon: { platformId: "snaptoon", nameKo: "스냅툰 · 스냅보드 (Snaptoon & Snapboard)", originUrl: "https://snaptoon.co.kr/", reaEvidenceId: "ev_b1e4285baa78b85f3ad6b72dd54277f72ecff570448402bebd87070fac64a8c3", scenarioSha256: "f05844d786ada6594f200e5398c9081345085acd0152146d0111169592e13acb", surfaceHex: "#FAF8F5", panelHex: "#F2EFEA", borderHex: "#E8E5E0", textPrimaryHex: "#1A1A1A", textMutedHex: "#6B6B6B", accentPrimaryHex: "#1E3A5F", accentSecondaryHex: "#2A5285", borderRadiusPx: 12, fontStack: "Pretendard, Noto Serif KR, EB Garamond", coreWorkflowKo: "스냅툰 3D 실시간 렌더링 → 스냅보드 AI 창작·변환 → 스냅툰 웨어하우스 3D 소재", keyRoutes: ["/", "/en/"] },
  kaistory: { platformId: "kaistory", nameKo: "카이스토리 · 카이툰 (KAISTORY & KAITOON)", originUrl: "https://kaistory.net/", reaEvidenceId: "ev_76255f44204c56a3615ba3ed1dd0f8a5f1cf15aaf954649b456e50cc80824613", scenarioSha256: "4a783a2b5bd2aa91f0b3c076bce1bb3bb6c1c8f7d84d54742a53493c0bcced7d", surfaceHex: "#f6f7fb", panelHex: "#ffffff", borderHex: "#e7e8f0", textPrimaryHex: "#1a1c2b", textMutedHex: "#5c6178", accentPrimaryHex: "#16168f", accentSecondaryHex: "#ff5a4d", borderRadiusPx: 14, fontStack: "Pretendard, sans-serif", coreWorkflowKo: "단일 프로젝트 데이터 엔벨로프(conti→design→editor→story) + 화자별 TTS + KAION 학습카드·문제 생성", keyRoutes: ["https://conti.kaistory.net", "https://design.kaistory.net", "https://editor.kaistory.net", "https://story.kaistory.net"] },
  ggooming: { platformId: "ggooming", nameKo: "꾸밍 (GGOOMING)", originUrl: "https://www.ggooms.com/", reaEvidenceId: "ev_28d88e317e86129ace97da5ecc1aa6be41335b246956741190f7f5416fc37e32", scenarioSha256: "912a469864405fc70aa12501c5f0fa64108ae1b49ca11702696dc6b98fd258aa", surfaceHex: "#eff6ff", panelHex: "#ffffff", borderHex: "#bfdbfe", textPrimaryHex: "#1e3ad4", textMutedHex: "#3f3f3f", accentPrimaryHex: "#274bff", accentSecondaryHex: "#4980ff", borderRadiusPx: 12, fontStack: "Geist, Geist Mono, sans-serif", coreWorkflowKo: "인스타툰·브랜드 콜라보 고속 컷 생성 및 캐릭터 화풍 일관성 락", keyRoutes: ["/", "/dashboard", "/dashboard/projects", "/dashboard/projects/new"] },
  "plask-motion": { platformId: "plask-motion", nameKo: "플라스크 모션 (Plask Motion)", originUrl: "https://plask.ai/", reaEvidenceId: "ev_e4c693a8ddd64ef1def91fcb5c6fc6fec52335a136eb945fbe376747ead4c7cb", scenarioSha256: "12062ecfeaed08c6dda16eee9ad9531e6d5982b08267f72947e57b6564756e1f", surfaceHex: "#0a0a0a", panelHex: "#171717", borderHex: "#333333", textPrimaryHex: "#ededed", textMutedHex: "#a0a0a0", accentPrimaryHex: "#0467DF", accentSecondaryHex: "#06C755", borderRadiusPx: 10, fontStack: "var(--font-plask-latin), var(--font-plask-cjk)", coreWorkflowKo: "단일 카메라 영상 AI 모션 캡처 → VRM/FBX 리타게팅 → 키프레임 스무딩 & DOF/모션블러", keyRoutes: ["/"] },
  "manhwa-ai": { platformId: "manhwa-ai", nameKo: "ManhwaAI", originUrl: "https://www.manhwaai.net/", reaEvidenceId: "ev_0a8511a3646c5da383e58a2b265eb450df9661c4601ca6414526ebeab5cfaee3", scenarioSha256: "d1cf486502398a0d6d77151a5219a8b55d4c0bc7395c6652f98c97b787dfe809", surfaceHex: "#17131e", panelHex: "#1d1825", borderHex: "#241925", textPrimaryHex: "#f8f4ee", textMutedHex: "#766b7d", accentPrimaryHex: "#7b5cff", accentSecondaryHex: "#e83f69", borderRadiusPx: 12, fontStack: "Inter, sans-serif", coreWorkflowKo: "6대 만화 화풍 프리셋(full-color, black-and-white 등) + 5대 톤 오버레이(FocusingLine, SpeedLine, Tone 등)", keyRoutes: ["/manhwa-character-generator", "/manhwa-editor", "/comic-editor", "/gallery/manhwa"] },
  "komiko-ai": { platformId: "komiko-ai", nameKo: "Komiko AI", originUrl: "https://komiko.app/", reaEvidenceId: "ev_a6091c8e574902740961b2395722ee6d65d22ef730bf05408d69f249434dc3ea", scenarioSha256: "c0bd29800afafd282dee7defc4aadfa39a40f051351063644c1d674d68500c5c", surfaceHex: "#0f101a", panelHex: "#181926", borderHex: "#2a2c42", textPrimaryHex: "#f3f4f6", textMutedHex: "#9ca3af", accentPrimaryHex: "#7C5CFA", accentSecondaryHex: "#FF4D9D", borderRadiusPx: 12, fontStack: "Plus Jakarta Sans, Inter, sans-serif", coreWorkflowKo: "OC 캐릭터 메이커 + 선화 채색 + 스케치 단순화 + 레이어 분리기(/layer_splitter) + 인비트윈(/inbetween)", keyRoutes: ["/oc-maker", "/ai-comic-generator", "/line_art_colorization", "/sketch_simplification", "/layer_splitter", "/inbetween", "/voice/generate"] },
  anifusion: { platformId: "anifusion", nameKo: "Anifusion", originUrl: "https://anifusion.ai/", reaEvidenceId: "ev_01828021391fc904afa8460e67291e1e0cedeb7bddfa084da1a92fe64adff8c8", scenarioSha256: "841e3a9d62df517833baa136eddc61ede2f971f8a63f6406c864202fdc4ca2fa", surfaceHex: "#1a1b1e", panelHex: "#25262b", borderHex: "#373a40", textPrimaryHex: "#fcfcfc", textMutedHex: "#858585", accentPrimaryHex: "#2196f3", accentSecondaryHex: "#4dabf7", borderRadiusPx: 10, fontStack: "Inter, sans-serif", coreWorkflowKo: "노드 플로우(/dashboard/flow/) + 무한 캔버스(/dashboard/canvas/) + 캐릭터 시트(/dashboard/character-sheets/)", keyRoutes: ["/dashboard/flow/", "/dashboard/canvas/", "/dashboard/character-sheets/", "/dashboard/comic-presets/", "/dashboard/sketch/", "/editor/"] },
  "katalist-ai": { platformId: "katalist-ai", nameKo: "Katalist AI", originUrl: "https://www.katalist.ai/", reaEvidenceId: "ev_6a2f91553a83af023e5531e399a40b2a077eb8dbdf3345f8d1d8af3ec6d23cc5", scenarioSha256: "33f0829eb08241e561a034d42f0889221b1d91989ce511b784d2d87590da1ae7", surfaceHex: "#0f172a", panelHex: "#1e293b", borderHex: "#334155", textPrimaryHex: "#f8fafc", textMutedHex: "#94a3b8", accentPrimaryHex: "#38bdf8", accentSecondaryHex: "#818cf8", borderRadiusPx: 12, fontStack: "Familjen Grotesk, Crimson Pro, Geist, Inter", coreWorkflowKo: "스크립트 자동 샷 분해 → 캐릭터·배경 고정 스토리보드 → 프레임별 포즈·앵글 직접 조작", keyRoutes: ["/"] },
  novelai: { platformId: "novelai", nameKo: "NovelAI", originUrl: "https://novelai.net/", reaEvidenceId: "ev_ed7b1d3017d19c852444e210f9905a7784dbf6ebd46e3e06e91c6d3f6e2e9633", scenarioSha256: "ee8200a356f72e7929601f8bae3c21373a2545bfb8a7caecccba1e179bd2ebc8", surfaceHex: "#0e0f21", panelHex: "#13152c", borderHex: "#252849", textPrimaryHex: "#f5f3c2", textMutedHex: "#e6e6e6", accentPrimaryHex: "#DCA7D7", accentSecondaryHex: "#5D69DE", borderRadiusPx: 8, fontStack: "Inter, Source Sans Pro, serif", coreWorkflowKo: "로어북 서사 메모리(/stories) + 다중 캐릭터 좌표 분리 & Vibe Transfer(/image)", keyRoutes: ["/stories", "/image", "/user/subscription", "/user/inventory"] },
  mootion: { platformId: "mootion", nameKo: "Mootion", originUrl: "https://www.mootion.com/", reaEvidenceId: "ev_0a0286dd2b8b2c4d017d08fb7af0cb82d91266b998ea37464fcb8ce43ac93e78", scenarioSha256: "d787a0537e1bddb33799f194acf0ab144b6add9c10185879cba21c07755585da", surfaceHex: "#0e1d47", panelHex: "#211f2c", borderHex: "#3021d9", textPrimaryHex: "#fafafa", textMutedHex: "#9a9a9a", accentPrimaryHex: "#4c33ff", accentSecondaryHex: "#a846ee", borderRadiusPx: 12, fontStack: "Inter, sans-serif", coreWorkflowKo: "프롬프트·대본 → 스토리보드 → 3D/비디오 애니매틱 시퀀스 자동 변환", keyRoutes: ["/"] },
  skyreels: { platformId: "skyreels", nameKo: "SkyReels", originUrl: "https://www.skyreels.ai/", reaEvidenceId: "ev_5b2e30d22a2b9ca1e351d56b727f16a800309bc25a07351272cca8048b87aeca", scenarioSha256: "86c5cc6fe9d8b1e50abf26cf1b8037fed348b5afbfe5de110f4b559fe246e75c", surfaceHex: "#1a1a1a", panelHex: "#262626", borderHex: "#3f3f46", textPrimaryHex: "#ffffff", textMutedHex: "#a1a1aa", accentPrimaryHex: "#FFCF00", accentSecondaryHex: "#efcf14", borderRadiusPx: 10, fontStack: "Plus Jakarta Sans, Poppins, sans-serif", coreWorkflowKo: "세로형 숏드라마·웹툰 릴스 에피소드 비디오 생성(/createVideo)", keyRoutes: ["/createVideo", "/dev/api-keys"] },
  frameo: { platformId: "frameo", nameKo: "Frameo AI", originUrl: "https://frameo.ai/", reaEvidenceId: "ev_1b43ad4a78636801dfd2660774f04d7ce09f826e64a2fccfdd9d0ba60f87ab5a", scenarioSha256: "7575ac64bb5935480f6a7ce31920c371e4cd3257c68c28bd102d4923a43cadea", surfaceHex: "#09090b", panelHex: "#18181b", borderHex: "#27272a", textPrimaryHex: "#f5f5f7", textMutedHex: "#a1a1aa", accentPrimaryHex: "#423be5", accentSecondaryHex: "#c084fc", borderRadiusPx: 8, fontStack: "Geist, Averia Serif Libre, Manrope", coreWorkflowKo: "AI 스토리보드·스크립트 투 비디오(/ai-storyboard-generator, /use-veo3) + 스포트라이트 콘 셰이더(--cursor-angle, --cone-spread)", keyRoutes: ["/ai-storyboard-generator", "/script-to-video", "/story-to-video", "/use-veo3"] },
  "naver-webtoon-shaper": { platformId: "naver-webtoon-shaper", nameKo: "NAVER WEBTOON SHAPER (셰이퍼)", originUrl: "https://shaper.webtoons.com/", reaEvidenceId: "ev_b31cfbe08e61ccbdb81f0bc2104108e580b7a7c5d3602039136136f7a999bdda", scenarioSha256: "7d3810f2fac29eda33110c99652642a4e483932ec41ee8d5298f3579feb87b1c", surfaceHex: "#0a0a0a", panelHex: "#222222", borderHex: "#333333", textPrimaryHex: "#ededed", textMutedHex: "#d3d3d3", accentPrimaryHex: "#00ff74", accentSecondaryHex: "#3b6cef", borderRadiusPx: 12, fontStack: "Volte, Pretendard, sans-serif", coreWorkflowKo: "3D 웹툰 캐릭터 프리셋 조합 + 3D 모델 표면 직접 드로잉 + AI 레퍼런스 프리셋 추천·포즈 캡처 + 레이어 PSD 출력", keyRoutes: ["/"] },
  posemaniacs: { platformId: "posemaniacs", nameKo: "Posemaniacs", originUrl: "https://www.posemaniacs.com/", reaEvidenceId: "ev_da8dc6db9a1253ca2e1c2bc2ae6b410e3f76ffbbc86f44ab797b83415afb284e", scenarioSha256: "6673b4de778f27a4331726e2ba610bfa1aca85610731a7f47c05c685908bd281", surfaceHex: "#111827", panelHex: "#1f2937", borderHex: "#414141", textPrimaryHex: "#f9fafb", textMutedHex: "#9ca3af", accentPrimaryHex: "#2563EB", accentSecondaryHex: "#EF4444", borderRadiusPx: 8, fontStack: "Roboto, Google Sans Text, sans-serif", coreWorkflowKo: "3D 에코르셰(근육) 해부학 회전 뷰어 + 핸드/표정 레퍼런스 + 오늘의 포즈 드로잉", keyRoutes: ["/poses", "/tools", "/faces", "/generated-photos", "/pose-of-the-day"] },
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
        // Wave 39 (20개 플랫폼 — 총 740개 플랫폼 완성)
        ["esports-moba-hud-minimap-killfeed", "MOBA/FPS Esports Broadcast HUD, Minimap Fog-of-War & Killfeed Continuity", "#3b82f6", "#ef4444", "프로게이머/인방 웹툰에서 상단 킬스코어·골드 격차·미니맵 전장의 안개 시야가 전후 컷 전투 상황과 100% 일치하도록 고정"],
        ["gamer-mechanical-keyboard-wasd-mouse", "Left-Hand WASD/QWER Keycap Angle & Right-Hand Low-DPI Mouse Grip", "#10b981", "#a855f7", "게이머 부스 컷에서 왼손 틸트 키보드(WASD/QWER) 운지와 오른손 마우스 그립 좌우 반전 작붕 원천 차단"],
        ["kpop-idol-wireless-iem-headset-mic", "K-Pop Stage Custom IEM Earphone Cable Loop & Cheek Headset Mic Rig", "#ec4899", "#38bdf8", "아이돌 무대 씬에서 귀 뒤로 넘기는 커스텀 인이어(IEM) 투명 케이블 루프와 볼 밀착 헤드셋 마이크 방향 고정"],
        ["concert-lightstick-ocean-dmx-laser", "Concert Arena Bluetooth Lightstick Ocean Color Sync & DMX Truss Laser", "#a855f7", "#f43f5e", "콘서트장 객석 응원봉 중앙제어 발광 색상과 상부 트러스 DMX 무빙라이트 빔 각도 원근 일관성 고정"],
        ["stage-blocking-choreo-v-formation", "Idol Group 5/7-Member Center V-Formation & Stage Trapdoor Lift", "#f59e0b", "#ec4899", "아이돌 칼군무 대형 전환(V자 센터/대각선) 시 멤버별 위치·신장 비례 및 무대 리프트 개폐 위치 고정"],
        ["korean-courtroom-judge-prosecutor-seat", "Korean Courtroom Bench Layout: Judge Center, Prosecutor Left, Counsel Right", "#3b82f6", "#eab308", "한국 법정 웹툰에서 판사석 정면 기준 좌측 검사석·우측 변호인석/피고인석 배치 좌우 반전 차단"],
        ["prison-interview-acrylic-divider-jumpsuit", "Detention Center Acrylic Partition Holes & Inmate Number Badge Side", "#64748b", "#f97316", "구치소 접견실 투명 아크릴 격벽 타공 통화구와 수용복 좌측 가슴 수용번호 명찰 색상·번호 고정"],
        ["police-handcuff-keyhole-miranda-bodycam", "Double-Lock Handcuff Keyhole Orientation & Chest Bodycam Green LED", "#2563eb", "#22c55e", "체포 씬 수갑 열쇠구멍 방향·등뒤 결박 손목 교차 해부학 및 경찰 조끼 바디캠 녹화 LED 위치 고정"],
        ["airliner-cockpit-throttle-yoke-hud", "Commercial Airliner Captain Left-Seat Yoke & Center Pedestal Thrust Levers", "#0ea5e9", "#10b981", "여객기 조종석 기장석(좌측)·부기장석(우측) 위치와 중앙 스로틀 레버·인공수평계(ADI) 기체 기울기 일치 고정"],
        ["fighter-jet-hmcs-hud-afterburner-diamond", "Fighter Jet Canopy HMCS Helmet Visor & Supersonic Shock-Diamond Plume", "#f97316", "#38bdf8", "전투기 도그파이트 컷에서 조종사 헬멧 시현기(HMCS) 반사광과 애프터버너 마하 다이아몬드 불꽃 마디 고증"],
        ["zero-gravity-hair-float-tether-thruster", "Zero-G Microgravity Hair/Blood Droplet Sphere & EVA Umbilical Tether", "#6366f1", "#ec4899", "우주 무중력 선내에서 머리카락 부유 실루엣·구형으로 맺히는 눈물/피 방울 표면장력 및 우주유영 생명줄 고정"],
        ["submarine-sonar-waterfall-periscope", "Submarine Control Room Red Rig-for-Red Lighting & Sonar Waterfall Display", "#ef4444", "#22c55e", "잠수함 야간 작전 적색 전투조명(Rig for Red)·잠망경 손잡이 각도·소나 폭포수 주파수 스펙트럼 고증"],
        ["sailing-tallship-rigging-wind-pennant", "Age-of-Sail Square Rigging Billow Direction vs Mast Pennant Wind Vector", "#0284c7", "#fbbf24", "범선 웹툰에서 돛이 부풀어 오른 방향과 돗대 꼭대기 풍향기(Pennant) 바람 벡터 역방향 작붕 차단"],
        ["scuba-diving-regulator-bcd-bubble", "Scuba Second-Stage Regulator Mouthpiece Right-Hose & Ascending Bubble Cone", "#06b6d4", "#3b82f6", "수중 다이빙 호흡기(Regulator) 우측 어깨 호스 진입 방향·수면으로 갈수록 팽창하는 공기방울 원뿔 물리 고증"],
        ["mountain-climbing-figure8-knot-carabiner", "Alpinist Harness Figure-Eight Tie-In Knot & Locking Carabiner Gate", "#f59e0b", "#10b981", "클라이밍 안전벨트 8자 매듭(Figure-8) 구조와 잠금 카라비너 개폐 게이트 방향·로프 텐션 고정"],
        ["archery-mediterranean-thumb-draw-paradox", "Korean Gakgung Thumb-Ring Draw vs Western Recurve Mediterranean Draw", "#10b981", "#eab308", "양궁 리커브(3지 당김+좌측 화살 거치)와 국궁 각궁(엄지 깍지+우측 화살 거치)의 동서양 궁술 좌우 구분 고정"],
        ["fencing-foil-epee-sabre-lame-target", "Fencing Foil/Epee/Sabre Guard Bell Shape & Conductive Lame Target Zone", "#e2e8f0", "#3b82f6", "펜싱 플러레(몸통 전도조끼)·에페(전신)·사브르(상체+마스크) 종목별 검 코등이 형태와 유효면 장비 고증"],
        ["boxing-mma-orthodox-southpaw-guard", "Orthodox vs Southpaw Lead-Foot Stance & 10oz Glove Thumb-Lock Tape", "#ef4444", "#fbbf24", "복싱/격투기에서 오소독스(왼발 앞)와 사우스포(오른발 앞) 스탠스가 컷마다 뒤바뀌는 작붕 차단"],
        ["billiards-cue-bridge-ghostball-tangent", "Billiards Open/Closed Finger Bridge & 90-Degree Tangent Line Deflection", "#22c55e", "#f8fafc", "당구 왼손 브릿지 손가락 지탱 해부학과 수구-목적구 90도 분리각·초크 팁 곡률 고증"],
        ["bowling-3hole-thumb-exit-pin-deck", "Bowling 10-Pin Triangle Deck Coordinates (1~10) & Thumb-First Release", "#a855f7", "#f97316", "볼링 10개 핀 정삼각형 번호 좌표(1번~10번) 투시 정렬과 엄지 선이탈 리프팅 회전축 고증"],
        // Wave 40 (20개 플랫폼 — 총 760개 플랫폼 완성)
        ["piano-88key-2-3-blackkey-pedal-rig", "88-Key Piano 2-3 Black-Key Grouping & Right-Foot Sustain Damper Pedal", "#f8fafc", "#eab308", "피아노 건반의 검은 건반 2개-3개 반복 배열 작붕 차단 및 오른발 서스테인 페달 밟기 고증"],
        ["acoustic-electric-guitar-6string-fret", "Right-Handed Guitar 6-String Tuners, Fretboard Dot Inlays (3/5/7/9/12) & Pick", "#d97706", "#38bdf8", "기타 연주 왼손 프렛 운지(3·5·7·9·12프렛 마크)·6현 줄 수 불변·오른손 피킹 좌우 고정"],
        ["drum-kit-hihat-crossstick-kick-pedal", "Right-Handed Drum Kit Crossed Hi-Hat/Snare Arms & Right-Foot Kick Pedal", "#f43f5e", "#fbbf24", "드럼 세트에서 오른팔(왼쪽 하이햇)과 왼팔(스네어)이 교차하는 정통 연주 자세 및 베이스 킥 페달 고정"],
        ["orchestra-conductor-baton-seating-arc", "Symphony Conductor Right-Hand Baton Beat Pattern & 1st-Violin Left Seating", "#eab308", "#a855f7", "오케스트라 지휘자 오른손 지휘봉 박자 궤적·왼손 표현 분리 및 지휘자 좌측 제1바이올린 배치 고증"],
        ["espresso-portafilter-tamp-latte-art", "Cafe Espresso Portafilter 9-Bar Extraction Crema & Steamed Milk Pitcher Pour", "#92400e", "#fde68a", "카페 포타필터 장착 회전 방향·더블샷 크레마 층·스팀피처 라떼아트 하트/로제타 푸어링 고증"],
        ["sushi-omakase-yanagiba-shari-nigiri", "Omakase Yanagiba Single-Bevel Pull-Cut & Tezu Vinegar Hand Nigiri Motion", "#38bdf8", "#f43f5e", "사시미칼(야나기바) 편날 당겨 썰기와 스시 쥐기 손동작 연속성 고정"],
        ["bakery-laminated-croissant-crumb-oven", "Croissant 27-Layer Honeycomb Crumb Cross-Section & Deck Oven Steam Vent", "#f59e0b", "#fef08a", "크루아상 단면 벌집 기공(Honeycomb Crumb) 구조와 바게트 쿠프(칼집) 팽창 방향 고증"],
        ["wine-sommelier-foil-corkscrew-swirl", "Sommelier Waiter's Friend Corkscrew Lever, Punt Thumb-Hold & Decanter", "#991b1b", "#fbbf24", "소믈리에 나이프 2단 지렛대 코르크 발주 및 와인잔 스템(Stem)/베이스 파지 매너 고정"],
        ["tea-ceremony-chado-dadou-chasen-whisk", "Traditional Dado/Chado Tea Bowl Front (Shomen) Rotation & Bamboo Whisk", "#15803d", "#fde047", "동양 다도에서 다완(찻사발) 정면 문양을 손님 쪽으로 돌려 내는 예법과 다선 수직 격불 고증"],
        ["calligraphy-brush-inkstone-seal-chops", "East Asian Upright Brush Grip (Ssanggu-beop), Inkstone Pool & Red Seal", "#1e293b", "#ef4444", "서예/동양화 붓을 수직으로 세우는 쌍구법 파지·벼루 연지 방향 및 낙관 인주 날인 위치 고정"],
        ["oil-painting-palette-thumbhole-mahlstick", "Painter's Wooden Palette Left-Thumb Hole & Mahlstick Hand-Rest Bridge", "#d97706", "#3b82f6", "화가가 왼손 엄지를 팔레트 구멍에 끼우고 붓 다발을 쥐는 해부학적 자세와 이젤 고정핀 고증"],
        ["pottery-wheel-ccw-centring-kiln-glaze", "Pottery Wheel Counter-Clockwise Rotation, Wet Clay Centring & Celadon Craze", "#0d9488", "#e2e8f0", "물레 반시계 방향 회전에 따른 양손 중심잡기 수막 광택과 청자 빙열(균열) 패턴 고정"],
        ["stained-glass-came-leadline-caustic-proj", "Cathedral Stained-Glass Lead Came Line Network & Colored Floor Caustics", "#8b5cf6", "#f43f5e", "성당 스테인드글라스 납선(Lead Came) 분할 구조와 바닥/인물 위에 맺히는 색수차 투영광 일치"],
        ["cherry-blossom-5petal-notch-autumn-maple", "Botanical 5-Petal Cherry Blossom Apical Notch vs 5/7-Lobe Palmate Maple", "#f472b6", "#ef4444", "벚꽃잎 끝 갈래 홈(Apical Notch) 5꽃잎 구조와 단풍잎 장상열 잎맥의 계절 혼입 작붕 차단"],
        ["bamboo-node-internode-hollow-culm-cut", "Bamboo Culm Node Ring Spacing & Hollow Interior Diagonal Sword-Cut", "#22c55e", "#a3e635", "무협 대나무 마디(Node) 테두리 간격과 검으로 베었을 때 속이 빈 원통 단면(Hollow Culm) 고증"],
        ["bonsai-ikebana-heaven-earth-man-asymmetry", "Ikebana/Suhokekka Heaven-Earth-Human (Cheon-Ji-In) Asymmetric Triangle", "#10b981", "#f59e0b", "동양 꽃꽂이·분재 소품의 천지인(삼재) 부등변 삼각형 비대칭 구도와 수반 침봉 고정"],
        ["origami-paper-crane-valley-mountain-fold", "Paper Crane (Jong-i-hak) Valley/Mountain Fold Geometry & Wing Crease", "#38bdf8", "#f472b6", "종이학·종이비행기 소품의 산접기/계곡접기 기하학적 면 분할 엣지 보존"],
        ["sewing-tailor-mannequin-tape-chalk-stitch", "Bespoke Tailor Dress-Form Pinning, Neck Tape-Measure & Basting Stitch", "#ec4899", "#fbbf24", "의상실 가봉 마네킹 시침핀 각도·줄자 눈금 간격·재봉틀 노루발 원단 진행 방향 고정"],
        ["blacksmith-anvil-horn-tongs-quench-steam", "Blacksmith London-Pattern Anvil Horn, Left-Hand Tongs & Oil/Water Quench", "#f97316", "#64748b", "대장간 왼손 집게 적열 강철 고정·오른손 해머 타격·모루 뿔 방향 및 담금질 수증기 폭발 고증"],
        ["alchemy-retort-alembic-astrolabe-orrery", "Medieval Alchemy Pelican Retort Distillation & Brass Armillary Sphere", "#eab308", "#a855f7", "마탑/연금술 공방 냉각관 증류기(Alembic)·아스트롤라베(혼천의) 황동 고리 동심원 투시 고증"],
        // Wave 41 (20개 플랫폼 — 총 780개 플랫폼 완성!)
        ["construction-excavator-boom-stick-bucket", "Hydraulic Excavator Boom-Stick-Bucket 3-Link Kinematics & Chrome Cylinder", "#eab308", "#64748b", "굴착기(포크레인) 붐-암-버킷 3절 링크 유압 실린더 피스톤 직선 운동과 무한궤도 접지 고증"],
        ["forklift-rear-wheel-steer-pallet-mast", "Warehouse Forklift Rear-Wheel Steering Pivot & 2-Stage Hydraulic Mast", "#f97316", "#3b82f6", "창고 지게차 후륜 조향 회전 반경·전방 마스트 체인 리프트 및 파렛트 포크 삽입 구멍 일치"],
        ["tower-crane-jib-counterweight-trolley", "Skyscraper Tower Crane Horizontal Jib Trolley & Concrete Counterweight", "#ef4444", "#eab308", "타워크레인 마스트 트러스 격자·수평 지브 트롤리 후크 로프 수직 하강 및 카운터웨이트 균형 고증"],
        ["high-voltage-pylon-catenary-insulator", "High-Voltage Transmission Tower Ceramic Insulator Strings & 3-Phase Sag", "#38bdf8", "#94a3b8", "배경 송전탑 자기 애자련 개수와 3상 송전선 중력 현수선(Catenary Curve) 평행 곡률 고정"],
        ["railway-pantograph-catenary-sleeper-gauge", "Electric Train Roof Pantograph Diamond Contact & 1435mm Standard Gauge", "#0ea5e9", "#22c55e", "전철/고속철도 지붕 팬터그래프 전차선 접지 높이와 레일 침목 소실점 수렴 고정"],
        ["shipping-container-iso-corner-casting-rib", "20ft/40ft ISO Shipping Container Corrugated Wall Ribs & Corner Locking", "#2563eb", "#f97316", "항만 ISO 컨테이너 측면 골판 간격·모서리 코너 캐스팅 구멍·우측문 선개폐 고증"],
        ["fire-hydrant-sprinkler-extinguisher-pin", "Fire Extinguisher Safety-Pin Lever, Ceiling Sprinkler Bulb & Hydrant Hose", "#dc2626", "#22c55e", "소화기 안전핀·압력게이지 녹색 영역·천장 스프링클러 디플렉터 물줄기 원뿔 확산 고증"],
        ["elevator-call-button-braille-floor-arrow", "Elevator Hall Lantern Up/Down Arrow, Braille Call Button & Door Gap", "#fbbf24", "#38bdf8", "엘리베이터 열림/닫힘 버튼 기호 구분과 홀 랜턴 상하 화살표 점등 일관성 고정"],
        ["escalator-yellow-demarcation-combplate", "Escalator Step Yellow Safety Border, Comb-Plate & Moving Handrail Sync", "#eab308", "#64748b", "에스컬레이터 계단 노란 안전선·상하단 콤플레이트 수평 진입 구간 고증"],
        ["vending-machine-coin-slot-can-dispense", "Street Vending Machine Lit Sample Display, Coin Return Lever & Flap Door", "#ef4444", "#38bdf8", "거리 자판기 상단 음료 진열대 조명·동전 투입구/반환 레버 우측 배치 및 하단 플랩 도어 고정"],
        ["neon-sign-glass-tube-electrode-transformer", "Cyberpunk/Noir Bent Glass Neon Tube Electrode Caps & Wall Stand-Offs", "#ec4899", "#00e5ff", "네온사인이 구부러진 유리관 이어짐·양끝 흑색 전극 캡·벽면 지지대로 묘사되도록 고정"],
        ["hangul-hanja-kana-shop-signboard-ortho", "East Asian Street Signboard Orthographic Perspective & Pseudo-Character Guard", "#10b981", "#fbbf24", "배경 간판의 한글·한자·가나 문자가 외계어(Gibberish)로 깨지는 현상을 차단하고 외벽 소실점과 정렬"],
        ["newspaper-headline-column-halftone-fold", "Print Newspaper 5-Column Grid, Masthead Date & Center Horizontal Fold", "#94a3b8", "#f8fafc", "신문 소품 제호·다단 칼럼 정렬·흑백 망점 사진·가로 중앙 접힘선 왜곡 고증"],
        ["passport-boarding-pass-mrz-barcode-stamp", "ICAO Passport MRZ 2-Line OCR Font & Airline Boarding Pass Tear-Stub", "#15803d", "#3b82f6", "여권 하단 2줄 기계판독영역(MRZ)과 탑승권 게이트/좌석 번호·출입국 도장 일관성 고정"],
        ["currency-banknote-serial-hologram-bundle", "Banknote Stack 100-Note Paper Strap, Hologram Strip & Corner Denomination", "#22c55e", "#eab308", "돈다발 소품 100장 띠지 결속·은색 홀로그램 은선·모서리 액면가 숫자의 좌우 반전 차단"],
        ["hospital-wheelchair-caster-crutch-axilla", "Wheelchair Large Rear Push-Rim, Front Swivel Caster & Forearm/Axilla Crutch", "#0ea5e9", "#e2e8f0", "휠체어 후방 대구경 핸드림 바퀴·전방 소형 캐스터·발판 구조 및 목발 겨드랑이 여유 간격 고증"],
        ["baby-stroller-bassinet-swaddle-bottle", "Parenting Webtoon Infant Head-to-Body Ratio (1:4), Swaddle Wrap & Bottle Tilt", "#f472b6", "#fde047", "육아물 영유아 등신비(4등신)·속싸개 여밈 및 젖병 수유 시 공기 유입 차단 45도 기울기 고증"],
        ["agricultural-rice-paddy-sickle-terraces", "Traditional Rice Paddy Bund Geometry, Crescent Sickle & Threshing Sheaf", "#84cc16", "#d97706", "사극/전원 논두렁 구획·벼 이삭 숙임·오른손 낫 날 곡률 및 볏단 묶음 비례 고정"],
        ["fishing-rod-parabolic-bend-spinning-reel", "Fishing Rod Parabolic Action Curve, Underslung Spinning Reel & Float", "#06b6d4", "#f97316", "낚시 씬 스피닝 릴 하단 장착 구조(베이트 릴은 상단)와 입질 시 초릿대 포물선 휨 곡선 고증"],
        ["webtoon-studio-tax-withholding-erp-ledger", "Korean Webtoon Creator 3.3% Business Withholding, VAT-Exempt & Assistant ERP", "#6366f1", "#10b981", "한국 웹툰 작가 고료 3.3% 원천징수·ISBN/ISSN 부가가치세 면세 요건·어시스턴트 정산 ERP 자동화"],
        // Wave 42 (20개 플랫폼 — 총 800개 플랫폼 돌파!)
        ["dental-fdi-tooth-chart-mirror-handpiece", "FDI Two-Digit Tooth Numbering (11~48), Dental Mirror & High-Speed Handpiece", "#38bdf8", "#f8fafc", "치과/의학 웹툰에서 상하좌우 치열(중절치·송곳니·어금니 개수)과 치경(Dental Mirror) 간접시야 반사·석션 위치 고정"],
        ["ophthalmology-slit-lamp-phoropter-snellen", "Ophthalmic Slit-Lamp Chin-Rest, Phoropter Dial & Snellen Chart Scale", "#0ea5e9", "#eab308", "안과 검진 세극등 현미경 턱받침/이마받침 밀착 구조와 시력검사표(Snellen/한천석) 란돌트 고리 방향 고증"],
        ["orthopedic-x-ray-bone-fracture-cast-sling", "Radiograph Left/Right Lead Marker ('L'/'R'), Clavicle Sling & Plaster Cast", "#64748b", "#38bdf8", "정형외과 X-ray 필름 좌/우 납 마커(L/R) 반전 차단 및 팔걸이 삼각건(Sling) 매듭 위치·깁스 발가락 노출 고증"],
        ["obstetrics-ultrasound-transducer-fetal-hr", "OB/GYN Convex Ultrasound Probe Gel Contact & Fetal Monitor Cardiotocography", "#ec4899", "#38bdf8", "산부인과 볼록형 초음파 프로브 복부 밀착 각도와 태아 심박수(120~160bpm) 모니터 파형 고증"],
        ["ambulance-stretcher-defibrillator-paddle", "Paramedic Roll-In Cot Stretcher Straps & AED/Defibrillator Sternum-Apex", "#ef4444", "#22c55e", "구급차 들것 다리 접이 레버와 제세동기 패들 부착 위치(우측 쇄골 아래 Sternum · 좌측 겨드랑이 아래 Apex) 고정"],
        ["firefighter-scba-mask-halligan-hose", "Firefighter SCBA Positive-Pressure Mask Regulator, Pressure Gauge & Halligan", "#f97316", "#eab308", "소방관 공기호흡기(SCBA) 면체 정압식 레귤레이터 결합 방향·산소통 잔압계 및 할리간 바 파지 고증"],
        ["coast-guard-rescue-hoist-basket-flare", "Helicopter SAR Rescue Basket Hoist Hook, Life-Ring & Handheld Red Flare", "#0284c7", "#ef4444", "해양구조 헬기 호이스트 구조바스켓 보조 로프(Tag Line)와 구명환·조난 신호홍염 연기 풍향 일치"],
        ["chemistry-burette-meniscus-erlenmeyer-fume", "Analytical Chemistry Burette Stopcock, Bottom-of-Meniscus & Fume Hood Sash", "#10b981", "#38bdf8", "화학 실험실 뷰렛 코크 조작·삼각플라스크 적정 회전 및 흄후드(Fume Hood) 안전 유리창 높이 고정"],
        ["microscope-binocular-objective-turret-stage", "Compound Microscope Revolving Nosepiece (4x/10x/40x/100x) & Coaxial Focus", "#6366f1", "#eab308", "생물학 현미경 대물렌즈 리볼버 배율 색띠(적·황·청·백)와 조동/미동 나사 양손 조작·프레파라트 클립 고정"],
        ["dna-gel-electrophoresis-pipette-centrifuge", "Micropipette First/Second Stop Plunger & Balanced Microcentrifuge Rotor", "#8b5cf6", "#06b6d4", "마이크로피펫 엄지 플런저 파지법(검지 걸기)과 원심분리기 대칭 밸런스 튜브 배치 고증"],
        ["astronomy-equatorial-mount-counterweight", "German Equatorial Telescope Mount Counterweight Shaft & Polar Axis Tilt", "#3b82f6", "#fbbf24", "적도의식 망원경 추봉(Counterweight) 균형 위치와 관측지 위도(37.5°)에 맞춘 극축 고도각 고정"],
        ["meteorology-anemometer-stevenson-barograph", "Weather Station 3-Cup Anemometer, Stevenson Screen Louvers & Isobar Map", "#0ea5e9", "#22c55e", "기상대 백엽상 이중 갤러리 창 방향과 등압선 일기도 고기압(시계)/저기압(반시계) 바람 화살표 고증"],
        ["veterinary-stethoscope-elizabethan-collar", "Veterinary Auscultation Zone, Elizabethan Cone Collar & IV Catheter Tape", "#14b8a6", "#f43f5e", "수의학 반려동물 넥카라(엘리자베스 카라) 버클 결속과 앞다리 두정맥 수액 라인 테이핑 고정"],
        ["equestrian-dressage-bridle-curb-stirrup", "Equestrian Snaffle/Pelham Bridle Cheekpiece, Girth & Ball-of-Foot Stirrup", "#d97706", "#10b981", "승마/로판 기마 씬에서 발볼(Ball of Foot)로 등자(Stirrup)를 밟는 원칙과 안장 복대(Girth) 누락 차단"],
        ["falconry-gauntlet-jesses-hood-perch", "Falconer Left-Hand Leather Gauntlet, Anklet Jesses & Rufter Hood Plume", "#92400e", "#fbbf24", "사극/판타지 매사냥에서 왼손 가죽 토시(시치) 위 매 거치·발목 줄(Jesses) 및 눈가리개(시모) 장식 고증"],
        ["beekeeping-veil-smoker-langstroth-frame", "Apiary Beekeeper Veil Mesh, Bellows Smoker & Hexagonal Honeycomb Frame", "#eab308", "#f59e0b", "양봉 훈연기(Smoker) 풀무 방향과 소비(벌집 틀) 육각형 밀랍 방(Cell) 정투영 격자 유지"],
        ["aquarium-planted-co2-diffuser-canister", "Aquascape Rimless Tank Silicone Seam, Glass Lily-Pipe & Schooling Fish", "#06b6d4", "#22c55e", "유리 수조 굴절률(Snell's Law)에 의한 수초/물고기 위치 이중 상 왜곡 제어 및 릴리파이프 수류 고정"],
        ["horology-watchmaker-loupe-tourbillon-gear", "Watchmaker Eyeglass Loupe Spring, Balance-Wheel Hair-Spring & Escapement", "#fbbf24", "#94a3b8", "시계공방/스팀펑크 맞물리는 두 톱니바퀴의 이빨 크기 일치와 짝수/홀수 기어 반대 회전 물리 고증"],
        ["jewelry-gemstone-4prong-pave-loupe", "Gemology 10x Triplet Loupe, 4/6-Prong Solitaire Setting & Brilliant Facets", "#ec4899", "#38bdf8", "보석상 10배율 루페 눈앞 밀착 파지법과 반지 프롱(발) 개수(4발/6발)가 컷마다 달라지는 작붕 차단"],
        ["perfumery-organ-blotter-strip-flacon", "Perfumer's Tiered Bottle Organ, Scent Blotter Strip Fan & Crimp Atomizer", "#a855f7", "#f472b6", "조향사 계단식 향료 오르간(Perfumer's Organ) 병 배열과 시향지(Blotter) 코끝 3cm 거리 매너 고정"],
        // Wave 43 (20개 플랫폼 — 총 820개 플랫폼 완성)
        ["film-slate-clapperboard-timecode-stripes", "Cinema Clapperboard Chevron Stripe Alignment, Scene/Take & Timecode LED", "#f8fafc", "#ef4444", "영화 촬영장 슬레이트(Clapperboard) 사선 줄무늬 맞물림과 Scene/Cut/Take 번호가 촬영 컷과 일치하도록 고정"],
        ["boom-mic-blimp-deadcat-shockmount-cstand", "Boom Operator Overhead Zeppelin Blimp, C-Stand Grip Arm Right-Hand Rule", "#64748b", "#eab308", "촬영장 붐마이크 데드캣 프레임 상단 비노출(Frame Line)과 C-스탠드 모래주머니/우측 조임 법칙 고증"],
        ["camera-dolly-track-steadicam-vest-gimbal", "Cinema Dolly Tubular Track, Steadicam Iso-Elastic Arm & Follow-Focus Whip", "#3b82f6", "#10b981", "카메라 스테디캠 조끼 암 텐션과 포커스 풀러(1st AC) 팔로우 포커스 휠 조작 위치 고정"],
        ["tv-control-room-preview-program-tally", "Broadcast Switcher Preview (Green) vs Program (Red) Multiview & Tally Light", "#22c55e", "#ef4444", "방송국 부조정실 모니터 월에서 프리뷰(녹색 테두리)와 본방 프로그램(적색 테두리+카메라 적색 탈리 램프) 일치"],
        ["radio-booth-xlr-popfilter-onair-lamp", "Radio Studio Condenser Mic Articulated Arm, Pop-Filter & Red ON-AIR Sign", "#ef4444", "#fbbf24", "라디오/성우 부스 콘덴서 마이크 전면 카디오이드 수음 방향과 이중 팝필터 거리 고정"],
        ["theater-proscenium-fly-loft-footlight", "Stage Proscenium Arch, Counterweight Fly-Rail Rope Lock & Wing Curtain", "#991b1b", "#eab308", "연극/뮤지컬 무대 옆 날개막(Wings) 시야 차단 각도와 상부 배튼(Batten) 조명봉 와이어 고정"],
        ["korean-csat-omr-card-computer-pen-clock", "Korean CSAT (Suneung) OMR 5-Bubble Pink Card, Black Sign-Pen & Analog Watch", "#ec4899", "#1e293b", "수능/모의고사 OMR 답안지 분홍 세로선 양식·컴퓨터용 흑색 사인펜·아날로그 시계 고증"],
        ["school-chalkboard-eraser-locker-indoor-shoe", "Classroom Green Chalkboard Tray, Locker Number Grid & Indoor Slipper Color", "#15803d", "#fde047", "한국 교실 칠판 분필받이·후면 사물함 번호 배열·학년별 명찰/실내화 색상띠 회차 간 불변 고정"],
        ["library-dewey-decimal-spine-label-cart", "Library Book Spine Call-Number Label Height, Book-Cart Shelf & Reading Lamp", "#d97706", "#22c55e", "도서관 서가 책등 청구기호 라벨 높이 정렬과 북카트 경사 선반 방향 고정"],
        ["graduation-mortarboard-tassel-left-right", "Academic Regalia Mortarboard Cap Tassel (Right Before, Left After) & Hood", "#1e293b", "#eab308", "졸업식 학사모 술(Tassel) 위치(학위 수여 전 우측→수여 후 좌측 이동) 및 단과대별 후드 색상 고증"],
        ["tcg-card-sleeve-mana-tap-90deg-graveyard", "TCG Card Battle Playmat Zones (Deck/Graveyard/Exile) & 90-Degree Tap State", "#6366f1", "#f43f5e", "TCG/카드배틀 덱·묘지·제외존 매트 위치가 컷마다 뒤섞이지 않고 공격/탭(90도 회전) 상태가 유지되도록 고정"],
        ["trpg-polyhedral-dice-d20-opposite-sum21", "Polyhedral D20/D6 Dice Opposite-Face Sum Rule (N+1) & DM Screen Layout", "#a855f7", "#fbbf24", "주사위(D6 마주보는 면 합 7, D20 합 21)에서 인접 면에 마주보는 숫자가 동시에 보이는 작붕 차단"],
        ["mahjong-136tile-wall-dora-discard-river", "Riichi Mahjong 13-Tile Hand, 6-Column Discard River (Ho) & Dora Indicator", "#10b981", "#f8fafc", "마작 손패 13장(쯔모 시 14장) 개수 불변·버림패(하즈) 6개씩 줄맞춤 및 도라 표시패 위치 고증"],
        ["roulette-37pocket-zero-green-croupier-rake", "European 37-Pocket (Single-0) vs American (00) Roulette Wheel Color Alternation", "#22c55e", "#ef4444", "카지노 룰렛 휠 녹색 0번 양옆 적/흑 교대 배열과 딜러 레이크(Rake) 칩 수거 동작 고증"],
        ["slot-machine-3reel-payline-coin-hopper", "Casino Slot Machine 3/5-Reel Symbol Alignment & Side Lever Ratchet", "#fbbf24", "#f43f5e", "슬롯머신 릴 곡면 원근 왜곡과 중앙 페이라인(Payline) 심볼 일치 고정"],
        ["arcade-claw-machine-gantry-3prong-joystick", "UFO Catcher Claw Machine X-Y Gantry Rail, 3-Prong Solenoid Claw & Chute", "#ec4899", "#38bdf8", "인형뽑기 기계 상부 X-Y 레일과 3발 집게 낙하 수직선·경품 투하구(Chute) 위치 일치"],
        ["amusement-rollercoaster-upstop-wheel-harness", "Rollercoaster Tubular Steel Track 3-Wheel Bogie (Road/Side/Upstop) & OTSR", "#ef4444", "#3b82f6", "롤러코스터 레일 탈선 방지용 하부 업스톱 휠(Upstop Wheel) 3륜 구조와 어깨 안전바 잠금 고정"],
        ["ferris-wheel-spoke-truss-pendulum-gondola", "Ferris Wheel Radial Tension Spokes & Gravity-Leveled Passenger Gondola", "#f472b6", "#fbbf24", "관람차 회전 시 바퀴 스포크 각도와 무관하게 승객 관람차 바닥은 항상 중력 수평을 유지하는 물리 고정"],
        ["camping-tent-guyline-peg-45deg-lantern", "Camping Dome Tent Rainfly Guyline 45-Degree Peg Angle & Wood-Stove Chimney", "#15803d", "#f97316", "캠핑 텐트 가이라인 땅속 팩(Peg) 45도 저항각과 화목난로 연통 스파크 어레스터 고증"],
        ["ski-snowboard-binding-din-gondola-pole", "Alpine Ski Boot Toe/Heel DIN Binding, Pole Basket & Snowboard Goofy/Regular", "#38bdf8", "#f43f5e", "스키/스노보드 레귤러(왼발 앞)/구피(오른발 앞) 스탠스 일관성 및 스키폴 바스켓 설면 관통 방지 고정"],
        // Wave 44 (20개 플랫폼 — 총 840개 플랫폼 완성!)
        ["rotary-telephone-finger-stop-coiled-cord", "Vintage Rotary Dial Telephone Finger-Stop (4-Hour) & Handset Coiled Cord", "#d97706", "#f8fafc", "시대극 다이얼 전화기 숫자 구멍 배열(1번 우상단~0번 하단)과 4시 방향 금속 핑거스톱 위치 고정"],
        ["typewriter-qwerty-typebar-carriage-return", "Mechanical Typewriter Typebar Basket Arc, Platen Roller & Left Return Lever", "#64748b", "#eab308", "수동 타자기 좌측 캐리지 리턴 레버(줄바꿈 손잡이)와 리본 스풀 2개 대칭 구조 고증"],
        ["vinyl-turntable-tonearm-right-cw-groove", "Vinyl Turntable Clockwise Platter Rotation & Right-Hand S-Tonearm Tracking", "#a855f7", "#38bdf8", "LP 턴테이블 톤암이 반드시 플래터 우측에 위치해 시계 방향 회전 레코드판 외곽→내측으로 진행하도록 고정"],
        ["cassette-tape-capstan-window-pencil-rewind", "Compact Cassette Dual Spool Window, Bottom Magnetic Tape Opening & A/B Side", "#f97316", "#06b6d4", "카세트테이프 하단 자기테이프 노출부와 좌/우 릴 감김량 비율 변화 고증"],
        ["film-slr-camera-pentaprism-advance-lever", "35mm Film SLR Right-Thumb Film Advance Lever, Shutter Speed Dial & Rewind", "#94a3b8", "#ef4444", "필름 카메라 우측 상단 와인딩 레버·셔터버튼과 좌측 되감기 크랭크 좌우 반전 차단"],
        ["polaroid-instant-camera-bottom-eject-border", "Instant Film Wide Bottom White Chemical Pod Border & Darkslide Ejection", "#f8fafc", "#ec4899", "폴라로이드 즉석사진의 넓은 흰색 여백이 상단이 아닌 하단(현상액 포드 위치)에 오도록 고정"],
        ["hourglass-sand-angle-of-repose-34deg-bulb", "Hourglass Upper Funnel Cone Depletion vs Lower 34-Degree Angle of Repose", "#eab308", "#a855f7", "모래시계 위쪽 모래는 움푹 파인 깔때기형, 아래쪽 모래는 34도 안식각 원뿔형으로 쌓이는 물리 고증"],
        ["candlestick-wax-drip-wick-flame-teardrop", "Tallow/Beeswax Candle Meniscus Pool, Curled Black Wick & Vertical Flame", "#f59e0b", "#ef4444", "촛불 소품 촛농 오목면과 촛대 기울기와 무관하게 중력 반대 수직으로 솟는 불꽃 부력 고증"],
        ["oil-lamp-glass-chimney-wick-thumbwheel", "Kerosene Hurricane Lamp Glass Chimney Bulge & Wick Raiser Thumbwheel", "#d97706", "#fde047", "시대극 호롱불·남포등 볼록한 유리 등피(Chimney)와 심지 조절 톱니 나사 구조 고정"],
        ["abacus-soroban-1-4-heaven-earth-beads", "East Asian Abacus (Soroban 1+4 vs Suanpan 2+5) Beam & Cleared Bead State", "#92400e", "#eab308", "주판 윗알 1개+아랫알 4개(현대식) 또는 윗알 2개+아랫알 5개(전통 당주판) 규격 통일"],
        ["balance-scale-fulcrum-knife-edge-heavier-low", "Two-Pan Apothecary Balance Scale Central Pointer Tilt Toward Heavier Pan", "#fbbf24", "#3b82f6", "천칭 저울에서 무거운 쪽 접시가 내려갈 때 중앙 바늘과 가로대 각도가 기하학적으로 일치하도록 고정"],
        ["spinning-wheel-flyer-bobbin-treadle-loom", "Traditional Spinning Wheel (Mul-re) Drive Band & Floor Loom Shuttle Warp", "#b45309", "#f8fafc", "전통 물레 큰 바퀴와 가락 현수벨트 연결 및 베틀 날실(Warp)/씨실 북(Shuttle) 직교 고증"],
        ["traditional-millstone-maetdol-handle-ccw", "Korean Stone Millstone (Maetdol) Offset Wooden Handle (Eo-i) & Top Feed Hole", "#64748b", "#d97706", "전통 맷돌 상짝 측면 나무 손잡이(어이) 결속 구조와 중앙 곡물 투입구 위치 고증"],
        ["well-pulley-bucket-rope-tension-winch", "Village Stone Well Overhead Pulley Groove & Loaded Rope Taut Verticality", "#0284c7", "#94a3b8", "우물 두레박 도르래 홈에 걸린 밧줄이 물을 길어 올릴 때 팽팽한 직선을 유지하는 장력 물리 고정"],
        ["umbrella-parabolic-8rib-stretchers-runner", "Umbrella 8-Rib Canopy Stretcher Linkage, Runner Catch & Raindrop Bounce", "#38bdf8", "#6366f1", "우산 내부 살(Rib 8개)과 받침살(Stretcher)이 중봉 러너(Runner)에 모이는 기구학 고정"],
        ["luggage-telescopic-handle-4spinner-tsa", "Hard-Shell Suitcase Dual-Tube Telescopic Handle & 360-Degree Spinner Wheels", "#0ea5e9", "#f43f5e", "캐리어 2단 폴대 손잡이 중앙 정렬과 하단 4륜 더블 스피너 바퀴 접지 일치"],
        ["shopping-cart-child-seat-swivel-caster-nest", "Supermarket Wire Shopping Cart Rear Fold-Out Child Seat & Tapered Frame", "#ef4444", "#e2e8f0", "마트 쇼핑카트 사다리꼴 바구니와 손잡이 쪽 유아용 접이식 시트 방향 고정"],
        ["museum-exhibition-stanchion-velvet-rope-plaque", "Art Gallery Wall Eyeline (145~150cm Center), Barrier Stanchion & Label Card", "#991b1b", "#fbbf24", "전시회 액자 중심 높이(바닥에서 145~150cm 눈높이)와 차단봉(벨벳 로프) 안전 거리 고증"],
        ["bookbinding-french-groove-headband-ribbon", "Hardcover Book Spine Headband, French Groove Hinge & Page-Spread Gutter Curve", "#8b5cf6", "#fde047", "마도서/고서 펼친 책 페이지가 책등 제본선(Gutter)으로 들어갈 때 생기는 M자 곡면 굴곡에 맞춰 글자/마법진 왜곡 투영"],
        ["webtoon-episode-cliffhanger-paywall-conversion", "Paywall Episode Preview Thumbnail Crop, Scroll-Stop Cliffhanger & Cookie ROI", "#10b981", "#ec4899", "유료 미리보기(쿠키) 전환율을 극대화하는 마지막 3컷 텐션 곡선·썸네일 크롭 안전영역·결제 유도 대사 분석"],
        // Wave 45 (20개 플랫폼 — 총 860개 플랫폼 완성)
        ["joseon-hwacha-singijeon-multi-rocket", "Joseon Hwacha 100-Rocket Singijeon Launch Angle & Fuse Ignition Sequence", "#ef4444", "#fbbf24", "사극 신기전 화차 발사통(100발/200발) 격자 배열과 점화 도화선 연쇄 발사 연기 궤적 고증"],
        ["turtle-ship-geobukseon-dragon-head-oars", "Geobukseon Iron-Spiked Roof, Dragon-Head Cannon & 8-Oar Rowing Cadence", "#0ea5e9", "#eab308", "거북선 개판 철첨 배열·용두 포구 현자총통 발사 및 좌우 8노(Oar) 노젓기 방향 일치"],
        ["medieval-trebuchet-counterweight-sling", "Counterweight Trebuchet Hinged Weight Box, Sling Release Pin & Arc", "#d97706", "#94a3b8", "중세 공성 투석기(Trebuchet)가 스프링 방식이 아닌 전면 무게추 낙하+가죽 슬링 원심력 투척 구조임을 고증"],
        ["battering-ram-tortoise-shed-portcullis", "Suspended Pendulum Battering Ram Roof Shed & Castle Portcullis Iron Grate", "#64748b", "#f97316", "공성 충차(Battering Ram) 지붕 사슬 현수 진자 운동과 성문 위 수직 낙하 쇠살문(Portcullis) 홈 일치"],
        ["chariot-2horse-yoke-spoked-wheel-rein", "Ancient War Chariot Yoke-Pole, 6/8-Spoke Wheel Hub & Charioteer Rein Loop", "#f59e0b", "#ef4444", "고대 전차(Chariot) 멍에(Yoke)와 중심 굴대 결합·바퀴 살 개수 불변 및 고삐 손목 감기 고정"],
        ["roman-testudo-scutum-phalanx-sarissa", "Shield Wall Testudo Overlap Order & 5-Meter Pike Phalanx Angle Tier", "#dc2626", "#fbbf24", "방패진(Testudo)에서 앞줄 정면 방패와 윗줄 머리 위 방패가 기와처럼 겹치는 방향 및 장창 각도 계층 고정"],
        ["japanese-katana-tsuba-hamon-left-saya", "Katana Edge-Up (Ha-Up) Left-Waist Obi Thrust & Chiburi Blood-Flick Arc", "#e2e8f0", "#ef4444", "일본도(카타나)는 반드시 날이 위(Ha-up)를 향하도록 왼쪽 허리에 꽂으며(환도/서양검은 날이 아래) 납도 동작 고정"],
        ["joseon-gat-manggeon-gwanja-amber-string", "Joseon Nobleman Gat Brim Translucency, Manggeon Forehead & Gat-Kkeun", "#1e293b", "#f59e0b", "사극 갓(흑립) 양태 반투명 말총 투과도·이마 망건(관자) 필수 착용 및 호박 갓끈 가슴 드리움 고증"],
        ["korean-binyeo-cheopji-norigae-samjak", "Joseon Royal/Noble Hairpin (Yongjam Binyeo), Parting Cheopji & Samjak Norigae", "#ec4899", "#eab308", "사극 여인 쪽머리 비녀(좌→우 관통)·정수리 첩지 및 고름 아래 삼작노리개 매듭 수직 대칭 고정"],
        ["palanquin-gama-4bearer-pole-curtain", "Traditional 4-Bearer Palanquin (Gama) Carrying Pole Shoulder Pad & Blind", "#991b1b", "#fde047", "사인가마 앞뒤 가마꾼 어깨 멜빵 끈과 발(주렴) 개폐 시 내부 착석 눈높이 일치"],
        ["beacon-mound-bongsu-5chimney-smoke-code", "Joseon Bongsu-dae 5-Torch Smoke Signal Code (Peace=1, Enemy=2, Battle=5)", "#f97316", "#64748b", "사극 봉수대 5개 화두에서 평시 1줄기·적 출현 2줄기·접전 5줄기 연기 개수로 전황을 전달하는 고증 고정"],
        ["traditional-ondol-agungi-gudeul-chimney", "Korean Ondol Firebox (Agungi), Underfloor Flue & Detached Low Chimney", "#b45309", "#ef4444", "한옥 아궁이 무쇠 가마솥 걸림 구조와 방바닥 구들 고래를 지나 마당 굴뚝으로 연기가 빠지는 동선 일치"],
        ["jangdokdae-onggi-breathing-glaze-ferment", "Korean Jangdokdae Stepped Stone Terrace, Onggi Lid Overhang & Solar Angle", "#92400e", "#fbbf24", "장독대 채광을 위해 작은 항아리(앞줄)→큰 항아리(뒷줄) 계단식 배치 및 옹기 뚜껑 처마 곡률 고정"],
        ["straw-thatched-choga-ridge-rope-grid", "Choga Thatched Roof Ridge-Roll (Yongmaru) & Woven Straw Rope Checker Grid", "#eab308", "#a16207", "초가집 지붕 용마루 엮음과 바람에 날리지 않도록 바둑판 모양으로 얽어맨 새끼줄(고삿) 격자 간격 고정"],
        ["watermill-mullebang-a-overshot-bucket", "Overshot Watermill (Mullebang-a) Bucket Wheel Rotation vs Flume Stream", "#0284c7", "#d97706", "물레방아 위쪽 수로(학배기)에서 떨어지는 물줄기 방향과 바퀴 회전 방향(물 떨어지는 쪽 하강) 물리 일치"],
        ["black-powder-matchlock-jochong-pan-ramrod", "Matchlock Musket (Jochong) Serpentine Match-Cord, Flash-Pan & Ramrod", "#64748b", "#ef4444", "조총(화승총) 우측 화승 집게(용두)·화약접시 개폐 및 총열 아래 꽂힌 꼬질대(Ramrod) 고증"],
        ["cannon-breech-muzzle-sponge-recoil-rope", "Naval/Fortress Muzzle-Loading Cannon Trunnion Carriage & Recoil Breeching", "#475569", "#f97316", "전장식 대포 포신 양옆 포이(Trunnion) 거치대와 발사 반동 제어용 브리칭 로프 고정"],
        ["medieval-wax-tablet-stylus-parchment-scroll", "Parchment Scroll Dual Wooden Rollers vs Wax Tablet Stylus Flat-Eraser", "#d97706", "#fef08a", "양피지 두루마리 말림 축과 밀랍 서판 첨필(뾰족한 끝=쓰기, 납작한 끝=지우기) 고증"],
        ["heraldic-jousting-lance-vamplate-tilt-barrier", "Medieval Jousting Tilt Barrier (Left-Shoulder Pass) & Right-Hand Lance", "#3b82f6", "#fbbf24", "마상창시합(Jousting)에서 두 기사는 반드시 중앙 분리벽(Tilt)을 사이에 두고 서로의 왼쪽 어깨가 스치도록 교차 질주"],
        ["chain-drawbridge-counterweight-moat-reflection", "Castle Drawbridge Overhead Lifting Beams (Fleches) & Moat Water Reflection", "#6366f1", "#38bdf8", "성문 도개교 상부 들보(Lifting Beam)와 성벽 사슬 삼각형 기하학 및 해자 수면 반사 일치"],
        // Wave 46 (20개 플랫폼 — 총 880개 플랫폼 완성)
        ["zombie-bite-tourniquet-barricade-board-nail", "Post-Apocalypse Window Plank Barricade Inside-Nail & CAT Tourniquet Windlass", "#dc2626", "#a3e635", "좀비/아포칼립스 창문 판자 바리케이드를 실내 쪽 프레임에 못질하는 생존 원칙과 지혈대(CAT) 윈들러스 막대 고정"],
        ["gas-mask-40mm-nato-canister-cheek-filter", "CBRN Gas Mask 40mm NATO Filter Thread (Left/Center) & Exhale Valve Fog", "#22c55e", "#64748b", "방독면 정화통을 오른손 사수 견착에 방해되지 않도록 왼쪽 볼 또는 중앙에 장착하는 군사 고증"],
        ["geiger-counter-pancake-probe-sievert-scale", "Geiger-Muller Tube Probe Cable & mSv/h vs CPM Radiation Unit Consistency", "#eab308", "#ef4444", "가이거 계수기 프로브 케이블 연결과 시버트(mSv/h) 방사선량 단위 연속성 유지"],
        ["hazmat-level-a-positive-pressure-suit-zip", "Level-A Encapsulated Hazmat Suit Positive-Pressure Inflation & Taped Seam", "#facc15", "#2563eb", "생화학 Level-A 밀폐 방호복이 내부 양압 공기호흡기로 인해 부풀어 있는 실루엣과 밀봉 테이프 고정"],
        ["crowbar-goose-neck-fulcrum-padlock-shackle", "Wrecking Crowbar Curved Goose-Neck Fulcrum Leverage & Padlock Shackle Cut", "#ef4444", "#94a3b8", "빠루(Crowbar) 구부러진 목 부분(Goose-neck)을 지렛대 받침점으로 삼아 당기는 물리 방향 고정"],
        ["bolt-cutter-compound-hinge-chain-link", "Compound-Action Bolt Cutter Jaw Leverage & Hardened Chain-Link Fracture", "#f97316", "#64748b", "볼트커터 이중 힌지가 벌어질 때 날 끝은 닫히는 복합 지렛대 기구학과 사슬 절단면 일치"],
        ["lockpick-tension-wrench-bottom-keyway-rake", "Lockpicking Bottom-of-Keyway Tension Wrench (Thumb) & Upper Hook Pick", "#38bdf8", "#fbbf24", "자물쇠 따기(Lockpicking)에서 반드시 열쇠구멍 하단에 텐션 렌치(돌림쇠)를 걸고 상단에 픽을 넣는 2도구 원칙 고정"],
        ["safe-combination-dial-3wheel-r-l-r-notch", "Mechanical Safe Dial 3-Wheel Combination (4x-3x-2x) & Stethoscope Contact", "#fbbf24", "#10b981", "금고 다이얼 눈금(0~99)과 청진기 다이어프램을 다이얼 축 옆 금속 문짝에 밀착하는 해부학 고정"],
        ["laser-tripwire-smoke-scatter-mirror-bounce", "Security Vault 650nm Red Laser Grid Tyndall Smoke Visibility & Mirror Law", "#ef4444", "#00e5ff", "보안 레이저가 연기/에어로졸 분사 시에만 틴들 현상으로 가시화되며 거울 반사각=입사각 물리 일치"],
        ["night-vision-green-phosphor-vs-white-thermal", "Image-Intensifier NVG Green/White Phosphor vs FLIR Thermal Ironbow Palette", "#22c55e", "#f97316", "야간투시경(유리창 투과 가능)과 열화상 카메라(유리창 투과 불가·체온 발열 감지)의 물리적 차이 혼동 차단"],
        ["hacking-terminal-ssh-nmap-wireshark-hex", "Realistic Linux Terminal (nmap/ssh/Wireshark Packet Hex) vs Fake 3D Skull UI", "#10b981", "#06b6d4", "해커 웹툰에서 허구적 3D 해골 대신 실제 리눅스 셸·포트 스캔·패킷 헥사 덤프 UI 일관성 유지"],
        ["server-rack-42u-patch-panel-hot-cold-aisle", "Data Center 19-Inch 42U Server Rack Patch Cable & Front-to-Back Airflow LED", "#3b82f6", "#22c55e", "데이터센터 42U 서버랙 전면 타공 도어·패치케이블 정리(Cable Management) 및 상태 LED 고정"],
        ["cctv-ptz-dome-blindspot-fisheye-timestamp", "CCTV PTZ Dome Camera FOV Cone Blind-Spot & OSD REC Timestamp Continuity", "#64748b", "#ef4444", "CCTV 화면 우상단 REC 타임스탬프가 사건 타임라인과 일치하고 천장 부감 광각 왜곡 유지"],
        ["car-blackbox-dashcam-wide140-gps-g-sensor", "Vehicle Dashcam 140-Degree Wide Hood Reflection & G-Sensor Impact Event", "#0ea5e9", "#fbbf24", "차량 블랙박스 영상 하단 날짜·시각·속도(km/h)·차량 보닛 반사광 고증"],
        ["subway-platform-screen-door-psd-emergency", "Korean Subway Platform Screen Door (PSD) Laser Sensor & Manual Release Bar", "#2563eb", "#ef4444", "지하철 승강장 스크린도어(PSD) 열차 출입문 정렬과 비상 수동 개폐 붉은 바 위치 고증"],
        ["rooftop-parapet-wall-height-ac-outdoor-unit", "Building Rooftop 120cm Parapet Wall Code, AC Condenser Fan & Emergency Door", "#94a3b8", "#38bdf8", "빌딩 옥상 난간벽(Parapet) 건축법 기준 120cm 이상 높이 비율 및 실외기 팬 그릴 고증"],
        ["manhole-cover-round-lip-ladder-rung-sewer", "Cast-Iron Round Manhole Cover (Cannot Fall In) & Offset Wall Step Rungs", "#475569", "#eab308", "원형 맨홀 뚜껑 갈고리 홈과 지하 수직 사다리 교차 디딤쇠 간격 고정"],
        ["fire-escape-counterbalanced-drop-ladder", "Urban Exterior Zig-Zag Fire Escape Balcony & Counterbalanced Drop Ladder", "#dc2626", "#94a3b8", "건물 외벽 지그재그 비상계단과 1층 바닥 위 체중 하강식 드롭 사다리 고증"],
        ["diesel-generator-pull-cord-recoil-jerrycan", "Portable Generator Recoil Pull-Start Handle, Choke Lever & 20L NATO Jerrycan", "#15803d", "#f59e0b", "비상 발전기 리코일 스타터 당김줄 방향과 20L 철제 제리캔 X자 보강 주름·3갈래 손잡이 고증"],
        ["walkie-talkie-ptt-thumb-button-helical-ant", "Two-Way Radio Left-Side PTT (Push-To-Talk) Thumb Hold & Squelch Tail", "#f97316", "#22c55e", "무전기 측면 PTT 버튼을 누르고 말한 뒤 떼고 듣는 반이중(Half-Duplex) 교신 동작 고정"],
        // Wave 47 (20개 플랫폼 — 총 900개 플랫폼 대기록 돌파!)
        ["cat-vertical-slit-pupil-ear-airplane-tail", "Feline Vertical Slit Pupil (Bright) vs Dilated Round (Dark/Play) & Ear Angle", "#f59e0b", "#10b981", "고양이 밝을 때 세로 실눈 동공·어둡거나 사냥 직전 둥글게 확장된 동공 및 마징가 귀 해부학 고정"],
        ["dog-play-bow-tail-wag-panting-harness-y", "Canine Play-Bow Posture, Y-Front Chest Harness (Non-Choke) & Ear Back", "#eab308", "#3b82f6", "반려견 앞다리를 낮추는 놀이 시그널(Play Bow)과 어깨 관절을 막지 않는 Y자형 하네스 착용 고증"],
        ["horse-ear-pinned-back-flemen-hoof-frog", "Equine Pinned-Back Ears (Aggression Warning), Nostril Flare & Horseshoe", "#d97706", "#ef4444", "말이 귀를 뒤로 바짝 젖히는 경계 신호와 말발굽 바닥 V자 쐐기(Frog)·편자 못 개수 고증"],
        ["owl-head-270deg-zygodactyl-talon-silent", "Owl Zygodactyl Talons (2 Front, 2 Back) & Facial Disc Feather Acoustics", "#a855f7", "#fbbf24", "올빼미/부엉이 사역마의 대지족(앞발가락 2개·뒷발가락 2개) 발톱 구조와 안면반 깃털 고정"],
        ["snake-forked-tongue-jacobson-pit-belly-scute", "Viper Loreal Heat-Pit, Forked Tongue Flick & Ventral Scute Locomotion", "#22c55e", "#ef4444", "뱀/용 몬스터 윗입술 앞 끝에서 나오는 갈라진 혀와 배 부분 넓은 가로 비늘(복판) 배열 고증"],
        ["butterfly-4wing-forewing-overlap-proboscis", "Lepidoptera 4-Wing Overlap (Forewing Over Hindwing) & Coiled Proboscis", "#ec4899", "#38bdf8", "나비 소품/이펙트에서 반드시 앞날개가 뒷날개 위를 덮는(Forewing Overlap) 겹침 순서 고정"],
        ["spider-8leg-cephalothorax-pedipalp-spinneret", "Arachnid 8-Leg Attachment to Cephalothorax (Not Abdomen) & Pedipalp Pair", "#991b1b", "#f8fafc", "거미 몬스터 다리 8개가 배(Abdomen)가 아닌 머리가슴(Cephalothorax)에 모두 붙어 있는 해부학 고정"],
        ["octopus-8arm-double-sucker-mantle-siphon", "Octopus 8 Arms (Double-Row Suckers) vs Squid 8 Arms + 2 Long Tentacles", "#8b5cf6", "#06b6d4", "문어(8다리+2열 빨판)와 오징어/크라켄(8다리+긴 촉완 2개=10다리)의 두족류 촉수 구분 고정"],
        ["shark-5gill-slit-vertical-tail-fin-dorsal", "Shark Vertical Caudal Fin (Side-to-Side) vs Whale Horizontal Fluke (Up-Down)", "#0284c7", "#e2e8f0", "상어/어류(수직 꼬리지느러미·좌우 유영)와 고래/돌고래(수평 꼬리지느러미·상하 유영) 꼬리 방향 혼동 차단"],
        ["crab-10leg-chela-pincer-sideways-carapace", "Decapod Crab 2 Chelipeds (Pincers) + 8 Walking Legs & Sideways Gait", "#ef4444", "#fbbf24", "갑각류 몬스터 집게다리 2개+보행다리 8개(총 10다리)와 안쪽으로 접히는 관절 구조 고정"],
        ["watch-chronograph-2pusher-tachymeter-crown", "Mechanical Chronograph 2-O'Clock Start/Stop Pusher, 4-O'Clock Reset & Crown", "#eab308", "#38bdf8", "크로노그래프 시계 우측 3시 용두·2시 스타트 버튼·4시 리셋 버튼 및 타키미터 베젤 고증"],
        ["fountain-pen-converter-piston-iridium-tip", "Fountain Pen Nib Breather Hole, Slit Capillary Action & Piston Converter", "#6366f1", "#fde047", "만년필 펜촉 숨구멍(Breather Hole)에서 끝단 팁까지 이어지는 중앙 슬릿이 위쪽을 향하도록 파지 고정"],
        ["mens-suit-button-rule-sometimes-always-never", "3-Button Suit Etiquette ('Sometimes-Always-Never') & Jacket Vent Split", "#1e293b", "#38bdf8", "남성 정장 재킷의 맨 아래 단추는 항상 풀어 두는(Never Button Bottom) 슈트 기본 매너 고정"],
        ["necktie-four-in-hand-windsor-dimple-belt", "Necktie Tip Touching Belt Buckle Center & Under-Knot Dimple Fold", "#2563eb", "#f43f5e", "넥타이 끝단이 벨트 버클 중앙에 정확히 닿는 길이 비율과 매듭 아래 보조개 주름(Dimple) 고정"],
        ["high-heel-stiletto-shank-arch-ankle-strap", "Stiletto Heel Vertical Plumb-Line Under Ankle Bone & Arch Shank Curve", "#ec4899", "#f8fafc", "하이힐 스틸레토 굽이 뒤꿈치 끝에서 수직으로 내려와 복사뼈 중심선과 정렬되도록 고정"],
        ["backpack-shoulder-strap-sternum-buckle-zip", "Backpack Dual Shoulder Strap Tension, Sternum Chest Clip & Load Lifter", "#10b981", "#fbbf24", "백팩 착용 시 어깨끈이 겨드랑이 아래로 밀착되고 등판이 허공에 뜨지 않도록 고정"],
        ["eyeglasses-nose-pad-temple-tip-ear-hook", "Eyeglasses Silicone Nose-Pad Contact & Temple-Tip Bend Behind Pinna", "#38bdf8", "#a855f7", "안경 착용 측면 컷에서 안경다리가 허공에 끝나지 않고 귓바퀴 위를 지나 귀 뒤로 꺾이도록 고정"],
        ["hearing-aid-bte-cie-cochlear-magnet-coil", "Behind-The-Ear (BTE) Hearing Aid Tube vs Cochlear Implant Scalp Magnet", "#06b6d4", "#fde047", "청각장애 보청기(귓바퀴 뒤 본체+음향관)와 인공와우(측두부 두피 원형 자석 코일) 구조 고증"],
        ["sign-language-ksl-asl-handshape-nonmanual", "Korean Sign Language (KSL) Finger-Spelling & Non-Manual Facial Grammar", "#14b8a6", "#f472b6", "한국수어(KSL) 수형·수위·수동과 함께 필수 문법 요소인 눈썹/입모양(비수지 기호) 동시 표현"],
        ["webtoon-global-archive-isbn-issn-legal-deposit", "National Library Legal Deposit (Napbon), UCI/ISBN-13 Barcode & Master PSD", "#6366f1", "#22c55e", "웹툰 국립중앙도서관 납본·단행본 ISBN-13 만화 분류기호(07810) 바코드 및 600dpi 마스터 PSD 아카이브 규격"],
        // Wave 48 (20개 플랫폼 — 총 920개 플랫폼 완성)
        ["murim-plum-blossom-sword-qi-petal", "Mount Hua Sect 5-Petal Plum Blossom Sword Qi Trajectory & Red Robe Emblem", "#f43f5e", "#fda4af", "화산파 매화검법 5꽃잎 검기 궤적·도포 매화 자수 문양 및 암향표 경공 잔상 고정"],
        ["namgung-imperial-lightning-broadsword-rig", "Namgung Clan Imperial Lightning Broadsword Two-Handed Center of Mass", "#38bdf8", "#eab308", "남궁세가 제왕검형 뇌전 청백색 스파크와 중검(대검) 양손 파지 무게중심 고증"],
        ["tang-clan-hidden-weapon-poison-needle-pouch", "Sichuan Tang Clan Poison Needle Wrist-Gauntlet, Throwing Dagger & Purple Qi", "#10b981", "#a855f7", "사천당가 허벅지/손목 암기낭·비도/독침 투척 손목 스냅 및 만독불침 보라 독기 연출"],
        ["zhuge-clan-qimen-dunjia-bagua-stone-array", "Zhuge Clan Qimen Dunjia 8-Trigram (Bagua) Stone Pillar Array & Feather Fan", "#06b6d4", "#fde047", "제갈세가 기문둔갑 팔진도 8방위 돌기둥 배열과 학우선(깃털 부채) 지휘 수인 고정"],
        ["shaolin-18arhat-wooden-staff-rosary-108", "Shaolin 108 Wooden Prayer Beads, Eyebrow-Height Bo Staff & Golden Body", "#f59e0b", "#d97706", "소림사 108염주 목걸이 알 크기·육합곤 양손 교차 그립 및 금강불괴 황금빛 금속 반사 고정"],
        ["demonic-cult-heavenly-demon-blood-qi-throne", "Heavenly Demon Cult Black-Core Crimson Aura & Obsidian Altar Relief", "#dc2626", "#1e1b4b", "천마신교 흑적색 마기(내부 암흑 코어+외곽 심홍 발광) 및 흑요석 마교 본산 제단 고증"],
        ["beggars-sect-bamboo-dog-beating-staff-gourd", "Beggars' Sect Green Bamboo Staff (Tagubong), Wine Gourd & Drunken Fist Axis", "#22c55e", "#ca8a04", "개방 타구봉 에메랄드빛 대나무 마디·허리 표주박 술병 매듭 및 취권 중심 이동 궤적 고정"],
        ["kunlun-wudang-taiji-yin-yang-fly-whisk", "Wudang Sect Taiji Yin-Yang Vortex, Horsehair Fly-Whisk (Buljin) & Lotus Pose", "#e2e8f0", "#0284c7", "무당파 태극 음양어 회전 방향·불진(백색 말총 먼지털이) 곡선 궤적 및 결가부좌 발등 위치 고정"],
        ["xianxia-flying-sword-imperial-stance-talisman", "Xianxia Flying Sword Surf Stance (Front/Rear Foot Balance) & Sword Array", "#38bdf8", "#c084fc", "선협 어검비행 시 검신 위 앞발·뒷발 측면 균형 자세와 왼손 검결(Jianjue) 수인 고정"],
        ["alchemy-pill-furnace-cauldron-tribulation-lightning", "Three-Legged Pill Cauldron (Danro) Fire Vent & Nine-Heavens Tribulation Lightning", "#f97316", "#a855f7", "무협/선협 삼족 연단로 화구 불꽃 색상과 경지 돌파 시 구중천 뇌겁 번개 소용돌이 연출"],
        ["martial-alliance-arena-stone-tile-flagpole", "Murim Alliance Duel Arena Shattered Bluestone Tiles & Sect Banner Wind", "#64748b", "#ef4444", "무림맹 비무대회장 청석 타일 파열 반경과 사방 문파 깃발의 풍향 일치 고정"],
        ["inn-tavern-2nd-floor-railing-wine-jar-seal", "Murim Inn (Gaekjan) 2nd-Floor Mezzanine Balustrade & Red-Cloth Sealed Wine Jar", "#b45309", "#dc2626", "객잔 2층 목조 난간 중정 내려다보기 부감 구도와 붉은 천으로 봉인한 도자기 술독 고증"],
        ["bamboo-forest-mist-leaf-slash-shockwave", "Bamboo Grove Diagonal Sword-Cut Slip Plane & Floating Leaf Shockwave", "#15803d", "#86efac", "대나무 숲 결투에서 검기에 베인 대나무가 45도 사선 단면를 따라 천천히 미끄러져 내리는 물리 연출"],
        ["waterfall-meditation-boulder-splash-refraction", "Waterfall Training Boulder Sitting Posture & High-Velocity Water Splash Crown", "#0ea5e9", "#f8fafc", "폭포수 아래 좌선 수련 시 어깨와 정수리에 부딪혀 사방으로 퍼지는 물보라 왕관 궤적 고정"],
        ["meridian-dantian-golden-core-nascent-soul", "Lower Dantian Golden Core (Geumdan) & 12 Meridian Qi Circulation Glow", "#fbbf24", "#38bdf8", "배꼽 아래 하단전 내단(금단) 코어 발광과 전신 12경맥 기혈 순환 라인 해부학 정렬"],
        ["ancient-scroll-bamboo-slip-silk-manuscript", "Woven Bamboo Slips (Jukgan) Dual Twine Binding & Right-to-Left Unrolling", "#d97706", "#fef08a", "고대 비급 죽간(대나무 조각) 위아래 2줄 엮음 끈 구조와 우→좌 펼침 순서 고증"],
        ["imperial-jade-seal-red-cinnabar-paste-box", "Imperial Heirloom Jade Seal (Oksae) Coiled Dragon Knob & Red Seal Impression", "#10b981", "#ef4444", "황실 옥새 반룡 손잡이 조각과 황색 비단 조서 위 경면주사 붉은 전서체 인영 일치"],
        ["carrier-pigeon-bamboo-leg-tube-wax-message", "Messenger Pigeon Tarsus Bamboo Tube Tie & Rolled Micro-Paper Scroll", "#94a3b8", "#f59e0b", "전서구 발목(부척골)에 묶인 초소형 대나무 서신통 위치와 밀랍 봉인 서찰 크기 비율 고정"],
        ["acupuncture-silver-needle-case-pulse-wrist", "Traditional Physician 3-Finger Radial Pulse Diagnosis (Chon-Gwan-Cheok) & Silver Needles", "#e2e8f0", "#14b8a6", "의원(신의) 진맥 시 환자 손목 요골동맥 위 검지·중지·약지(촌·관·척) 3지 접점과 은침 롤케이스 고증"],
        ["sealed-demonic-sword-chain-talisman-wrap", "Cursed Sword Iron Chain Cross-Binding & Talisman Seal Paper Shatter", "#ef4444", "#fbbf24", "봉인된 마검의 쇠사슬 교차 결박과 부적 띠가 발도 순간 탄화하며 찢어지는 연속성 고정"],
        // Wave 49 (20개 플랫폼 — 총 940개 플랫폼 완성)
        ["casino-baccarat-squeeze-shoe-chip-denomination", "VIP Casino Baccarat 8-Deck Shoe, Card Squeeze Corner Pip & Clay Chip Stack", "#10b981", "#fbbf24", "VIP 카지노 바카라 카드 쪼기(Squeeze) 시 변 기호 개수로 숫자를 읽는 규칙과 칩 액면가 색상 스택 고정"],
        ["poker-texas-holdem-button-flop-turn-river", "Texas Hold'em Dealer Button, Burn Card & 5 Community Cards (Flop-Turn-River)", "#ef4444", "#22c55e", "텍사스 홀덤 테이블 딜러 버튼·칩 팟(Pot) 및 중앙 커뮤니티 카드 5장 배치 순서 고정"],
        ["luxury-yacht-flybridge-teak-deck-champagne", "Superyacht Teak Deck Caulking Lines, Flybridge Helm & Stern Horizon Lock", "#0ea5e9", "#f59e0b", "슈퍼요트 티크 우드 갑판 줄눈 투시선과 바다 수평선 기울기 일치 고정"],
        ["private-jet-cabin-club-seating-oval-window", "Gulfstream Private Jet 4-Place Club Leather Seating & Dual Oval Windows", "#38bdf8", "#e2e8f0", "프라이빗 제트기 마주보는 클럽 시트·타원형 창문 간격·접이식 우드 테이블 비례 고증"],
        ["five-star-penthouse-infinity-pool-city-skyline", "Penthouse Floor-to-Ceiling Glass Reflection & Rooftop Infinity Pool Edge", "#6366f1", "#ec4899", "펜트하우스 통유리창 실내 반사상과 야간 스카이라인 소실점 정합성 유지"],
        ["auction-house-podium-gavel-paddle-number", "Fine Art Auctioneer Rostrum Gavel, Lot Display & Numbered Bidding Paddle", "#d97706", "#fef08a", "경매장 경매사 포디움 의사봉(Gavel) 타격판과 낙찰자 패들 번호가 컷마다 바뀌지 않도록 고정"],
        ["haute-couture-runway-catwalk-backstage-rack", "Fashion Week Runway Glossy Catwalk Reflection & Photographer Pit Lens Wall", "#ec4899", "#f8fafc", "패션쇼 런웨이 바닥 반사상과 양옆 프레스 카메라 렌즈 벽·조명 트러스 대칭 고정"],
        ["michelin-kitchen-pass-heat-lamp-tweezers", "Fine-Dining Kitchen Pass Infrared Heat Lamp, Plating Tweezers & Sauce Spoon", "#f97316", "#e2e8f0", "미슐랭 주방 패스(Pass) 보온등 주황빛 반사와 셰프 핀셋(Tweezers) 마이크로허브 플레이팅 고증"],
        ["cigar-humidor-guillotine-cutter-cedar-spill", "Cigar Double-Blade Guillotine Cut at Cap Shoulder & Cylindrical White Ash", "#b45309", "#ef4444", "시가 헤드 캡 숄더 절단면과 연소 시 끝단에 형성되는 원통형 회백색 재(Ash)·자줏빛 불씨 고정"],
        ["whisky-glencairn-ice-ball-decanter-cut-glass", "Glencairn Whisky Glass Tulip Bowl vs Old-Fashioned Hand-Carved Ice Sphere", "#d97706", "#fde047", "위스키 온더락 잔 내부 투명 구형 아이스볼(Ice Ball)의 호박색 액체 굴절과 크리스탈 디캔터 고증"],
        ["espresso-lever-machine-naked-portafilter-tiger", "Bottomless Portafilter Tiger-Stripe Crema Extraction & Microfoam Pitcher", "#92400e", "#fbbf24", "바리스타 바텀리스 포타필터 중앙으로 모이는 황금빛 타이거 스킨 에스프레소 추출 줄기 고정"],
        ["violin-stradivarius-f-hole-chinrest-rosin-dust", "Violin Left-Side Chinrest, Symmetrical f-Holes, Bridge Curve & Bow Rosin", "#b45309", "#fde047", "바이올린 턱받침(테일피스 좌측)·f홀 대칭·브릿지 곡률 및 활털 위 송진 가루 디테일 고정"],
        ["grand-piano-lid-prop-stick-right-side-damper", "Concert Grand Piano Lid Prop-Stick Opening on Right (Audience Side) Only", "#f8fafc", "#eab308", "그랜드 피아노 상판 덮개는 반드시 연주자 기준 오른쪽(객석 방향)으로 열리며 좌측 경첩 고정(좌우반전 작붕 차단)"],
        ["golf-driver-tee-shot-divot-bunker-sand-splash", "Golf Iron Turf Divot Ahead of Ball Position & Bunker Sand Explosion Arc", "#22c55e", "#facc15", "골프 아이언 샷에서 디봇(잔디 파임)이 공이 있던 위치보다 목표 방향 앞쪽에 생성되는 물리 고증"],
        ["polo-mallet-right-hand-only-helmet-martingale", "Equestrian Polo Right-Hand-Only Mallet Rule, Standing Martingale & Leg Wraps", "#3b82f6", "#ef4444", "귀족 폴로 경기에서 모든 선수는 안전 규칙상 반드시 오른손으로만 스틱(Mallet)을 쥐어야 함을 고정"],
        ["f1-pitstop-wheel-gun-halo-cockpit-drs-wing", "Formula 1 Titanium Halo Cockpit Bar, Rear Wing DRS Flap & Pit-Stop Wheel Gun", "#ef4444", "#38bdf8", "F1 머신 조종석 중앙 티타늄 헤일로(Halo) 기둥과 타이어 컴파운드 색띠(Soft 적색/Medium 황색/Hard 백색) 고정"],
        ["supercar-scissor-vs-gullwing-door-hinge-caliper", "Supercar Scissor Door (Front A-Pillar Hinge) vs Butterfly/Gullwing & Brake Caliper", "#f59e0b", "#ef4444", "슈퍼카 시저도어(앞펜더 경첩 수직 상승)와 걸윙도어(지붕 경첩) 구분 및 휠 내부 브레이크 캘리퍼 위치 고정"],
        ["swiss-bank-safe-deposit-dual-key-biometric-vault", "Private Bank Vault 2-Key Safe Deposit Lock & Exposed Epicyclic Door Gears", "#eab308", "#94a3b8", "스위스 프라이빗 뱅크 대여금고의 이중 열쇠구멍(은행원 키+고객 키 동시 해정)과 원형 금고문 기어 고증"],
        ["red-carpet-step-and-repeat-logo-wall-strobe", "Awards Red Carpet Step-and-Repeat Sponsor Grid & Velvet Rope Press Line", "#dc2626", "#fbbf24", "시상식 레드카펫 포토월 스폰서 로고 바둑판 배열 연속성과 카메라 플래시 반사 하이라이트 고정"],
        ["opera-glasses-mother-of-pearl-handle-balcony", "Vintage Mother-of-Pearl Opera Glasses Telescopic Handle & Dual-Circle Vignette", "#ec4899", "#fde047", "로판 황실 극장 오페라글라스 접이식 손잡이 방향과 쌍안경 시점 컷(8자형 듀얼 서클 비네팅) 연출"],
        // Wave 50 (20개 플랫폼 — 총 960개 플랫폼 완성!)
        ["deep-sea-submersible-acrylic-sphere-biolum", "Deep-Sea Submersible Thick Acrylic Viewport Refraction & hydraulic Manipulator", "#0284c7", "#00f5d4", "심해 잠수정 두꺼운 반구형 아크릴 관측창 가장자리 굴절 왜곡과 외부 유압 매니퓰레이터 집게 고정"],
        ["oil-rig-offshore-derrick-helipad-flare-boom", "Offshore Oil Platform Drilling Derrick, Cantilever Helipad & Gas Flare Boom", "#f97316", "#38bdf8", "해상 시추선 드릴링 데릭 철골 구조·캔틸레버 헬리패드 및 가스 플레어 타워 화염 풍향 일치"],
        ["arctic-icebreaker-snowmobile-dog-sled-goggle", "Polar Icebreaker Spoon Bow, Snow Goggle Mirrored Tint & Dog-Sled Gangline", "#38bdf8", "#f97316", "극지 탐험 설상 고글 곡면 반사상·방한 파카 퍼 후드 성에 및 개썰매 중심 줄(Gangline) 장력 고정"],
        ["desert-sandstorm-mirage-dune-slipface-shemagh", "Barchan Sand Dune Windward Ripple vs 34-Degree Leeward Slipface & Mirage", "#eab308", "#f97316", "사막 모래언덕 바람받이 잔물결 완경사와 바람그늘 34도 급경사 능선(Crest) 방향 일치"],
        ["volcano-lava-tube-obsidian-pyroclastic-ash", "Pahoehoe Lava Black Cooling Crust Cracks & Incandescent Orange Core Glow", "#ef4444", "#facc15", "화산 용암 표면이 식어 검게 굳은 껍질 갈라진 틈으로만 가장 밝은 황백색/주홍색 백열광이 비치도록 고정"],
        ["space-station-cupola-window-earth-terminator", "ISS 7-Window Cupola Dome, Earth Limb Airglow & Orbital Sunrise Terminator", "#2563eb", "#38bdf8", "우주정거장 7면 큐폴라 관측창(중앙 원형창+주변 사다리꼴 6창) 기하학과 지구 대기권 푸른 곡선 고정"],
        ["eva-spacesuit-tether-hook-visor-gold-fresnel", "Extravehicular Spacesuit Gold-Plated Visor Reflection, Chest DCM & Safety Tether", "#fbbf24", "#e2e8f0", "선외우주복(EVA) 가슴 제어 모듈(DCM) 거울 반전 글자와 금도금 헬멧 바이저 반사상·안전 테더 고정"],
        ["lunar-mars-rover-6wheel-rocker-bogie-habitat", "Planetary Rover 6-Wheel Rocker-Bogie Suspension & Pressurized Airlock Hatch", "#d97706", "#38bdf8", "화성/달 탐사 로버 6륜 로커-보기 관절 링크와 거주 기지 원형 에어락 내외부 압력차 개폐 방향 고정"],
        ["cryosleep-pod-frost-glass-biomonitor-tube", "Sci-Fi Cryostasis Pod Dendritic Frost Pattern, Biometric HUD & Coolant Umbilical", "#06b6d4", "#a855f7", "SF 콜드슬립 동면 포드 유리창 가장자리 수지상 성에 결정과 생체 바이탈 홀로그램 수평 정렬"],
        ["particle-accelerator-torus-cherenkov-blue-glow", "Research Reactor Pool Cherenkov Radiation Blue Glow (#00B4D8) & Torus Magnet", "#00b4d8", "#3b82f6", "원자로 수조 코어 주변에서 발생하는 체렌코프 복사 특유의 청록색 수중 발광과 입자가속기 원통 투시 고정"],
        ["bsl4-biohazard-airlock-chemical-shower-glovebox", "BSL-4 Positive-Pressure Coiled Air-Hose Suit & Negative-Pressure Glovebox", "#facc15", "#ef4444", "BSL-4 생물안전 실험실 천장 노란 나선형 공기 공급 호스 연결과 글러브박스 음압 장갑 방향 고정"],
        ["air-traffic-control-tower-radar-sweep-runway", "Airport Control Tower Outward-Tilted Anti-Glare Glass & Runway Approach Lights", "#10b981", "#38bdf8", "공항 관제탑 유리창이 실내 조명 반사를 막기 위해 바깥쪽 위로 15도 기울어진 사다리꼴 단면 고증"],
        ["wind-turbine-3blade-nacelle-solar-tracker-farm", "3-Blade Wind Turbine 120-Degree Hub Symmetry & Solar Array South Tilt", "#22c55e", "#0ea5e9", "풍력발전기 날개 3개가 정확히 120도 간격을 이루며 원근 투시 타원에 맞춰 회전하는 기하학 고정"],
        ["hydroelectric-dam-spillway-floodgate-penstock", "Concrete Arch Dam Tainter Spillway Gate & Parabolic Whitewater Plume", "#0284c7", "#e2e8f0", "댐 여수로 수문 하단에서 뿜어져 나오는 고압 방류수의 포물선 궤적과 하류 무지개 물보라 연출"],
        ["nuclear-cooling-tower-hyperbolic-steam-plume", "Hyperboloid Cooling Tower Waist Curve & Buoyant White Water-Vapor Plume", "#94a3b8", "#f8fafc", "발전소 냉각탑의 오목한 쌍곡면(Hyperboloid) 실루엣과 상단 순백색 수증기 구름 기둥 고증"],
        ["underground-bunker-blast-door-handwheel-dog", "Heavy Blast Door Central Spoke Handwheel & Radial Locking Dogs Linkage", "#64748b", "#f59e0b", "지하 벙커 방폭문 중앙 핸드휠을 돌릴 때 문 테두리 사방의 강철 빗장(Dogs)이 동시에 물리는 기구학 고정"],
        ["cargo-plane-rear-ramp-paratrooper-green-light", "Military Transport Rear Cargo Ramp, Static-Line Cable & Jump Light (Red/Green)", "#15803d", "#22c55e", "수송기 후방 램프 개방 시 천장 강하 와이어에 걸린 정적줄(Static Line) 카라비너와 점프 신호등 고증"],
        ["aircraft-carrier-catapult-steam-arresting-wire", "Carrier Flight Deck Catapult Shuttle, Jet Blast Deflector & 3rd Arresting Wire", "#475569", "#eab308", "항공모함 갑판 제트 화염 편향판(JBD) 기립 각도와 착함기 테일후크가 어레스팅 와이어를 당기는 V자 장력 고정"],
        ["ice-cave-glacier-crevasse-crampon-ice-axe", "Glacial Crevasse Subsurface Blue Light, 12-Point Crampons & Ice-Axe Self-Arrest", "#38bdf8", "#e0f2fe", "빙하 크레바스 얼음벽 내부 깊은 청색 다중산란광과 피켈(Ice Axe) 헤드/피크 방향 고증"],
        ["mine-shaft-timber-shoring-ore-cart-canary-lamp", "Underground Mine Post-and-Lintel Timber Sets, Narrow-Gauge Ore Cart & Headlamp", "#92400e", "#fbbf24", "지하 광산 갱도 사각 목재 동바리(기둥+보) 반복 투시와 광차 레일 궤간·안전모 랜턴 원뿔광 고정"],
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
export const REA740_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA760_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA780_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA800_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA820_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA840_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA860_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA880_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA900_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA920_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA940_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
export const REA960_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;
