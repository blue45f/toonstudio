import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EXIT_CODES,
  ERROR_CODES,
  validateProject,
  generateExportManifest,
  verifyExportManifest,
  canonicalJsonStringify,
  computeFileSha256,
  formatStudioChecksum,
} from '../src/index.mjs';
import { runCli } from '../bin/toon-validator.mjs';

const FIXTURE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'toon-manifest-validator-fixtures-'));
test.after(() => { fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true }); });
const VALID_FIXTURE_DIR = path.join(FIXTURE_ROOT, 'valid-basic');
const INVALID_FIXTURE_DIR = path.join(FIXTURE_ROOT, 'invalid-sample');

function ensureSyntheticFixtures() {
  fs.mkdirSync(path.join(VALID_FIXTURE_DIR, 'assets', 'images'), { recursive: true });
  fs.mkdirSync(path.join(VALID_FIXTURE_DIR, 'assets', 'audio'), { recursive: true });
  fs.mkdirSync(path.join(VALID_FIXTURE_DIR, 'assets', 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(VALID_FIXTURE_DIR, 'assets', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(VALID_FIXTURE_DIR, 'assets', 'subtitles'), { recursive: true });
  fs.mkdirSync(path.join(VALID_FIXTURE_DIR, 'empty-dir'), { recursive: true });

  fs.writeFileSync(
    path.join(VALID_FIXTURE_DIR, 'assets', 'images', 'ep1_p1.png'),
    Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex')
  );
  fs.writeFileSync(
    path.join(VALID_FIXTURE_DIR, 'assets', 'images', 'ep1_p2.webp'),
    Buffer.from('RIFF_SYNTHETIC_WEBP_PANEL_2', 'utf8')
  );
  fs.writeFileSync(
    path.join(VALID_FIXTURE_DIR, 'assets', 'images', '한글배경.jpg'),
    Buffer.from('FFD8FFE0_SYNTHETIC_JPEG_KOREAN_NFC', 'utf8')
  );
  fs.writeFileSync(
    path.join(VALID_FIXTURE_DIR, 'assets', 'audio', 'bgm_01.mp3'),
    Buffer.from('ID3_SYNTHETIC_AUDIO_BGM_01', 'utf8')
  );
  fs.writeFileSync(
    path.join(VALID_FIXTURE_DIR, 'assets', 'fonts', 'toon_sans.woff2'),
    Buffer.from('wOF2_SYNTHETIC_FONT_DATA', 'utf8')
  );
  fs.writeFileSync(
    path.join(VALID_FIXTURE_DIR, 'assets', 'scripts', 'dialogue_ep1.json'),
    JSON.stringify({ lines: ['Hello ToonStudio!'] })
  );
  fs.writeFileSync(
    path.join(VALID_FIXTURE_DIR, 'assets', 'subtitles', 'ep1_ko.vtt'),
    'WEBVTT\n\n00:00.000 --> 00:02.000\n안녕하세요\n'
  );
  fs.writeFileSync(path.join(VALID_FIXTURE_DIR, 'assets', 'images', 'zero_byte.png'), Buffer.alloc(0));

  const validProject = makeBaseValidProject();
  fs.writeFileSync(
    path.join(VALID_FIXTURE_DIR, 'project.json'),
    JSON.stringify(validProject, null, 2) + '\n',
    'utf8'
  );

  const validGraphProject = makeValidStudioProjectGraphV1();
  fs.writeFileSync(
    path.join(VALID_FIXTURE_DIR, 'project-graph-v1.json'),
    JSON.stringify(validGraphProject, null, 2) + '\n',
    'utf8'
  );

  fs.mkdirSync(INVALID_FIXTURE_DIR, { recursive: true });
  const brokenProject = makeBaseValidProject();
  brokenProject.project.title = '   ';
  brokenProject.episodes[0].projectId = 'wrong-proj';
  brokenProject.panels[0].assetIds.push('asset-missing-999');
  brokenProject.assets.push({
    id: 'asset-traversal',
    type: 'image',
    title: 'Traversal Escape',
    relativePath: ['..', '..', 'outside-fixture', 'unallowed.dat'].join('/'),
  });
  fs.writeFileSync(
    path.join(INVALID_FIXTURE_DIR, 'project-invalid.json'),
    JSON.stringify(brokenProject, null, 2) + '\n',
    'utf8'
  );
}

function makeBaseValidProject() {
  return {
    schemaVersion: '1.0.0',
    project: {
      id: 'proj-toon-001',
      title: '달빛 스튜디오 시즌1',
      author: 'ToonStudio Team',
      createdAt: '2026-11-10T00:00:00.000Z',
    },
    episodes: [
      { id: 'ep-01', projectId: 'proj-toon-001', title: '제1화 시작의 문', order: 1 },
      { id: 'ep-02', projectId: 'proj-toon-001', title: '제2화 그림자 숲', order: 2 },
    ],
    scenes: [
      { id: 'sc-01', episodeId: 'ep-01', title: '오프닝 거리', order: 1 },
      { id: 'sc-02', episodeId: 'ep-01', title: '옥상 조우', order: 2 },
      { id: 'sc-03', episodeId: 'ep-02', title: '숲 입구', order: 1 },
    ],
    panels: [
      {
        id: 'pn-01',
        sceneId: 'sc-01',
        title: '첫 번째 컷',
        order: 1,
        assetIds: ['as-img-1', 'as-font-1'],
        dialogue: '드디어 도착했어.',
      },
      {
        id: 'pn-02',
        sceneId: 'sc-01',
        title: '두 번째 컷',
        order: 2,
        assetIds: ['as-img-2', 'as-aud-1'],
      },
      {
        id: 'pn-03',
        sceneId: 'sc-02',
        title: '옥상 야경 컷',
        order: 1,
        assetIds: ['as-img-kr', 'as-sub-1'],
      },
      {
        id: 'pn-04',
        sceneId: 'sc-03',
        title: '숲 속 대사 컷',
        order: 1,
        assetIds: ['as-scr-1'],
      },
    ],
    assets: [
      {
        id: 'as-img-1',
        type: 'image',
        title: '1화 1컷 이미지',
        relativePath: 'assets/images/ep1_p1.png',
      },
      {
        id: 'as-img-2',
        type: 'image',
        title: '1화 2컷 이미지',
        relativePath: 'assets/images/ep1_p2.webp',
      },
      {
        id: 'as-img-kr',
        type: 'image',
        title: '한글 배경 이미지',
        relativePath: 'assets/images/한글배경.jpg',
      },
      {
        id: 'as-aud-1',
        type: 'audio',
        title: '배경음악 01',
        relativePath: 'assets/audio/bgm_01.mp3',
      },
      {
        id: 'as-font-1',
        type: 'font',
        title: '기본 웹툰 폰트',
        relativePath: 'assets/fonts/toon_sans.woff2',
      },
      {
        id: 'as-scr-1',
        type: 'script',
        title: '1화 대본 데이터',
        relativePath: 'assets/scripts/dialogue_ep1.json',
      },
      {
        id: 'as-sub-1',
        type: 'subtitle',
        title: '1화 한국어 자막',
        relativePath: 'assets/subtitles/ep1_ko.vtt',
      },
    ],
  };
}

function makeValidStudioProjectGraphV1() {
  return {
    version: 1,
    projectId: 'proj:toon:graph-01',
    title: '달빛 스튜디오 그래프 v1',
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    nodes: [
      {
        version: 1,
        id: 'ep:01',
        kind: 'episode',
        parentId: null,
        scope: { version: 1, projectId: 'proj:toon:graph-01', episodeId: 'ep:01' },
        label: '제1화 그래프 오프닝',
        order: 1,
      },
      {
        version: 1,
        id: 'sc:01',
        kind: 'scene',
        parentId: 'ep:01',
        scope: { version: 1, projectId: 'proj:toon:graph-01', episodeId: 'ep:01', sceneId: 'sc:01' },
        label: '장면 1',
        order: 1,
      },
      {
        version: 1,
        id: 'pn:01',
        kind: 'panel',
        parentId: 'sc:01',
        scope: {
          version: 1,
          projectId: 'proj:toon:graph-01',
          episodeId: 'ep:01',
          sceneId: 'sc:01',
          panelId: 'pn:01',
        },
        label: '패널 1',
        order: 1,
      },
    ],
    assetUsages: [
      {
        version: 1,
        id: 'usage:01',
        assetId: 'as:img:1',
        assetRevisionId: 'rev:01',
        licenseGrantId: 'lic:01',
        scope: {
          version: 1,
          projectId: 'proj:toon:graph-01',
          episodeId: 'ep:01',
          sceneId: 'sc:01',
          panelId: 'pn:01',
        },
        insertedAt: '2026-11-10T00:00:00.000Z',
      },
    ],
    assets: [
      {
        id: 'as:img:1',
        type: 'image',
        label: '그래프 패널 이미지',
        displayPath: 'assets/images/ep1_p1.png',
      },
    ],
  };
}

ensureSyntheticFixtures();

test('01. Valid flat relational project passes validation and generates manifest', () => {
  const proj = makeBaseValidProject();
  const res = generateExportManifest(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.ok, true);
  assert.equal(res.validation.errors.length, 0);
  assert.equal(res.manifest.summary.episodeCount, 2);
  assert.equal(res.manifest.summary.sceneCount, 3);
  assert.equal(res.manifest.summary.panelCount, 4);
  assert.equal(res.manifest.summary.assetCount, 7);
  assert.equal(res.manifest.studioArchiveManifest.schemaVersion, 1);
  assert.equal(res.manifest.studioArchiveManifest.files.length, 7);
});

test('02. Valid ToonStudio native StudioProjectGraphV1 (nodes + scope + assetUsages) passes and generates manifest', () => {
  const graphProj = makeValidStudioProjectGraphV1();
  const res = generateExportManifest(graphProj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.ok, true);
  assert.equal(res.manifest.project.id, 'proj:toon:graph-01');
  assert.equal(res.manifest.summary.episodeCount, 1);
  assert.equal(res.manifest.summary.sceneCount, 1);
  assert.equal(res.manifest.summary.panelCount, 1);
  assert.equal(res.manifest.summary.assetCount, 1);
});

test('03. Valid nested project (episodes[].scenes[].panels[]) normalizes and passes', () => {
  const nestedProject = {
    schemaVersion: '1.0.0',
    project: { id: 'proj-nested', title: '중첩 구조 프로젝트' },
    episodes: [
      {
        id: 'ep-1',
        projectId: 'proj-nested',
        title: '1화',
        order: 1,
        scenes: [
          {
            id: 'sc-1',
            title: '1씬',
            order: 1,
            panels: [
              {
                id: 'pn-1',
                title: '1컷',
                order: 1,
                assetIds: ['as-img-1'],
              },
            ],
          },
        ],
      },
    ],
    assets: [
      {
        id: 'as-img-1',
        type: 'image',
        title: '컷1 이미지',
        relativePath: 'assets/images/ep1_p1.png',
      },
    ],
  };
  const res = generateExportManifest(nestedProject, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.ok, true);
  assert.equal(res.manifest.summary.panelCount, 1);
});

test('04. Valid expectedSha256 (both raw 64-hex and "sha256:<64hex>" Studio format) succeeds', () => {
  const proj = makeBaseValidProject();
  const sha = computeFileSha256(path.join(VALID_FIXTURE_DIR, 'assets/images/ep1_p1.png'));
  proj.assets[0].expectedSha256 = sha.toUpperCase();
  proj.assets[1].contentDigest = formatStudioChecksum(
    computeFileSha256(path.join(VALID_FIXTURE_DIR, 'assets/images/ep1_p2.webp'))
  );
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, true);
});

test('05. Boundary: Leading "./" and NFC Korean asset path normalizes cleanly', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].relativePath = './assets/images/ep1_p1.png';
  const res = generateExportManifest(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.ok, true);
  const found = res.manifest.assets.find((a) => a.id === 'as-img-1');
  assert.equal(found.normalizedPath, 'assets/images/ep1_p1.png');
});

