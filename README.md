# FoundryDB VS Code Extension

Manage [FoundryDB](https://foundrydb.com) managed database services directly from VS Code.

## Features

- **Service Tree View** — Browse all your database services grouped by type (PostgreSQL, MySQL, MongoDB, Valkey, Kafka) in the Explorer sidebar.
- **Service Detail Panel** — Click any service to open a detail panel showing overview, metrics, connection strings, users, and recent backups.
- **Copy Connection String** — Right-click a service to copy a ready-to-use connection string with revealed password to your clipboard.
- **Trigger Backup** — Right-click a service to kick off an on-demand backup.
- **Auto-refresh** — Credentials and API URL changes in settings take effect immediately.

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

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `foundrydb.apiUrl` | `https://api.foundrydb.com` | FoundryDB API base URL |
| `foundrydb.username` | — | API username |
| `foundrydb.password` | — | API password |

## Supported Database Types

- PostgreSQL
- MySQL
- MongoDB
- Valkey
- Kafka

## Requirements

- VS Code 1.85.0 or later
- A FoundryDB account with API access

## License

MIT
