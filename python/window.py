import http.server
import socketserver
import webbrowser
import os
import urllib

def new_window(websocket_port):
    PORT = 8000
    os.chdir(os.path.join(os.path.dirname(__file__), "../viewer"))
    url = "http://localhost:{:d}/three.html".format(PORT)
    url += "?" + urllib.parse.urlencode({"host": "127.0.0.1", "port": websocket_port})

    Handler = http.server.SimpleHTTPRequestHandler
    for i in range(100):
        try:
            httpd = socketserver.TCPServer(("", PORT), Handler)
        except OSError as e:
            print("port: {:d} in use".format(PORT))
            PORT += 1
    webbrowser.open(url, new=1)
    print("serving at port", PORT)
    httpd.serve_forever()

if __name__ == '__main__':
    new_window(8765)
