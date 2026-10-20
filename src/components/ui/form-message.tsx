import { Alert } from "./index";
import type { FormState } from "@/lib/forms";

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}
