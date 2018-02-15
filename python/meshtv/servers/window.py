import webbrowser

from . import fileserver
from .websocketpool import WebSocketPool


class ViewerWindow:
    def __init__(self, host="127.0.0.1"):
        self.host = host
        self.pool = WebSocketPool()
        self.pool_q, self.pool_thread = self.pool.run_threaded(host=host)
        self.file_thread, self.file_port = fileserver.run_threaded(host=host)

    def url(self):
        return "http://{:s}:{:d}/three.html?host={:s}&port={:d}".format(
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
        self.pool_q.put(msg)


if __name__ == '__main__':
    import time

    w = ViewerWindow().open()
    for i in range(1000):
        w.send("hello %d" % i)
        time.sleep(1)

