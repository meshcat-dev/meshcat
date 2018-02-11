import asyncio
import random
import websockets

sockets = set()

async def handle(websocket, path):
    print("connected", websocket)
    sockets.add(websocket)
    try:
        while True:
            await websocket.recv()
    except websockets.exceptions.ConnectionClosed:
        print("removing", websocket)
        if websocket in sockets:
            sockets.remove(websocket)
        # pass

start_server = websockets.serve(handle, '127.0.0.1', 8765)
asyncio.get_event_loop().run_until_complete(start_server)
print("started")

def wait_for_connection(sockets, timeout=10):
    print("wait_for_connection")
    for i in range(int(timeout / 0.1)):
        if sockets:
            return
        else:
            asyncio.get_event_loop().run_until_complete(asyncio.sleep(0.1))

async def _send(sockets, msg):
    lost_connections = []
    for sock in sockets:
        # await queue.put(msg)
        try:
            await sock.send(msg)
        except websockets.exceptions.ConnectionClosed:
            lost_connections.append(sock)
    sockets.difference_update(lost_connections)

def send(sockets, msg):
    wait_for_connection(sockets)
    print("sending:", msg)
    asyncio.get_event_loop().run_until_complete(_send(sockets, msg))
    # asyncio.get_event_loop().stop()
    # asyncio.get_event_loop().run_forever()


import time

for i in range(1000):
    send(sockets, "hello %d" % i)
    time.sleep(1)
    # asyncio.get_event_loop().run_until_complete(send("hello %d" % i))
    # asyncio.get_event_loop().run_until_complete(asyncio.sleep(1))
# asyncio.get_event_loop().run_forever()
