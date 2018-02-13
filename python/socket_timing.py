import asyncio
import time

import websockets
import numpy as np


async def handle_new_connection(websocket, path):
    print("connected", websocket)
    data = np.random.bytes(100000 * 3 * 4 * 2)
    N = 100

    now = time.time()
    for i in range(N):
        await websocket.send(data)
    duration = time.time() - now
    print(duration / N)
    print(len(data) / (duration / N) * 8)

start_server = websockets.serve(handle_new_connection, '127.0.0.1', 8765)
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
