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

