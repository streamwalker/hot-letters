import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import "../letterer.css";
// @ts-expect-error raw import
import bodyHtml from "../letterer-body.html?raw";
// @ts-expect-error raw import
import appJs from "../letterer-app.js?raw";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no",
      },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "theme-color", content: "#1a1d23" },
      { title: "Comic Book Letterer — v002" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bangers&family=Bungee&family=Comic+Neue:wght@400;700&family=Kalam:wght@400;700&family=Luckiest+Guy&family=Permanent+Marker&display=swap",
      },
    ],
  }),
  component: Letterer,
});

function Letterer() {
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const s = document.createElement("script");
    s.textContent = appJs as string;
    document.body.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  return (
    <div
      id="letterer-root"
      dangerouslySetInnerHTML={{ __html: bodyHtml as string }}
    />
  );
}
