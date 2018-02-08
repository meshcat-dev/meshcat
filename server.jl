using HttpServer
using WebSockets
using MeshIO
using FileIO
# using JSON
using MsgPack

mesh = load("head_multisense.obj")

wsh = WebSocketHandler() do req,client
    while true
        req = read(client)
        num_points = MsgPack.unpack(req)
		@time verts = rand(Float32, 3, num_points)
		@time msg = MsgPack.pack(
			Dict(
			    "vertices" => Ext(0x17, reinterpret(UInt8, verts, (sizeof(verts),))),
			    "colors" => Ext(0x17, reinterpret(UInt8, verts, (sizeof(verts),)))
			)
		)
		@time write(client, msg)
    end
  end

server = Server(wsh)
run(server,8765)
