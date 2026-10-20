import { Alert } from "./index";
import type { FormState } from "@/lib/forms";

export function FormMessage({ state }: { state: FormState }) {
  const details = state.details?.length ? (
    <ul className="mt-1 list-disc pl-5">
      {state.details.map((d) => <li key={d}>{d}</li>)}
    </ul>
  ) : null;
  if (state.error) return <Alert tone={state.details?.length ? "warning" : "error"}>{state.error}{details}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}{details}</Alert>;
  return null;
}
