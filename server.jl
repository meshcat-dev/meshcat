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

function serve_geometry(i)
    my_port = 5005 + i
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
        mesh = load("head_multisense.obj", GLUVMesh)
        texture_png = open(read, "HeadTextureMultisense.png", "r")
        num_points = 100000
        verts = [rand(Point3f0) for i in 1:num_points]
        pc_geom_id = string(Base.Random.uuid1())
        pc_mat_id = string(Base.Random.uuid1())
        pointcloud_data = Dict(
            "metadata" => Dict("version" => 4.5, "type" => "Object"),
            "geometries" => [
                Dict(
                    "uuid" => pc_geom_id,
                    "type" => "BufferGeometry",
                    "data" => Dict(
                        "attributes" => Dict(
                            "position" => Dict(
                                "itemSize" => 3,
                                "type" => "Float32Array",
                                "array" => PackedVector(verts .+ [rand(Point3f0)]),
                                "normalized" => false
                            ), 
                            "color" => Dict(
                                "itemSize" => 3,
                                "type" => "Float32Array",
                                "array" => PackedVector(verts),
                                "normalized" => false,
                            )
                        )
                    )
                )
            ], 
            "materials" => [
                Dict(
                    "uuid" => pc_mat_id,
                    "type" => "PointsMaterial",
                    "color" => 16777215,
                    "size" => 0.001,
                    "vertexColors" => 2,
                )
            ],
            "object" => Dict(
                "type" => "Points",
                "matrix" => [1, 0, 0, 0,
                             0, 1, 0, 0,
                             0, 0, 1, 0,
                             0, 0, 0, 1],
                "geometry" => pc_geom_id,
                "material" => pc_mat_id
            )
        )

        m_geom_id = string(Base.Random.uuid1())
        m_mat_id = string(Base.Random.uuid1())
        m_img_id = string(Base.Random.uuid1())
        m_texture_id = string(Base.Random.uuid1())

        mesh_data = Dict(
            "metadata" => Dict("version" => 4.5, "type" => "Object"),
            "geometries" => [
                Dict(
                    "uuid" => m_geom_id,
                    "type" => "BufferGeometry",
                    "data" => Dict(
                        "attributes" => Dict(
                            "position" => Dict(
                                "itemSize" => 3,
                                "type" => "Float32Array",
                                "array" => PackedVector(vertices(mesh) .+ [rand(Point3f0)]),
                                "normalized" => false
                            ),
                            "uv" => Dict(
                                "itemSize" => 2,
                                "type" => "Float32Array",
                                "array" => PackedVector(texturecoordinates(mesh))
                            )
                        ),
                        "index" => Dict(
                            "itemSize" => 1,
                            "type" => "Uint32Array",
                            "array" => PackedVector(faces(mesh)),
                            "normalized" => false
                        )
                    )
                )
            ],
            "images" => [
                Dict(
                    "uuid" => m_img_id,
                    "url" => "data:image/png;base64,$(base64encode(texture_png))"
                )
            ],
            "textures" => [
                Dict(
                    "uuid" => m_texture_id,
                    "image" => m_img_id,
                    "wrap" => [1001, 1001],
                    "repeat" => [1, 1]
                )
            ],
            "materials" => [
                Dict(
                    "uuid" => m_mat_id,
                    "type" => "MeshPhongMaterial",
                    "color" => 0xffffff,
                    "shininess" => 30,
                    "map" => m_texture_id
                )
            ],
            "object" => Dict(
                "type" => "Mesh",
                "matrix" => [1, 0, 0, 0,
                             0, 1, 0, 0,
                             0, 0, 1, 0,
                             0, 0, 0, 1],
                "geometry" => m_geom_id,
                "material" => m_mat_id
            )
        )


        msg_data = Dict(
            "commands" => [
                Dict(
                    "type" => "add_object",
                    "path" => ["robots", "valkyrie", "head"],
                    "object" => mesh_data
                ),
                Dict(
                     "type" => "add_object",
                     "path" => ["sensors", "pc1"],
                     "object" => pointcloud_data
                ),
                Dict(
                    "type" => "set_transform",
                    "path" => ["robots", "valkyrie"],
                    "position" => [-1, 1, 0],
                    "quaternion" => [0, 0, 0, 1],
                )
            ]
        )

		write(client, MsgPack.pack(msg_data))
        # close(server)
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
                sleep(0.1)
            end
        end
    end
end

@sync begin
    serve_geometry(0)
end

