import { REA39_WAVE23_PLATFORM_UI_THEMES } from "./claude-rea39-wave23-platform-themes";

/* ============================================================================
 * 0. 65대 웹툰·스토리보드·3D·드로잉·번역·채색·LoRA/ControlNet·캐릭터메이커·오디오 AI 보조 플랫폼 REA 정본 카탈로그 및 UI/UX 디자인 토큰 스키마
 *    (하위 호환을 위해 REA15_*, REA39_*, REA50_*, REA65_* 식별자를 동시에 노출합니다)
 * ============================================================================ */

export const REA15_PLATFORM_IDS = [
  // Wave 1 (15개 플랫폼)
  "glimnavi",
  "snaptoon",
  "kaistory",
  "ggooming",
  "plask-motion",
  "manhwa-ai",
  "komiko-ai",
  "anifusion",
  "katalist-ai",
  "novelai",
  "mootion",
  "skyreels",
  "frameo",
  "naver-webtoon-shaper",
  "posemaniacs",
  // Wave 2 (12개 플랫폼)
  "llamagen",
  "dashtoon",
  "ltx-studio",
  "boords",
  "magic-poser",
  "posemy-art",
  "cascadeur",
  "krea",
  "leonardo-ai",
  "gentoon",
  "tootoon",
  "tooning-plus",
  // Wave 3 (12개 플랫폼)
  "enkava",
  "jitter",
  "lumiere-graphics",
  "graphite-editor",
  "pixieditor",
  "spline",
  "rive",
  "medibang-paint",
  "ibispaint",
  "clip-studio-paint",
  "acon3d",
  "webtoon-canvas",
  // Wave 4 (11개 플랫폼)
  "comicai",
  "ai-comic-factory",
  "wonderunit-storyboarder",
  "storyboardthat",
  "cotrans-manga-translator",
  "vroid-studio",
  "blockade-skybox-ai",
  "krita",
  "procreate-dreams",
  "pixiv-sketch",
  "artbreeder",
  // Wave 5 (15개 플랫폼 — 총 65개 플랫폼 완성)
  "nijijourney",
  "civitai",
  "tensor-art",
  "seaart-ai",
  "pixai-art",
  "moescape-ai",
  "waifulabs",
  "charat-me",
  "heroforge",
  "tripo3d",
  "meshy-ai",
  "suno-ai",
  "elevenlabs",
  "manga-plus-creators",
  "picrew-me",
  // Wave 6 (15개 플랫폼 — 총 80개 플랫폼 완성)
  "sketchup-3d-warehouse",
  "petalica-paint",
  "comicsmaker-ai",
  "runwayml",
  "luma-dream-machine",
  "pika-art",
  "live2d-cubism",
  "spine-2d",
  "blender-grease-pencil",
  "magma-studio",
  "cara-app",
  "openart-ai",
  "playground-ai",
  "recraft-ai",
  "viggle-ai",
  // Wave 7 (20개 플랫폼 — 총 100개 플랫폼 완성)
  "tapas-io",
  "tappytoon",
  "ridibooks-webtoon",
  "postype",
  "mixamo",
  "marvelous-designer",
  "substance-3d",
  "coolors",
  "adobe-color",
  "noonnu-font",
  "blambot-fonts",
  "sudowrite",
  "novelcrafter",
  "campfire-writing",
  "milanote",
  "pureref",
  "toon-boom-harmony",
  "tvpaint-animation",
  "moho-animation",
  "eagle-cool",
  // Wave 8 (20개 플랫폼 — 총 120개 플랫폼 완성)
  "naver-webtoon-ai-painter",
  "lezhin-comics-studio",
  "kakao-webtoon-alive",
  "pocket-comics-comico",
  "bilibili-comics",
  "comixology-guided-view",
  "clipdrop-relight-uncrop",
  "magnific-ai-relight",
  "photoroom-matting",
  "ideogram-v3-typography",
  "midjourney-web-editor",
  "comfyui-ipadapter-controlnet",
  "invokeai-unified-canvas",
  "procreate-5-3-ipad",
  "paint-tool-sai-v2",
  "rebelle-7-nanopixel",
  "heavy-paint-color-block",
  "zbrush-npr-matcap",
  "daz3d-genesis9-figure",
  "nomad-sculpt-webtoon",
  // Wave 9 (20개 플랫폼 — 총 140개 플랫폼 완성)
  "kuaikan-manhua-studio",
  "piccoma-smartoon-studio",
  "line-manga-indies",
  "mrblue-webtoon-studio",
  "bomtoon-kidari-studio",
  "toomics-global-studio",
  "manta-comics-studio",
  "qimao-free-comic",
  "tencent-ac-qq-comic",
  "pixiv-comic-indie",
  "artstation-3d-marketplace",
  "sketchfab-3d-webtoon",
  "polycam-3d-lidar-room",
  "luma-genie-3d-prop",
  "csm-3d-cube-ai",
  "kaedim-3d-asset",
  "scenario-gg-game-art",
  "layer-ai-2d-spine",
  "dashtoon-character-lora",
  "glaze-nightshade-shield",
  // Wave 10 (20개 플랫폼 — 총 160개 플랫폼 완성)
  "jaedam-media-webtoon",
  "dccent-noblesse-studio",
  "redice-studio-action",
  "ylab-superstring-studio",
  "kenaz-webtoon-house",
  "daon-creative-studio",
  "toyou-dream-webtoon",
  "celsys-clipstudio-assets",
  "carapace-3d-perspective",
  "lazy-nezumi-pro-ruler",
  "designdoll-terawell-3d",
  "easy-pose-madcat-mobile",
  "handy-art-reference-tool",
  "mara-3d-facial-rig",
  "style2paints-v45-color",
  "manga-whisperer-balloons",
  "typecast-neopience-voice",
  "supertone-play-webtoon",
  "fliki-ai-webtoon-reels",
  "capcut-comic-reels-studio",
  // Wave 11 (20개 플랫폼 — 총 180개 플랫폼 완성)
  "flux-1-kontext-character",
  "sd-forge-controlnet-layer",
  "fooocus-inpaint-engine",
  "krita-ai-diffusion-aclysia",
  "photoshop-firefly-generative",
  "illustrator-vector-speech-sfx",
  "affinity-designer-v2-vector",
  "corel-painter-2025-thick",
  "artrage-vitae-impasto",
  "open-toonz-gts-scan",
  "tahoma2d-stopmotion-toon",
  "synfig-studio-vector-tween",
  "wick-editor-interactive-toon",
  "fable-prism-motion-ai",
  "haiper-ai-video-keyframe",
  "kling-ai-motion-brush",
  "minimax-hailuo-director",
  "sora-storyboard-timeline",
  "veo-3-cinematic-audio-cut",
  "higgsfield-diffuse-camera",
  // Wave 12 (20개 플랫폼 — 총 200개 플랫폼 완성)
  "world-anvil-chronicle",
  "legendkeeper-atlas-wiki",
  "fantasia-archive-lore",
  "obsidian-canvas-story-graph",
  "scrivener-3-corkboard",
  "final-draft-13-beatboard",
  "arc-studio-pro-plotline",
  "causality-story-sequencer",
  "twinmotion-unreal-toon",
  "d5-render-ai-atmosphere",
  "lumion-2025-stylized-arch",
  "enscape-orthographic-plan",
  "blender-beer-malt-npr",
  "goo-engine-dillongoo-anime",
  "vroid-hub-pose-cloud",
  "booth-pm-webtoon-3d-assets",
  "clip-studio-modeler-3d",
  "sandoll-cloud-webtoon-font",
  "rixfont-comic-sfx-type",
  "paletton-color-scheme-lab",
  // Wave 13 (20개 플랫폼 — 총 220개 플랫폼 완성)
  "webtoon-factory-dupuis",
  "delitoon-france-studio",
  "verytoon-editions-delcourt",
  "izneo-bd-eu-player",
  "mangamo-subscription-reader",
  "azuki-digital-manga",
  "globalcomix-creator-hub",
  "inkr-comics-localization",
  "bato-v4-panel-inspector",
  "bookwalker-kadokawa-vertical",
  "cmoa-ntt-solmare-studio",
  "mechacomic-amutus-strip",
  "rensa-ai-manga-translator",
  "deep-manga-colorizer-v2",
  "orx-ornatrix-hair-groom",
  "xgen-maya-toon-groom",
  "clo3d-fashion-pattern",
  "style3d-digital-garment",
  "metahuman-animator-facs",
  "audio2face-omniverse-lip",
  // Wave 14 (20개 플랫폼 — 총 240개 플랫폼 완성)
  "ic-light-lllyasviel",
  "beeble-switchlight-studio",
  "wonder-dynamics-wonder-studio",
  "move-ai-multicam-mocap",
  "rokoko-vision-dualcam",
  "deepmotion-animate-3d",
  "radical-3d-live-mocap",
  "kinetix-emote-3d-studio",
  "davinci-resolve-color-lut",
  "dehancer-film-bloom-grain",
  "borisfx-sapphire-glow-rays",
  "knoll-light-factory-flare",
  "trapcode-particular-vfx",
  "embergen-realtime-fire-smoke",
  "liquigen-realtime-water-splash",
  "world-creator-terrain-3d",
  "gaea-quadspinner-erosion",
  "speedtree-stylized-foliage",
  "yoondesign-font-cloud",
  "morisawa-fonts-manga-jp",
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
