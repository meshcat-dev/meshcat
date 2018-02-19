using HttpServer
using WebSockets
using URIParser: escape

struct WebSocketPool
	sockets::Set{WebSocket}
	new_connection_queue::Channel{WebSocket}

	WebSocketPool(sockets=Set{WebSocket}(), new_connection_queue=Channel{WebSocket}(32)) =
		new(sockets, new_connection_queue)
end

cleanup!(pool::WebSocketPool) = filter!(isopen, pool.sockets)

take_new_connection!(pool::WebSocketPool) = push!(pool.sockets, take!(pool.new_connection_queue))

function ensure_connection!(pool::WebSocketPool)
	cleanup!(pool)
	if isempty(pool.sockets)
		# Block for at least one connection
		println("Waiting for a websocket connection...")
		while !isready(pool.new_connection_queue)
			sleep(0.1)
		end
		println("...client connected!")
	end
	# Get any new connections
	while isready(pool.new_connection_queue)
		take_new_connection!(pool)
	end
end

function Base.send(pool::WebSocketPool, msg)
	ensure_connection!(pool)
	@sync begin
		for socket in pool.sockets
			if isopen(socket)
				@async write(socket, msg)
			end
		end
	end
end

function WebSockets.WebSocketHandler(pool::WebSocketPool)
	handler = WebSocketHandler() do req, client
		put!(pool.new_connection_queue, client)
		try
			while true
				read(client)
			end
		catch e
			if e isa WebSockets.WebSocketClosedError
				if client in pool.sockets
					delete!(pool.sockets, client)
				end
			else
				rethrow(e)
			end
		end
	end
end

function url_with_query(address; params...)
	string(address,
	       "?",
	       join([string(escape(string(k)), "=", escape(string(v))) for (k, v) in params], '&'))
end

function open_url(url)
	@show url
	try
		@static if is_windows()
			run(`start $url`)
		elseif is_apple()
			run(`open $url`)
		elseif is_linux()
			run(`xdg-open $url`)
		end
	catch e
		println("Could not open browser automatically: $e")
		println("Please open the following URL in your browser:")
		println(url)
	end
end

mutable struct ViewerWindow  # mutable so it can be finalized
	host::IPv4
	pool::WebSocketPool
	server::Server
	port::Int

	function ViewerWindow(host::IPv4, pool::WebSocketPool, server::Server, port::Int)
		w = new(host, pool, server, port)
		finalizer(w, shutdown)
		w
	end
end

function shutdown(w::ViewerWindow)
	close(w.server)
end

const viewer_root = joinpath(@__DIR__, "..", "viewer")
const viewer_html = joinpath(viewer_root, "meshtv.html")

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

function find_available_port(get_handlers::Function, host=IPv4(127,0,0,1); default=8000, max_attempts=1000)
    HttpServer.initcbs()
    for i in 1:max_attempts
        port = default + i - 1
        try
            server = Server(get_handlers()...)
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


function ViewerWindow(; host::IPv4=ip"127.0.0.1", open=false)
	pool = WebSocketPool()

	# The server handles both HTTP requests (for the viewer html and js)
	# and the websocket requests from the viewer itself.
	server, port = find_available_port(host; default=5000) do
		HttpHandler(handle_viewer_file_request), WebSocketHandler(pool)
	end

	# Yield once to let the servers start
	yield()
	window = ViewerWindow(host, pool, server, port)
	if open
		Base.open(window)
	end
	window
end


function geturl(window::ViewerWindow)
    url = url_with_query(string("http://", window.host, ":", window.port, "/meshtv.html"),
                         host=window.host,
                         port=window.port)
end

Base.open(window::ViewerWindow) = open_url(geturl(window))

Base.send(window::ViewerWindow, msg) = send(window.pool, msg)
