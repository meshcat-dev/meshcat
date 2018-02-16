const libzwssock = joinpath(@__DIR__, "zwssock", "src", "CZMQ-ZWSSock", "libzwssock.so")

major = Ref{Cint}()
minor = Ref{Cint}()
patch = Ref{Cint}()

ccall((:zmq_version, :libczmq), Void, (Ref{Cint}, Ref{Cint}, Ref{Cint}), major, minor, patch)
@show major minor patch

ctx = ccall((:zctx_new, :libczmq), Ptr{Void}, ())
@show ctx
ctx == C_NULL && error("could not create context")

sock = ccall((:zwssock_new_router, libzwssock), Ptr{Void}, (Ptr{Void},), ctx)
@show sock
ctx == C_NULL && error("could not create socket")

ccall((:zwssock_bind, libzwssock), Void, (Ptr{Void}, Cstring), sock, "tcp://127.0.0.1:8000")

while true
	msg = ccall((:zwssock_recv, libzwssock), Ptr{Void}, (Ptr{Void},), sock)
	if msg == C_NULL
		println("Got null msg")
		break
	end
	@show msg

	id = ccall((:zmsg_pop, :libczmq), Ptr{Void}, (Ptr{Void},), msg)
	@show unsafe_wrap(Array,
		ccall((:zframe_data, :libczmq), Ptr{UInt8}, (Ptr{Void},), id),
        (ccall((:zframe_size, :libczmq), Csize_t, (Ptr{Void},), id),))
    @show unsafe_string(
        ccall((:zframe_data, :libczmq), Ptr{UInt8}, (Ptr{Void},), id),
        ccall((:zframe_size, :libczmq), Csize_t, (Ptr{Void},), id))
	@show id

	while ccall((:zmsg_size, :libczmq), Csize_t, (Ptr{Void},), msg) != 0
		str = ccall((:zmsg_popstr, :libczmq), Ptr{Void}, (Ptr{Void},), msg)
		println(str)
		ccall((:free, :libczmq), Void, (Ptr{Void},), str)
	end

	ccall((:zmsg_destroy, :libczmq), Void, (Ref{Ptr{Void}},), Ref(msg))

	msg = ccall((:zmsg_new, :libczmq), Ptr{Void}, ())
	ccall((:zmsg_push, :libczmq), Void, (Ptr{Void}, Ptr{Void}), msg, id)
	ccall((:zmsg_addstr, :libczmq), Void, (Ptr{Void}, Cstring), msg, "hello back")

	rc = ccall((:zwssock_send, libzwssock), Cint, (Ptr{Void}, Ref{Ptr{Void}}), sock, Ref(msg))
	if rc != 0
		ccall((:zmsg_destroy, :libczmq), Void, (Ref{Ptr{Void}},), Ref(msg))
	end

end


