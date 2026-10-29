import Link from "next/link";
import { Tr } from "@/components/ui/tr";

// Под формой регистрации: ссылка на политику конфиденциальности (App Store 5.1.1, Google Play User Data)
export function PrivacyNote() {
  return (
    <p className="text-xs text-gray-500">
      <Tr>Регистрируясь, вы соглашаетесь с</Tr>{" "}
      <Link href="/privacy" target="_blank" className="text-brand-600 hover:underline"><Tr>политикой конфиденциальности</Tr></Link>
    </p>
  );
}
