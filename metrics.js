// ─────────────────────────────────────────────
//  METRICS — Kanban flow calculations
// ─────────────────────────────────────────────

const Metrics = (() => {
  const msToDay = (ms) => Math.round(ms / (1000 * 60 * 60 * 24));
  const now = () => new Date();

  function ageInDays(dateStr) {
    return msToDay(now() - new Date(dateStr));
  }

  function isBlocked(issue) {
    const labels = issue.fields.labels || [];
    if (CONFIG.blockedLabel && labels.includes(CONFIG.blockedLabel)) return true;
    const statusName = (issue.fields.status?.name || "").toLowerCase();
    return statusName.includes("block");
  }

  function getColumn(issue) {
    const raw = issue.fields.status?.name || "Unknown";
    const normalized = String(raw).toLowerCase().trim();

    // Prefer exact configured column match (case-insensitive).
    const exact = CONFIG.columns.find((c) => c.toLowerCase() === normalized);
    if (exact) return exact;

    // Map common Jira variants into configured board columns.
    if (normalized.includes("review")) {
      const reviewCol = CONFIG.columns.find((c) => c.toLowerCase().includes("review"));
      return reviewCol || "In Review";
    }
    if (normalized.includes("progress") || normalized === "doing") {
      return CONFIG.inProgressColumn || raw;
    }
    if (normalized.includes("done") || normalized.includes("complete") || normalized === "closed") {
      return CONFIG.doneColumn || raw;
    }
    if (
      normalized.includes("backlog") ||
      normalized.includes("selected") ||
      normalized.includes("groom") ||
      normalized.includes("refin") ||
      normalized.includes("ready")
    ) {
      const backlogCol = CONFIG.columns.find((c) => c.toLowerCase().includes("backlog"));
      return backlogCol || raw;
    }
    if (normalized.includes("to do") || normalized === "todo" || normalized === "open") {
      const todoCol = CONFIG.columns.find((c) => {
        const v = c.toLowerCase();
        return v.includes("to do") || v === "todo";
      });
      return todoCol || raw;
    }

    return raw;
  }

  function getPriority(issue) {
    const raw = issue.fields.priority?.name || "Medium";
    const normalized = String(raw).toLowerCase().trim();

    if (/^1\s*[-:]?\s*critical$/.test(normalized) || normalized === "critical") return "Critical";
    if (/^2\s*[-:]?\s*high$/.test(normalized) || normalized === "high") return "High";
    if (/^3\s*[-:]?\s*medium$/.test(normalized) || normalized === "medium") return "Medium";
    if (/^4\s*[-:]?\s*low$/.test(normalized) || normalized === "low") return "Low";

    // Fallbacks for alternate Jira schemes.
    if (normalized.includes("critical") || normalized.includes("highest")) return "Critical";
    if (normalized.includes("high")) return "High";
    if (normalized.includes("medium") || normalized.includes("normal")) return "Medium";
    if (normalized.includes("low") || normalized.includes("lowest")) return "Low";

    return "Medium";
  }

  function getType(issue) {
    return issue.fields.issuetype?.name || "Task";
  }

  function getDoneDate(issue) {
    // Resolution date is the canonical completion timestamp in Jira.
    const raw = issue.fields.resolutiondate;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  // KPI summary
  function kpis(open, done) {
    const inProgress = open.filter((i) => getColumn(i) === CONFIG.inProgressColumn);
    const blocked = open.filter(isBlocked);
    const doneThisMonth = done.filter((i) => {
      const d = getDoneDate(i);
      if (!d) return false;
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const prevMonthDone = done.filter((i) => {
      const d = getDoneDate(i);
      if (!d) return false;
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1);
      return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
    });
    const doneThisYear = done.filter((i) => {
      const d = getDoneDate(i);
      if (!d) return false;
      return d.getFullYear() === new Date().getFullYear();
    });
    const donePrevYear = done.filter((i) => {
      const d = getDoneDate(i);
      if (!d) return false;
      return d.getFullYear() === (new Date().getFullYear() - 1);
    });

    return {
      totalOpen: open.length,
      inProgress: inProgress.length,
      blocked: blocked.length,
      doneThisMonth: doneThisMonth.length,
      donePrevMonth: prevMonthDone.length,
      doneThisYear: doneThisYear.length,
      donePrevYear: donePrevYear.length,
      wipOverLimit: CONFIG.wipLimit > 0 && inProgress.length > CONFIG.wipLimit,
    };
  }

  // Columns → ticket grouping
  function byColumn(open, done = []) {
    const map = {};
    CONFIG.columns.forEach((c) => (map[c] = []));
    const all = [...open, ...done];
    all.forEach((i) => {
      const col = getColumn(i);
      if (!map[col]) map[col] = [];
      map[col].push({
        id: i.key,
        title: i.fields.summary,
        priority: getPriority(i),
        type: getType(i),
        age: ageInDays(i.fields.updated),
        created: i.fields.created,
        duedate: i.fields.duedate,
        blocked: isBlocked(i),
        labels: i.fields.labels || [],
      });
    });
    // Sort each column by age desc (oldest first = most at risk)
    Object.keys(map).forEach((col) => {
      map[col].sort((a, b) => b.age - a.age);
    });
    return map;
  }

  // Aging WIP — all open tickets sorted by age
  function agingWip(open) {
    return open
      .map((i) => ({
        id: i.key,
        title: i.fields.summary,
        column: getColumn(i),
        age: ageInDays(i.fields.updated),
        priority: getPriority(i),
        blocked: isBlocked(i),
      }))
      .filter((t) => t.column !== CONFIG.doneColumn)
      .sort((a, b) => b.age - a.age)
      .slice(0, 12);
  }

  // Weekly throughput (last 8 weeks)
  function weeklyThroughput(done) {
    const weeks = [];
    const buckets = {};
    for (let i = 7; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      d.setDate(d.getDate() - d.getDay()); // Monday
      const key = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      weeks.push(key);
      buckets[key] = 0;
    }
    done.forEach((i) => {
      const doneDate = getDoneDate(i);
      if (!doneDate) return;
      const d = new Date(doneDate);
      d.setDate(d.getDate() - d.getDay());
      const key = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      if (key in buckets) buckets[key]++;
    });
    return { labels: weeks, data: weeks.map((w) => buckets[w]) };
  }

  // Average cycle time per week (last 5 weeks)
  function cycleTrend(done) {
    const weeks = [];
    const buckets = {};
    for (let i = 4; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      d.setDate(d.getDate() - d.getDay());
      const key = i === 0 ? "This wk" : i === 1 ? "Last wk" : `${i}w ago`;
      weeks.push({ key, date: new Date(d) });
      buckets[key] = [];
    }
    done.forEach((i) => {
      const created = new Date(i.fields.created);
      const resolved = getDoneDate(i);
      if (!resolved) return;
      const cycleMs = resolved - created;
      if (cycleMs < 0) return;
      const cycleDays = msToDay(cycleMs);

      // Find which week bucket
      for (let w = 0; w < weeks.length - 1; w++) {
        if (resolved >= weeks[w].date && resolved < weeks[w + 1].date) {
          buckets[weeks[w].key].push(cycleDays);
          break;
        }
      }
      const lastWeek = weeks[weeks.length - 1];
      if (resolved >= lastWeek.date) buckets[lastWeek.key].push(cycleDays);
    });

    const labels = weeks.map((w) => w.key);
    const data = labels.map((l) => {
      const arr = buckets[l];
      if (!arr.length) return null;
      return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    });
    return { labels, data };
  }

  function leadTimeDistribution(done) {
    const leadDays = done
      .map((i) => {
        const created = new Date(i.fields.created);
        const resolved = getDoneDate(i);
        if (!resolved) return null;
        const cycleMs = resolved - created;
        if (cycleMs < 0) return null;
        return msToDay(cycleMs);
      })
      .filter((v) => v !== null)
      .sort((a, b) => a - b);

    const percentile = (arr, p) => {
      if (!arr.length) return null;
      const idx = (p / 100) * (arr.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return arr[lo];
      return Math.round(arr[lo] + (arr[hi] - arr[lo]) * (idx - lo));
    };

    const buckets = {
      "0-2d": 0,
      "3-7d": 0,
      "8-14d": 0,
      "15-30d": 0,
      "31+d": 0,
    };

    leadDays.forEach((d) => {
      if (d <= 2) buckets["0-2d"]++;
      else if (d <= 7) buckets["3-7d"]++;
      else if (d <= 14) buckets["8-14d"]++;
      else if (d <= 30) buckets["15-30d"]++;
      else buckets["31+d"]++;
    });

    return {
      labels: Object.keys(buckets),
      data: Object.values(buckets),
      p50: percentile(leadDays, 50),
      p75: percentile(leadDays, 75),
      p90: percentile(leadDays, 90),
      sampleSize: leadDays.length,
    };
  }

  function cfdSeries(open, done, weeksBack = 10) {
    const labels = [];
    const weekEnds = [];
    for (let i = weeksBack - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      d.setHours(23, 59, 59, 999);
      labels.push(d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
      weekEnds.push(new Date(d));
    }

    const all = [...open, ...done];
    const byKey = new Map();
    all.forEach((i) => byKey.set(i.key, i));
    const uniqueIssues = [...byKey.values()];

    const createdCum = [];
    const doneCum = [];
    const wip = [];

    weekEnds.forEach((point) => {
      let created = 0;
      let doneCount = 0;

      uniqueIssues.forEach((i) => {
        const createdAt = new Date(i.fields.created);
        if (createdAt <= point) created++;

        const resolvedAt = getDoneDate(i);
        if (resolvedAt && resolvedAt <= point) doneCount++;
      });

      createdCum.push(created);
      doneCum.push(doneCount);
      wip.push(Math.max(0, created - doneCount));
    });

    return { labels, createdCum, doneCum, wip };
  }

  // Priority breakdown
  function priorityBreakdown(open) {
    const map = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    open.forEach((i) => {
      const p = getPriority(i);
      if (p in map) map[p]++;
      else map["Medium"]++;
    });
    return map;
  }

  // AI-style insights
  function insights(open, done, kpiData) {
    const tips = [];
    const aging = agingWip(open);

    // Oldest ticket
    if (aging.length > 0) {
      const oldest = aging[0];
      tips.push({
        level: "danger",
        text: `${oldest.id} has been in "${oldest.column}" for ${oldest.age} days — the longest aging ticket. Consider splitting or escalating.`,
      });
    }

    // Blocked tickets
    const blockedList = open.filter(isBlocked);
    if (blockedList.length > 0) {
      tips.push({
        level: "danger",
        text: `${blockedList.length} ticket${blockedList.length > 1 ? "s are" : " is"} currently blocked: ${blockedList.map((i) => i.key).join(", ")}. These need immediate attention.`,
      });
    }

    // WIP limit
    if (kpiData.wipOverLimit) {
      tips.push({
        level: "warn",
        text: `WIP is at ${kpiData.inProgress} — above your limit of ${CONFIG.wipLimit}. Finish before starting new work to improve flow.`,
      });
    } else if (CONFIG.wipLimit > 0) {
      tips.push({
        level: "good",
        text: `WIP is at ${kpiData.inProgress} / ${CONFIG.wipLimit} — within limit. Flow looks healthy.`,
      });
    }

    // Throughput trend
    const tp = weeklyThroughput(done);
    const recent = tp.data.slice(-3);
    const earlier = tp.data.slice(0, 3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length || 1;
    if (recentAvg > earlierAvg) {
      tips.push({
        level: "good",
        text: `Throughput is trending up — avg ${Math.round(recentAvg)} tickets/week recently vs ${Math.round(earlierAvg)} earlier. Keep the momentum.`,
      });
    } else if (recentAvg < earlierAvg) {
      tips.push({
        level: "warn",
        text: `Throughput dropped — avg ${Math.round(recentAvg)}/week recently vs ${Math.round(earlierAvg)} earlier. Check for blockers or scope creep.`,
      });
    }

    // Done this month vs prev
    if (kpiData.donePrevMonth > 0) {
      const diff = kpiData.doneThisMonth - kpiData.donePrevMonth;
      if (diff > 0) {
        tips.push({
          level: "good",
          text: `Completed ${kpiData.doneThisMonth} tickets this month vs ${kpiData.donePrevMonth} last month — +${diff} improvement.`,
        });
      }
    }

    // Critical tickets not started
    const criticalPending = open.filter(
      (i) => getPriority(i) === "Critical" && getColumn(i) !== CONFIG.inProgressColumn
    );
    if (criticalPending.length > 0) {
      tips.push({
        level: "warn",
        text: `${criticalPending.length} Critical ticket${criticalPending.length > 1 ? "s" : ""} not yet in progress: ${criticalPending.map((i) => i.key).join(", ")}. Pull these next.`,
      });
    }

    return tips.slice(0, 5);
  }

  return {
    kpis,
    byColumn,
    agingWip,
    weeklyThroughput,
    cycleTrend,
    leadTimeDistribution,
    cfdSeries,
    priorityBreakdown,
    insights,
    getDoneDate,
    getColumn,
    getPriority,
    getType,
    isBlocked,
    ageInDays,
  };
})();
