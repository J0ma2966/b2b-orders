import { AdminShell } from "@/components/shell/admin-shell";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
