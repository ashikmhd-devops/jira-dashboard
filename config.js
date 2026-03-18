// ─────────────────────────────────────────────
//  JIRA KANBAN DASHBOARD — CONFIGURATION
//  Fill in the values below and you're good to go
// ─────────────────────────────────────────────

var CONFIG = {
  domain: "<YOUR_DOMAIN>.atlassian.net",
  email: "<YOUR_EMAIL>",
  apiToken: "<YOUR_API_TOKEN>",
  projectKeys: "<YOUR_PROJECT_KEYS>", // comma-separated list of project keys, e.g. "PROJ1,PROJ2"
  columns: ["Backlog", "To Do", "In Progress", "In Review", "Done"],
  doneColumn: "Done",
  inProgressColumn: "In Progress",
  blockedLabel: "blocked",
  wipLimit: 5,
  doneLookbackDays: 60,
  autoRefreshMinutes: 0
};
