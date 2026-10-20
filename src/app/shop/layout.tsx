import { ShopShell } from "@/components/shell/shop-shell";
import { SHOP_MOBILE_NAV, SHOP_NAV } from "@/components/shell/shop-nav";

export default function ShopLayout({ children }: LayoutProps<"/shop">) {
  return (
    <ShopShell nav={SHOP_NAV} mobileNav={SHOP_MOBILE_NAV}>
      {children}
    </ShopShell>
  );
}
