import { Card, PageHeader } from "@/components/ui";
import { requireSupplier } from "@/lib/auth/current";
import { getTerritoryOptions } from "@/lib/territory";
import { fileUrl } from "@/lib/storage";
import { ProfileForm } from "./form";

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
    </>
  );
}
