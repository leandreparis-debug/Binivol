"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { MAX_IMPORT_BYTES } from "@/server/import/file";
import { runImport, type ImportOutcome } from "@/server/import/service";

/** The workbook, read in memory and never stored. */
const workbookInput = z.object({
  file: z
    .instanceof(File, { message: "Choisissez un fichier .xlsx." })
    .refine((f) => f.size > 0, "Le fichier est vide.")
    .refine((f) => f.size <= MAX_IMPORT_BYTES, "Le fichier dépasse la taille maximale de 5 Mo."),
});

async function run(
  file: File,
  actor: { userId: string; name: string },
  dryRun: boolean,
): Promise<ImportOutcome> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const outcome = await runImport(getDb(), {
    actor: { userId: actor.userId, label: actor.name },
    fileName: file.name,
    buffer,
    dryRun,
  });
  revalidatePath("/admin/import");
  return outcome;
}

/** Simulation: reads the workbook and reports, writes nothing but the run history. */
export const simulateImportAction = defineAction({
  action: "import.run",
  input: workbookInput,
  handler: ({ input, actor }) => run(input.file, actor, true),
});

/** Real import of the same file as the last simulation (< 30 min, same account). */
export const runImportAction = defineAction({
  action: "import.run",
  input: workbookInput,
  handler: ({ input, actor }) => run(input.file, actor, false),
});
