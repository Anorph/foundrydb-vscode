import * as vscode from "vscode";
import {
  FoundryDBClient,
  Service,
  DatabaseUser,
  Metrics,
  Backup,
  buildConnectionString,
  buildEnvVarsString,
} from "../api/client";

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusBadge(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "running") {
    return `<span class="badge badge-running">Running</span>`;
  }
  if (normalized.includes("provisioning") || normalized.includes("setup")) {
    return `<span class="badge badge-provisioning">Provisioning</span>`;
  }
  if (normalized === "stopped") {
    return `<span class="badge badge-stopped">Stopped</span>`;
  }
  if (normalized.includes("error") || normalized.includes("failed")) {
    return `<span class="badge badge-error">Error</span>`;
  }
  return `<span class="badge badge-default">${status}</span>`;
}

function metricBar(value: number | undefined, label: string): string {
  if (value === undefined || value === null) {
    return `<div class="metric"><span class="metric-label">${label}</span><span class="metric-value">N/A</span></div>`;
  }
  const pct = Math.min(100, Math.max(0, value));
  const colorClass = pct > 85 ? "bar-danger" : pct > 60 ? "bar-warning" : "bar-ok";
  return `
    <div class="metric">
      <div class="metric-header">
        <span class="metric-label">${label}</span>
        <span class="metric-value">${pct.toFixed(1)}%</span>
      </div>
      <div class="bar-bg"><div class="bar-fill ${colorClass}" style="width:${pct}%"></div></div>
    </div>`;
}

