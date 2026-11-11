/**
 * Starter files for the Stage 2 milestone, handed out by the practice API at
 * /starter/<name>, the way a team would hand a new developer a repository. Learners
 * download them with curl into their practice folder, finish one function, and run them.
 */

export const ORDERS_STARTER = `// The orders service. It accepts new orders, and tells the board service about each one.
const http = require("http");

const PORT = 4396;
const BOARD_EVENTS = "http://localhost:4397/events";
let nextId = 1;

// Tell the board service that something happened. Called once for every new order.
async function notifyBoard(order) {
  // TODO: send a POST request to BOARD_EVENTS with fetch().
  //   The body is JSON: JSON.stringify({ type: "order.created", order: order })
  //   Send the header "Content-Type": "application/json".
  //   If the board is down, catch the error and console.log it, so taking orders still works.
}

http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/orders") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      const form = new URLSearchParams(body); // reads item=...&customer=...
      const order = { id: nextId, item: form.get("item"), customer: form.get("customer") };
      nextId += 1;
      await notifyBoard(order);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(order));
      console.log("Created order", order.id);
    });
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Try POST /orders");
  }
}).listen(PORT, "127.0.0.1", () => console.log(\`Orders service on http://localhost:\${PORT}\`));
`;

/** The finished notifyBoard, used by the end-to-end test in place of a learner. */
export const ORDERS_NOTIFY_SOLUTION = `async function notifyBoard(order) {
  try {
    await fetch(BOARD_EVENTS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "order.created", order: order }),
    });
  } catch (error) {
    console.log("Couldn't reach the board:", error.message);
  }
}`;

export const BOARD_STARTER = `// The board service. It shows a live list of orders in the browser.
const http = require("http");
const fs = require("fs");

const PORT = 4397;
const watchers = []; // open connections to browsers, waiting for news

const page = \`<!doctype html>
<meta charset="utf-8">
<title>Order board</title>
<h1>Live orders</h1>
<p id="status">Connecting...</p>
<ul id="orders"></ul>
<script>
  const events = new EventSource("/stream");
  events.onopen = () => {
    document.getElementById("status").textContent = "Live: new orders appear here by themselves.";
  };
  events.onmessage = (message) => {
    const order = JSON.parse(message.data).order;
    const item = document.createElement("li");
    item.textContent = "#" + order.id + ": " + order.item + " for " + order.customer;
    document.getElementById("orders").prepend(item);
  };
</script>\`;

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(page);
  } else if (req.method === "GET" && req.url === "/stream") {
    // Server-Sent Events: keep this response open, and write to it whenever there's news.
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(": connected\\n\\n");
    watchers.push(res);
    fs.appendFileSync("stream-log.txt", "browser connected " + new Date().toISOString() + "\\n");
    req.on("close", () => watchers.splice(watchers.indexOf(res), 1));
  } else if (req.method === "POST" && req.url === "/events") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      fs.appendFileSync("board-log.txt", body + "\\n");
      for (const watcher of watchers) {
        watcher.write("data: " + body + "\\n\\n");
      }
      res.writeHead(204);
      res.end();
      console.log("Event received, and sent to", watchers.length, "browser(s)");
    });
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(\`Board service on http://localhost:\${PORT}\`));
`;

export const STARTERS: Record<string, string> = {
  'orders.js': ORDERS_STARTER,
  'board.js': BOARD_STARTER,
};
