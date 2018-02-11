import threading

import umsgpack

import geometry
import server
import window
from geometry import ViewerMessage, Mesh, Box, MeshBasicMaterial, AddObject


if __name__ == '__main__':
    socket_port = 5002
    fileserver_thread = threading.Thread(target=lambda: window.new_window(socket_port), daemon=True)
    fileserver_thread.start()

    manager = server.WebsocketManager(socket_port)

    while True:
        path = input("path: ")
        msg = ViewerMessage([AddObject(
            Mesh(
                Box([0.2, 0.1, 0.2]),
                MeshBasicMaterial(0xff00ff)
            ),
            path.split("/")
        )])
        manager.send_to_all(umsgpack.packb(msg.serialize()))
