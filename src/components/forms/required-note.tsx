import { RequiredMark } from "@/components/ui";
import { Tr } from "@/components/ui/tr";

// Пояснение к звёздочкам над формой
export function RequiredNote() {
  return (
    <p className="text-xs text-gray-500" data-testid="required-note">
      <RequiredMark /> <Tr>— обязательные поля</Tr>
    </p>
  );
}
