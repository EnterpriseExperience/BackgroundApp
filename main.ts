const rooms = new Map<string, Set<WebSocket>>();

Deno.serve((req) => {
    if (req.headers.get("upgrade") === "websocket") {
        const { socket, response } = Deno.upgradeWebSocket(req);

        let currentRoom: string | null = null;

        socket.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);

                if (data.type === "join") {
                    currentRoom = data.server;
                    if (!rooms.has(currentRoom)) {
                        rooms.set(currentRoom, new Set());
                    }
                    rooms.get(currentRoom)!.add(socket);

                } else if (data.type === "message" && currentRoom) {
                    const room = rooms.get(currentRoom);
                    if (!room) return;
                    room.forEach(client => {
                        if (client.readyState === 1) {
                            client.send(e.data);
                        }
                    });
                } else if (data.type === "ping") {
                    socket.send(JSON.stringify({ type: "pong" }));
                }

            } catch (_) {}
        };

        socket.onclose = () => {
            if (currentRoom) {
                rooms.get(currentRoom)?.delete(socket);
                if (rooms.get(currentRoom)?.size === 0) {
                    rooms.delete(currentRoom);
                }
            }
        };

        return response;
    }
    return new Response("WebSocket server running");
});
