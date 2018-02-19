import asyncio
import threading

import websockets


loop = asyncio.get_event_loop()


class WebSocketPool():
    def __init__(self):
        self.sockets = set()
        self.host = None
        self.port = None
        self.server = None

    async def handle_new_connection(self, websocket, path):
        print("connected", websocket)
        self.sockets.add(websocket)
        try:
            while True:
                await websocket.recv()
        except websockets.exceptions.ConnectionClosed:
            self.remove(websocket)

    def start(self, host="127.0.0.1", default_port=5000, max_attempts=1000):
        self.host = host
        for i in range(max_attempts):
            self.port = default_port + i
            start_server = websockets.serve(self.handle_new_connection,
                self.host, self.port)
            try:
                self.server = loop.run_until_complete(start_server)
                break
            except OSError as e:
                pass
        print("Serving websockets at ws://{:s}:{:d}".format(self.host, self.port))
        return self

    def remove(self, websocket):
        print("removing", websocket)
        if websocket in self.sockets:
            self.sockets.remove(websocket)

    async def _wait_for_connection(self, interval=0.1):
        while not self.sockets:
            await asyncio.sleep(interval)

    async def _send_to_all(self, msg):
        lost_connections = []
        for sock in self.sockets:
            try:
                await sock.send(msg)
            except websockets.exceptions.ConnectionClosed:
                lost_connections.append(sock)
        self.sockets.difference_update(lost_connections)

    def send(self, msg):
        loop.run_until_complete(self._wait_for_connection())
        loop.run_until_complete(self._send_to_all(msg))

    def close(self):
        self.server.close()
        # for socket in self.sockets:
        #     print("closing:", socket)
        #     socket.handler_task.cancel()
        loop.run_until_complete(self.server.wait_closed())
