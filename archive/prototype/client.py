import asyncio
import websockets
import sys

async def hello():
    async with websockets.connect('ws://localhost:' + sys.argv[1]) as websocket:
        for i in range(1000):
            print(await websocket.recv())

asyncio.get_event_loop().run_until_complete(hello())