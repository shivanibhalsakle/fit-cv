import { auth } from "@/lib/auth";
import { buildResumeDoc } from "@/lib/resume-doc";
import { toLatex } from "@/lib/latex";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await buildResumeDoc(id);
  if (!doc) return new Response("Not found", { status: 404 });

  const filename = `${doc.contact.name.replace(/\s+/g, "_")}_${doc.personaName.replace(/\s+/g, "_")}.tex`;

  return new Response(toLatex(doc), {
    headers: {
      "Content-Type": "application/x-tex; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
