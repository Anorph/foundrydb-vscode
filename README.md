# FoundryDB VS Code Extension

Manage [FoundryDB](https://foundrydb.com) managed database services directly from VS Code.

## Features

- **Service Tree View** — Browse all your database services grouped by type (PostgreSQL, MySQL, MongoDB, Valkey, Kafka, OpenSearch, MSSQL) in the Explorer sidebar.
- **Service Detail Panel** — Click any service to open a detail panel showing overview, metrics, connection strings, users, and recent backups.
- **Copy Connection String** — Right-click a service to copy a ready-to-use connection string with revealed password to your clipboard.
- **Trigger Backup** — Right-click a service to kick off an on-demand backup.
- **Switch Organization** — Use the organization switcher command to scope the view to a specific organization.
- **Auto-refresh** — Credentials, API URL, and organization changes in settings take effect immediately.

## Getting Started

1. Install the extension.
2. Open the FoundryDB panel in the Activity Bar (database icon).
3. Run the command **FoundryDB: Add Connection** (or click the `+` button in the panel title).
4. Enter your API URL (default: `https://api.foundrydb.com`), username, and password.
5. Your services will appear in the tree view.

## Commands

| Command | Description |
|---------|-------------|
| `FoundryDB: Add Connection` | Configure API URL and credentials |
| `FoundryDB: Refresh Services` | Reload the service list |
| `FoundryDB: Copy Connection String` | Copy connection string to clipboard |
| `FoundryDB: Trigger Backup` | Start an on-demand backup |
| `FoundryDB: Switch Organization` | List available organizations and switch the active one |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `foundrydb.apiUrl` | `https://api.foundrydb.com` | FoundryDB API base URL |
| `foundrydb.username` | — | API username |
| `foundrydb.password` | — | API password |
| `foundrydb.organizationId` | — | Organization ID to scope API calls. Set via `FoundryDB: Switch Organization` or manually in settings. When set, all API requests include the `X-Active-Org-ID` header. |

## Organization Switching

If your account belongs to multiple organizations, use **FoundryDB: Switch Organization** (or click the organization icon in the panel title) to pick which organization's services to display. Selecting "All organizations" clears the filter and shows services across all orgs.

## Supported Database Types

| Type | Supported Versions |
|------|--------------------|
| PostgreSQL | 14, 15, 16, 17, 18 |
| MySQL | 8.4 |
| MongoDB | 6.0, 7.0, 8.0 |
| Valkey | 7.2, 8.0, 8.1, 9.0 |
| Kafka | 3.6, 3.7, 3.8, 3.9, 4.0 |
| OpenSearch | 2 |
| MSSQL | 4.8 |

## Requirements

- VS Code 1.85.0 or later
- A FoundryDB account with API access

## License

MIT
