import { Card, PageHeader } from "@/components/ui";
import { requireSupplier } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { fileUrl } from "@/lib/storage";
import { ProfileForm } from "./form";
import { OrderTermsForm } from "./terms-form";
import { Tr } from "@/components/ui/tr";

export default async function SupplierProfilePage() {
  const ctx = await requireSupplier(["OWNER", "ADMIN"]);
  const s = ctx.supplier;
  const territories = await getTerritoryOptions();
  const logo = fileUrl(s.logoPath);
  return (
    <>
      <PageHeader title="Профиль компании" subtitle={`ИНН ${s.inn} · изменить ИНН может только администратор платформы`} />
      <Card className="max-w-3xl">
        {logo && <img src={logo} alt="" className="mb-4 size-20 rounded-lg object-cover ring-1 ring-gray-200" />}
        <ProfileForm
          territories={territories}
          defaults={{
            legalName: s.legalName,
            displayName: s.displayName,
            inn: s.inn,
            legalAddress: s.legalAddress,
            companyPhone: s.phone,
            email: s.email,
            website: s.website ?? "",
            contactPerson: s.contactPerson,
            description: s.description ?? "",
            officeTerritoryId: s.officeTerritoryId ?? "",
            officeAddress: s.officeAddress,
            officeLat: s.officeLat?.toString() ?? "",
            officeLng: s.officeLng?.toString() ?? "",
          }}
        />
      </Card>
      <Card className="mt-6 max-w-3xl">
        <h2 className="mb-1 text-base font-semibold"><Tr>Условия заказа</Tr></h2>
        <p className="mb-4 text-sm text-gray-500"><Tr>Дни доставки задаются по районам на странице «Территория доставки».</Tr></p>
        <OrderTermsForm
          defaults={{
            minOrderTotal: s.minOrderTotal?.toString() ?? "",
            orderCutoffHour: s.orderCutoffHour?.toString() ?? "",
            creditOverLimitBlock: s.creditOverLimitBlock,
            skipAssembly: s.skipAssembly,
          }}
        />
      </Card>
    </>
  );
}
