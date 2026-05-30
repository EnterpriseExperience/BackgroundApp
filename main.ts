const clients = new Set<WebSocket>();

Deno.serve((req) => {
    if (req.headers.get("upgrade") === "websocket") {
        const { socket, response } = Deno.upgradeWebSocket(req);
        
        socket.onopen = () => clients.add(socket);
        socket.onclose = () => clients.delete(socket);
        socket.onmessage = (e) => {
            for (const client of clients) {
                if (client.readyState === 1) {
                    client.send(e.data);
                }
            }
        };
        return response;
    }
    return new Response("WebSocket server running");
});
