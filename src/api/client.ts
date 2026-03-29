import * as https from "https";
import * as http from "http";
import { URL } from "url";

// ---- Typed error ----

export class FoundryDBError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "FoundryDBError";
    this.statusCode = statusCode;
  }
}

// ---- Domain types ----

export interface Service {
  id: string;
  name: string;
  status: string;
  database_type: string;
  version: string;
  zone: string;
  plan_name: string;
  created_at: string;
  dns_records?: DnsRecord[];
}

export interface DnsRecord {
  full_domain: string;
  record_type: string;
  port?: number;
}

export interface ServicesResponse {
  services: Service[];
}

export interface DatabaseUser {
  username: string;
  privileges: string;
  created_at: string;
}

export interface DatabaseUsersResponse {
  users: DatabaseUser[];
}

export interface RevealPasswordResponse {
  password: string;
}

export interface Metrics {
  cpu_usage_percent?: number;
  memory_usage_percent?: number;
  storage_usage_percent?: number;
  storage_used_bytes?: number;
  storage_total_bytes?: number;
  connections?: number;
  timestamp?: string;
}

export interface Backup {
  id: string;
  backup_type: string;
  status: string;
  size_bytes?: number;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface BackupsResponse {
  backups: Backup[];
}

export interface TriggerBackupResponse {
  id: string;
  status: string;
}

// ---- Client ----

export class FoundryDBClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(apiUrl: string, username: string, password: string) {
    this.baseUrl = apiUrl.replace(/\/$/, "");
    const credentials = Buffer.from(`${username}:${password}`).toString("base64");
    this.authHeader = `Basic ${credentials}`;
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${path}`);
      const isHttps = url.protocol === "https:";
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      };

      const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
      if (bodyStr && options.headers) {
        (options.headers as Record<string, string>)["Content-Length"] = Buffer.byteLength(bodyStr).toString();
      }

      const transport = isHttps ? https : http;
      const req = transport.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? (JSON.parse(data) as T) : ({} as T));
            } catch {
              resolve({} as T);
            }
          } else {
            reject(new FoundryDBError(res.statusCode ?? 0, `HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on("error", reject);

      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }

  listServices(): Promise<ServicesResponse> {
    return this.request<ServicesResponse>("GET", "/managed-services");
  }

  getService(id: string): Promise<Service> {
    return this.request<Service>("GET", `/managed-services/${id}`);
  }

  listUsers(serviceId: string): Promise<DatabaseUsersResponse> {
    return this.request<DatabaseUsersResponse>("GET", `/managed-services/${serviceId}/database-users`);
  }

  revealPassword(serviceId: string, username: string): Promise<RevealPasswordResponse> {
    return this.request<RevealPasswordResponse>(
      "POST",
      `/managed-services/${serviceId}/database-users/${username}/reveal-password`
    );
  }

  getMetrics(serviceId: string): Promise<Metrics> {
    return this.request<Metrics>("GET", `/managed-services/${serviceId}/metrics`);
  }

  listBackups(serviceId: string): Promise<BackupsResponse> {
    return this.request<BackupsResponse>("GET", `/managed-services/${serviceId}/backups`);
  }

  triggerBackup(serviceId: string): Promise<TriggerBackupResponse> {
    return this.request<TriggerBackupResponse>("POST", `/managed-services/${serviceId}/backups`);
  }
}

// ---- Connection string builders ----

export function buildConnectionString(service: Service, password: string, username: string): string {
  const domain = service.dns_records?.[0]?.full_domain;
  if (!domain) {
    return "";
  }

  const type = service.database_type.toLowerCase();

  switch (type) {
    case "postgresql":
    case "postgres":
      return `postgresql://${username}:${encodeURIComponent(password)}@${domain}:5432/defaultdb?sslmode=require`;
    case "mysql":
      return `mysql://${username}:${encodeURIComponent(password)}@${domain}:3306/defaultdb`;
    case "mongodb":
    case "mongo":
      return `mongodb://${username}:${encodeURIComponent(password)}@${domain}:27017/defaultdb?tls=true`;
    case "valkey":
    case "redis":
      return `rediss://${username}:${encodeURIComponent(password)}@${domain}:6380`;
    case "kafka":
      return `${domain}:9093`;
    default:
      return `${type}://${username}:${encodeURIComponent(password)}@${domain}`;
  }
}

export function buildEnvVarsString(service: Service, password: string, username: string): string {
  const domain = service.dns_records?.[0]?.full_domain ?? "";
  const type = service.database_type.toUpperCase();

  const vars = [
    `${type}_HOST=${domain}`,
    `${type}_USER=${username}`,
    `${type}_PASSWORD=${password}`,
  ];

  switch (service.database_type.toLowerCase()) {
    case "postgresql":
    case "postgres":
      vars.push(`${type}_PORT=5432`);
      vars.push(`${type}_DB=defaultdb`);
      vars.push(`${type}_SSL=require`);
      break;
    case "mysql":
      vars.push(`${type}_PORT=3306`);
      vars.push(`${type}_DB=defaultdb`);
      break;
    case "mongodb":
    case "mongo":
      vars.push(`${type}_PORT=27017`);
      vars.push(`${type}_DB=defaultdb`);
      break;
    case "valkey":
    case "redis":
      vars.push(`${type}_PORT=6380`);
      vars.push(`${type}_TLS=true`);
      break;
    case "kafka":
      vars.push(`${type}_PORT=9093`);
      break;
  }

  return vars.join("\n");
}
