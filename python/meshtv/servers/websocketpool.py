import asyncio
import threading

import janus
import websockets


class WebSocketPool():
    def __init__(self):
        self.sockets = set()
        self.host = None
        self.port = None
        self.queue = None

    def start(self, host="127.0.0.1", default_port=5000, max_attempts=1000):
        self.host = host
        self.loop = asyncio.new_event_loop()
        for i in range(max_attempts):
            self.port = default_port + i
            start_server = websockets.serve(self.handle_new_connection,
                self.host, self.port, loop=self.loop)
            try:
                self.loop.run_until_complete(start_server)
                break
            except OSError as e:
                pass
        print("Serving websockets at ws://{:s}:{:d}".format(self.host, self.port))
        self.queue = janus.Queue(loop=self.loop, maxsize=1)
        return self.queue.sync_q

    async def _run(self):
        while True:
            msg = await self.queue.async_q.get()
            await self._wait_for_connection()
            await self._send_to_all(msg)

    def run_threaded(self, *args, **kwargs):
        queue = self.start(*args, **kwargs)
        thread = threading.Thread(target=self.run, daemon=True)
        thread.start()
        return queue, thread

    def run(self):
        self.loop.run_until_complete(self._run())

    async def handle_new_connection(self, websocket, path):
        print("connected", websocket)
        self.sockets.add(websocket)
        try:
            while True:
                await websocket.recv()
        except websockets.exceptions.ConnectionClosed:
            self.remove(websocket)

    def remove(self, websocket):
        print("removing", websocket)
        if websocket in self.sockets:
            self.sockets.remove(websocket)

    async def _wait_for_connection(self, interval=0.1):
        while not self.sockets:
            await asyncio.sleep(interval, loop=self.loop)

    async def _send_to_all(self, msg):
        lost_connections = []
        for sock in self.sockets:
            try:
                await sock.send(msg)
            except websockets.exceptions.ConnectionClosed:
                lost_connections.append(sock)
        self.sockets.difference_update(lost_connections)


if __name__ == '__main__':
    import time

    manager = WebSocketPool()
    queue, thread = manager.run_threaded()

    for i in range(1000):
        queue.put("hello %d" %i)
        time.sleep(1)
