const http = require("http");
const WebSocket = require("ws");

module.exports = () => {
  const server = http.createServer((req,res)=>{
    res.end("backend ok");
  });

  const wss = new WebSocket.Server({ server });

  wss.on("connection", ws => {
    ws.on("message", msg => {
      wss.clients.forEach(c=>{
        if(c.readyState===1) c.send(msg);
      });
    });
  });

  server.listen(3000, "0.0.0.0", ()=>{
    console.log("SERVER CORE RUNNING");
  });
};
const startServer = require("./server");
startServer();