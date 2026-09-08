import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Temporary diagnostic for #39; remove before merge.
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function diagnose(buffer) {
  const utf8 = buffer.toString("utf8");
  const lf = utf8.replace(/\r\n/g, "\n");
  const crlf = lf.replace(/\n/g, "\r\n");
  const withoutBom = utf8.replace(/^\uFEFF/, "");
  const withoutBomLf = withoutBom.replace(/\r\n/g, "\n");
  const withoutBomCrlf = withoutBomLf.replace(/\n/g, "\r\n");
  const stripFinalNewline = (value) => value.replace(/(?:\r\n|\n)$/, "");
  return {
    bytes: buffer.length,
    startsWithBom: buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    crlfCount: (utf8.match(/\r\n/g) ?? []).length,
    lfCount: (utf8.match(/\n/g) ?? []).length,
    endsWithNewline: /(?:\r\n|\n)$/.test(utf8),
    raw: sha256(buffer),
    lf: sha256(lf),
    crlf: sha256(crlf),
    lfNoFinalNewline: sha256(stripFinalNewline(lf)),
    crlfNoFinalNewline: sha256(stripFinalNewline(crlf)),
    withoutBom: sha256(withoutBom),
    withoutBomLf: sha256(withoutBomLf),
    withoutBomCrlf: sha256(withoutBomCrlf),
    withoutBomLfNoFinalNewline: sha256(stripFinalNewline(withoutBomLf)),
    withoutBomCrlfNoFinalNewline: sha256(stripFinalNewline(withoutBomCrlf)),
  };
}

test("ISSUE 39 TEMPORARY: diagnose scientific CSV byte fingerprints", async () => {
  const relevance = await readFile(new URL("../EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.csv", import.meta.url));
  const functional = await readFile(new URL("../Movement_Pattern_to_Muscle_Function_Matrix.csv", import.meta.url));
  throw new Error(JSON.stringify({ relevance: diagnose(relevance), functional: diagnose(functional) }, null, 2));
});
