import asyncio
import threading

import websockets
import zmq
import zmq.asyncio

# Tell asyncio to use zmq's eventloop. Future
# versions may not need this. See:
# https://github.com/zeromq/pyzmq/issues/1034#issuecomment-315113731
zmq.asyncio.install()

queues = set()

async def handle_new_connection(websocket, path):
    print("connected", websocket)
    my_queue = asyncio.Queue()
    queues.add(my_queue)
    try:
        while True:
            msg = await my_queue.get()
            await websocket.send(msg)
    except websockets.ConnectionClosed as e:
        queues.remove(queue)

start_server = websockets.serve(handle_new_connection, '127.0.0.1', 8765)
asyncio.get_event_loop().run_until_complete(start_server)

context = zmq.asyncio.Context()
socket = context.socket(zmq.REP)
socket.bind("tcp://*:5555")

async def run_zmq():
    while True:
        message = await socket.recv()
        for q in queues:
            await q.put(message)
        await socket.send(b"ok")

asyncio.get_event_loop().run_until_complete(run_zmq())
