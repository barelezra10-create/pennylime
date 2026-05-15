import http from "node:http";
import { WebSocketServer } from "ws";
import { handleConnection } from "./relay";

const PORT = Number(process.env.PORT || 8080);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("pennylime-voice ok");
});

const wss = new WebSocketServer({ server, path: "/relay" });
wss.on("connection", (ws) => {
  console.log(JSON.stringify({ event: "ws_connect", at: Date.now() }));
  handleConnection(ws as unknown as import("ws").WebSocket).catch((err) =>
    console.error(JSON.stringify({ event: "ws_error", message: String(err) }))
  );
  ws.on("close", () => console.log(JSON.stringify({ event: "ws_close", at: Date.now() })));
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ event: "voice_started", port: PORT }));
});
