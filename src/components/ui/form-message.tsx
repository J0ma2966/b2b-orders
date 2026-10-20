import { Alert } from "./index";
import { Tr } from "./tr";
import type { FormState } from "@/lib/forms";

export function FormMessage({ state }: { state: FormState }) {
  const details = state.details?.length ? (
    <ul className="mt-1 list-disc pl-5">
      {state.details.map((d) => <li key={d}><Tr>{d}</Tr></li>)}
    </ul>
  ) : null;
  if (state.error) return <Alert tone={state.details?.length ? "warning" : "error"}><Tr>{state.error}</Tr>{details}</Alert>;
  if (state.ok && state.message) return <Alert tone="success"><Tr>{state.message}</Tr>{details}</Alert>;
  return null;
}
