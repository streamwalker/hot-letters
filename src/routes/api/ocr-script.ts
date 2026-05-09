import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

type Body = { imageBase64?: string; mimeType?: string };

export const Route = createFileRoute("/api/ocr-script")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const { imageBase64, mimeType } = body;
        if (!imageBase64 || typeof imageBase64 !== "string") {
          return new Response("imageBase64 required", { status: 400 });
        }
        const mt =
          typeof mimeType === "string" && /^image\/(png|jpeg|jpg|gif|webp)$/i.test(mimeType)
            ? mimeType
            : "image/jpeg";

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const dataUrl = `data:${mt};base64,${imageBase64}`;

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are an OCR assistant for comic book scripts. Transcribe the script page exactly as written, preserving panel headings, character cues (e.g. 'SARA:'), parentheticals, dialogue, captions, and SFX in the original reading order. Output plain text only — no commentary, no markdown.",
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Transcribe this script page." },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          return new Response(`AI gateway error ${resp.status}: ${errText}`, {
            status: resp.status === 429 || resp.status === 402 ? resp.status : 502,
          });
        }
        const data = (await resp.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = data.choices?.[0]?.message?.content?.trim() ?? "";
        return Response.json({ text });
      },
    },
  },
});
