import { CourierShell } from "@/components/shell/courier-shell";

export default function CourierLayout({ children }: LayoutProps<"/courier">) {
  return <CourierShell>{children}</CourierShell>;
}
