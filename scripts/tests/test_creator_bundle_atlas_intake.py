"""파일·GLB 합성 회귀이며 렌더링 품질이나 운영 배포를 증명하지 않는다."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
SPEC = importlib.util.spec_from_file_location('atlas_intake', Path(__file__).resolve().parents[1] / 'prepare-creator-bundle-atlas-intake.py')
intake = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(intake)


class AtlasIntakeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.library = self.root / 'library'
        self.pack = self.library / '03-nature/nature-owner/engine/godot'
        (self.pack / 'Models/Plants').mkdir(parents=True)
        (self.pack / 'Textures').mkdir()
        self.image = self.pack / 'Textures/atlas.png'
        self.image.write_bytes(b'\x89PNG\r\n\x1a\nsynthetic-atlas-bytes')
        self.uri = '../../Textures/atlas.png'
        self.source = self.pack / 'Models/Plants/leaf.glb'
        self.save_glb(self.source)
        self.recipe = {'schema': intake.SCHEMA, 'version': 1, 'generatedAt': '2026-10-30T00:00:00Z', 'packs': [{
            'catalogId': 'cbv1-nature', 'ingestId': 'cbv1-ingest-nature',
            'packRoot': '03-nature/nature-owner/engine/godot', 'sourceDirectory': 'Models',
            'imagePaths': {self.uri: 'Textures/atlas.png'}}]}
        self.ledger = {'schema': 'toonstudio.creator-bundle-pack-rights.v1', 'version': 1, 'packs': [{
            'id': 'cbv1-nature', 'catalogIds': ['cbv1-nature'], 'group': 'pack', 'serve': 'allow',
            'libraryPacks': ['nature-owner'], 'title': '자연 팩', 'creator': '제작자',
            'grant': {'status': 'licensed', 'licenseName': '구매 에셋', 'commercialUse': True, 'attributionRequired': False}}]}
        self.projection = {'schema': 'toonstudio.bg3d-bundle-theme-packs.v1', 'packs': [{
            'catalogIds': ['cbv1-nature'], 'ingestPackIds': ['cbv1-ingest-nature'], 'title': '자연 팩', 'creator': '제작자',
            'rights': {'serve': 'allow', **self.ledger['packs'][0]['grant']}}]}
        self.recipe_path = self.root / 'recipe.json'
        self.rights_path = self.root / 'rights.json'
        self.projection_path = self.root / 'projection.json'
        self.output = self.root / 'output'
        self.flush()

    def save_glb(self, path, uri=None, *, external_buffer=False):
        doc = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': 4}],
               'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 4}],
               'images': [{'uri': self.uri if uri is None else uri}],
               'meshes': [{'primitives': []}], 'nodes': [{'mesh': 0}], 'scenes': [{'nodes': [0]}]}
        if external_buffer:
            doc['buffers'][0]['uri'] = 'outside.bin'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(intake.glb.write_glb(doc, b'1234'))

    def flush(self):
        for path, data in [(self.recipe_path, self.recipe), (self.rights_path, self.ledger), (self.projection_path, self.projection)]:
            path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')

    def plan(self, **overrides):
        self.flush()
        args = dict(recipe_path=self.recipe_path, library_root=self.library, output_root=self.output,
                    pack_rights=self.rights_path, projection_path=self.projection_path)
        args.update(overrides)
        return intake.build_plan(**args)

    def test_check_never_creates_persistent_output(self):
        before = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        plan = self.plan()
        self.assertEqual(plan['summary'], {'existingAssets': 0, 'addedAssets': 1})
        self.assertFalse(self.output.exists())
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_write_embeds_exact_texture_and_preserves_original_json_and_bin(self):
        original = self.source.read_bytes()
        plan = self.plan()
        result = intake.write_plan(plan)
        root = Path(result['inputRoot'])
        manifest = intake.read_json(root / 'manifest-v2.json')
        primary = manifest['assets'][0]['files'][0]
        derived = root / primary['path']
        source_doc, source_bin = intake.glb.read_glb(original)
        doc, binary = intake.glb.read_glb(derived.read_bytes())
        self.assertEqual(binary[:len(source_bin)], source_bin)
        for key in ['meshes', 'nodes', 'scenes']:
            self.assertEqual(doc[key], source_doc[key])
        view = doc['bufferViews'][doc['images'][0]['bufferView']]
        self.assertEqual(binary[view['byteOffset']:view['byteOffset'] + view['byteLength']], self.image.read_bytes())
        self.assertEqual(self.source.read_bytes(), original)
        self.assertNotEqual(derived.stat().st_ino, self.source.stat().st_ino)
        self.assertEqual(primary['sha256'], intake.glb.sha256_file(derived))
        self.assertTrue(manifest['inServiceOnly']); self.assertFalse(manifest['downloadable'])
        proof = intake.read_json(root / 'preparation-proof.json')
        self.assertEqual(set(proof['controls']), {'recipe', 'rights', 'projection'})
        self.assertEqual(proof['assets'][0]['source']['sha256'], intake.digest(original))
        self.assertFalse(proof['studioRuntimeVerified']); self.assertFalse(proof['productApplied'])

    def test_models_are_deterministic_and_each_uses_only_its_declared_uri_subset(self):
        other_image = self.pack / 'Textures/other.png'
        other_image.write_bytes(b'\x89PNG\r\n\x1a\nother-atlas')
        self.save_glb(self.pack / 'Models/Plants/a.glb', '../../Textures/other.png')
        self.recipe['packs'][0]['imagePaths']['../../Textures/other.png'] = 'Textures/other.png'
        plan = self.plan()
        self.assertEqual([p['sourcePath'] for p in plan['additions']], ['Plants/a.glb', 'Plants/leaf.glb'])
        self.assertEqual([len(p['binding'].image_paths) for p in plan['additions']], [1, 1])
        intake.write_plan(plan)
        self.assertEqual(intake.read_json(self.output / 'input/manifest-v2.json')['totals']['assets'], 2)

    def test_existing_descriptors_and_bytes_are_copied_without_hardlinks(self):
        self.recipe['packs'][0]['sourceDirectory'] = 'Models/Plants'
        intake.write_plan(self.plan())
        base = self.output / 'input'
        before = intake.read_json(base / 'manifest-v2.json')
        self.save_glb(self.pack / 'Models/Other/new.glb')
        self.recipe['packs'][0]['sourceDirectory'] = 'Models/Other'
        other = self.root / 'appended'
        intake.write_plan(self.plan(existing_root=base, output_root=other))
        current = intake.read_json(other / 'input/manifest-v2.json')
        self.assertEqual(current['assets'][:1], before['assets'])
        path = before['assets'][0]['files'][0]['path']
        self.assertEqual((base / path).read_bytes(), (other / 'input' / path).read_bytes())
        self.assertNotEqual((base / path).stat().st_ino, (other / 'input' / path).stat().st_ino)
        self.assertEqual(intake.read_json(base / 'manifest-v2.json'), before)

    def test_existing_same_pack_source_is_rejected(self):
        intake.write_plan(self.plan())
        with self.assertRaisesRegex(ValueError, '동일 팩'):
            self.plan(existing_root=self.output / 'input', output_root=self.root / 'other')

    def test_existing_corrupt_payload_is_rejected(self):
        intake.write_plan(self.plan())
        base = self.output / 'input'
        manifest = intake.read_json(base / 'manifest-v2.json')
        (base / manifest['assets'][0]['files'][0]['path']).write_bytes(b'bad')
        with self.assertRaisesRegex(ValueError, 'SHA256'):
            self.plan(existing_root=base, output_root=self.root / 'other')

    def test_existing_duplicate_ids_and_paths_are_rejected(self):
        intake.write_plan(self.plan())
        base = self.output / 'input'
        manifest = intake.read_json(base / 'manifest-v2.json')
        manifest['assets'].append(copy.deepcopy(manifest['assets'][0]))
        manifest['totals']['assets'] = 2
        (base / 'manifest-v2.json').write_text(json.dumps(manifest), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '중복'):
            self.plan(existing_root=base, output_root=self.root / 'other')

    def test_hold_wrong_group_identity_and_library_ownership_are_rejected(self):
        for field, value in [('serve', 'hold'), ('group', 'pending'), ('title', '다른 팩'), ('libraryPacks', ['other'])]:
            original = self.ledger['packs'][0][field]
            with self.subTest(field=field):
                self.ledger['packs'][0][field] = value
                with self.assertRaises(ValueError): self.plan()
            self.ledger['packs'][0][field] = original

    def test_projection_mismatch_and_duplicate_owner_are_rejected(self):
        self.projection['packs'][0]['ingestPackIds'] = ['different']
        with self.assertRaises(ValueError): self.plan()
        self.projection['packs'][0]['ingestPackIds'] = ['cbv1-ingest-nature']
        self.ledger['packs'].append(copy.deepcopy(self.ledger['packs'][0]))
        with self.assertRaises(ValueError): self.plan()

    def test_rights_projection_drift_and_invalid_texture_are_rejected(self):
        self.ledger['packs'][0]['grant']['commercialUse'] = False
        with self.assertRaisesRegex(ValueError, '권리 블록'): self.plan()
        self.ledger['packs'][0]['grant']['commercialUse'] = True
        self.image.write_bytes(b'not-an-image')
        with self.assertRaisesRegex(ValueError, '파일 서명'): self.plan()

    def test_noncommercial_grant_is_rejected_even_if_projection_matches(self):
        self.ledger['packs'][0]['grant']['commercialUse'] = False
        self.projection['packs'][0]['rights']['commercialUse'] = False
        with self.assertRaisesRegex(ValueError, '권리 블록'): self.plan()

    def test_check_output_is_optional_but_write_requires_new_private_output(self):
        plan = self.plan(output_root=None)
        self.assertEqual(plan['summary']['addedAssets'], 1)
        with self.assertRaisesRegex(ValueError, '--output-root'): intake.write_plan(plan)
        self.assertFalse(self.output.exists())

    def test_missing_unused_and_wrong_atlas_mappings_are_rejected(self):
        self.recipe['packs'][0]['imagePaths'] = {'unknown.png': 'Textures/atlas.png'}
        with self.assertRaisesRegex(ValueError, '매핑'): self.plan()
        self.recipe['packs'][0]['imagePaths'] = {self.uri: 'Textures/atlas.png', 'unused.png': 'Textures/atlas.png'}
        with self.assertRaisesRegex(ValueError, '사용하지 않는'): self.plan()
        (self.pack / 'Textures/other.png').write_bytes(self.image.read_bytes())
        self.recipe['packs'][0]['imagePaths'] = {self.uri: 'Textures/other.png'}
        with self.assertRaises(ValueError): self.plan()

    def test_external_buffer_hidden_traversal_and_network_uri_are_rejected(self):
        self.save_glb(self.source, external_buffer=True)
        with self.assertRaises(ValueError): self.plan()
        for uri in ['%2e%2e/Textures/atlas.png', 'https://example.test/a.png', '../../../outside.png']:
            with self.subTest(uri=uri):
                self.save_glb(self.source, uri)
                self.recipe['packs'][0]['imagePaths'] = {uri: 'Textures/atlas.png'}
                with self.assertRaises(ValueError): self.plan()

    def test_source_and_texture_symlinks_are_rejected(self):
        original = self.source.read_bytes()
        self.source.unlink(); self.source.symlink_to(self.image)
        with self.assertRaises(ValueError): self.plan()
        self.source.unlink(); self.source.write_bytes(original)
        actual = self.root / 'actual.png'; actual.write_bytes(self.image.read_bytes())
        self.image.unlink(); self.image.symlink_to(actual)
        with self.assertRaises(ValueError): self.plan()

    def test_source_directory_escape_and_wrong_case_are_rejected(self):
        for name in ['../Models', 'models', 'Models//Plants']:
            with self.subTest(name=name):
                self.recipe['packs'][0]['sourceDirectory'] = name
                with self.assertRaises(ValueError): self.plan()

    def test_protected_and_existing_output_are_never_overwritten(self):
        targets = [self.library / 'new', self.root / 'public/new', intake.REPO / 'new-atlas-test']
        (self.root / 'public').mkdir()
        self.output.mkdir(); (self.output / 'keep').write_text('보존', encoding='utf-8')
        targets.append(self.output)
        for output in targets:
            with self.subTest(output=output), self.assertRaises(ValueError): self.plan(output_root=output)
        self.assertEqual((self.output / 'keep').read_text(encoding='utf-8'), '보존')

    def test_stale_source_texture_and_controls_abort_before_publication(self):
        for changed in [self.source, self.image, self.rights_path, self.projection_path, self.recipe_path]:
            with self.subTest(changed=changed):
                plan = self.plan()
                old = changed.read_bytes(); changed.write_bytes(old + b' ')
                with self.assertRaises(ValueError): intake.write_plan(plan)
                self.assertFalse(self.output.exists())
                changed.write_bytes(old)

    def test_normalization_failure_removes_only_owned_staging(self):
        plan = self.plan()
        with patch.object(intake.glb, 'normalize', side_effect=ValueError('합성 실패')):
            with self.assertRaises(ValueError): intake.write_plan(plan)
        self.assertFalse(self.output.exists())
        self.assertTrue(self.source.is_file()); self.assertTrue(self.image.is_file())

    def test_new_source_after_plan_is_not_silently_omitted(self):
        plan = self.plan()
        self.save_glb(self.pack / 'Models/Plants/added.glb')
        with self.assertRaisesRegex(ValueError, 'GLB 목록'): intake.write_plan(plan)
        self.assertFalse(self.output.exists())

    def test_late_staging_corruption_is_rejected_before_publication(self):
        self.save_glb(self.pack / 'Models/Plants/second.glb')
        plan = self.plan()
        original = intake.glb.normalize
        destinations = []
        def normalize(source, destination, **kwargs):
            result = original(source, destination, **kwargs)
            destinations.append(destination)
            if len(destinations) == 2:
                destinations[0].write_bytes(b'corrupt')
            return result
        with patch.object(intake.glb, 'normalize', side_effect=normalize):
            with self.assertRaisesRegex(ValueError, '최종 GLB'): intake.write_plan(plan)
        self.assertFalse(self.output.exists())

    def test_json_duplicate_keys_and_cli_errors_are_explicit(self):
        self.recipe_path.write_text('{"schema":"first","schema":"second"}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '중복된 키'): intake.read_json(self.recipe_path)
        self.flush()
        args = ['--recipe', str(self.recipe_path), '--library-root', str(self.library), '--output-root', str(self.output),
                '--pack-rights', str(self.rights_path), '--projection', str(self.projection_path), '--check']
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout): self.assertEqual(intake.main(args), 0)
        self.assertFalse(json.loads(stdout.getvalue())['persistentOutputWritten'])
        self.ledger['packs'][0]['serve'] = 'hold'; self.flush()
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr): self.assertEqual(intake.main(args), 2)
        self.assertIn('--check', stderr.getvalue()); self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
