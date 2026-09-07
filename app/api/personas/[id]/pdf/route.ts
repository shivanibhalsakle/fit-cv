import { auth } from "@/lib/auth";
import { buildResumeDoc } from "@/lib/resume-doc";
import { renderResumePdf } from "@/lib/render-pdf";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await buildResumeDoc(id);
  if (!doc) return new Response("Not found", { status: 404 });

  const { buffer, pageCount } = await renderResumePdf(doc);

  // ?download=1 forces a save dialog; without it the PDF renders inline in the
  // preview iframe.
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `${doc.contact.name.replace(/\s+/g, "_")}_${doc.personaName.replace(/\s+/g, "_")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "X-Page-Count": String(pageCount),
      "Cache-Control": "no-store",
    },
  });
}
