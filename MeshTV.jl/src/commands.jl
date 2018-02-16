abstract type AbstractCommand end

struct SetObject{O <: AbstractObject} <: AbstractCommand
    object::O
    path::Vector{Symbol}
end

struct SetTransform{T <: Transformation} <: AbstractCommand
    tform::T
    path::Vector{Symbol}
end

struct Delete <: AbstractCommand
    path::Vector{Symbol}
end

function lower(cmd::SetObject)
    Dict{String, Any}(
        "type" => "set_object",
        "object" => lower(cmd.object),
        "path" => string.(cmd.path)
    )
end

function lower(cmd::SetTransform)
    Dict{String, Any}(
        "type" => "set_transform",
        "path" => string.(cmd.path),
        "position" => convert(Vector, translation(cmd.tform)),
        "quaternion" => convert(Vector, quaternion_xyzw(cmd.tform))
    )
end

function lower(cmd::Delete)
    Dict{String, Any}(
        "type" => "delete",
        "path" => string.(cmd.path)
    )
end
