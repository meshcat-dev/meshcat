module Geometry

using GeometryTypes
using Parameters: @with_kw
using Base.Random: UUID, uuid1
using Colors

const GeometryLike = Union{AbstractGeometry, AbstractMesh}
abstract type AbstractObject end
abstract type AbstractMaterial end


struct Object{G <: GeometryLike, M <: AbstractMaterial} <: AbstractObject
	geometry::G
	material::M
end

convert(::Type{Object}, geometry::GeometryLike) = Object(geometry, MeshLambertMaterial())


@with_kw struct MeshMaterial <: AbstractMaterial
	_type::String
	color::Colorant = RGBA(1., 1., 1., 1.)   # not a concrete type, but probably not a major performance problem
end

MeshBasicMaterial(kw...) = MeshMaterial(_type="MeshBasicMaterial", kw...)
MeshLambertMaterial(kw...) = MeshMaterial(_type="MeshLambertMaterial", kw...)
MeshPhongMaterial(kw...) = MeshMaterial(_type="MeshPhongMaterial", kw...)

threejstype(m::MeshMaterial) = m._type
threejstype(o::Object) = "Object"


function serialize(obj::AbstractObject, uuid=uuid1())
	data = Dict{String, Any}(
	    "metadata" => Dict{String, Any}("version" => 4.5, "type" => "Object"),
        "object" => Dict{String, Any}(
            "uuid" => uuid,
            "type" => threejstype(obj),
        )
    )
    add_to_object!(data, geometry(obj))
    add_to_object!(data, material(obj))
end

function add_to_object!(object_data::Dict, geometry::GeometryLike, uuid=uuid1()
    object_data["object"]["geometry"] = uuid
    push!(get!(object_data, "geometries", []), serialize(geometry, uuid))
end

function add_to_object!(object_data::Dict, material::AbstractMaterial, uuid=uuid1())
    object_data["object"]["material"] = uuid
    push!(get!(object_data, "materials", []), serialize(geometry, uuid))
end


function serialize(box::HyperRectangle{3}, uuid=uuid1())
    # TODO: handle intrinsic transform
    w = widths(box)
    Dict{String, Any}(
        "uuid" => uuid,
        "type" => "BoxGeometry",
        "width" => w[1],
        "height" => w[2],
        "depth" => w[3]
    )
end

function serialize(material::MeshMaterial, uuid=uuid1())
    Dict{String, Any}(
        "uuid" => uuid,
        "type" => threejstype(material),
        "color" => string("0x", hex(convert(RGB, material.color))),
        "transparent" => alpha(material.color) != 1,
        "opacity" => alpha(material.color),
    )
end