test('06. Boundary: Unicode NFD Korean path normalizes to NFC when unique', () => {
  const proj = makeBaseValidProject();
  const nfdPath = 'assets/images/한글배경.jpg'.normalize('NFD');
  proj.assets[2].relativePath = nfdPath;
  const res = generateExportManifest(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.ok, true);
  const found = res.manifest.assets.find((a) => a.id === 'as-img-kr');
  assert.equal(found.normalizedPath, 'assets/images/한글배경.jpg'.normalize('NFC'));
});

test('07. Boundary: Unreferenced asset allowed as warning when requireAllAssetsReferenced=false', () => {
  const proj = makeBaseValidProject();
  proj.panels[3].assetIds = ['as-img-1'];
  const res = validateProject(proj, {
    fixtureDir: VALID_FIXTURE_DIR,
    requireAllAssetsReferenced: false,
  });
  assert.equal(res.valid, true);
  assert.equal(res.warnings.length, 1);
  assert.equal(res.warnings[0].code, ERROR_CODES.UNREFERENCED_ASSET);
});

test('08. Deterministic Manifest Reproducibility: Shuffled input order yields identical manifest JSON and hashes', () => {
  const projA = makeBaseValidProject();
  const projB = makeBaseValidProject();
  projB.episodes.reverse();
  projB.scenes.reverse();
  projB.panels.reverse();
  projB.assets.reverse();

  const resA = generateExportManifest(projA, { fixtureDir: VALID_FIXTURE_DIR });
  const resB = generateExportManifest(projB, { fixtureDir: VALID_FIXTURE_DIR });

  assert.equal(resA.ok, true);
  assert.equal(resB.ok, true);
  assert.equal(
    canonicalJsonStringify(resA.manifest),
    canonicalJsonStringify(resB.manifest)
  );
  assert.equal(
    resA.manifest.integrity.manifestContentHash,
    resB.manifest.integrity.manifestContentHash
  );
  assert.equal(
    resA.manifest.integrity.assetTreeHash,
    resB.manifest.integrity.assetTreeHash
  );
});

