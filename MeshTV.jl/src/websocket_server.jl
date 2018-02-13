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
		wait(pool.new_connection_queue)
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
			@async write(socket, msg)
		end
	end
end

function HttpServer.Server(pool::WebSocketPool)
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
	Server(handler)
end


function url_with_query(address; params...)
	string(address, 
	       "?",
	       join([string(escape(string(k)), "=", escape(string(v))) for (k, v) in params], '&'))
end

"""
Work-around for https://bugs.freedesktop.org/show_bug.cgi?id=45857

This is a terrible, terrible hack. 
TODO: Either actually parse the .desktop file or find a better way to do this
"""
function work_around_xdg_open_issue(url)
	desktop_file = readstring(`xdg-mime query default text/html`)
	execname = split(desktop_file, '.')[1]
	open(`$execname $url`)
end

function open_url(url)
	try
		@static if is_windows()
			run(`start $url`)
		elseif is_apple()
			run(`open $url`)
		elseif is_linux()
			if startswith(url, "file://")
				work_around_xdg_open_issue(url)
			else
				run(`xdg-open $url`)
			end
		end
	catch e
		println("Could not open browser automatically: $e")
		println("Please open the following URL in your browser:")
		println(url)
	end
end

struct ViewerWindow
	host::String
	port::Int
	pool::WebSocketPool
	server::Server
end

function ViewerWindow(; host::AbstractString="127.0.0.1", port::Integer=5001)
	pool = WebSocketPool()
	server = Server(pool)
	@async run(server, port)
	# Yield once to let the server start
	yield()
	window = ViewerWindow(host, port, pool, server)
	open(window)
	window
end

# const viewer_html = joinpath(@__DIR__, "..", "..", "viewer", "three.html")
const viewer_html = joinpath(@__DIR__, "..", "..", "simple_receiver.html")

function Base.open(window::ViewerWindow)
	url = url_with_query(string("file://", abspath(viewer_html)),
	                     host=window.host,
	                     port=window.port)
	open_url(url)
end

window = ViewerWindow(port=8765)

Base.send(window::ViewerWindow, msg) = send(window.pool, msg)

for i in 1:100
	send(window, "hello $i")
	sleep(1)
end

