import * as vscode from "vscode";
import { ServiceTreeProvider, ServiceNode } from "../providers/serviceTreeProvider";
import { openServiceDetailPanel } from "../views/serviceDetailPanel";
import { buildConnectionString, FoundryDBError } from "../api/client";

// ---- Error classification ----

function classifyError(err: unknown): string {
  if (err instanceof FoundryDBError) {
    if (err.statusCode === 401) {
      return "Authentication failed. Check your username and password in settings.";
    }
    if (err.statusCode === 404) {
      return "Service not found.";
    }
    if (err.statusCode === 408 || err.statusCode === 504) {
      return "Request timed out. The FoundryDB API may be unavailable.";
    }
    return `FoundryDB API error (${err.statusCode}). Please try again.`;
  }

  const msg = String(err);
  if (
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("fetch failed") ||
    msg.includes("connect ETIMEDOUT")
  ) {
    return "Cannot connect to FoundryDB API. Check your connection settings.";
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    return "Request timed out. The FoundryDB API may be unavailable.";
  }

  return "An unexpected error occurred. Please try again.";
}

export function registerCommands(
  context: vscode.ExtensionContext,
  treeProvider: ServiceTreeProvider
): void {
  // Add Connection
  context.subscriptions.push(
    vscode.commands.registerCommand("foundrydb.addConnection", async () => {
      const config = vscode.workspace.getConfiguration("foundrydb");

      const currentUrl = config.get<string>("apiUrl") ?? "https://api.foundrydb.com";
      const apiUrl = await vscode.window.showInputBox({
        prompt: "FoundryDB API URL",
        value: currentUrl,
        validateInput: (v) => {
          if (!v.startsWith("http://") && !v.startsWith("https://")) {
            return "URL must start with http:// or https://";
          }
          return undefined;
        },
      });
      if (apiUrl === undefined) {
        return;
      }

      const username = await vscode.window.showInputBox({
        prompt: "Username",
        value: config.get<string>("username") ?? "",
      });
      if (username === undefined) {
        return;
      }

      const password = await vscode.window.showInputBox({
        prompt: "Password",
        password: true,
      });
      if (password === undefined) {
        return;
      }

      await config.update("apiUrl", apiUrl, vscode.ConfigurationTarget.Global);
      await config.update("username", username, vscode.ConfigurationTarget.Global);
      await config.update("password", password, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage("FoundryDB: Connection saved.");
      treeProvider.refresh();
    })
  );

  // Refresh Services
  context.subscriptions.push(
    vscode.commands.registerCommand("foundrydb.refreshServices", () => {
      treeProvider.refresh();
    })
  );

  // Open Service Detail
  context.subscriptions.push(
    vscode.commands.registerCommand("foundrydb.openServiceDetail", async (node: ServiceNode) => {
      const service = node?.service;
      if (!service) {
        vscode.window.showWarningMessage("FoundryDB: No service selected.");
        return;
      }
      const client = treeProvider.getClient();
      if (!client) {
        vscode.window.showWarningMessage(
          "FoundryDB: No connection configured. Run 'FoundryDB: Add Connection' first."
        );
        return;
      }
      try {
        await openServiceDetailPanel(context, service, client);
      } catch (err) {
        vscode.window.showErrorMessage(`FoundryDB: Failed to open service detail — ${classifyError(err)}`);
      }
    })
  );

  // Open Service Detail on tree item click (double click / enter)
  context.subscriptions.push(
    vscode.commands.registerCommand("foundrydb.openServiceDetailFromClick", async (node: ServiceNode) => {
      if (node?.kind === "service") {
        await vscode.commands.executeCommand("foundrydb.openServiceDetail", node);
      }
    })
  );

  // Copy Connection String
  context.subscriptions.push(
    vscode.commands.registerCommand("foundrydb.copyConnectionString", async (node: ServiceNode) => {
      const service = node?.service;
      if (!service) {
        vscode.window.showWarningMessage("FoundryDB: No service selected.");
        return;
      }
      const client = treeProvider.getClient();
      if (!client) {
        vscode.window.showWarningMessage(
          "FoundryDB: No connection configured. Run 'FoundryDB: Add Connection' first."
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `FoundryDB: Fetching connection string for ${service.name}...`,
          cancellable: false,
        },
        async () => {
          try {
            let usersResp;
            try {
              usersResp = await client.listUsers(service.id);
            } catch (err) {
              vscode.window.showErrorMessage(`FoundryDB: Failed to fetch users — ${classifyError(err)}`);
              return;
            }

            const users = usersResp.users ?? [];
            if (users.length === 0) {
              vscode.window.showWarningMessage("FoundryDB: No database users found.");
              return;
            }

            // Pick user if there are multiple
            let username = users[0].username;
            if (users.length > 1) {
              const picked = await vscode.window.showQuickPick(
                users.map((u) => u.username),
                { placeHolder: "Select a user" }
              );
              if (!picked) {
                return;
              }
              username = picked;
            }

            let pwResp;
            try {
              pwResp = await client.revealPassword(service.id, username);
            } catch (err) {
              if (err instanceof FoundryDBError && err.statusCode === 404) {
                vscode.window.showErrorMessage(`FoundryDB: Could not reveal password — user "${username}" was not found.`);
              } else {
                vscode.window.showErrorMessage(`FoundryDB: Could not reveal password — ${classifyError(err)}`);
              }
              return;
            }

            const connStr = buildConnectionString(service, pwResp.password, username);

            if (!connStr) {
              vscode.window.showWarningMessage("FoundryDB: Could not build connection string (DNS not ready).");
              return;
            }

            await vscode.env.clipboard.writeText(connStr);
            vscode.window.showInformationMessage(`FoundryDB: Connection string copied to clipboard.`);
          } catch (err) {
            vscode.window.showErrorMessage(`FoundryDB: Failed to get connection string — ${classifyError(err)}`);
          }
        }
      );
    })
  );

  // Trigger Backup
  context.subscriptions.push(
    vscode.commands.registerCommand("foundrydb.triggerBackup", async (node: ServiceNode) => {
      const service = node?.service;
      if (!service) {
        vscode.window.showWarningMessage("FoundryDB: No service selected.");
        return;
      }
      const client = treeProvider.getClient();
      if (!client) {
        vscode.window.showWarningMessage(
          "FoundryDB: No connection configured. Run 'FoundryDB: Add Connection' first."
        );
        return;
      }

      const confirm = await vscode.window.showInformationMessage(
        `Trigger a backup for "${service.name}"?`,
        { modal: true },
        "Trigger Backup"
      );
      if (confirm !== "Trigger Backup") {
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `FoundryDB: Triggering backup for ${service.name}...`,
          cancellable: false,
        },
        async (progress) => {
          try {
            const result = await client.triggerBackup(service.id);
            progress.report({ increment: 100 });
            vscode.window.showInformationMessage(
              `FoundryDB: Backup started for "${service.name}" (ID: ${result.id}, status: ${result.status}).`
            );
          } catch (err) {
            vscode.window.showErrorMessage(`FoundryDB: Failed to trigger backup — ${classifyError(err)}`);
          }
        }
      );
    })
  );
}
