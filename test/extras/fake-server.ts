// A local stand-in for a model provider's HTTP API, so tests never reach the network or need a key.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeServer {
  url: string;
  requests: Array<{ method: string; path: string; body: unknown }>;
  close(): Promise<void>;
}

export async function fakeServer(reply: (path: string, body: unknown) => unknown): Promise<FakeServer> {
  const requests: FakeServer["requests"] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = raw === "" ? null : JSON.parse(raw);
      const path = req.url ?? "";
      requests.push({ method: req.method ?? "", path, body });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(reply(path, body)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
