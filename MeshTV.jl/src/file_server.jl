using HttpServer

const viewer_root = joinpath(@__DIR__, "..", "..", "viewer")

function handle_viewer_file_request(req, res)
	parts = split(req.resource, '/')
	if parts[1] != ""
		return Response(404)
	end
	if length(parts) == 2
		path = joinpath(viewer_root, parts[2])
	else
		if length(parts) != 3
			return Response(404)
		end
		if parts[2] != "js"
			return Response(404)
		end
		path = joinpath(viewer_root, parts[2], parts[3])
	end
	path = split(path, "?")[1]
    if isfile(path)
	    open(path) do file
	        return Response(read(file))
	    end
	else
		return Response(404)
	end
end

function find_available_port(get_handler::Function, host=IPv4(127,0,0,1); default=8000, max_attempts=1000)
	HttpServer.initcbs()
	for i in 1:max_attempts
		port = default + i - 1
		try
			server = Server(get_handler())
			listen(server, host, port)
			@async HttpServer.handle_http_request(server)
			return server, port
		catch e
			if e isa Base.UVError
				println("Port $(host):$(port) in use, trying another")
			else
				rethrow(e)
			end
		end
	end
	error("Could not find a port to use")
end

# @sync begin
# 	port = find_available_port() do 
# 		HttpHandler(handle_viewer_file_request)
# 	end
# end

function serve_viewer_files()
	find_available_port() do
		HttpHandler(handle_viewer_file_request)
	end
end
