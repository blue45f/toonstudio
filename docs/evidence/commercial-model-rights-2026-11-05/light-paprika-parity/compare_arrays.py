import json,pathlib,hashlib,numpy as np
old=pathlib.Path('/tmp/toonstudio-light-paprika-evaluation');root=pathlib.Path('/tmp/toonstudio-light-paprika-parity-followup');out=pathlib.Path('/workspace/toonstudio/docs/evidence/commercial-model-rights-2026-11-05/light-paprika-parity');report=[]
for name in ['usgs-mountain-lake-original.jpg','synthetic-city.png']:
 browser=np.fromfile(root/(name+'.browser130-output.f32'),dtype=np.float32);cpu=np.fromfile(root/(name+'.cpu130-output.f32'),dtype=np.float32);tf=np.load(old/(name+'.tf-output.npy')).reshape(-1)
 diff=np.abs(browser.astype(np.float64)-cpu.astype(np.float64))
 report.append({'image':name,'elements':int(browser.size),'browser_nonfinite':int((~np.isfinite(browser)).sum()),'browser_sha256':hashlib.sha256(browser.tobytes()).hexdigest(),'cpu130_sha256':hashlib.sha256(cpu.tobytes()).hexdigest(),'max_error_vs_cpu130':float(diff.max()),'mean_error_vs_cpu130_float64_accumulator':float(diff.mean()),'elements_above_or_equal_2_over_255':int((diff>=2/255).sum()),'fraction_above_or_equal_2_over_255':float((diff>=2/255).mean()),'max_error_browser_vs_tf':float(np.abs(browser.astype(np.float64)-tf.astype(np.float64)).max()),'parity_passed':bool(diff.max()<2/255)})
(out/'independent-array-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
