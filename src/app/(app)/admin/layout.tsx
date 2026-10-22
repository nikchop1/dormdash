import { requireAdmin } from "@/lib/auth/session";
import { AdminTabs } from "./tabs";

// Server-side role gate for every /admin page (not just a hidden button).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8">
      <AdminTabs />
      {children}
    </div>
  );
}
