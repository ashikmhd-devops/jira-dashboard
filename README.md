# Jira Kanban Dashboard

> A powerful, self-hosted Jira dashboard with real-time flow metrics, lead time analytics, and AI-driven insights.

[![Built with Node.js](https://img.shields.io/badge/Node.js-v18+-43853d?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Jira API v3](https://img.shields.io/badge/Jira%20API-v3-0052CC?style=for-the-badge&logo=jira)](https://developer.atlassian.com/cloud/jira/rest/v3/)

---

## ✨ Features at a Glance

- 📊 **Live Kanban Board** — Visualize tickets across swimlanes in real-time
- 📈 **KPI Dashboard** — Track open, in-progress, blocked, and completed tickets  
- ⏱️ **Lead Time Analytics** — Percentile distribution (P50/P75/P90) with trend charts
- 📉 **Flow Diagrams** — Cumulative Flow Diagram (CFD) to spot bottlenecks
- 🎯 **Smart Filtering** — Filter by status, priority, or click KPI cards to drill down
- 💡 **AI Insights** — Rule-based bottleneck detection, WIP warnings, throughput trends
- 📋 **Activity Tables** — See tickets updated in the last 24h and stale work
- 🚀 **Zero Configuration** — Drop-in deployment with minimal setup

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ ([download](https://nodejs.org/))
- Jira Cloud account with API token access

### Step 1: Get Your Jira API Token

1. Visit: **https://id.atlassian.com/manage-profile/security/api-tokens**
2. Click **Create API token**
3. Copy the token (you'll need it in 60 seconds)

### Step 2: Configure the Dashboard

Edit `config.js` with your Jira credentials:

```javascript
var CONFIG = {
  domain:           "yourcompany.atlassian.net",
  email:            "you@yourcompany.com",
  apiToken:         "paste_token_here",
  projectKeys:      "PROJ1,PROJ2",
  
  // Kanban board columns (customize to match your workflow)
  columns:          ["Backlog", "To Do", "In Progress", "In Review", "Done"],
  
  // Optional: Customize thresholds
  wipLimit:         5,                // WIP limit for In Progress
  doneLookbackDays: 60,               // How many days of completed tickets to load
  autoRefreshMinutes: 0,              // Auto-refresh interval (0 = disabled)
};
```

### Step 3: Configure the Proxy

The dashboard requires a CORS proxy to securely communicate with Jira. Edit `proxy.js`:

```javascript
const DOMAIN     = "yourcompany.atlassian.net";
const EMAIL      = "you@yourcompany.com";
const API_TOKEN  = "paste_same_token_here";
```

### Step 4: Install & Start

```bash
# Install dependencies
npm install

# Start the proxy server (runs on port 3001)
npm start
```

### Step 5: Open Dashboard

Visit: **http://localhost:3001**

---

## 📂 Project Structure

```
jira-dashboard/
├── index.html          Main dashboard UI (the complete app)
├── config.js           Your credentials & board settings
├── api.js              Jira REST API fetch layer with auth forwarding
├── metrics.js          Flow calculations & insights engine
├── proxy.js            Local CORS proxy (Node.js/Express)
├── package.json        Dependencies
├── README.md           This file
└── .gitignore          Git ignore rules
```

---

## ⚙️ Configuration Reference

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `domain` | string | Your Atlassian Cloud domain | `required` |
| `email` | string | Jira user email | `required` |
| `apiToken` | string | API token from step 1 | `required` |
| `projectKeys` | string | Comma-separated project keys (e.g., `"ENG,OPS"`) | `required` |
| `columns` | array | Kanban column names in workflow order | `["Backlog", "To Do", "In Progress", "In Review", "Done"]` |
| `doneColumn` | string | Name of your "Done" column | `"Done"` |
| `inProgressColumn` | string | Name of your "In Progress" column | `"In Progress"` |
| `blockedLabel` | string | Jira label used to mark blocked tickets | `"blocked"` |
| `wipLimit` | number | WIP threshold for warnings (0 = off) | `5` |
| `autoRefreshMinutes` | number | Auto-refresh interval in minutes (0 = off) | `0` |

---

## 🔒 Security & Architecture

### Why a Proxy?
Jira blocks direct browser requests (CORS). The local `proxy.js` server:
- Acts as a secure intermediary
- Forwards your authentication headers
- **Never stores or logs credentials**
- Runs entirely on localhost (no external requests)

### Authentication Flow
```
Browser → Proxy (localhost:3001) → Jira API (HTTPS) → Proxy → Browser
```

Your API token is only stored in `config.js` and `proxy.js` — **never sent to third parties**.

---

## 📊 Dashboard Sections

### KPI Cards
Four primary metrics at a glance:
- **Total Open** — All unfinished tickets
- **In Progress** — Actively being worked
- **Blocked** — Stalled by blockers
- **Done This Month** — Completed tickets

Click any card to filter the table by that category.

### Kanban Board
Visual swimlane view of tickets across your workflow columns. Shows:
- Ticket count per column
- Color-coded priorities (Critical, High, Medium, Low)
- Quick assignee information

### Charts & Insights
- **Throughput** — Tickets completed per week
- **Cycle Time** — Average days from created to done
- **Priority Breakdown** — Distribution across severity levels
- **Lead Time Percentiles** — P50, P75, P90 completion times
- **CFD Chart** — Cumulative flow over 10 weeks

### Smart Filtering
- Filter by status, priority, or custom criteria
- Drill down from KPI cards for focused views
- Activity tables show recent changes

---

## 🛠️ Troubleshooting

### ❌ "Could not load data"

**Connection timeout?**
```bash
# Ensure proxy is running
npm start

# Check port 3001 is available
lsof -i :3001
```

**Authentication failed?**
```
✓ Double-check email in config.js
✓ Verify API token is not expired (recreate if needed)
✓ Ensure token has Jira read permissions
```

**Dashboard shows old data?**
```bash
# Hard refresh in browser: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
# Or restart the proxy: npm start
```

---

## 💡 Tips & Best Practices

1. **Use a project alias** for shorter `projectKeys` if they're long
2. **Adjust `doneLookbackDays`** based on your team's velocity (higher = slower to load)
3. **Enable `autoRefreshMinutes`** for real-time monitoring (e.g., `5` for 5-minute refresh)
4. **Customize `columns`** to exactly match your Jira workflow for accurate metrics
5. **Use `blockedLabel`** consistently to track impediments

---

## 📝 Example Configurations

### Agile Team (Scrum)
```javascript
columns: ["Product Backlog", "Sprint Backlog", "In Progress", "Review", "Done"],
wipLimit: 8,
blockedLabel: "blocked",
doneLookbackDays: 90
```

### SRE/Ops Team
```javascript
columns: ["Backlog", "Ready", "Working", "Testing", "Deployed"],
wipLimit: 3,
blockedLabel: "incident",
autoRefreshMinutes: 5  // Real-time mode
```

### Kanban Flow
```javascript
columns: ["Backlog", "In Progress", "Done"],
wipLimit: 10,
blockedLabel: "blocked",
autoRefreshMinutes: 0
```

---

## 🤝 Contributing

Found a bug? Have an idea? Feel free to:
1. Open an issue
2. Submit a pull request
3. Share feedback

