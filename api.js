// ─────────────────────────────────────────────
//  JIRA API — fetch layer
//  Tries direct first, falls back to proxy.js
// ─────────────────────────────────────────────

const API = (() => {
  const auth = () => btoa(`${CONFIG.email}:${CONFIG.apiToken}`);
  const base = () => `https://${CONFIG.domain}/rest/api/3`;
  const proxyBase = "http://localhost:3001/jira";
  const authHeaders = () => ({
    Authorization: `Basic ${auth()}`,
    Accept: "application/json",
  });

  let useProxy = false;

  async function request(jql, fields = [], maxResults = 100, nextPageToken = "") {
    const params = new URLSearchParams({
      jql,
      maxResults,
    });
    if (fields.length > 0) params.set("fields", fields.join(","));
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    // Try direct first
    if (!useProxy) {
      try {
        const res = await fetch(`${base()}/search/jql?${params}`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        if (res.ok) return data;
        if (res.status === 401) throw new Error("AUTH_FAILED");
        if (data.errorMessages && data.errorMessages.length > 0) throw new Error(data.errorMessages[0]);
        throw new Error("Direct Jira request failed");
      } catch (e) {
        if (e.message === "AUTH_FAILED") throw e;
        // Connection error (ECONNRESET, timeout, etc) - fall back to proxy
        if (e.message && (e.message.includes("ECONNRESET") || e.message.includes("ETIMEDOUT") || e.message.includes("Failed to fetch"))) {
          useProxy = true;
        } else {
          // Other errors - also try proxy
          useProxy = true;
        }
      }
    }

    // Proxy fallback
    const proxyParams = new URLSearchParams({ jql, maxResults });
    if (fields.length > 0) proxyParams.set("fields", fields.join(","));
    if (nextPageToken) proxyParams.set("nextPageToken", nextPageToken);
    try {
      const proxyRes = await fetch(`${proxyBase}?${proxyParams}`, { headers: authHeaders() });
      const data = await proxyRes.json();
      if (!proxyRes.ok && !data.error) {
        throw new Error(`Proxy request failed (${proxyRes.status})`);
      }
      if (data.errorMessages && data.errorMessages.length > 0) throw new Error(data.errorMessages[0]);
      if (data.error) {
        if (data.error.includes("ECONNRESET") || data.error.includes("ETIMEDOUT")) {
          throw new Error("Connection timeout to Jira. Check your network connection or try again.");
        }
        throw new Error(data.error);
      }
      return data;
    } catch (e) {
      if (e.message.includes("ECONNRESET") || e.message.includes("ETIMEDOUT")) {
        throw new Error("Connection timeout to Jira. Check your network connection or try again.");
      }
      throw e;
    }
  }

  async function fetchAll(jql, fields) {
    let all = [];
    let nextPageToken = "";
    const pageSize = 100;

    while (true) {
      const data = await request(jql, fields, pageSize, nextPageToken);
      all = all.concat(data.issues || []);
      if ((data.issues || []).length === 0) break;
      if (data.nextPageToken) {
        nextPageToken = data.nextPageToken;
        continue;
      }
      if (typeof data.total === "number" && all.length < data.total) {
        throw new Error("Jira pagination response missing nextPageToken");
      }
      break;
    }
    return all;
  }

  function filterMine(issues, me) {
    const myAccountId = me?.accountId;
    if (!myAccountId) return issues;
    return issues.filter((issue) => issue.fields?.assignee?.accountId === myAccountId);
  }


  async function getOpenTickets() {
    const me = await getCurrentUser();
    const keys = CONFIG.projectKeys.split(",").map((k) => k.trim());
    const projectJQL = keys.map((k) => `project = "${k}"`).join(" OR ");
    const jql = `assignee = currentUser() AND issuetype != Epic AND statusCategory != Done AND (${projectJQL}) ORDER BY updated DESC`;
    const issues = await fetchAll(jql, [
      "summary", "status", "priority", "issuetype",
      "created", "updated", "labels", "assignee",
      "comment", "duedate", "fixVersions",
    ]);
    return filterMine(issues, me);
  }

  async function getDoneTickets() {
    const me = await getCurrentUser();
    const keys = CONFIG.projectKeys.split(",").map((k) => k.trim());
    const projectJQL = keys.map((k) => `project = "${k}"`).join(" OR ");
    
    // Fetch done tickets using absolute date ranges to avoid large lookback timeouts
    // Query 1: Current year (Jan 1 of current year to now) - small window
    const now = new Date();
    const currentYearStart = new Date(now.getFullYear(), 0, 1);
    const currentYearISO = currentYearStart.toISOString().split('T')[0];
    
    const jqlCurrent = `assignee = currentUser() AND issuetype != Epic AND statusCategory = Done AND resolutiondate >= ${currentYearISO} AND (${projectJQL}) ORDER BY resolutiondate DESC`;
    const currentIssues = await fetchAll(jqlCurrent, [
      "summary", "status", "priority", "issuetype",
      "created", "updated", "resolutiondate", "labels", "assignee",
    ]);
    
    // Query 2: Last year (Jan 1 to Dec 31 of previous year) - covers full prior year
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
    const lastYearStartISO = lastYearStart.toISOString().split('T')[0];
    const lastYearEndISO = lastYearEnd.toISOString().split('T')[0];
    
    const jqlLastYear = `assignee = currentUser() AND issuetype != Epic AND statusCategory = Done AND resolutiondate >= ${lastYearStartISO} AND resolutiondate <= ${lastYearEndISO} AND (${projectJQL}) ORDER BY resolutiondate DESC`;
    const lastYearIssues = await fetchAll(jqlLastYear, [
      "summary", "status", "priority", "issuetype",
      "created", "updated", "resolutiondate", "labels", "assignee",
    ]);
    
    // Combine both sets
    const all = [...currentIssues, ...lastYearIssues];
    return filterMine(all, me);
  }

  async function getCurrentUser() {
    if (!useProxy) {
      try {
        const res = await fetch(`${base()}/myself`, { headers: authHeaders() });
        if (res.ok) return await res.json();
        if (res.status === 401) throw new Error("AUTH_FAILED");
      } catch (e) {
        if (e.message === "AUTH_FAILED") throw e;
        useProxy = true;
      }
    }

    const proxyRes = await fetch(`${proxyBase}/myself`, { headers: authHeaders() });
    const data = await proxyRes.json();
    if (!proxyRes.ok && !data.error) throw new Error(`Proxy request failed (${proxyRes.status})`);
    if (data.errorMessages && data.errorMessages.length > 0) throw new Error(data.errorMessages[0]);
    if (data.error) throw new Error(data.error);
    return data;
  }

  return { getOpenTickets, getDoneTickets, getCurrentUser };
})();
