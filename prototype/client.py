import asyncio
import websockets

async def hello():
    async with websockets.connect('ws://localhost:8765') as websocket:
        for i in range(3):
            print(await websocket.recv())

asyncio.get_event_loop().run_until_complete(hello())