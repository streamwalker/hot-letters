import { useEffect, useRef, useState } from "react";
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

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

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

  // Initial load: fetch projects, restore active or create "Untitled".
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

        let list: ProjectRow[] = rows ?? [];
        // Bootstrap a default project for brand-new users.
        if (list.length === 0) {
          const { data: created, error: cErr } = await supabase
            .from("projects")
            .insert({ user_id: u.user.id, name: "Untitled", data: {} })
            .select("id, name, updated_at")
            .single();
          if (cErr) throw cErr;
          list = [created as ProjectRow];
        }
        if (cancelled) return;
        setProjects(list);

        const stored = (() => {
          try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
        })();
        const initial = list.find((p) => p.id === stored) ?? list[0];
        await loadProject(initial.id);
      } catch (e) {
        console.error("ProjectManager init failed", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function loadProject(id: string) {
    loadedRef.current = false;
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
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const payload = window.__letterer!.serialize();
          const now = new Date().toISOString();
          const { error: e } = await supabase
            .from("projects")
            .update({ data: payload as never, updated_at: now })
            .eq("id", id);
          if (e) throw e;
          setProjects((prev) =>
            prev.map((p) => (p.id === id ? { ...p, updated_at: now } : p)),
          );
        } catch (e) {
          console.error("Autosave failed", e);
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

  async function handleSaveAs() {
    if (!userId || busy) return;
    const suggested = `${currentName() || "Untitled"} copy`;
    const name = promptName(suggested);
    if (!name) return;
    if (projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      window.alert(`A project named "${name}" already exists. Pick a different name.`);
      return;
    }
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
    const name = promptName(currentName());
    if (!name || name === currentName()) return;
    if (projects.some((p) => p.id !== activeId && p.name.toLowerCase() === name.toLowerCase())) {
      window.alert(`A project named "${name}" already exists.`);
      return;
    }
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
        // Bootstrap a fresh Untitled so the user always has a project.
        loadedRef.current = false;
        if (window.__letterer) {
          try { window.__letterer.load({}); } catch { /* ignore */ }
        }
        const { data: created, error: cErr } = await supabase
          .from("projects")
          .insert({ user_id: userId, name: "Untitled", data: {} })
          .select("id, name, updated_at")
          .single();
        if (cErr) throw cErr;
        const row = created as ProjectRow;
        setProjects([row]);
        setActiveId(row.id);
        try { localStorage.setItem(ACTIVE_KEY, row.id); } catch { /* ignore */ }
        loadedRef.current = true;
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
    // Flush any pending autosave for the outgoing project before switching.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const out = activeIdRef.current;
      if (out && window.__letterer) {
        try {
          const payload = window.__letterer.serialize();
          await supabase
            .from("projects")
            .update({ data: payload as never, updated_at: new Date().toISOString() })
            .eq("id", out);
        } catch (e) {
          console.error("Flush before switch failed", e);
        }
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
      <select
        value={activeId ?? ""}
        onChange={(e) => handleSwitch(e.target.value)}
        disabled={busy || projects.length === 0}
        aria-label="Active project"
        style={{
          ...baseBtn,
          padding: "5px 8px",
          maxWidth: 220,
        }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
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
    </div>
  );
}