function getWebviewContent(
  service: Service,
  users: DatabaseUser[],
  metrics: Metrics,
  backups: Backup[],
  nonce: string
): string {
  const domain = service.dns_records?.[0]?.full_domain ?? "";
  const urlConn = domain
    ? `<code class="conn-string">${escapeHtml(buildConnectionString(service, "****", users[0]?.username ?? "user"))}</code>`
    : `<em>DNS record not yet available</em>`;
  const envConn = domain
    ? `<pre class="env-block">${escapeHtml(buildEnvVarsString(service, "****", users[0]?.username ?? "user"))}</pre>`
    : `<em>DNS record not yet available</em>`;

  const usersHtml =
    users.length === 0
      ? `<tr><td colspan="3"><em>No users</em></td></tr>`
      : users
          .map(
            (u) =>
              `<tr>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.privileges ?? "")}</td>
            <td>${escapeHtml(u.created_at ? new Date(u.created_at).toLocaleDateString() : "")}</td>
          </tr>`
          )
          .join("");

  const backupsHtml =
    backups.length === 0
      ? `<tr><td colspan="4"><em>No backups</em></td></tr>`
      : backups
          .slice(0, 10)
          .map(
            (b) =>
              `<tr>
            <td>${escapeHtml(b.backup_type)}</td>
            <td><span class="badge ${b.status === "completed" ? "badge-running" : b.status === "failed" ? "badge-error" : "badge-provisioning"}">${escapeHtml(b.status)}</span></td>
            <td>${b.size_bytes ? formatBytes(b.size_bytes) : "—"}</td>
            <td>${escapeHtml(b.created_at ? new Date(b.created_at).toLocaleDateString() : "")}</td>
          </tr>`
          )
          .join("");

  const storageUsed = metrics.storage_used_bytes;
  const storageTotal = metrics.storage_total_bytes;
  const storagePct =
    storageUsed !== undefined && storageTotal && storageTotal > 0
      ? (storageUsed / storageTotal) * 100
      : metrics.storage_usage_percent;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(service.name)} — FoundryDB</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border);
      --card-bg: var(--vscode-sideBar-background);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --code-bg: var(--vscode-textCodeBlock-background);
      --input-bg: var(--vscode-input-background);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 20px; line-height: 1.5; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    h2 { font-size: 13px; font-weight: 600; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
    .header-meta { opacity: 0.6; font-size: 12px; margin-top: 2px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 16px; }
    .card-full { grid-column: 1 / -1; }
    .kv { display: grid; grid-template-columns: 120px 1fr; gap: 4px 12px; }
    .kv dt { opacity: 0.6; font-size: 12px; align-self: start; padding-top: 1px; }
    .kv dd { font-weight: 500; word-break: break-all; }
    .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge-running { background: #1a6b3c; color: #4ade80; }
    .badge-provisioning { background: #6b4a1a; color: #fbbf24; }
    .badge-stopped { background: #3a3a3a; color: #9ca3af; }
    .badge-error { background: #6b1a1a; color: #f87171; }
    .badge-default { background: var(--input-bg); color: var(--fg); }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 6px 8px; opacity: 0.6; font-weight: 600; border-bottom: 1px solid var(--border); }
    td { padding: 6px 8px; border-bottom: 1px solid var(--border); opacity: 0.9; }
    tr:last-child td { border-bottom: none; }
    .conn-string { display: block; background: var(--code-bg); padding: 8px 12px; border-radius: 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; word-break: break-all; margin-top: 6px; }
    .env-block { background: var(--code-bg); padding: 8px 12px; border-radius: 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; margin-top: 6px; white-space: pre-wrap; }
    .conn-note { font-size: 11px; opacity: 0.5; margin-top: 6px; }
    .metric { margin-bottom: 10px; }
    .metric-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .metric-label { opacity: 0.7; font-size: 12px; }
    .metric-value { font-weight: 600; font-size: 12px; }
    .bar-bg { height: 6px; background: var(--input-bg); border-radius: 3px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .bar-ok { background: #4ade80; }
    .bar-warning { background: #fbbf24; }
    .bar-danger { background: #f87171; }
    .section-label { font-size: 11px; opacity: 0.5; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(service.name)}</h1>
      <div class="header-meta">${escapeHtml(service.database_type)} ${escapeHtml(service.version)} &bull; ${escapeHtml(service.zone)} &bull; ${escapeHtml(service.plan_name)}</div>
    </div>
    ${statusBadge(service.status)}
  </div>

  <div class="grid">
    <div class="card">
      <h2>Overview</h2>
      <dl class="kv">
        <dt>ID</dt><dd>${escapeHtml(service.id)}</dd>
        <dt>Database</dt><dd>${escapeHtml(service.database_type)} ${escapeHtml(service.version)}</dd>
        <dt>Status</dt><dd>${statusBadge(service.status)}</dd>
        <dt>Zone</dt><dd>${escapeHtml(service.zone)}</dd>
        <dt>Plan</dt><dd>${escapeHtml(service.plan_name)}</dd>
        <dt>Created</dt><dd>${escapeHtml(service.created_at ? new Date(service.created_at).toLocaleDateString() : "—")}</dd>
        ${domain ? `<dt>Hostname</dt><dd>${escapeHtml(domain)}</dd>` : ""}
      </dl>
    </div>

    <div class="card">
      <h2>Metrics</h2>
      ${metricBar(metrics.cpu_usage_percent, "CPU")}
      ${metricBar(metrics.memory_usage_percent, "Memory")}
      ${metricBar(storagePct, "Storage")}
      ${storageUsed !== undefined && storageTotal ? `<div class="conn-note">${formatBytes(storageUsed)} / ${formatBytes(storageTotal)} used</div>` : ""}
      ${metrics.connections !== undefined ? `<div class="metric"><span class="metric-label">Connections: </span><strong>${metrics.connections}</strong></div>` : ""}
    </div>

    <div class="card card-full">
      <h2>Connection Strings</h2>
      <div class="section-label">URL format (password hidden — use Copy Connection String command for full string)</div>
      ${urlConn}
      <div style="height:12px"></div>
      <div class="section-label">Environment variables</div>
      ${envConn}
    </div>

    <div class="card card-full">
      <h2>Database Users</h2>
      <table>
        <thead><tr><th>Username</th><th>Privileges</th><th>Created</th></tr></thead>
        <tbody>${usersHtml}</tbody>
      </table>
    </div>

    <div class="card card-full">
      <h2>Recent Backups</h2>
      <table>
        <thead><tr><th>Type</th><th>Status</th><th>Size</th><th>Created</th></tr></thead>
        <tbody>${backupsHtml}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

const panels = new Map<string, vscode.WebviewPanel>();

export async function openServiceDetailPanel(
  context: vscode.ExtensionContext,
  service: Service,
  client: FoundryDBClient
): Promise<void> {
  const panelId = `foundrydb.service.${service.id}`;
  const existing = panels.get(panelId);
  if (existing) {
    existing.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "foundrydbServiceDetail",
    `FoundryDB: ${service.name}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    }
  );

  panels.set(panelId, panel);
  panel.onDidDispose(() => panels.delete(panelId), null, context.subscriptions);

  panel.webview.html = getLoadingHtml(service.name);

  // Load data in parallel
  const [usersResult, metricsResult, backupsResult] = await Promise.allSettled([
    client.listUsers(service.id),
    client.getMetrics(service.id),
    client.listBackups(service.id),
  ]);

  const users = usersResult.status === "fulfilled" ? (usersResult.value.users ?? []) : [];
  const metrics = metricsResult.status === "fulfilled" ? metricsResult.value : {};
  const backups = backupsResult.status === "fulfilled" ? (backupsResult.value.backups ?? []) : [];

  const nonce = generateNonce();
  panel.webview.html = getWebviewContent(service, users, metrics, backups, nonce);
}

function getLoadingHtml(name: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Loading...</title></head><body style="font-family:sans-serif;padding:20px;color:var(--vscode-editor-foreground)"><p>Loading ${escapeHtml(name)}...</p></body></html>`;
}
