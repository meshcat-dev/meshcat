import MsgPack: pack, Ext

extcode(v::PackedVector) = extcode(eltype(v.data))
extcode(::Type{UInt8}) = 0x12
extcode(::Type{Int32}) = 0x15
extcode(::Type{UInt32}) = 0x16
extcode(::Type{Float32}) = 0x17

pack(io::IO, v::PackedVector) = pack(io, Ext(extcode(v), reinterpret(UInt8, v.data, (sizeof(v.data),))))

pack(s::IO, cmd::AbstractCommand) = pack(s, lower(cmd))
