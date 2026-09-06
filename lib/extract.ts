import mammoth from "mammoth";

/**
 * Resume file → plain text. Deterministic and free; no model involved.
 *
 * Uses unpdf (a serverless-friendly pdfjs build) rather than the pdftotext
 * binary, because the deploy target has no system binaries. Extraction quality
 * on single-column, text-based resumes is equivalent.
 */

export type ExtractResult = {
  text: string;
  pageCount: number | null;
  kind: "pdf" | "docx" | "text";
};

export class ExtractError extends Error {}

const MAX_BYTES = 10 * 1024 * 1024;

export async function extractText(
  bytes: Uint8Array,
  filename: string,
): Promise<ExtractResult> {
  if (bytes.byteLength === 0) throw new ExtractError("The file is empty.");
  if (bytes.byteLength > MAX_BYTES) {
    throw new ExtractError("File is larger than 10 MB.");
  }

  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf") {
    // Imported lazily: unpdf pulls in a large pdfjs bundle that should not load
    // on requests that never touch a PDF.
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await pdfText(pdf, { mergePages: true });
    const clean = normalise(text);
    if (!clean.trim()) {
      throw new ExtractError(
        "No text found in this PDF. It is probably a scan or an image export — paste the text instead.",
      );
    }
    return { text: clean, pageCount: totalPages, kind: "pdf" };
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    const clean = normalise(value);
    if (!clean.trim()) throw new ExtractError("No text found in this document.");
    return { text: clean, pageCount: null, kind: "docx" };
  }

  if (ext === "txt" || ext === "md") {
    const clean = normalise(new TextDecoder().decode(bytes));
    if (!clean.trim()) throw new ExtractError("The file is empty.");
    return { text: clean, pageCount: null, kind: "text" };
  }

  if (ext === "doc") {
    throw new ExtractError(
      "Legacy .doc is not supported. Save as .docx or PDF, or paste the text.",
    );
  }

  throw new ExtractError(
    `Unsupported file type “.${ext}”. Use PDF, DOCX, TXT, or paste the text.`,
  );
}

/**
 * PDF extraction leaves ligatures, non-breaking spaces, and bullet glyphs that
 * would otherwise reach the model as noise or become part of stored bullet text.
 */
function normalise(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    // Leading bullet glyphs, including the private-use characters some PDF
    // fonts emit in place of a bullet.
    .replace(/^[ 	]*[•●▪‣◦·--]+[ 	]*/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
