import http.server
import socketserver
import webbrowser
import os
import time
import urllib
import threading
import functools
import platform
import subprocess
import stat


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


# Taken from the CPython sources at https://github.com/python/cpython/blob/2.7/Lib/webbrowser.py
# Copyright © 2001-2018 Python Software Foundation; All Rights Reserved
def _isexecutable(cmd):
    if os.path.isfile(cmd):
        mode = os.stat(cmd)[stat.ST_MODE]
        if mode & stat.S_IXUSR or mode & stat.S_IXGRP or mode & stat.S_IXOTH:
            return True
    return False


# Taken from the CPython sources at https://github.com/python/cpython/blob/2.7/Lib/webbrowser.py
# Copyright © 2001-2018 Python Software Foundation; All Rights Reserved
def _iscommand(cmd):
    """Return True if cmd is executable or can be found on the executable
    search path."""
    if _isexecutable(cmd):
        return True
    path = os.environ.get("PATH")
    if not path:
        return False
    for d in path.split(os.pathsep):
        exe = os.path.join(d, cmd)
        if _isexecutable(exe):
            return True
    return False


def launch_local(websocket_port):
    url = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "viewer", "three.html"))
    url += "?" + urllib.parse.urlencode({"host": "127.0.0.1", "port": websocket_port})
    url = "file://" + url

    # Work-around the fact that xdg-open fails on file URLs with query parameters
    if _iscommand("xdg-open"):
        try:
            desktop_file = subprocess.check_output(["xdg-mime", "query", "default", "text/html"]).decode('utf-8')
            print(desktop_file, type(desktop_file))
            execname = desktop_file.split(".")[0]
            print(url)
            subprocess.Popen([execname, url])
        except Exception as e:
            print(e)
            print("xdg-open workaround failed, falling back to webbrowser.open")
            webbrowser.open(url, new=1)
    else:
        webbrowser.open(url, new=1)
    print("You can reopen the visualizer by visiting the following URL:")
    print(url)
