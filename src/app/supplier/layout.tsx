import { SupplierShell } from "@/components/shell/supplier-shell";

export default function SupplierLayout({ children }: LayoutProps<"/supplier">) {
  return <SupplierShell>{children}</SupplierShell>;
}