test('09. Manifest Verification succeeds on untampered manifest and fixture directory', () => {
  const proj = makeBaseValidProject();
  const { manifest } = generateExportManifest(proj, { fixtureDir: VALID_FIXTURE_DIR });
  const verification = verifyExportManifest(manifest, VALID_FIXTURE_DIR);
  assert.equal(verification.verified, true);
  assert.equal(verification.errors.length, 0);
});

test('10. Reference Integrity: Episode projectId mismatch fails with REF_EPISODE_PROJECT_MISMATCH', () => {
  const proj = makeBaseValidProject();
  proj.episodes[1].projectId = 'proj-other-999';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.REF_EPISODE_PROJECT_MISMATCH));
});

test('11. Reference Integrity: Scene referencing missing episodeId fails with REF_SCENE_EPISODE_MISSING', () => {
  const proj = makeBaseValidProject();
  proj.scenes[0].episodeId = 'ep-non-existent';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.REF_SCENE_EPISODE_MISSING));
});

test('12. Reference Integrity: Panel referencing missing sceneId fails with REF_PANEL_SCENE_MISSING', () => {
  const proj = makeBaseValidProject();
  proj.panels[0].sceneId = 'sc-non-existent';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.REF_PANEL_SCENE_MISSING));
});

test('13. Reference Integrity: Panel referencing missing assetId fails with REF_PANEL_ASSET_MISSING', () => {
  const proj = makeBaseValidProject();
  proj.panels[0].assetIds.push('as-ghost-404');
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.REF_PANEL_ASSET_MISSING));
});

