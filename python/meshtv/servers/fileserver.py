import http.server
import socketserver
import os
import threading

viewer_root = os.path.join(os.path.dirname(__file__), "..", "..", "..", "viewer")


def start_fileserver(host="127.0.0.1", default_port=8000, max_attempts=1000):
    os.chdir(viewer_root)
    handler = http.server.SimpleHTTPRequestHandler
    for i in range(max_attempts):
        port = default_port + i
        try:
            httpd = socketserver.TCPServer((host, port), handler)
            break
        except OSError as e:
            pass
    return httpd, port


def run_threaded(*args, **kwargs):
    httpd, port = start_fileserver(*args, **kwargs)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return thread, port
