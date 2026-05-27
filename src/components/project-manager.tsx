import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ProjectRow = {
  id: string;
  name: string;
  updated_at: string;
};

const ACTIVE_KEY = "letterer:active-project-id";

/**
 * Manages the user's named projects: loads the active one into the letterer
 * editor, autosaves changes back to its row, and renders a top-left bar with
 * a project switcher, "Save As" (creates a new uniquely-named project), and
 * "Rename" (renames the active project).
 *
 * Waits for `window.__letterer` (provided by the bridge) before doing any
 * load/save so we never overwrite an unloaded project.
 */
export function ProjectManager() {
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const activeIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Tracks whether the editor has changes pending the debounced autosave.
  const dirtyRef = useRef(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  // Autosave status surfaced in the bar.
  // "idle"   → nothing pending, freshly loaded
  // "pending"→ user typed; debounce timer running before write
  // "saving" → write in flight
  // "saved"  → last write succeeded ("Up to date")
  // "error"  → last write failed; tooltip carries the message
  type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Close picker on outside click or Escape; focus search when opened.
  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Defer focus so the click that opened the picker doesn't immediately blur it.
    const t = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [pickerOpen]);

  // Wait for window.__letterer to be available.
  function waitForLetterer(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function tick() {
        if (typeof window !== "undefined" && window.__letterer) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error("letterer not ready"));
        setTimeout(tick, 50);
      })();
    });
  }

  // Initial load: fetch the user's projects but DO NOT auto-open one.
  // The user picks an existing project or starts a new one from the
  // selection screen rendered below.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user || cancelled) return;
        setUserId(u.user.id);

        const { data: rows, error: listErr } = await supabase
          .from("projects")
          .select("id, name, updated_at")
          .eq("user_id", u.user.id)
          .order("updated_at", { ascending: false });
        if (listErr) throw listErr;
        if (cancelled) return;
        setProjects(rows ?? []);
      } catch (e) {
        console.error("ProjectManager init failed", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleStartNew() {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await waitForLetterer();
      // Reset the editor to a blank state before creating the row, so the
      // new project doesn't inherit any leftover in-memory content.
      if (window.__letterer) {
        try { window.__letterer.load({}); } catch { /* ignore */ }
      }
      const name = suggestUniqueName("Untitled");
      const payload = window.__letterer ? window.__letterer.serialize() : {};
      const { data, error: e } = await supabase
        .from("projects")
        .insert({ user_id: userId, name, data: payload as never })
        .select("id, name, updated_at")
        .single();
      if (e) throw e;
      const row = data as ProjectRow;
      setProjects((prev) => [row, ...prev]);
      setActiveId(row.id);
      try { localStorage.setItem(ACTIVE_KEY, row.id); } catch { /* ignore */ }
      loadedRef.current = true;
      setSaveStatus("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Start new project failed", e);
      setError(msg);
      window.alert(`Could not start a new project: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadProject(id: string) {
    loadedRef.current = false;
    dirtyRef.current = false;
    setHasUnsaved(false);
    setSaveStatus("idle");
    setSaveError(null);
    setActiveId(id);
    try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
    try {
      await waitForLetterer();
      const { data, error: e } = await supabase
        .from("projects")
        .select("data")
        .eq("id", id)
        .single();
      if (e) throw e;
      if (window.__letterer) {
        try { window.__letterer.load(data?.data ?? {}); }
        catch (err) { console.error("Failed to load project payload", err); }
      }
      loadedRef.current = true;
    } catch (e) {
      console.error("loadProject failed", e);
    }
  }

  // Autosave on letterer:change → write to the active project row.
  useEffect(() => {
    function onChange() {
      const id = activeIdRef.current;
      if (!loadedRef.current || !id || !window.__letterer) return;
      dirtyRef.current = true;
      setHasUnsaved(true);
      setSaveStatus("pending");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          const payload = window.__letterer!.serialize();
          const now = new Date().toISOString();
          const { error: e } = await supabase
            .from("projects")
            .update({ data: payload as never, updated_at: now })
            .eq("id", id);
          if (e) throw e;
          dirtyRef.current = false;
          setHasUnsaved(false);
          setSaveStatus("saved");
          setSaveError(null);
          setSavedAt(now);
          setProjects((prev) =>
            prev.map((p) => (p.id === id ? { ...p, updated_at: now } : p)),
          );
        } catch (e) {
          console.error("Autosave failed", e);
          setSaveStatus("error");
          setSaveError(e instanceof Error ? e.message : String(e));
        }
      }, 1200);
    }
    window.addEventListener("letterer:change", onChange);
    return () => {
      window.removeEventListener("letterer:change", onChange);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function promptName(initial: string): string | null {
    const raw = window.prompt("Project name:", initial);
    if (raw == null) return null;
    const name = raw.trim();
    if (!name) return null;
    if (name.length > 80) return name.slice(0, 80);
    return name;
  }

  /**
   * If `name` collides with an existing project (excluding `excludeId`),
   * suggest "name (2)", "name (3)", … until one is free. Strips an existing
   * trailing " (N)" from the base so repeated retries don't snowball.
   */
  function suggestUniqueName(name: string, excludeId?: string | null): string {
    const taken = new Set(
      projects
        .filter((p) => p.id !== excludeId)
        .map((p) => p.name.toLowerCase()),
    );
    if (!taken.has(name.toLowerCase())) return name;
    const base = name.replace(/\s*\(\d+\)\s*$/, "").trim() || name;
    for (let n = 2; n < 1000; n++) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} ${Date.now()}`;
  }

  /**
   * Ask for a name, then if it conflicts offer a unique suggestion the user
   * can accept (OK), tweak (re-prompt), or cancel. Returns the final accepted
   * name or null if the user bailed out.
   */
  function promptUniqueName(initial: string, excludeId?: string | null): string | null {
    let candidate = promptName(initial);
    while (candidate) {
      const conflicts = projects.some(
        (p) => p.id !== excludeId && p.name.toLowerCase() === candidate!.toLowerCase(),
      );
      if (!conflicts) return candidate;
      const suggestion = suggestUniqueName(candidate, excludeId);
      const useIt = window.confirm(
        `"${candidate}" is already taken.\n\nUse "${suggestion}" instead?\n\n(Cancel to pick a different name.)`,
      );
      if (useIt) return suggestion;
      candidate = promptName(suggestion);
    }
    return null;
  }

  async function handleSaveAs() {
    if (!userId || busy) return;
    const suggested = suggestUniqueName(`${currentName() || "Untitled"} copy`);
    const name = promptUniqueName(suggested);
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      // Snapshot whatever is currently in the editor.
      const payload = window.__letterer ? window.__letterer.serialize() : {};
      const { data, error: e } = await supabase
        .from("projects")
        .insert({ user_id: userId, name, data: payload as never })
        .select("id, name, updated_at")
        .single();
      if (e) throw e;
      const row = data as ProjectRow;
      setProjects((prev) => [row, ...prev]);
      setActiveId(row.id);
      try { localStorage.setItem(ACTIVE_KEY, row.id); } catch { /* ignore */ }
      loadedRef.current = true; // editor content already matches the new row.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Save As failed", e);
      setError(msg);
      window.alert(`Could not save: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!userId || !activeId || busy) return;
    const name = promptUniqueName(currentName(), activeId);
    if (!name || name === currentName()) return;
    setBusy(true);
    try {
      const { error: e } = await supabase
        .from("projects")
        .update({ name })
        .eq("id", activeId);
      if (e) throw e;
      setProjects((prev) =>
        prev.map((p) => (p.id === activeId ? { ...p, name } : p)),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Rename failed", e);
      window.alert(`Could not rename: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!userId || !activeId || busy) return;
    const name = currentName();
    if (!window.confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    // Cancel any pending autosave for the project being deleted.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const deletingId = activeId;
    try {
      const { error: e } = await supabase.from("projects").delete().eq("id", deletingId);
      if (e) throw e;
      const remaining = projects.filter((p) => p.id !== deletingId);
      setProjects(remaining);
      if (remaining.length > 0) {
        await loadProject(remaining[0].id);
      } else {
        // No projects left — return to the selection screen instead of
        // auto-creating one. The user picks "Start new project" there.
        loadedRef.current = false;
        if (window.__letterer) {
          try { window.__letterer.load({}); } catch { /* ignore */ }
        }
        setActiveId(null);
        try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Delete failed", e);
      setError(msg);
      window.alert(`Could not delete: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitch(id: string) {
    if (id === activeId || busy) return;

    // If autosave hasn't caught up yet, ask before leaving — three options:
    //   OK     → save current edits, then switch
    //   Cancel → abort the switch and stay on the current project
    // (Discard isn't offered separately to keep this to a single browser
    // dialog; users who want to discard can switch back and undo.)
    if (dirtyRef.current) {
      const proceed = window.confirm(
        `"${currentName()}" has unsaved changes.\n\n` +
        `Save them and switch projects?\n\n` +
        `(Cancel to stay on this project.)`,
      );
      if (!proceed) return;
    }

    // Flush any pending autosave for the outgoing project before switching.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const out = activeIdRef.current;
    if (dirtyRef.current && out && window.__letterer) {
      setSaveStatus("saving");
      try {
        const payload = window.__letterer.serialize();
        await supabase
          .from("projects")
          .update({ data: payload as never, updated_at: new Date().toISOString() })
          .eq("id", out);
        dirtyRef.current = false;
        setHasUnsaved(false);
      } catch (e) {
        console.error("Flush before switch failed", e);
        setSaveStatus("error");
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    }
    await loadProject(id);
  }

  function currentName(): string {
    return projects.find((p) => p.id === activeId)?.name ?? "Untitled";
  }

  // Don't render the bar until init has progressed enough to avoid a flash.
  if (!userId) return null;

  const baseBtn: React.CSSProperties = {
    background: "#2c313a",
    color: "#e6e9ef",
    border: "1px solid #3a414d",
    padding: "5px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
  };

  // No project chosen yet → show the selection screen instead of the bar.
  if (!activeId) {
    return (
      <ProjectSelectionScreen
        projects={projects}
        busy={busy}
        error={error}
        onOpen={(id) => loadProject(id)}
        onStartNew={handleStartNew}
      />
    );
  }


  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 2000,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "rgba(20, 26, 38, 0.85)",
        border: "1px solid #3a414d",
        padding: "4px 6px",
        borderRadius: 8,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
      title={error ? `Error: ${error}` : "Projects"}
    >
      <span style={{ fontSize: 11, color: "#a9c2e6", padding: "0 4px" }}>
        Project
      </span>
      <ProjectPicker
        ref={pickerRef}
        projects={projects}
        activeId={activeId}
        open={pickerOpen}
        setOpen={setPickerOpen}
        query={query}
        setQuery={setQuery}
        highlight={highlight}
        setHighlight={setHighlight}
        searchInputRef={searchInputRef}
        busy={busy}
        baseBtn={baseBtn}
        onPick={(id) => { setPickerOpen(false); setQuery(""); handleSwitch(id); }}
      />
      <button
        type="button"
        onClick={handleSaveAs}
        disabled={busy}
        style={baseBtn}
        title="Save the current editor contents as a new named project"
      >
        Save As…
      </button>
      <button
        type="button"
        onClick={handleRename}
        disabled={busy || !activeId}
        style={baseBtn}
        title="Rename the active project"
      >
        Rename
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy || !activeId}
        style={{ ...baseBtn, background: "#5a2a2a", borderColor: "#7a3a3a" }}
        title="Delete the active project"
      >
        Delete
      </button>
      <SaveIndicator status={saveStatus} error={saveError} savedAt={savedAt} hasUnsaved={hasUnsaved} />
    </div>
  );
}

type PickerProps = {
  projects: ProjectRow[];
  activeId: string | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  query: string;
  setQuery: (v: string) => void;
  highlight: number;
  setHighlight: (v: number) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  busy: boolean;
  baseBtn: React.CSSProperties;
  onPick: (id: string) => void;
};

const ProjectPicker = React.forwardRef<HTMLDivElement, PickerProps>(function ProjectPicker(
  { projects, activeId, open, setOpen, query, setQuery, highlight, setHighlight,
    searchInputRef, busy, baseBtn, onPick },
  ref,
) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) => p.name.toLowerCase().includes(q))
    : projects;
  const activeName = projects.find((p) => p.id === activeId)?.name ?? "Select…";

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight, setHighlight]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(Math.min(highlight + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(Math.max(highlight - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlight];
      if (pick) onPick(pick.id);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={busy || projects.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch project"
        style={{
          ...baseBtn,
          padding: "5px 10px",
          maxWidth: 220,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{activeName}</span>
        <span style={{ opacity: 0.7, fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: 260,
            maxWidth: 360,
            background: "#1b212c",
            border: "1px solid #3a414d",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            padding: 6,
            zIndex: 2100,
          }}
        >
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search projects…"
            aria-label="Search projects"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#11151d",
              color: "#e6e9ef",
              border: "1px solid #3a414d",
              borderRadius: 6,
              padding: "6px 8px",
              fontSize: 12,
              outline: "none",
              marginBottom: 4,
            }}
          />
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "8px 6px", color: "#8aa0bf", fontSize: 12 }}>
                No matches
              </div>
            ) : (
              filtered.map((p, i) => {
                const isActive = p.id === activeId;
                const isHi = i === highlight;
                return (
                  <div
                    key={p.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => onPick(p.id)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 12,
                      color: "#e6e9ef",
                      background: isHi ? "#2c3543" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <span style={{ width: 10, color: "#7fb3ff" }}>{isActive ? "•" : ""}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});

type SaveStatusValue = "idle" | "pending" | "saving" | "saved" | "error";

function SaveIndicator({
  status, error, savedAt, hasUnsaved,
}: {
  status: SaveStatusValue;
  error: string | null;
  savedAt: string | null;
  hasUnsaved: boolean;
}) {
  // Re-render every 30s so the "Up to date · 2m ago" relative time stays fresh.
  const [, force] = useState(0);
  useEffect(() => {
    if (status !== "saved" || !savedAt) return;
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [status, savedAt]);

  let label = "Up to date";
  let dot = "#3ecf8e"; // green
  let title = "All changes saved";

  if (status === "idle" && !hasUnsaved) {
    label = "Up to date";
  } else if (status === "pending" || (status === "idle" && hasUnsaved)) {
    label = "Unsaved";
    dot = "#e0a73a"; // amber
    title = "Edits will autosave shortly";
  } else if (status === "saving") {
    label = "Saving…";
    dot = "#e0a73a";
    title = "Writing changes to the server";
  } else if (status === "saved") {
    label = savedAt ? `Up to date · ${relativeTime(savedAt)}` : "Up to date";
    title = savedAt ? `Last saved ${new Date(savedAt).toLocaleTimeString()}` : "All changes saved";
  } else if (status === "error") {
    label = "Save failed";
    dot = "#e05a5a"; // red
    title = error ? `Autosave error: ${error}` : "Autosave failed";
  }

  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginLeft: 2,
        padding: "0 8px",
        fontSize: 11,
        color: "#a9c2e6",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dot,
          boxShadow:
            status === "saving" || status === "pending"
              ? `0 0 0 0 ${dot}`
              : "none",
          animation:
            status === "saving" ? "letterer-pm-pulse 1.1s ease-in-out infinite" : undefined,
        }}
      />
      {label}
      <style>{`@keyframes letterer-pm-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }`}</style>
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
