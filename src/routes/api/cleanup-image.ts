import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

type Body = { imageDataUrl?: string; maskDataUrl?: string };

// AI-powered "Clean Up" inpainting for the loaded comic page image.
// Receives the current page image and a binary mask (white = erase) and asks
// Lovable AI to regenerate the page with the masked regions reconstructed.
export const Route = createFileRoute("/api/cleanup-image")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const { imageDataUrl, maskDataUrl } = body;
        if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
          return new Response("imageDataUrl required (data URL)", { status: 400 });
        }
        if (!maskDataUrl || !maskDataUrl.startsWith("data:image/")) {
          return new Response("maskDataUrl required (data URL)", { status: 400 });
        }
        // Soft cap to keep payloads sane.
        if (imageDataUrl.length > 12_000_000 || maskDataUrl.length > 12_000_000) {
          return new Response("Image too large", { status: 413 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const prompt =
          "You are performing an inpainting / 'clean up' edit on a comic book page. " +
          "The FIRST image is the original page. The SECOND image is a binary mask " +
          "where WHITE pixels mark the regions that must be erased and reconstructed, " +
          "and BLACK pixels mark regions that must be left COMPLETELY UNCHANGED. " +
          "Reconstruct the content beneath the white regions so the result is seamless: " +
          "match line weight, ink style, colour, shading, and texture of the surrounding art. " +
          "Do not redraw, restyle, or 'improve' any area outside the white mask. " +
          "Do not add new objects, characters, text, signatures, or watermarks. " +
          "Return ONLY the cleaned page image at the original aspect ratio and resolution.";

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            modalities: ["image", "text"],
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: imageDataUrl } },
                  { type: "image_url", image_url: { url: maskDataUrl } },
                ],
              },
            ],
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          const status =
            resp.status === 429 || resp.status === 402 ? resp.status : 502;
          return new Response(
            `AI gateway error ${resp.status}: ${errText.slice(0, 400)}`,
            { status },
          );
        }

        const data = (await resp.json()) as {
          choices?: {
            message?: {
              images?: { image_url?: { url?: string } }[];
              content?: string;
            };
          }[];
        };
        const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (!url || !url.startsWith("data:image/")) {
          return new Response("AI did not return an image", { status: 502 });
        }
        return Response.json({ imageDataUrl: url });
      },
    },
  },
});
