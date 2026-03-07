/**
 * PureQL API Client — communicates with the Python bridge server.
 *
 * The Python server runs on localhost and is launched by Tauri as a sidecar.
 * All communication is via HTTP JSON on localhost (never leaves the machine).
 */

const BASE_URL = "http://127.0.0.1:9741";

async function request<T>(
  path: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Health ──

export async function checkHealth(): Promise<{ status: string; version: string }> {
  return request("/health", "GET");
}

export async function getState(): Promise<{
  hasDataset: boolean;
  datasetName: string;
  versionCount: number;
  currentVersion: string;
  aiModel: string;
  aiProvider: string;
}> {
  return request("/state", "GET");
}

// ── Dataset ──

export async function loadDataset(path: string): Promise<{
  success: boolean;
  datasetName: string;
  profile: ProfileData;
  preview: Record<string, unknown>[];
  versions: VersionData[];
}> {
  return request("/load", "POST", { path });
}

export async function getPreview(rows?: number): Promise<{
  preview: Record<string, unknown>[];
}> {
  return request("/preview", "POST", { rows: rows || 100 });
}

export async function getProfile(): Promise<{ profile: ProfileData }> {
  return request("/profile", "POST");
}

// ── Chat ──

export async function sendChat(message: string): Promise<{
  explanation: string;
  confidence: number;
  actions: ActionData[];
  results: ActionResult[];
  preview: Record<string, unknown>[];
  versions: VersionData[];
  error: string | null;
}> {
  return request("/chat", "POST", { message });
}

// ── Direct Actions ──

export async function executeAction(
  type: string,
  params: Record<string, unknown> = {},
  target: string = "all"
): Promise<ActionResult & { preview: Record<string, unknown>[]; versions: VersionData[] }> {
  return request("/execute", "POST", { type, params, target });
}

export async function autoClean(): Promise<{
  success: boolean;
  operations: { operation: string; description: string; rowsAffected: number }[];
  qualityScore: number;
  preview: Record<string, unknown>[];
  versions: VersionData[];
}> {
  return request("/auto-clean", "POST");
}

// ── Versions ──

export async function getVersions(): Promise<{
  versions: VersionData[];
  currentId: string;
}> {
  return request("/versions", "POST");
}

export async function undo(): Promise<{
  success: boolean;
  preview?: Record<string, unknown>[];
  versions?: VersionData[];
  currentId?: string;
  message?: string;
}> {
  return request("/undo", "POST");
}

export async function redo(): Promise<{
  success: boolean;
  preview?: Record<string, unknown>[];
  versions?: VersionData[];
  currentId?: string;
  message?: string;
}> {
  return request("/redo", "POST");
}

export async function checkout(versionId: string): Promise<{
  success: boolean;
  preview: Record<string, unknown>[];
  versions: VersionData[];
  currentId: string;
}> {
  return request("/checkout", "POST", { versionId });
}

// ── SQL ──

export async function generateSchema(
  tableName?: string,
  engine?: string
): Promise<{
  sql: string;
  indexes: string[];
  explanation: string;
}> {
  return request("/schema", "POST", {
    tableName: tableName || "data",
    engine: engine || "postgresql",
  });
}

export async function optimizeSQL(
  query: string,
  engine?: string
): Promise<{
  sql: string;
  originalSql: string;
  changes: string[];
  indexes: string[];
  explanation: string;
}> {
  return request("/optimize", "POST", { query, engine: engine || "postgresql" });
}

export async function runSQL(
  query: string,
  tableName?: string
): Promise<{
  success: boolean;
  preview: Record<string, unknown>[];
  rowCount: number;
  colCount: number;
}> {
  return request("/query", "POST", { query, tableName: tableName || "data" });
}

// ── Hardware & AI ──

export async function detectHardware(): Promise<{
  hardware: HardwareData;
  recommendedModels: ModelData[];
}> {
  return request("/hardware", "POST");
}

export async function getOllamaStatus(): Promise<{
  installed: boolean;
  running: boolean;
  models: unknown[];
}> {
  return request("/ollama/status", "POST");
}

export async function startOllama(): Promise<{
  started: boolean;
  running: boolean;
  message?: string;
  error?: string;
}> {
  return request("/ollama/start", "POST");
}

export async function updateSettings(settings: {
  model?: string;
  provider?: string;
  apiKey?: string;
}): Promise<{
  model: string;
  provider: string;
  hasApiKey: boolean;
}> {
  return request("/settings", "POST", settings);
}

// ── Export ──

export async function exportData(
  format: string,
  path: string,
  tableName?: string
): Promise<{ success: boolean; path: string; format: string }> {
  return request("/export", "POST", { format, path, tableName });
}

// ── Types ──

export interface ProfileData {
  rowCount: number;
  colCount: number;
  qualityScore: number;
  columns: ColumnData[];
  issues: string[];
  duplicateCount: number;
  memoryMb: number;
}

export interface ColumnData {
  name: string;
  type: string;
  nullCount: number;
  nullPct: number;
  uniqueCount: number;
  uniquePct: number;
  sampleValues: string[];
  issues: string[];
}

export interface VersionData {
  id: string;
  label: string;
  description: string;
  timestamp: number;
  qualityScore: number;
  operation: string;
  rowsAffected: number;
  parentId: string | null;
}

export interface ActionData {
  type: string;
  params: Record<string, unknown>;
  target: string;
}

export interface ActionResult {
  success: boolean;
  description: string;
  quality_score?: number;
  rows_affected?: number;
  version?: { id: string; label: string };
  sql?: string;
  indexes?: string[];
  error?: string;
}

export interface HardwareData {
  ramGb: number;
  cpuCores: number;
  gpu: string | null;
  os: string;
  arch: string;
  tier: string;
}

export interface ModelData {
  name: string;
  display_name: string;
  size_gb: number;
  quality: string;
  speed: string;
  best_for: string;
  min_ram_gb: number;
  tier: string;
  recommended?: boolean;
}

// ── Database ──

export interface DbEngineInfo {
  id: string;
  name: string;
  icon: string;
  defaultPort: number | null;
}

export interface DbTableInfo {
  name: string;
  schema: string | null;
  columns: { name: string; type: string; nullable: boolean; default: string | null }[];
  primaryKey: string[];
  foreignKeys: { columns: string[]; referredTable: string; referredColumns: string[] }[];
  indexes: { name: string; columns: string[]; unique: boolean }[];
  rowCount: number | null;
  isView: boolean;
}

export interface DbConnectionInfo {
  name: string;
  engineType: string;
  connected: boolean;
  error: string | null;
}

export async function getDbEngines(): Promise<{ engines: DbEngineInfo[] }> {
  return request("/db/engines", "POST");
}

export async function connectDatabase(params: {
  engineType: string;
  name?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  path?: string;
  uri?: string;
}): Promise<{
  success: boolean;
  connection: DbConnectionInfo;
  tables?: DbTableInfo[];
  error?: string;
}> {
  return request("/db/connect", "POST", params);
}

export async function testDbConnection(params: {
  engineType: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  path?: string;
  uri?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  return request("/db/test", "POST", params);
}

export async function disconnectDatabase(name: string): Promise<{ success: boolean }> {
  return request("/db/disconnect", "POST", { name });
}

export async function getDbTables(
  connection: string,
  schema?: string
): Promise<{ tables: DbTableInfo[] }> {
  return request("/db/tables", "POST", { connection, schema });
}

export async function readDbTable(params: {
  connection: string;
  table: string;
  columns?: string[];
  limit?: number;
  where?: string;
}): Promise<{
  success: boolean;
  datasetName: string;
  profile: ProfileData;
  preview: Record<string, unknown>[];
  versions: VersionData[];
}> {
  return request("/db/read", "POST", params);
}

export async function readDbQuery(params: {
  connection: string;
  query: string;
}): Promise<{
  success: boolean;
  datasetName: string;
  profile: ProfileData;
  preview: Record<string, unknown>[];
  versions: VersionData[];
  rowCount: number;
  colCount: number;
}> {
  return request("/db/read-query", "POST", params);
}

export async function writeToDb(params: {
  connection: string;
  table: string;
  ifExists?: "replace" | "append" | "fail";
}): Promise<{ success: boolean; table?: string; rows?: number; message?: string; error?: string }> {
  return request("/db/write", "POST", params);
}

export async function getDbConnections(): Promise<{ connections: DbConnectionInfo[] }> {
  return request("/db/connections", "POST");
}