test('14. Reference Integrity: Unreferenced asset fails by default with UNREFERENCED_ASSET', () => {
  const proj = makeBaseValidProject();
  proj.panels[3].assetIds = ['as-img-1'];
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.UNREFERENCED_ASSET));
});

test('15. StudioProjectGraphV1 Integrity: Missing parentId in graph node fails with REF_NODE_PARENT_MISSING', () => {
  const graphProj = makeValidStudioProjectGraphV1();
  graphProj.nodes[1].parentId = 'ep:missing:999';
  const res = validateProject(graphProj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.REF_NODE_PARENT_MISSING));
});

test('16. StudioScopeRefV1 Integrity: Scene/Panel scope missing episodeId parent fails with REF_SCOPE_HIERARCHY_INVALID', () => {
  const graphProj = makeValidStudioProjectGraphV1();
  delete graphProj.nodes[1].scope.episodeId;
  const res = validateProject(graphProj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.REF_SCOPE_HIERARCHY_INVALID));
});

test('17. Duplicate ID: Duplicate episode ID fails with DUPLICATE_EPISODE_ID', () => {
  const proj = makeBaseValidProject();
  proj.episodes[1].id = 'ep-01';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_EPISODE_ID));
});

test('18. Duplicate ID: Duplicate scene ID fails with DUPLICATE_SCENE_ID', () => {
  const proj = makeBaseValidProject();
  proj.scenes[1].id = 'sc-01';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_SCENE_ID));
});

