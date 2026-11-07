import { PageTransition } from "@/components/shell/page-transition";

// Плавная смена страниц раздела (см. PageTransition)
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
