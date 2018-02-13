using HttpServer
using WebSockets

handler = WebSocketHandler() do req, client
	@show client
	# data = rand(UInt8, 100_000 * 3 * sizeof(Float32) * 2)
	data = join(rand('a':'z', 100_000 * 3 * sizeof(Float32) * 2))
	@show sizeof(data)
	N = 500
	duration = @elapsed for i in 1:N
		write(client, data)
	end
	@show duration / N
	@show sizeof(data) / (duration / N) * 8
end

server = Server(handler)
run(server, 8765)
