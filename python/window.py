import http.server
import socketserver
import webbrowser
import os
import time
import urllib
import threading
import functools


def new_window(websocket_port, fileserver_port=8000):
    os.chdir(os.path.join(os.path.dirname(__file__), "../viewer"))

    Handler = http.server.SimpleHTTPRequestHandler
    for i in range(1000):
        try:
            httpd = socketserver.TCPServer(("", fileserver_port), Handler)
            break
        except OSError as e:
            fileserver_port += 1
    url = "http://localhost:{:d}/three.html".format(fileserver_port)
    url += "?" + urllib.parse.urlencode({"host": "127.0.0.1", "port": websocket_port})
    webbrowser.open(url, new=1)
    print("You can reopen the visualizer by visiting the following URL:")
    print(url)
    httpd.serve_forever()


def launch_thread(websocket_port):
    fileserver_thread = threading.Thread(
        target=functools.partial(new_window, websocket_port),
        daemon=True)
    fileserver_thread.start()
    return fileserver_thread


if __name__ == '__main__':
    new_window(8765)