test('19. Duplicate ID: Duplicate panel ID fails with DUPLICATE_PANEL_ID', () => {
  const proj = makeBaseValidProject();
  proj.panels[1].id = 'pn-01';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_PANEL_ID));
});

test('20. Duplicate ID: Duplicate asset ID fails with DUPLICATE_ASSET_ID', () => {
  const proj = makeBaseValidProject();
  proj.assets[1].id = 'as-img-1';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_ASSET_ID));
});

test('21. Duplicate ID: Cross-entity ID collision fails with DUPLICATE_GLOBAL_ID', () => {
  const proj = makeBaseValidProject();
  proj.scenes[0].id = 'ep-01';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_GLOBAL_ID));
});

test('22. Duplicate ID: Duplicate asset reference inside a single panel fails with DUPLICATE_PANEL_ASSET_REF', () => {
  const proj = makeBaseValidProject();
  proj.panels[0].assetIds = ['as-img-1', 'as-img-1'];
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_PANEL_ASSET_REF));
});

test('23. Ordering: Episode order <= 0 or non-integer fails with INVALID_EPISODE_ORDER', () => {
  const proj = makeBaseValidProject();
  proj.episodes[0].order = 0;
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.INVALID_EPISODE_ORDER));
});

test('24. Ordering: Duplicate episode order fails with DUPLICATE_EPISODE_ORDER', () => {
  const proj = makeBaseValidProject();
  proj.episodes[1].order = 1;
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_EPISODE_ORDER));
});

test('25. Ordering: Non-sequential episode order (gap 1, 3) fails with NON_SEQUENTIAL_EPISODE_ORDER', () => {
  const proj = makeBaseValidProject();
  proj.episodes[1].order = 3;
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.NON_SEQUENTIAL_EPISODE_ORDER));
});

test('26. Ordering: Duplicate scene order within same episode fails with DUPLICATE_SCENE_ORDER', () => {
  const proj = makeBaseValidProject();
  proj.scenes[1].order = 1;
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_SCENE_ORDER));
});

test('27. Ordering: Non-sequential scene order (starts at 2) fails with NON_SEQUENTIAL_SCENE_ORDER', () => {
  const proj = makeBaseValidProject();
  proj.scenes[2].order = 2;
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.NON_SEQUENTIAL_SCENE_ORDER));
});

test('28. Ordering: Duplicate and non-sequential panel orders fail with DUPLICATE_PANEL_ORDER / NON_SEQUENTIAL_PANEL_ORDER', () => {
  const projDup = makeBaseValidProject();
  projDup.panels[1].order = 1;
  const resDup = validateProject(projDup, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(resDup.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_PANEL_ORDER));

  const projGap = makeBaseValidProject();
  projGap.panels[1].order = 5;
  const resGap = validateProject(projGap, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(resGap.errors.some((e) => e.code === ERROR_CODES.NON_SEQUENTIAL_PANEL_ORDER));
});

test('29. Empty Title: Whitespace-only project or episode title fails with EMPTY_PROJECT_TITLE / EMPTY_EPISODE_TITLE', () => {
  const proj = makeBaseValidProject();
  proj.project.title = '   \t\n ';
  proj.episodes[0].title = '';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.EMPTY_PROJECT_TITLE));
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.EMPTY_EPISODE_TITLE));
});

