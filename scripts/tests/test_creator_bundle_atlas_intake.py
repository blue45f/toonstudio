"""파일·GLB 합성 회귀이며 렌더링 품질이나 운영 배포를 증명하지 않는다."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import struct
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
        self.assertEqual(set(proof), {'schema', 'controls', 'assets', 'copyPolicy', 'productApplied', 'studioRuntimeVerified'})
        self.assertNotIn(str(self.root), json.dumps(proof, ensure_ascii=False))
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

    def verified_input(self):
        plan = self.plan()
        intake.write_plan(plan)
        return plan, self.output / 'input'

    def rewrite_candidate(self, root, *, change_document=None, change_binary=None):
        manifest = intake.read_json(root / 'manifest-v2.json')
        asset = manifest['assets'][0]
        payload = root / asset['files'][0]['path']
        doc, binary = intake.glb.read_glb(payload.read_bytes())
        if change_document is not None:
            change_document(doc)
        if change_binary is not None:
            binary = change_binary(binary)
        body = intake.glb.write_glb(doc, binary)
        payload.write_bytes(body)
        state = intake.file_state(payload)
        asset['files'][0].update(state)
        suffix = intake.digest((asset['sourcePath'] + '\0' + state['sha256']).encode())[:20]
        asset['id'] = asset['packId'] + '-' + suffix
        (root / 'manifest-v2.json').write_text(json.dumps(manifest), encoding='utf-8')

    def test_derived_verification_rebuilds_descriptors_and_leaves_inputs_unchanged(self):
        plan, root = self.verified_input()
        before = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result = intake.verify_derived(plan, root)
        manifest = intake.read_json(root / 'manifest-v2.json')
        self.assertEqual(result['assets'], manifest['assets'])
        self.assertEqual(result['mode'], 'verify-derived')
        self.assertFalse(result['persistentOutputWritten'])
        self.assertEqual(result['summary'], {'derivedAssets': 1,
                         'derivedBytes': manifest['assets'][0]['files'][0]['bytes'],
                         'inputUnchanged': True, 'targetUnchanged': True})
        self.assertEqual(result['targetManifest'], intake.file_state(root / 'manifest-v2.json'))
        self.assertEqual(result['controls'], plan['controls'])
        self.assertEqual(result['inputFiles'], [
            {'path': str(path), **plan['states'][path]['state']} for path in sorted(plan['states'], key=str)])
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_derived_verification_removes_each_temporary_model_before_next(self):
        self.save_glb(self.pack / 'Models/Plants/second.glb')
        plan, root = self.verified_input()
        normalizer = intake.glb.normalize
        destinations = []
        def normalize(source, destination, **kwargs):
            self.assertFalse(destination.exists())
            self.assertEqual(list(destination.parent.iterdir()), [])
            destinations.append(destination)
            return normalizer(source, destination, **kwargs)
        with patch.object(intake.glb, 'normalize', side_effect=normalize):
            result = intake.verify_derived(plan, root)
        self.assertEqual(result['summary']['derivedAssets'], 2)
        self.assertTrue(all(not path.exists() and not path.parent.exists() for path in destinations))

    def test_derived_verification_checks_raw_bin_even_with_matching_candidate_hash(self):
        plan, root = self.verified_input()
        self.rewrite_candidate(root, change_binary=lambda binary: b'4321' + binary[4:])
        with self.assertRaisesRegex(ValueError, '재생성한 결과'):
            intake.verify_derived(plan, root)

    def test_derived_verification_checks_full_json_even_with_matching_candidate_hash(self):
        plan, root = self.verified_input()
        self.rewrite_candidate(root, change_document=lambda doc: doc.update(extras={'changed': True}))
        with self.assertRaisesRegex(ValueError, '재생성한 결과'):
            intake.verify_derived(plan, root)

    def test_derived_verification_checks_texture_bytes_even_with_matching_candidate_hash(self):
        plan, root = self.verified_input()
        self.rewrite_candidate(root, change_binary=lambda binary: binary[:-1] + bytes([binary[-1] ^ 1]))
        with self.assertRaisesRegex(ValueError, '재생성한 결과'):
            intake.verify_derived(plan, root)

    def test_derived_verification_rejects_missing_duplicate_and_extra_recipe_sources(self):
        plan, root = self.verified_input()
        original = intake.read_json(root / 'manifest-v2.json')
        for kind in ['missing', 'duplicate', 'extra']:
            manifest = copy.deepcopy(original)
            if kind == 'missing':
                manifest['assets'].clear()
            else:
                asset = copy.deepcopy(manifest['assets'][0])
                if kind == 'extra':
                    asset['sourcePath'] = 'Plants/not-in-recipe.glb'
                    asset['id'] += '-extra'
                    old_path = asset['files'][0]['path']
                    asset['files'][0]['path'] = asset['packId'] + '/native/' + asset['sourcePath']
                    new_file = root / asset['files'][0]['path']
                    new_file.write_bytes((root / old_path).read_bytes())
                manifest['assets'].append(asset)
            manifest['totals']['assets'] = len(manifest['assets'])
            (root / 'manifest-v2.json').write_text(json.dumps(manifest), encoding='utf-8')
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                intake.verify_derived(plan, root)

    def test_derived_verification_rejects_target_manifest_and_payload_symlinks(self):
        plan, root = self.verified_input()
        manifest = intake.read_json(root / 'manifest-v2.json')
        targets = [root / 'manifest-v2.json', root / manifest['assets'][0]['files'][0]['path']]
        for index, target in enumerate(targets):
            outside = self.root / ('outside-' + str(index))
            target.rename(outside)
            target.symlink_to(outside)
            with self.subTest(target=target), self.assertRaisesRegex(ValueError, '심볼릭'):
                intake.verify_derived(plan, root)
            target.unlink(); outside.rename(target)

    def test_derived_verification_rejects_final_source_texture_control_and_target_drift(self):
        plan, root = self.verified_input()
        normalizer = intake.glb.normalize
        for changed in [self.source, self.image, self.recipe_path, self.rights_path,
                        self.projection_path, root / 'manifest-v2.json']:
            original = changed.read_bytes()
            def normalize(source, destination, **kwargs):
                result = normalizer(source, destination, **kwargs)
                changed.write_bytes(original + b' ')
                return result
            with self.subTest(changed=changed), patch.object(intake.glb, 'normalize', side_effect=normalize):
                with self.assertRaises(ValueError): intake.verify_derived(plan, root)
            changed.write_bytes(original)

    def test_derived_verification_rejects_final_source_list_drift(self):
        plan, root = self.verified_input()
        normalizer = intake.glb.normalize
        def normalize(source, destination, **kwargs):
            result = normalizer(source, destination, **kwargs)
            self.save_glb(self.pack / 'Models/Plants/late.glb')
            return result
        with patch.object(intake.glb, 'normalize', side_effect=normalize):
            with self.assertRaisesRegex(ValueError, 'GLB 목록'): intake.verify_derived(plan, root)

    def test_derived_verification_rechecks_payload_already_compared_before_later_model(self):
        self.save_glb(self.pack / 'Models/Plants/second.glb')
        plan, root = self.verified_input()
        first = root / intake.read_json(root / 'manifest-v2.json')['assets'][0]['files'][0]['path']
        original = first.read_bytes()
        normalizer = intake.glb.normalize
        calls = 0
        def normalize(source, destination, **kwargs):
            nonlocal calls
            result = normalizer(source, destination, **kwargs)
            calls += 1
            if calls == 2:
                first.write_bytes(original + b'changed-after-comparison')
            return result
        with patch.object(intake.glb, 'normalize', side_effect=normalize):
            with self.assertRaisesRegex(ValueError, '변경됐습니다'): intake.verify_derived(plan, root)

    def test_derived_verification_cleanup_on_normalization_failure(self):
        plan, root = self.verified_input()
        destinations = []
        def normalize(source, destination, **kwargs):
            destination.write_bytes(b'partial')
            destinations.append(destination)
            raise ValueError('합성 내부화 실패')
        with patch.object(intake.glb, 'normalize', side_effect=normalize):
            with self.assertRaisesRegex(ValueError, '합성 내부화 실패'): intake.verify_derived(plan, root)
        self.assertTrue(all(not path.exists() and not path.parent.exists() for path in destinations))
        self.assertTrue((root / 'manifest-v2.json').is_file())

    def test_verify_derived_cli_requires_check_and_preserves_normal_check_summary(self):
        plan, root = self.verified_input()
        args = ['--recipe', str(self.recipe_path), '--library-root', str(self.library),
                '--pack-rights', str(self.rights_path), '--projection', str(self.projection_path)]
        for suffix in [['--check'], ['--check', '--verify-derived-root', str(root)]]:
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout): self.assertEqual(intake.main(args + suffix), 0)
            result = json.loads(stdout.getvalue())
            if '--verify-derived-root' not in suffix:
                self.assertEqual(result, {'existingAssets': 0, 'addedAssets': 1,
                                         'mode': 'check', 'persistentOutputWritten': False})
            else:
                self.assertEqual(result['assets'], intake.read_json(root / 'manifest-v2.json')['assets'])
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(intake.main(args + ['--write', '--verify-derived-root', str(root)]), 2)
        self.assertIn('--check', stderr.getvalue())
        self.assertTrue((root / 'manifest-v2.json').is_file())

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


class GltfAtlasIntakeTests(unittest.TestCase):
    """작은 합성 원문으로 명시적 glTF 입력의 보존·거부 경계를 확인한다."""
    save_glb = AtlasIntakeTests.save_glb
    flush = AtlasIntakeTests.flush
    plan = AtlasIntakeTests.plan
    verified_input = AtlasIntakeTests.verified_input
    rewrite_candidate = AtlasIntakeTests.rewrite_candidate

    def setUp(self):
        AtlasIntakeTests.setUp(self)
        self.source.unlink()
        self.source = self.source.with_suffix('.gltf')
        self.binary = self.source.with_suffix('.bin')
        self.raw_binary = struct.pack('<8fH', 1, 2, 3, 0, 1, 0, .25, .5, 0) + b'\0\0' + struct.pack('<f', 0) + b'X'
        self.binary.write_bytes(self.raw_binary)
        self.document = {
            'asset': {'version': '2.0', 'generator': '합성 glTF 원문'},
            'buffers': [{'uri': 'leaf.bin', 'byteLength': len(self.raw_binary), 'name': '원문 BIN'}],
            'bufferViews': [{'buffer': 0, 'byteOffset': offset, 'byteLength': length}
                            for offset, length in [(0, 12), (12, 12), (24, 8), (32, 2), (36, 4)]],
            'accessors': [{'bufferView': i, 'componentType': 5123 if i == 3 else 5126,
                           'count': 1, 'type': kind} for i, kind in enumerate(['VEC3', 'VEC3', 'VEC2', 'SCALAR', 'SCALAR'])],
            'images': [{'uri': self.uri, 'name': '원문 atlas', 'extras': {'keep': True}}],
            'samplers': [{'magFilter': 9729, 'wrapS': 10497, 'wrapT': 10497}],
            'textures': [{'source': 0, 'sampler': 0}],
            'materials': [{'name': '원문 재질', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}],
            'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2},
                                       'indices': 3, 'material': 0, 'mode': 0}]}],
            'nodes': [{'mesh': 0, 'skin': 0, 'translation': [1, 2, 3]}, {'name': '관절'}],
            'skins': [{'joints': [1]}], 'scenes': [{'nodes': [0, 1]}], 'scene': 0,
            'animations': [{'samplers': [{'input': 4, 'output': 0}],
                            'channels': [{'sampler': 0, 'target': {'node': 1, 'path': 'translation'}}]}],
            'extras': {'keep': '원문 부가 정보'}}
        self.save_gltf()
        self.recipe['packs'][0]['sourceFormat'] = 'gltf'
        self.flush()

    def save_gltf(self, document=None):
        self.source.write_text(json.dumps(self.document if document is None else document, ensure_ascii=False), encoding='utf-8')

    def test_gltf_preserves_original_geometry_json_image_and_separate_provenance(self):
        before = {p: p.read_bytes() for p in [self.source, self.binary, self.image]}
        plan, root = self.verified_input()
        manifest = intake.read_json(root / 'manifest-v2.json')
        asset = manifest['assets'][0]
        self.assertEqual(asset['sourcePath'], 'Plants/leaf.glb')
        document, binary = intake.glb.read_glb((root / asset['files'][0]['path']).read_bytes())
        view = document['bufferViews'][document['images'][0]['bufferView']]
        expected = copy.deepcopy(self.document)
        del expected['buffers'][0]['uri']
        expected['buffers'][0]['byteLength'] = len(binary)
        expected['images'][0].pop('uri')
        expected['images'][0].update(mimeType='image/png', bufferView=len(expected['bufferViews']))
        expected['bufferViews'].append(view)
        self.assertEqual(document, expected)
        self.assertEqual(binary[:len(self.raw_binary)], self.raw_binary)
        self.assertEqual(view['byteOffset'] % 4, 0)
        self.assertEqual(binary[view['byteOffset']:view['byteOffset'] + view['byteLength']], self.image.read_bytes())
        proof = intake.read_json(root / 'preparation-proof.json')['assets'][0]
        self.assertEqual(proof['sourcePath'], 'Plants/leaf.glb')
        self.assertEqual(proof['originalSourcePath'], 'Plants/leaf.gltf')
        self.assertEqual(proof['sourceFormat'], 'gltf')
        self.assertEqual(proof['source'], intake.file_state(self.source))
        self.assertEqual(proof['sourceBuffer'], {'path': 'Models/Plants/leaf.bin', **intake.file_state(self.binary)})
        result = intake.verify_derived(plan, root)
        self.assertTrue({self.source, self.binary, self.image} <= {Path(entry['path']) for entry in result['inputFiles']})
        self.assertEqual(result['sourceInputs'], [{'packId': 'cbv1-ingest-nature', 'sourcePath': 'Plants/leaf.glb',
                         'originalSourcePath': 'Plants/leaf.gltf', 'sourceFormat': 'gltf'}])
        self.assertEqual(before, {p: p.read_bytes() for p in before})

    def test_invalid_source_format_is_not_silently_treated_as_glb(self):
        for value in ['glb', 'GLTF', None, 1]:
            self.recipe['packs'][0]['sourceFormat'] = value
            with self.subTest(value=value), self.assertRaises(ValueError): self.plan()

    def test_same_source_directory_cannot_hide_another_format_snapshot(self):
        other = copy.deepcopy(self.recipe['packs'][0])
        other.pop('sourceFormat'); other['ingestId'] = 'cbv1-ingest-other'
        self.recipe['packs'].append(other)
        self.projection['packs'][0]['ingestPackIds'].append(other['ingestId'])
        self.save_glb(self.source.with_suffix('.glb'))
        with self.assertRaisesRegex(ValueError, 'sourceDirectory.*중복'): self.plan()

    def test_single_local_bin_and_exact_length_are_required(self):
        cases = [[], [self.document['buffers'][0]] * 2, [{'byteLength': 41}],
                 [{'uri': 'leaf.bin', 'byteLength': True}], [{'uri': 'leaf.bin', 'byteLength': 40}]]
        for buffers in cases:
            document = copy.deepcopy(self.document); document['buffers'] = buffers; self.save_gltf(document)
            with self.subTest(buffers=buffers), self.assertRaises(ValueError): self.plan()

    def test_bin_bytes_read_after_stat_must_match_declared_length(self):
        read = Path.read_bytes
        def changed(path):
            body = read(path)
            return body + b'X' if path == self.binary else body
        with patch.object(Path, 'read_bytes', changed):
            with self.assertRaisesRegex(ValueError, '읽은 BIN 길이'): self.plan()

    def test_bin_uri_escape_network_query_and_hidden_external_resources_are_rejected(self):
        for uri in ['../leaf.bin', '%2e%2e/leaf.bin', 'https://example.test/leaf.bin',
                    'data:application/octet-stream,AAAA', 'leaf.bin?x=1', 'leaf.bin#x', '%2fleaf.bin']:
            document = copy.deepcopy(self.document); document['buffers'][0]['uri'] = uri; self.save_gltf(document)
            with self.subTest(uri=uri), self.assertRaises(ValueError): self.plan()
        document = copy.deepcopy(self.document); document['extras']['uri'] = 'hidden.bin'; self.save_gltf(document)
        with self.assertRaisesRegex(ValueError, '승인하지 않은'): self.plan()

    def test_gltf_bin_and_texture_symlinks_are_rejected(self):
        for index, path in enumerate([self.source, self.binary, self.image]):
            moved = self.root / ('moved-' + str(index)); path.rename(moved); path.symlink_to(moved)
            with self.subTest(path=path), self.assertRaises(ValueError): self.plan()
            path.unlink(); moved.rename(path)

    def test_unapproved_image_and_duplicate_gltf_keys_are_rejected(self):
        self.recipe['packs'][0]['imagePaths'] = {'unused.png': 'Textures/atlas.png'}
        with self.assertRaisesRegex(ValueError, '매핑'): self.plan()
        self.recipe['packs'][0]['imagePaths'] = {self.uri: 'Textures/atlas.png'}
        self.source.write_text('{"asset":{},"asset":{}}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '중복된 키'): self.plan()

    def test_gltf_mode_does_not_replace_an_embedded_glb_image(self):
        self.recipe['packs'][0].pop('sourceFormat')
        path = self.source.with_suffix('.glb')
        document = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': 4}],
                    'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 4}],
                    'images': [{'bufferView': 0, 'mimeType': 'image/png'}]}
        path.write_bytes(intake.glb.write_glb(document, b'1234'))
        with self.assertRaisesRegex(ValueError, '사용하지 않는'): self.plan()

    def test_all_gltf_inputs_are_frozen_before_write(self):
        for path in [self.source, self.binary, self.image]:
            plan = self.plan(); original = path.read_bytes()
            path.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
            with self.subTest(path=path), self.assertRaises(ValueError): intake.write_plan(plan)
            self.assertFalse(self.output.exists()); path.write_bytes(original)

    def test_new_gltf_source_is_rejected_after_plan(self):
        plan = self.plan()
        self.source.with_name('late.gltf').write_bytes(self.source.read_bytes())
        with self.assertRaisesRegex(ValueError, 'GLTF 목록'): intake.write_plan(plan)
        self.assertFalse(self.output.exists())

    def test_rebuilt_gltf_rejects_candidate_geometry_json_and_texture_changes(self):
        for kind in ['geometry', 'json', 'image']:
            self.output = self.root / ('output-' + kind)
            plan, root = self.verified_input()
            changes = {'change_document': lambda document: document.update(extras={'changed': True})} if kind == 'json' else {
                'change_binary': (lambda binary: bytes([binary[0] ^ 1]) + binary[1:]) if kind == 'geometry' else
                                 (lambda binary: binary[:-1] + bytes([binary[-1] ^ 1]))}
            self.rewrite_candidate(root, **changes)
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, '재생성한 결과'):
                intake.verify_derived(plan, root)

    def test_gltf_final_binary_and_source_list_drift_are_rejected(self):
        plan, root = self.verified_input()
        normalize = intake.glb.normalize_bytes
        original = self.binary.read_bytes()
        for kind in ['binary', 'source-list']:
            def changed(*args, **kwargs):
                result = normalize(*args, **kwargs)
                if kind == 'binary': self.binary.write_bytes(original[:-1] + b'Y')
                else: self.source.with_name('late.gltf').write_bytes(self.source.read_bytes())
                return result
            with self.subTest(kind=kind), patch.object(intake.glb, 'normalize_bytes', side_effect=changed):
                with self.assertRaises(ValueError): intake.verify_derived(plan, root)
            self.binary.write_bytes(original)
            self.source.with_name('late.gltf').unlink(missing_ok=True)

    def test_gltf_normalization_failure_preserves_inputs_and_owned_cleanup(self):
        plan, root = self.verified_input()
        before = {p: p.read_bytes() for p in [self.source, self.binary, self.image, root / 'manifest-v2.json']}
        with patch.object(intake.glb, 'normalize_bytes', side_effect=ValueError('합성 glTF 실패')):
            with self.assertRaisesRegex(ValueError, '합성 glTF 실패'): intake.verify_derived(plan, root)
        self.assertEqual(before, {p: p.read_bytes() for p in before})


if __name__ == '__main__':
    unittest.main()
