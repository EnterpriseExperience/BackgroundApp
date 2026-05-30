const rooms = new Map<string, {
    clients: Set<WebSocket>,
    users: Map<string, WebSocket>,
    history: Array<{user: string, text: string}>,
    seen: Set<string>
}>();

function get_room(id: string) {
    if (!rooms.has(id)) {
        rooms.set(id, {
            clients: new Set(),
            users: new Map(),
            history: [],
            seen: new Set()
        });
    }
    return rooms.get(id)!;
}

function cleanup_room(id: string) {
    const room = rooms.get(id);
    if (room && room.clients.size === 0) {
        rooms.delete(id);
    }
}

function broadcast(room: ReturnType<typeof get_room>, payload: unknown) {
    const msg = JSON.stringify(payload);
    room.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
    });
}

Deno.serve((req) => {
    if (req.headers.get("upgrade") === "websocket") {
        const { socket, response } = Deno.upgradeWebSocket(req);

        let server_id: string | null = null;
        let username: string | null = null;
        let last_msg_time = 0;

        socket.onmessage = (e) => {
            let data: Record<string, unknown>;
            try {
                data = JSON.parse(e.data);
            } catch {
                return;
            }

            if (!data || typeof data.type !== "string") return;

            if (data.type === "join" || data.type === "rejoin") {
                if (typeof data.server !== "string" || typeof data.user !== "string") return;

                const room = get_room(data.server);

                // evict stale connection for same user
                if (room.users.has(data.user) && room.users.get(data.user) !== socket) {
                    const stale = room.users.get(data.user)!;
                    room.clients.delete(stale);
                    room.users.delete(data.user);
                    try { stale.close(); } catch (_) {}
                }

                server_id = data.server;
                username = data.user;

                room.clients.add(socket);
                room.users.set(username, socket);

                const isRejoin = data.type === "rejoin" || room.seen.has(username);
                room.seen.add(username);

                broadcast(room, {
                    system: true,
                    text: username + (isRejoin ? " rejoined" : " joined")
                });

                // send history to new user
                room.history.forEach(m => {
                    if (socket.readyState === 1) socket.send(JSON.stringify(m));
                });

            } else if (data.type === "leave") {
                if (!server_id) return;
                const room = rooms.get(server_id);
                if (!room) return;

                room.clients.delete(socket);
                if (username) room.users.delete(username);

                broadcast(room, { system: true, text: (username || "someone") + " left" });
                cleanup_room(server_id);

            } else if (data.type === "message") {
                if (typeof data.text !== "string" || typeof data.user !== "string") return;
                if (data.text.length === 0 || data.text.length > 200) return;
                if (!server_id) return;

                const now = Date.now();
                if (now - last_msg_time < 500) return; // rate limit
                last_msg_time = now;

                const room = rooms.get(server_id);
                if (!room) return;

                const payload = { user: data.user, text: data.text };
                room.history.push(payload);
                if (room.history.length > 10) room.history.shift();

                broadcast(room, payload);

            } else if (data.type === "pm") {
                if (!server_id) return;
                if (typeof data.to !== "string" || typeof data.text !== "string") return;

                const room = rooms.get(server_id);
                if (!room) return;

                const target = room.users.get(data.to);
                if (!target) return;

                const payload = { type: "pm", from: username, to: data.to, text: data.text };
                if (target.readyState === 1) target.send(JSON.stringify(payload));
                if (socket.readyState === 1) socket.send(JSON.stringify(payload));

            } else if (data.type === "typing") {
                if (!server_id) return;
                const room = rooms.get(server_id);
                if (!room) return;

                room.clients.forEach(client => {
                    if (client !== socket && client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: "typing",
                            user: data.user,
                            state: data.state
                        }));
                    }
                });

            } else if (data.type === "ping") {
                if (socket.readyState === 1) {
                    socket.send(JSON.stringify({ type: "pong" }));
                }
            }
        };

        socket.onclose = () => {
            if (!server_id) return;
            const room = rooms.get(server_id);
            if (!room) return;

            room.clients.delete(socket);
            if (username) room.users.delete(username);

            broadcast(room, { system: true, text: (username || "someone") + " disconnected" });
            cleanup_room(server_id);
        };

        return response;
    }
    return new Response("WebSocket server running");
});
