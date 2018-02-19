import webbrowser

from . import fileserver
from .websocketpool import WebSocketPool


class ViewerWindow:
    def __init__(self, host="127.0.0.1"):
        self.host = host
        self.pool = WebSocketPool().start(host=host)
        self.file_thread, self.file_port = fileserver.run_threaded(host=host)

    def url(self):
        return "http://{:s}:{:d}/meshtv.html?host={:s}&port={:d}".format(
            self.host,
            self.file_port,
            self.host,
            self.pool.port)

    def open(self):
        webbrowser.open(self.url(), new=1)
        print("You can reopen the visualizer by visiting the following URL:")
        print(self.url())
        return self

    def send(self, msg):
        self.pool.send(msg)

    def close(self):
        self.pool.close()
