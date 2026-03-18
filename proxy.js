const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

// ── PASTE YOUR CREDENTIALS HERE ──
const DOMAIN    = "<YOUR_DOMAIN>.atlassian.net";
const EMAIL     = "<YOUR_EMAIL>";
const API_TOKEN = "<YOUR_API_TOKEN>";
// ─────────────────────────────────

const app  = express();
const PORT = 3001;
const AUTH = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64");

app.use(express.static(path.join(__dirname)));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

function getAuthHeader(req) {
  const incoming = req.header("Authorization");
  if (incoming && incoming.startsWith("Basic ")) return incoming;
  return `Basic ${AUTH}`;
}

app.get("/jira", async (req, res) => {
  try {
    const { jql, fields, maxResults = 100, nextPageToken = "" } = req.query;

    if (!jql) return res.status(400).json({ error: "jql required" });

    const params = new URLSearchParams({
      jql: String(jql),
      maxResults: String(maxResults),
    });
    if (fields) params.set("fields", String(fields));
    if (nextPageToken) params.set("nextPageToken", String(nextPageToken));
    const url = `https://${DOMAIN}/rest/api/3/search/jql?${params}`;

    console.log("-> GET", url.substring(0, 120));

    const upstream = await fetch(url, {
      headers: {
        Authorization: getAuthHeader(req),
        Accept: "application/json",
      },
    });

    const text = await upstream.text();
    console.log("<-", upstream.status, text.substring(0, 200));

    res.status(upstream.status).set("Content-Type", "application/json").send(text);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/jira/myself", async (req, res) => {
  try {
    const url = `https://${DOMAIN}/rest/api/3/myself`;
    console.log("-> GET", url);

    const upstream = await fetch(url, {
      headers: {
        Authorization: getAuthHeader(req),
        Accept: "application/json",
      },
    });

    const text = await upstream.text();
    console.log("<-", upstream.status, text.substring(0, 200));

    res.status(upstream.status).set("Content-Type", "application/json").send(text);
  } catch (err) {
    console.error("Proxy /myself error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", domain: DOMAIN });
});

app.listen(PORT, () => {
  console.log("\n  Dashboard  ->  http://localhost:" + PORT);
  console.log("  Domain     ->  " + DOMAIN + "\n");
});
