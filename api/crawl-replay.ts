import { createServer } from "node:http";
import { WebSocket, WebSocketServer, type ServerOptions } from "ws";
import capturedSamples from "../src/data/live-sample.json" with { type: "json" };

export const crawlReplayPath = "/api/crawl-replay";

const intervalMs = 250;
const durationMs = 30_000;

export function createCrawlReplaySocketServer(options: ServerOptions) {
  const socketOptions = {
    ...options,
    maxPayload: 1,
    closeTimeout: 1_000,
  };
  const sockets = new WebSocketServer(socketOptions);
  sockets.on("headers", (headers) => {
    headers.push("Cache-Control: private, no-store");
  });
  sockets.on("connection", (socket, request) => {
    const site = new URLSearchParams(request.url?.split("?", 2)[1]).get("site");
    const samples = site === "rbccm" || site === "rbcits" ? Object.entries(capturedSamples[site]) : [];

    socket.on("error", () => socket.terminate());
    socket.send(JSON.stringify({ type: "ready", transport: "websocket", intervalMs, durationMs }));

    let sequence = 0;
    const ticker = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        const observation = samples[sequence];
        sequence += 1;
        const sample = observation && {
          id: Number(observation[0]),
          status: observation[1].status,
          responseMs: observation[1].responseMs,
          htmlBytes: observation[1].htmlBytes,
          staticFindingCount: observation[1].staticFindingCount,
        };
        socket.send(JSON.stringify({ type: "tick", sequence, sample }));
      }
    }, intervalMs);
    const deadline = setTimeout(() => {
      clearInterval(ticker);
      socket.close(1000, "Replay window ended");
    }, durationMs);
    socket.on("close", () => {
      clearInterval(ticker);
      clearTimeout(deadline);
    });
  });
  return sockets;
}

const server = createServer((_request, response) => {
  response.writeHead(426, {
    Upgrade: "websocket",
    "Cache-Control": "private, no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end("WebSocket upgrade required");
});

createCrawlReplaySocketServer({ server });

export default server;
