const http = require("http");
const https = require("https");

const PORT = 3001;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Target-URL");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "POST only. Send X-Target-URL header." }));
    return;
  }

  const targetUrl = req.headers["x-target-url"];
  if (!targetUrl) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing X-Target-URL header" }));
    return;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid target URL" }));
    return;
  }

  console.log(`[PROXY] ${new Date().toISOString()} → ${targetUrl}`);

  const proxyReq = https.request(
    parsed,
    {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.linkedin.com/jobs/search/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        Connection: "keep-alive",
      },
    },
    (proxyRes) => {
      console.log(
        `[PROXY] ← ${proxyRes.statusCode} (${proxyRes.headers["content-length"] || "?"} bytes)`
      );
      const headers = { "Content-Type": proxyRes.headers["content-type"] || "text/html" };
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    console.error(`[PROXY] ERROR: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  proxyReq.setTimeout(15000, () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Timeout" }));
    }
  });

  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`\n🔗 LinkedIn proxy running on http://localhost:${PORT}`);
  console.log(`\nTo expose to internet, run in another terminal:`);
  console.log(`  cloudflared tunnel --url http://localhost:${PORT}`);
  console.log(`\nThen add the public URL to your .env.local:`);
  console.log(`  LINKEDIN_PROXY_URL=https://xxxx.trycloudflare.com\n`);
});
