using HttpServer
using WebSockets

sockets = Set()

handler = WebSocketHandler() do req, client
	@show client
	push!(sockets, client)
	try
		while true
			read(client)
		end
	catch e
		if e isa WebSockets.WebSocketClosedError
			println("closing ", client)
			delete!(sockets, client)
		else
			rethrow(e)
		end
	end
end

function wait_for_connection(sockets, timeout=10)
	println("wait_for_connections")
	for i in 1:(timeout ÷ 0.1)
		if !isempty(sockets)
			return
		end
		sleep(0.1)
	end
	error("timed out")
end

function send_to_all(sockets, msg)
	wait_for_connection(sockets)
	println("sending $i")
	@sync for socket in sockets
		@async write(socket, msg)
	end
end

server = Server(handler)
@async run(server, 8765)

for i in 1:1000
	send_to_all(sockets, "hello $i")
	sleep(1)
end


