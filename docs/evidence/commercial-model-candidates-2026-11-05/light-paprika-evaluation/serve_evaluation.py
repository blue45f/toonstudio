import http.server,pathlib
root=pathlib.Path('/tmp/toonstudio-light-paprika-evaluation')
ort=pathlib.Path('/workspace/toonstudio/node_modules/.pnpm/onnxruntime-web@1.30.0/node_modules/onnxruntime-web/dist')
class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self,path):
        if path.startswith('/ort/'):
            name=path.split('?',1)[0].removeprefix('/ort/')
            if '/' in name or '..' in name:return str(root/'missing')
            return str(ort/name)
        return super().translate_path(path)
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy','same-origin')
        self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        super().end_headers()
    def log_message(self,*args):pass
import os
os.chdir(root)
http.server.ThreadingHTTPServer(('127.0.0.1',8921),Handler).serve_forever()
