import { useEffect, useState } from "react";
import {
  type ErrorEntry,
  clearEntries,
  exportJson,
  subscribe,
} from "@/lib/error-tracker";

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false }) +
    "." + d.getMilliseconds().toString().padStart(3, "0");
};

const kindColor: Record<ErrorEntry["kind"], string> = {
  error: "#ff5757",
  unhandledrejection: "#ff8a3d",
  console: "#ffd166",
  network: "#4ea1ff",
};

export function ErrorTrackerPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ErrorEntry[]>([]);

  useEffect(() => subscribe(setEntries), []);

  const errorCount = entries.filter((e) => e.level === "error").length;

  function download() {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `error-log-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Error log"
        style={{
          position: "fixed",
          bottom: 10,
          right: 10,
          zIndex: 2147483646,
          background: errorCount ? "#c0392b" : "#2c313a",
          color: "#fff",
          border: "1px solid #3a414d",
          borderRadius: 999,
          padding: "5px 10px",
          fontSize: 11,
          fontFamily: "monospace",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        ⚠ {errorCount}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 10,
            bottom: 46,
            width: "min(560px, calc(100vw - 20px))",
            maxHeight: "60vh",
            zIndex: 2147483647,
            background: "#1a1d23",
            color: "#e6e9ef",
            border: "1px solid #3a414d",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
            boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderBottom: "1px solid #3a414d",
            }}
          >
            <strong style={{ flex: 1 }}>
              Error log ({entries.length})
            </strong>
            <button onClick={download} style={btnStyle}>Download JSON</button>
            <button onClick={() => clearEntries()} style={btnStyle}>Clear</button>
            <button onClick={() => setOpen(false)} style={btnStyle}>Close</button>
          </div>
          <div style={{ overflow: "auto", padding: 6 }}>
            {entries.length === 0 && (
              <div style={{ padding: 12, color: "#8a93a6" }}>
                No errors captured yet.
              </div>
            )}
            {entries.slice().reverse().map((e) => (
              <div
                key={e.id}
                style={{
                  padding: "6px 8px",
                  borderBottom: "1px solid #2c313a",
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  fontSize: 11,
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ color: "#8a93a6" }}>{fmtTime(e.ts)}</span>
                  <span
                    style={{
                      color: kindColor[e.kind],
                      fontWeight: 700,
                      textTransform: "uppercase",
                      fontSize: 10,
                    }}
                  >
                    {e.kind}
                  </span>
                  {e.status !== undefined && (
                    <span style={{ color: "#ff8a3d" }}>{e.status}</span>
                  )}
                </div>
                <div>{e.message}</div>
                {e.stack && (
                  <details style={{ marginTop: 2, color: "#8a93a6" }}>
                    <summary style={{ cursor: "pointer" }}>stack</summary>
                    <pre style={{ margin: 0, fontSize: 10 }}>{e.stack}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#2c313a",
  color: "#e6e9ef",
  border: "1px solid #3a414d",
  borderRadius: 4,
  padding: "3px 8px",
  fontSize: 11,
  cursor: "pointer",
};
