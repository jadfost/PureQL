import { useState, useEffect } from "react";
import {
  getDbEngines, connectDatabase, testDbConnection, getDbTables, readDbTable,
  type DbEngineInfo, type DbTableInfo,
} from "../../lib/api";
import { useAppStore } from "../../stores/appStore";

interface Props {
  onClose: () => void;
}

type Step = "configure" | "tables" | "preview";

export function DatabaseModal({ onClose }: Props) {
  const { setDatasetName, setProfile, setPreviewData, setVersions, setLoading } = useAppStore();

  // Engines
  const [engines, setEngines] = useState<DbEngineInfo[]>([]);
  const [selectedEngine, setSelectedEngine] = useState("postgresql");

  // Form
  const [connName, setConnName] = useState("my_db");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState<string>("");
  const [database, setDatabase] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [filePath, setFilePath] = useState(""); // for sqlite/duckdb

  // State
  const [step, setStep] = useState<Step>("configure");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionName, setConnectionName] = useState<string | null>(null);
  const [tables, setTables] = useState<DbTableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableLimit, setTableLimit] = useState("10000");
  const [loadingTable, setLoadingTable] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    getDbEngines().then((r) => {
      setEngines(r.engines);
    }).catch(() => {});
  }, []);

  const isFileBased = ["sqlite", "duckdb"].includes(selectedEngine);
  const engine = engines.find((e) => e.id === selectedEngine);
  const defaultPort = engine?.defaultPort?.toString() ?? "";

  const buildParams = () => ({
    engineType: selectedEngine,
    name: connName,
    ...(isFileBased
      ? { path: filePath }
      : { host, port: port ? parseInt(port) : undefined, database, user, password }),
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDbConnection(buildParams());
      setTestResult(result);
    } catch {
      setTestResult({ success: false, error: "Could not reach bridge server." });
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await connectDatabase(buildParams());
      if (result.success && result.tables) {
        setConnectionName(connName);
        setTables(result.tables);
        setStep("tables");
      } else {
        setConnectError(result.error ?? "Connection failed.");
      }
    } catch (e) {
      setConnectError("Could not reach bridge server.");
    } finally {
      setConnecting(false);
    }
  };

  const handleLoadTable = async () => {
    if (!selectedTable || !connectionName) return;
    setLoadingTable(true);
    setLoading(true);
    try {
      const res = await readDbTable({
        connection: connectionName,
        table: selectedTable,
        limit: tableLimit ? parseInt(tableLimit) : undefined,
      });
      setDatasetName(res.datasetName);
      setProfile(res.profile);
      setPreviewData(res.preview);
      setVersions(res.versions);
      onClose();
    } catch {
    } finally {
      setLoadingTable(false);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] max-h-[85vh] flex flex-col bg-pureql-dark border border-pureql-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-pureql-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base">🗄</span>
            <span className="text-sm font-semibold text-zinc-200">
              {step === "configure" ? "Connect to Database" : step === "tables" ? "Select Table" : "Preview Data"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === "configure" && (
            <div className="space-y-3">
              {/* Engine selector */}
              <div>
                <label className="text-[10px] text-zinc-500 font-semibold tracking-wide block mb-1.5">
                  DATABASE ENGINE
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {engines.map((eng) => (
                    <button
                      key={eng.id}
                      onClick={() => { setSelectedEngine(eng.id); setPort(eng.defaultPort?.toString() ?? ""); }}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md border text-[11px] transition ${
                        selectedEngine === eng.id
                          ? "border-pureql-accent/50 bg-pureql-accent-dim text-pureql-accent"
                          : "border-pureql-border text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      <span>{eng.icon}</span>
                      <span>{eng.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Connection name */}
              <Field label="CONNECTION NAME">
                <input value={connName} onChange={(e) => setConnName(e.target.value)}
                  className={inputCls} placeholder="my_database" />
              </Field>

              {isFileBased ? (
                <Field label="FILE PATH">
                  <input value={filePath} onChange={(e) => setFilePath(e.target.value)}
                    className={inputCls} placeholder="/path/to/database.db" />
                </Field>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Field label="HOST">
                        <input value={host} onChange={(e) => setHost(e.target.value)}
                          className={inputCls} placeholder="localhost" />
                      </Field>
                    </div>
                    <Field label="PORT">
                      <input value={port || defaultPort} onChange={(e) => setPort(e.target.value)}
                        className={inputCls} placeholder={defaultPort} />
                    </Field>
                  </div>
                  <Field label="DATABASE">
                    <input value={database} onChange={(e) => setDatabase(e.target.value)}
                      className={inputCls} placeholder="my_database" />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="USER">
                      <input value={user} onChange={(e) => setUser(e.target.value)}
                        className={inputCls} placeholder="admin" />
                    </Field>
                    <Field label="PASSWORD">
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                        className={inputCls} placeholder="••••••••" />
                    </Field>
                  </div>
                </>
              )}

              {/* Test result */}
              {testResult && (
                <div className={`text-[11px] rounded-md px-3 py-2 border ${
                  testResult.success
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                    : "bg-red-500/10 text-red-400 border-red-500/25"
                }`}>
                  {testResult.success ? "✓ " + (testResult.message ?? "Connection OK") : "✕ " + testResult.error}
                </div>
              )}

              {connectError && (
                <div className="text-[11px] rounded-md px-3 py-2 border bg-red-500/10 text-red-400 border-red-500/25">
                  {connectError}
                </div>
              )}
            </div>
          )}

          {step === "tables" && (
            <div className="space-y-3">
              <div className="text-[10px] font-semibold text-zinc-500 tracking-wide">
                SELECT A TABLE ({tables.length} found)
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {tables.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTable(t.name)}
                    className={`w-full text-left px-3 py-2 rounded-md border text-[11px] transition ${
                      selectedTable === t.name
                        ? "border-pureql-accent/50 bg-pureql-accent-dim text-pureql-accent"
                        : "border-pureql-border text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{t.name}</span>
                      <span className="text-zinc-500 text-[10px]">
                        {t.rowCount != null ? t.rowCount.toLocaleString() + " rows" : ""}
                        {t.isView ? " · view" : ""}
                      </span>
                    </div>
                    <div className="text-zinc-600 text-[10px] mt-0.5">
                      {t.columns.slice(0, 4).map((c) => c.name).join(", ")}
                      {t.columns.length > 4 ? ` +${t.columns.length - 4} more` : ""}
                    </div>
                  </button>
                ))}
              </div>

              {selectedTable && (
                <Field label="ROW LIMIT (optional)">
                  <input
                    value={tableLimit}
                    onChange={(e) => setTableLimit(e.target.value)}
                    className={inputCls}
                    placeholder="10000 (leave blank for all)"
                  />
                </Field>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-pureql-border flex justify-between items-center shrink-0">
          {step === "configure" ? (
            <>
              <button onClick={handleTest} disabled={testing}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 transition disabled:opacity-50">
                {testing ? "Testing…" : "Test connection"}
              </button>
              <div className="flex gap-2">
                <button onClick={onClose}
                  className="px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition">
                  Cancel
                </button>
                <button onClick={handleConnect} disabled={connecting}
                  className="px-4 py-1.5 text-[11px] bg-pureql-accent/20 text-pureql-accent border border-pureql-accent/30 rounded hover:bg-pureql-accent/30 transition disabled:opacity-50">
                  {connecting ? "Connecting…" : "Connect →"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={() => setStep("configure")}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 transition">
                ← Back
              </button>
              <button onClick={handleLoadTable} disabled={!selectedTable || loadingTable}
                className="px-4 py-1.5 text-[11px] bg-pureql-accent/20 text-pureql-accent border border-pureql-accent/30 rounded hover:bg-pureql-accent/30 transition disabled:opacity-50 disabled:cursor-not-allowed">
                {loadingTable ? "Loading…" : "Load Table →"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 font-semibold tracking-wide block mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-pureql-dark border border-pureql-border rounded px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-pureql-accent/50 transition";
