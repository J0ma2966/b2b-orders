import { Field, Input } from "@/components/ui";
import { Tr } from "@/components/ui/tr";
import type { FormState } from "@/lib/forms";
import { PhoneConfirm } from "./phone-confirm";

export type PhoneConfirmChannels = { telegram: "bot" | "gateway" | null; sms: boolean } | null;

// Поля учётной записи при регистрации (не показываются, если пользователь уже вошёл).
// confirm — способы подтверждения номера кодом (null, если на сервере не настроены ни бот, ни SMS).
export function AccountFields({ state, confirm = null }: { state: FormState; confirm?: PhoneConfirmChannels }) {
  const e = state.fieldErrors ?? {};
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-base font-semibold"><Tr>Учётная запись</Tr></legend>

      <Field label="Ваше ФИО" name="fullName" error={e.fullName}>
        <Input name="fullName" autoComplete="name" defaultValue={state.values?.fullName} required />
      </Field>
      <Field label="Телефон для входа" name="loginPhone" error={e.loginPhone}>
        <Input name="loginPhone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+998 90 123-45-67" defaultValue={state.values?.loginPhone} required />
      </Field>
      {confirm && <PhoneConfirm telegram={confirm.telegram} sms={confirm.sms} error={e.phoneCode} defaultCode={state.values?.phoneCode} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Пароль" name="password" error={e.password} hint="Минимум 8 символов">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Повторите пароль" name="password2" error={e.password2}>
          <Input name="password2" type="password" autoComplete="new-password" required />
        </Field>
      </div>
    </fieldset>
  );
}