test('30. Empty Title: Empty scene or panel title fails with EMPTY_SCENE_TITLE / EMPTY_PANEL_TITLE', () => {
  const proj = makeBaseValidProject();
  proj.scenes[0].title = '   ';
  proj.panels[0].title = null;
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.EMPTY_SCENE_TITLE));
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.EMPTY_PANEL_TITLE));
});

test('31. Empty Title: Empty asset title fails with EMPTY_ASSET_TITLE', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].title = '';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.EMPTY_ASSET_TITLE));
});

test('32. Path Safety: Parent directory traversal ("../") and backslash traversal ("..\\") fail with PATH_TRAVERSAL_DETECTED', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].relativePath = ['..', 'outside', 'ep1_p1.png'].join('/');
  proj.assets[1].relativePath = ['assets', '..', '..', 'ep1_p2.webp'].join('\\');
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  const traversalErrors = res.errors.filter((e) => e.code === ERROR_CODES.PATH_TRAVERSAL_DETECTED);
  assert.equal(traversalErrors.length, 2);
});

test('33. Path Safety: URL-encoded traversal ("%2e%2e%2f") fails with PATH_TRAVERSAL_DETECTED', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].relativePath = 'assets/%2e%2e/%2e%2e/outside/image.png';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.PATH_TRAVERSAL_DETECTED));
});

test('34. Path Safety: POSIX and Windows absolute paths fail with UNSAFE_ABSOLUTE_PATH', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].relativePath = '/abs/root/image.png';
  proj.assets[1].relativePath = 'C:\\Workspace\\ep1_p2.webp';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  const absErrors = res.errors.filter((e) => e.code === ERROR_CODES.UNSAFE_ABSOLUTE_PATH);
  assert.equal(absErrors.length, 2);
});

test('35. Path Safety: Custom URI scheme and null byte fail with UNSAFE_URI_SCHEME / UNSAFE_NULL_BYTE', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].relativePath = ['custom-scheme', '://bucket/ep1_p1.png'].join('');
  proj.assets[1].relativePath = 'assets/images/ep1_p2.webp%00.png';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.UNSAFE_URI_SCHEME));
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.UNSAFE_NULL_BYTE));
});

test('36. Sensitive File Exclusion: hidden config and secret patterns are rejected with SENSITIVE_FILE_REJECTED', () => {
  const proj = makeBaseValidProject();
  const dotE = String.fromCharCode(46, 101, 110, 118);
  const gitFolder = String.fromCharCode(46, 103, 105, 116);
  const npmFile = String.fromCharCode(46, 110, 112, 109, 114, 99);
  proj.assets[0].relativePath = `${dotE}.local`;
  proj.assets[1].relativePath = `${gitFolder}/config.png`;
  proj.assets[2].relativePath = `assets/${npmFile}`;
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  const sensitiveErrors = res.errors.filter((e) => e.code === ERROR_CODES.SENSITIVE_FILE_REJECTED);
  assert.equal(sensitiveErrors.length, 3);
});

test('37. Non-Regular File: Referencing a directory instead of a regular file fails with NOT_A_REGULAR_FILE', () => {
  const proj = makeBaseValidProject();
  fs.mkdirSync(path.join(VALID_FIXTURE_DIR, 'assets', 'images', 'dir_as_file.png'), { recursive: true });
  proj.assets[0].relativePath = 'assets/images/dir_as_file.png';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.NOT_A_REGULAR_FILE));
});

test('38. Normalization Collision: Case-only difference ("EP1_P1.PNG" vs "ep1_p1.png") fails with NORMALIZATION_COLLISION_CASE', () => {
  const proj = makeBaseValidProject();
  proj.assets[1].type = 'image';
  proj.assets[1].relativePath = 'assets/images/EP1_P1.PNG';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR, verifyFiles: false });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.NORMALIZATION_COLLISION_CASE));
});

test('39. Normalization Collision: Unicode NFC vs NFD identical visual filename fails with NORMALIZATION_COLLISION_UNICODE', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].relativePath = 'assets/images/한글배경.jpg'.normalize('NFC');
  proj.assets[1].relativePath = 'assets/images/한글배경.jpg'.normalize('NFD');
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR, verifyFiles: false });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.NORMALIZATION_COLLISION_UNICODE));
});

