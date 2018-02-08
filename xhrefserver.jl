using HttpServer

http = HttpHandler() do req::Request, res::Response
	response = Response("hello")
	response.headers["Access-Control-Allow-Origin"] = "*"
	close(server)
	response
end

server = Server( http )
run(server, 8764)
