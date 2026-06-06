import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/panelcraft")({
  component: PanelcraftPage,
  head: () => ({
    meta: [
      { title: "Panelcraft" },
      { name: "description", content: "Embedded Panelcraft artifact." },
    ],
  }),
});

function PanelcraftPage() {
  return (
    <div style={{ width: "100%", height: "100vh", margin: 0 }}>
      <iframe
        src="https://claude.site/public/artifacts/867764f4-a46f-48df-80d1-98f735e4b6a2/embed"
        title="panelcraft.jsx"
        width="100%"
        height="600"
        frameBorder="0"
        allow="clipboard-write"
        allowFullScreen
        style={{ width: "100%", height: "100%", border: 0 }}
      />
    </div>
  );
}
