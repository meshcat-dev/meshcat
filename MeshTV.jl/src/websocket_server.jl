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
	open(`$execname --new-window $url`)
end

function open_url(url)
	@show url
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
	host::IPv4
	port::Int
	pool::WebSocketPool
	server::Server
end

function ViewerWindow(; host::IPv4=ip"127.0.0.1", port::Integer=5001, open=true)
	pool = WebSocketPool()
	server = Server(pool)
	@async run(server, port)
	# Yield once to let the server start
	yield()
	window = ViewerWindow(host, port, pool, server)
	if open
		Base.open(window)
	end
	window
end

const viewer_html = joinpath(@__DIR__, "..", "..", "viewer", "three.html")
# const viewer_html = joinpath(@__DIR__, "..", "..", "simple_receiver.html")

function Base.open(window::ViewerWindow)
	url = url_with_query(string("file://", abspath(viewer_html)),
	                     host=window.host,
	                     port=window.port)
	open_url(url)
end

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
    # This is a bit more complicated than it really should be. The problem is
    # that embedding an IFrame with a local file source causes the query 
    # parameters to be stripped for some reason, so we have to generate a 
    # full URL using the current location. 
    id = Base.Random.uuid1()
    print(io, """
<iframe id="$id" src="" height=500 width=800></iframe>
<script>
let viewer = document.getElementById("$id");
viewer.src = location.origin + "/files/viewer/three.html?host=$(frame.window.host)&port=$(frame.window.port)";
</script>
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
