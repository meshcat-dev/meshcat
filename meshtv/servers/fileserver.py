import http.server
from http.server import HTTPServer as BaseHTTPServer, SimpleHTTPRequestHandler
import socketserver
import os
import threading

viewer_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "viewer"))

# https://stackoverflow.com/a/46332163
class ViewerFileRequestHandler(SimpleHTTPRequestHandler):
    """This handler uses server.base_path instead of always using os.getcwd()"""
    def translate_path(self, path):
        path = SimpleHTTPRequestHandler.translate_path(self, path)
        relpath = os.path.relpath(path, os.getcwd())
        fullpath = os.path.join(viewer_root, relpath)
        return fullpath

    def log_message(self, *args):
        pass


def start_fileserver(host="127.0.0.1", default_port=8000, max_attempts=1000):
    # os.chdir(viewer_root)
    for i in range(max_attempts):
        port = default_port + i
        try:
            httpd = socketserver.TCPServer((host, port), ViewerFileRequestHandler)
            break
        except OSError as e:
            pass
    return httpd, port


def run_threaded(*args, **kwargs):
    httpd, port = start_fileserver(*args, **kwargs)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return thread, port
