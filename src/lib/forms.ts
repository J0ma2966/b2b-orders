import { z } from "zod";

export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  // Подробности к сообщению (например, что изменилось в корзине)
  details?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
  // Значения, чтобы форма не очищалась после ошибки
  values?: Record<string, string>;
  // Метка успешной отправки: по ней форма сбрасывается (key={state.at})
  at?: number;
};

export function success(message: string): FormState {
  return { ok: true, message, at: Date.now() };
}

export const initialFormState: FormState = {};

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string" || k.startsWith("$") || /password/i.test(k)) continue;
    // Множественные поля (name="x[]") собираем через запятую
    values[k] = k.endsWith("[]") && values[k] ? `${values[k]},${v}` : v;
  }
  return values;
}

export function parseForm<T extends z.ZodType>(schema: T, formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const all = formData.getAll(key).filter((v) => typeof v === "string");
    raw[key] = key.endsWith("[]") ? all : all[0];
  }
  return schema.safeParse(raw);
}

export function invalid(error: z.ZodError, formData: FormData): FormState {
  return {
    error: "Проверьте правильность заполнения полей",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
    values: formValues(formData),
  };
}

// Общие поля
export const req = (msg = "Обязательное поле") => z.string({ error: msg }).trim().min(1, msg);
export const opt = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined));
export const coord = (msg: string) =>
  z.coerce.number({ error: msg }).refine((n) => Number.isFinite(n) && n !== 0, msg);
