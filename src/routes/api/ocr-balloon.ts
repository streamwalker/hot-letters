import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

type Body = { imageBase64?: string; mimeType?: string };

// Dedicated OCR endpoint for a cropped image of a single comic word balloon.
// Differs from /api/ocr-script: the prompt is tuned to return ONLY the dialogue text
// inside the balloon (no character cues, no panel headings, no commentary).
export const Route = createFileRoute("/api/ocr-balloon")({
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
            : "image/png";

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
                  "You transcribe the text inside a single comic-book word balloon. Output ONLY the dialogue exactly as lettered — preserve line breaks, punctuation, emphasis like ALL CAPS, and word-balloon conventions (e.g. '...', '--'). Do NOT add the speaker's name, do NOT add quotation marks, do NOT add commentary. If the image contains no readable text, return an empty string.",
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Transcribe the text inside this word balloon." },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          if (resp.status === 402) {
            return Response.json(
              { error: "credits_exhausted", message: "Lovable AI credits exhausted. Please top up in your workspace billing settings." },
              { status: 402 },
            );
          }
          if (resp.status === 429) {
            return Response.json(
              { error: "rate_limited", message: "AI is rate-limited. Please wait a moment and try again." },
              { status: 429 },
            );
          }
          return new Response(`AI gateway error ${resp.status}: ${errText}`, { status: 502 });
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
