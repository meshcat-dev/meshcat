import asyncio
import websockets

clients = set()
msg_queue = asyncio.Queue()
visualizers = set()


async def new_client(websocket, path):
    print("new client:", websocket)
    clients.add(websocket)
    try:
        while True:
            msg = await websocket.recv()
            await msg_queue.put(msg)
    except websockets.exceptions.ConnectionClosed:
        clients.remove(websocket)

async def new_visualizer(websocket, path):
    print("new visualizer:", websocket)
    visualizers.add(websocket)
    while True:
        await websocket.recv()

# async def hello(websocket, path):
#     name = await websocket.recv()
#     print("< {}".format(name))

#     greeting = "Hello {}!".format(name)
#     await websocket.send(greeting)
#     print("> {}".format(greeting))


async def main():
    while True:
        msg = await msg_queue.get()
        for vis in visualizers:
            await vis.send(msg)


loop = asyncio.get_event_loop()
loop.run_until_complete(websockets.serve(new_client, 'localhost', 8765))
loop.run_until_complete(websockets.serve(new_visualizer, 'localhost', 8764))
loop.run_until_complete(main())
