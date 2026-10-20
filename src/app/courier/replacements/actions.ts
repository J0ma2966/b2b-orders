"use server";

import { revalidatePath } from "next/cache";
import { requireSupplier } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";
import { OrderError } from "@/lib/orders";
import { completeReplacement } from "@/lib/replacements";
import { realFiles, saveImage, UploadError } from "@/lib/storage";
import { StockError } from "@/lib/stock";
import { success, type FormState } from "@/lib/forms";

export async function completeReplacementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSupplier(["COURIER"]);
  const id = String(formData.get("id") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || null;
  try {
    const photos: string[] = [];
    for (const f of realFiles(formData, "photos", 4)) photos.push(await saveImage(f, "returned"));
    await completeReplacement(ctx.auth.user.id, id, comment, photos);
  } catch (e) {
    if (e instanceof OrderError || e instanceof StockError || e instanceof UploadError) return { error: e.message };
    throw e;
  }
  await writeAudit({ entity: "Replacement", entityId: id, action: "complete", actorRole: "COURIER", supplierId: ctx.supplier.id, comment });
  revalidatePath("/courier", "layout");
  return success("Замена выполнена, забранный товар передан в «Возвращённые»");
}