test('40. Normalization Collision: Backslash vs forward-slash path ("assets\\images\\ep1_p1.png") fails with NORMALIZATION_COLLISION_PATH', () => {
  const proj = makeBaseValidProject();
  proj.assets[1].type = 'image';
  proj.assets[1].relativePath = 'assets\\images\\ep1_p1.png';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR, verifyFiles: false });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.NORMALIZATION_COLLISION_PATH));
});

test('41. Extension Validation: Unsupported extension (.bin, .dat) fails with UNSUPPORTED_EXTENSION', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].relativePath = 'assets/images/archive.dat';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR, verifyFiles: false });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.UNSUPPORTED_EXTENSION));
});

test('42. Extension Validation: Asset type vs extension mismatch (image with .mp3) fails with ASSET_TYPE_EXTENSION_MISMATCH', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].type = 'image';
  proj.assets[0].relativePath = 'assets/audio/bgm_01.mp3';
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR, verifyFiles: false });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.ASSET_TYPE_EXTENSION_MISMATCH));
});

test('43. Missing Asset & Zero-Byte File: Non-existent file and 0-byte file fail with MISSING_ASSET_FILE / EMPTY_ASSET_FILE', () => {
  const projMissing = makeBaseValidProject();
  projMissing.assets[0].relativePath = 'assets/images/does_not_exist.png';
  const resMissing = validateProject(projMissing, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(resMissing.errors.some((e) => e.code === ERROR_CODES.MISSING_ASSET_FILE));

  const projEmpty = makeBaseValidProject();
  projEmpty.assets[0].relativePath = 'assets/images/zero_byte.png';
  const resEmpty = validateProject(projEmpty, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(resEmpty.errors.some((e) => e.code === ERROR_CODES.EMPTY_ASSET_FILE));
});

test('44. SHA-256 Tamper Detection: Mismatched expectedSha256 and tampered manifest fail verification', () => {
  const proj = makeBaseValidProject();
  proj.assets[0].expectedSha256 = '0'.repeat(64);
  const res = validateProject(proj, { fixtureDir: VALID_FIXTURE_DIR });
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.ASSET_SHA256_MISMATCH));

  const validRes = generateExportManifest(makeBaseValidProject(), { fixtureDir: VALID_FIXTURE_DIR });
  const tamperedManifest = JSON.parse(JSON.stringify(validRes.manifest));
  tamperedManifest.assets[0].sha256 = 'f'.repeat(64);
  const verifyRes = verifyExportManifest(tamperedManifest, VALID_FIXTURE_DIR);
  assert.equal(verifyRes.verified, false);
  assert.ok(verifyRes.errors.some((e) => e.code === ERROR_CODES.MANIFEST_ASSET_TAMPERED));
  assert.ok(verifyRes.errors.some((e) => e.code === ERROR_CODES.MANIFEST_HASH_MISMATCH));
});

test('45. CLI Exit Codes & Reports: returns 0 on valid, 1 on invalid project, 2 on usage/bad JSON', () => {
  const validCli = runCli([
    '--project',
    path.join(VALID_FIXTURE_DIR, 'project.json'),
    '--fixture-dir',
    VALID_FIXTURE_DIR,
    '--format',
    'both',
  ]);
  assert.equal(validCli.exitCode, EXIT_CODES.SUCCESS);
  assert.match(validCli.stdout, /Status\s+:\s+PASS \(VALID\)/);
  assert.match(validCli.stdout, /"status": "valid"/);

  const invalidCli = runCli([
    '--project',
    path.join(INVALID_FIXTURE_DIR, 'project-invalid.json'),
    '--fixture-dir',
    VALID_FIXTURE_DIR,
    '--format',
    'json',
  ]);
  assert.equal(invalidCli.exitCode, EXIT_CODES.VALIDATION_FAILED);
  const invalidParsed = JSON.parse(invalidCli.stdout);
  assert.equal(invalidParsed.status, 'invalid');
  assert.ok(invalidParsed.errorCount >= 4);

  const usageCli = runCli(['--unknown-flag']);
  assert.equal(usageCli.exitCode, EXIT_CODES.USAGE_OR_IO_ERROR);
});
