import * as vscode from "vscode";
import { FoundryDBClient, FoundryDBError, Service } from "../api/client";

// ---- Node types ----

export type NodeKind =
  | "group"
  | "service"
  | "connectionInfo"
  | "users"
  | "metrics"
  | "backups";

export class ServiceNode extends vscode.TreeItem {
  public readonly kind: NodeKind;
  public readonly service?: Service;
  public readonly groupLabel?: string;

  constructor(opts: {
    kind: NodeKind;
    label: string;
    collapsibleState: vscode.TreeItemCollapsibleState;
    service?: Service;
    groupLabel?: string;
    description?: string;
    tooltip?: string;
    contextValue?: string;
    iconPath?: vscode.ThemeIcon;
  }) {
    super(opts.label, opts.collapsibleState);
    this.kind = opts.kind;
    this.service = opts.service;
    this.groupLabel = opts.groupLabel;
    this.description = opts.description;
    this.tooltip = opts.tooltip ?? opts.label;
    this.contextValue = opts.contextValue;
    this.iconPath = opts.iconPath;
  }
}

// ---- Helpers ----

function dbIcon(dbType: string): vscode.ThemeIcon {
  switch (dbType.toLowerCase()) {
    case "postgresql":
    case "postgres":
      return new vscode.ThemeIcon("database");
    case "mysql":
      return new vscode.ThemeIcon("database");
    case "mongodb":
    case "mongo":
      return new vscode.ThemeIcon("server");
    case "valkey":
    case "redis":
      return new vscode.ThemeIcon("zap");
    case "kafka":
      return new vscode.ThemeIcon("broadcast");
    case "opensearch":
      return new vscode.ThemeIcon("search");
    case "mssql":
      return new vscode.ThemeIcon("database");
    default:
      return new vscode.ThemeIcon("database");
  }
}

function statusDescription(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "running") {
    return "$(circle-filled) running";
  }
  if (normalized.includes("provisioning") || normalized.includes("setup")) {
    return "$(sync~spin) provisioning";
  }
  if (normalized === "stopped") {
    return "$(circle-slash) stopped";
  }
  if (normalized.includes("error") || normalized.includes("failed")) {
    return "$(error) error";
  }
  return `$(info) ${status}`;
}

function groupDbType(dbType: string): string {
  const normalized = dbType.toLowerCase();
  switch (normalized) {
    case "postgresql":
    case "postgres":
      return "PostgreSQL";
    case "mysql":
      return "MySQL";
    case "mongodb":
    case "mongo":
      return "MongoDB";
    case "valkey":
      return "Valkey";
    case "kafka":
      return "Kafka";
    case "opensearch":
      return "OpenSearch";
    case "mssql":
      return "MSSQL";
    default:
      return dbType;
  }
}

// ---- Tree provider ----

export class ServiceTreeProvider implements vscode.TreeDataProvider<ServiceNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ServiceNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private client: FoundryDBClient | null = null;
  private services: Service[] = [];

  constructor() {
    this.buildClient();
  }

  buildClient(): void {
    const config = vscode.workspace.getConfiguration("foundrydb");
    const apiUrl = config.get<string>("apiUrl") ?? "https://api.foundrydb.com";
    const username = config.get<string>("username") ?? "";
    const password = config.get<string>("password") ?? "";
    const orgId = config.get<string>("organizationId") || undefined;

    if (username && password) {
      this.client = new FoundryDBClient(apiUrl, username, password, orgId);
    } else {
      this.client = null;
    }
  }

  refresh(): void {
    this.buildClient();
    this._onDidChangeTreeData.fire();
  }

  getClient(): FoundryDBClient | null {
    return this.client;
  }

  getTreeItem(element: ServiceNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ServiceNode): Promise<ServiceNode[]> {
    if (!element) {
      return this.getRootNodes();
    }

    switch (element.kind) {
      case "group":
        return this.getServiceNodes(element.groupLabel ?? "");
      case "service":
        return this.getServiceChildNodes(element.service!);
      default:
        return [];
    }
  }

  private async getRootNodes(): Promise<ServiceNode[]> {
    if (!this.client) {
      return [
        new ServiceNode({
          kind: "group",
          label: "No connection configured",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconPath: new vscode.ThemeIcon("warning"),
          tooltip: "Run 'FoundryDB: Add Connection' to configure credentials",
        }),
      ];
    }

    try {
      const response = await this.client.listServices();
      this.services = response.services ?? [];

      if (this.services.length === 0) {
        return [
          new ServiceNode({
            kind: "group",
            label: "No services found",
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            iconPath: new vscode.ThemeIcon("info"),
          }),
        ];
      }

      const groups = new Map<string, number>();
      for (const svc of this.services) {
        const g = groupDbType(svc.database_type);
        groups.set(g, (groups.get(g) ?? 0) + 1);
      }

      const nodes: ServiceNode[] = [];
      for (const [groupName, count] of groups) {
        nodes.push(
          new ServiceNode({
            kind: "group",
            label: groupName,
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            groupLabel: groupName,
            description: `${count} service${count !== 1 ? "s" : ""}`,
            iconPath: dbIcon(groupName),
          })
        );
      }
      return nodes;
    } catch (err) {
      let errorLabel = "Failed to load services — click to retry";
      if (err instanceof FoundryDBError) {
        if (err.statusCode === 401) {
          errorLabel = "Authentication failed — check settings and click to retry";
        } else if (err.statusCode === 404) {
          errorLabel = "API endpoint not found — check API URL and click to retry";
        } else {
          errorLabel = `API error (${err.statusCode}) — click to retry`;
        }
      } else {
        const msg = String(err);
        if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("fetch failed")) {
          errorLabel = "Cannot connect to FoundryDB API — click to retry";
        } else if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
          errorLabel = "Connection timed out — click to retry";
        }
      }

      const retryNode = new ServiceNode({
        kind: "group",
        label: errorLabel,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        iconPath: new vscode.ThemeIcon("error"),
        tooltip: String(err),
      });
      retryNode.command = {
        command: "foundrydb.refreshServices",
        title: "Retry",
        arguments: [],
      };
      return [retryNode];
    }
  }

  private getServiceNodes(groupLabel: string): ServiceNode[] {
    return this.services
      .filter((svc) => groupDbType(svc.database_type) === groupLabel)
      .map(
        (svc) =>
          new ServiceNode({
            kind: "service",
            label: svc.name,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            service: svc,
            description: statusDescription(svc.status),
            tooltip: `${svc.name} — ${svc.database_type} ${svc.version} (${svc.zone})`,
            contextValue: "service",
            iconPath: dbIcon(svc.database_type),
          })
      );
  }

  private getServiceChildNodes(service: Service): ServiceNode[] {
    return [
      new ServiceNode({
        kind: "connectionInfo",
        label: "Connection Info",
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        service,
        iconPath: new vscode.ThemeIcon("plug"),
        contextValue: "connectionInfo",
      }),
      new ServiceNode({
        kind: "users",
        label: "Users",
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        service,
        iconPath: new vscode.ThemeIcon("person"),
        contextValue: "users",
      }),
      new ServiceNode({
        kind: "metrics",
        label: "Metrics",
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        service,
        iconPath: new vscode.ThemeIcon("pulse"),
        contextValue: "metrics",
      }),
      new ServiceNode({
        kind: "backups",
        label: "Backups",
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        service,
        iconPath: new vscode.ThemeIcon("archive"),
        contextValue: "backups",
      }),
    ];
  }

  getServiceById(id: string): Service | undefined {
    return this.services.find((s) => s.id === id);
  }
}
