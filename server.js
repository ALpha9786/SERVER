const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const WebSocket = require("ws");

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const PAGE_DIR = path.join(PUBLIC_DIR, "page");
const STORAGE_DIR = path.join(PUBLIC_DIR, "storage");

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(PAGE_DIR)) fs.mkdirSync(PAGE_DIR, { recursive: true });

const users = {};

// ===== LAN IP =====
function getLANIP() {
  const nets = os.networkInterfaces();
  for (const n of Object.values(nets)) {
    for (const i of n) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "0.0.0.0";
}

// ===== HTTP SERVER =====
const server = http.createServer((req, res) => {

  // ---------- API : PAGES ----------
  if (req.url === "/api/pages") {
    const pages = fs.existsSync(PAGE_DIR)
      ? fs.readdirSync(PAGE_DIR).filter(f => f.endsWith(".html"))
      : [];

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(pages));
  }

  // ---------- API : STORAGE LIST ----------
  if (req.url === "/api/storage") {
    const files = fs.readdirSync(STORAGE_DIR).map(name => {
      const stat = fs.statSync(path.join(STORAGE_DIR, name));
      return {
        name,
        size: stat.size
      };
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(files));
  }

  // ---------- STORAGE FILE ----------
  if (req.url.startsWith("/storage/")) {
    const rel = req.url.replace("/storage/", "");
    const filePath = path.join(STORAGE_DIR, rel);

    if (filePath.startsWith(STORAGE_DIR) && fs.existsSync(filePath)) {
      res.writeHead(200);
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404);
    return res.end("file not found");
  }

  // ---------- STATIC FILE ----------
  let filePath = req.url === "/"
    ? path.join(PUBLIC_DIR, "index.html")
    : path.join(PUBLIC_DIR, req.url);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("forbidden");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end("404");
  }

  const ext = path.extname(filePath);
  const mime = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
  fs.createReadStream(filePath).pipe(res);
});

// ===== WEBSOCKET =====
const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {

  ws.on("message", msg => {
    if (msg.toString() === "ping") return;

    try {
      const d = JSON.parse(msg);

      // LOGIN
      if (d.type === "login") {
        if (users[d.username]) {
          ws.send(JSON.stringify({ type: "error", msg: "name used" }));
          return;
        }
        ws.username = d.username;
        users[d.username] = ws;
        broadcastUsers();
      }

      // CHAT
      if (d.type === "chat" && users[d.to]) {
        users[d.to].send(JSON.stringify({
          type: "chat",
          from: ws.username,
          msg: d.msg
        }));
      }
    } catch {}
  });

  ws.on("close", () => {
    if (ws.username) {
      delete users[ws.username];
      broadcastUsers();
    }
  });
});

function broadcastUsers() {
  const list = Object.keys(users);
  Object.values(users).forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "users", users: list }));
    }
  });
}

// ===== LIVE RELOAD =====
fs.watch(PUBLIC_DIR, { recursive: true }, () => {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send("reload");
    }
  });
});

function getAllNetworkInfo() {
  const nets = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      results.push({
        interface: name,
        family: net.family,      // IPv4 / IPv6
        address: net.address,
        internal: net.internal   // true = localhost
      });
    }
  }
  return results;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("SERVER RUNNING");
  console.log("");

  console.log("LOCAL:");
  console.log("  - http://localhost:" + PORT);
  console.log("  - http://127.0.0.1:" + PORT);
  console.log("  - http://[::1]:" + PORT);
  console.log("");

  console.log("NETWORK INTERFACES:");

  const infos = getAllNetworkInfo();
  infos.forEach(net => {
    const type =
      net.internal ? "LOCALHOST" :
      net.family === "IPv4" ? "LAN IPv4" :
      "LAN IPv6";

    const url =
      net.family === "IPv6"
        ? `http://[${net.address}]:${PORT}`
        : `http://${net.address}:${PORT}`;

    console.log(
      `- ${net.interface} | ${type} | ${net.family}\n  ${url}`
    );
  });

  console.log("=================================");
});

