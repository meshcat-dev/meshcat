import asyncio
import random

import websockets


class WebsocketManager():
    def __init__(self, port, start=True):
        self.sockets = set()
        self.port = port
        if start:
            self.start()

    def start(self):
        start_server = websockets.serve(self.handle_new_connection,
            '127.0.0.1', self.port)
        asyncio.get_event_loop().run_until_complete(start_server)
        print("started")

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
        # pass

    def wait_for_connection(self, timeout=10, interval=0.1):
        for i in range(int(timeout / interval)):
            if self.sockets:
                return
            else:
                asyncio.get_event_loop().run_until_complete(
                    asyncio.sleep(interval))

    async def _send_to_all(self, msg):
        lost_connections = []
        for sock in self.sockets:
            try:
                await sock.send(msg)
            except websockets.exceptions.ConnectionClosed:
                lost_connections.append(sock)
        self.sockets.difference_update(lost_connections)

    def send_to_all(self, msg, wait=True):
        if wait:
            self.wait_for_connection()
        asyncio.get_event_loop().run_until_complete(self._send_to_all(msg))


if __name__ == '__main__':
    manager = WebsocketManager()
    import time

    for i in range(1000):
        manager.send_to_all("hello %d" % i)
        time.sleep(1)
