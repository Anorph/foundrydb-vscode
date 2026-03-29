import * as vscode from "vscode";
import { ServiceTreeProvider } from "./providers/serviceTreeProvider";
import { registerCommands } from "./commands/index";

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new ServiceTreeProvider();

  const treeView = vscode.window.createTreeView("foundrydbExplorer", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Reload tree when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("foundrydb.apiUrl") ||
        e.affectsConfiguration("foundrydb.username") ||
        e.affectsConfiguration("foundrydb.password")
      ) {
        treeProvider.refresh();
      }
    })
  );

  registerCommands(context, treeProvider);
}

export function deactivate(): void {
  // Nothing to clean up; VS Code disposes subscriptions automatically.
}
