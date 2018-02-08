using HttpServer
using WebSockets
using MeshIO
using FileIO
# using JSON
using MsgPack
using StaticArrays
using GeometryTypes
using GeometryTypes: raw
using Colors
using Colors: N0f8


struct PackedVector{T}
    data::Vector{T}
end

PackedVector(v::Vector{<:StaticVector}) = PackedVector(reinterpret(eltype(eltype(v)), v))

function PackedVector(faces::Vector{<:Face{N}}) where {N}
    PackedVector(reinterpret(UInt32,
        [raw.(convert(Face{N, GeometryTypes.OffsetInteger{-1, UInt32}}, face)) for face in faces], (N * length(faces),)))
end

PackedVector(colors::Vector{<:Colorant}) = PackedVector(convert(Vector{RGBA{N0f8}}, colors))
PackedVector(rgba::Vector{RGBA{N0f8}}) = PackedVector(reinterpret(UInt8, rgba))

PackedVector(uv::Vector{<:UV{T}}) where {T} = PackedVector(reinterpret(T, uv, (2 * length(uv),)))

extcode(v::PackedVector{T}) where {T} = extcode(T)
extcode(::Type{UInt8}) = 0x12
extcode(::Type{Int32}) = 0x15
extcode(::Type{UInt32}) = 0x16
extcode(::Type{Float32}) = 0x17

MsgPack.pack(io::IO, v::PackedVector) = pack(io, Ext(extcode(v), reinterpret(UInt8, v.data, (sizeof(v.data),))))

function serve_geometry()
    my_port = 5005 + rand(1:500)
    magic_port = 8765

    # connection_channel = Channel{Bool}(1)
    # name_server = Server(WebSocketHandler() do req, client
    #     write(client, MsgPack.pack(my_port))
    #     println("got name server connection")
    #     close(name_server)
    # end)

    # name_server = Server(HttpHandler() do req::Request, res::Response
    #     @show my_port
    #     response = Response("ws://127.0.0.1:$my_port")
    #     response.headers["Access-Control-Allow-Origin"] = "*"
    #     close(name_server)
    #     response
    # end)

    wsh = WebSocketHandler() do req,client
        @show client
        req = read(client)
        mesh = load("head_multisense.obj", GLUVMesh)
        texture_png = open(read, "HeadTextureMultisense.png", "r")
        num_points = MsgPack.unpack(req)
        verts = [rand(Point3f0) for i in 1:num_points]
		msg = MsgPack.pack(
            Dict(
                "setgeometry" => [
                    Dict(
                        "type" => "pointcloud",
                        "points" => PackedVector(verts .+ [rand(Point3f0)]),
                        "channels" => Dict(
                            "rgb" => PackedVector(verts)
                        )
                    ),
                    Dict(
                        "type" => "mesh_data",
                        "vertices" => PackedVector(vertices(mesh) .+ [rand(Point3f0)]),
                        "faces" => PackedVector(faces(mesh)),
                        "texture" => Dict(
                            "coordinates" => PackedVector(texturecoordinates(mesh)),
                            "png" => PackedVector(texture_png)
                        )
                    )
                ]
			)
		)
		write(client, msg)
        close(server)
    end


    server = Server(wsh)
    println("running geometry server")
    @async run(server,my_port)

    @async begin
        while true
            try
                name_server = listen(magic_port)
                socket = accept(name_server)
                println("advertising my port as $my_port")
                response = Response("ws://127.0.0.1:$my_port")
                response.headers["Access-Control-Allow-Origin"] = "*"
                write(socket, response)
                close(socket)
                close(name_server)
                break
            catch e
                println("waiting")
                sleep(0.1)
            end
        end
    end
end

serve_geometry()
