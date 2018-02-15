module Servers

export ViewerWindow,
    IJuliaCell

using HttpServer
using WebSockets
using URIParser: escape

include("file_server.jl")


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

struct ViewerWindow
	host::IPv4
	pool::WebSocketPool
	server::Server
	port::Int
end

function ViewerWindow(; host::IPv4=ip"127.0.0.1", open=true)
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

const viewer_html = joinpath(@__DIR__, "..", "..", "viewer", "three.html")

function geturl(window::ViewerWindow)
    url = url_with_query(string("http://", window.host, ":", window.port, "/three.html"),
                         host=window.host,
                         port=window.port)
end

Base.open(window::ViewerWindow) = open_url(geturl(window))

Base.send(window::ViewerWindow, msg) = send(window.pool, msg)

struct IJuliaCell
	window::ViewerWindow
    embed::Bool

    IJuliaCell(window, embed=false) = new(window, embed)
end

function Base.show(io::IO, ::MIME"text/html", frame::IJuliaCell)
    if frame.embed
        show_embed(io, frame)
    else
        show_inline(io, frame)
    end
end

function show_inline(io::IO, frame::IJuliaCell)
    print(io, """
<iframe src="$(geturl(frame.window))" height=500 width=800></iframe>
""")
end

srcdoc_escape(x) = replace(replace(x, "&", "&amp;"), "\"", "&quot;")

function show_embed(io::IO, frame::IJuliaCell)
    id = Base.Random.uuid1()
    print(io, """
    <iframe id="$id" srcdoc="$(srcdoc_escape(readstring(open(joinpath(@__DIR__, "..", "..", "viewer", "build", "inline.html")))))" height=500 width=800>
    </iframe>
    <script>
    function try_to_connect() {
        console.log("trying");
        let frame = document.getElementById("$id");
        if (frame && frame.contentWindow !== undefined && frame.contentWindow.connect !== undefined) {
            frame.contentWindow.connect("$(frame.window.host)", $(frame.window.port));
        } else {
            console.log("could not connect");
          setTimeout(try_to_connect, 100);
        }
    }
    setTimeout(try_to_connect, 1);
    </script>
    """)
end

struct Snapshot
	json::String
end

Snapshot(io::IO) = Snapshot(readstring(io))

function Base.show(io::IO, ::MIME"text/html", snap::Snapshot)
	content = readstring(open(joinpath(@__DIR__, "..", "..", "viewer", "build", "inline.html")))
	# TODO: there has to be a better way than doing a replace() on the html.
	script = """
	<script>
	scene = new THREE.ObjectLoader().parse(JSON.parse(`$(snap.json)`));
	update_gui();
	</script>
	</body>
	"""
	html = replace(content, "</body>", script)
	print(io, """
	<iframe srcdoc="$(srcdoc_escape(html))" height=500 width=800>
	</iframe>
	""")
end


end
