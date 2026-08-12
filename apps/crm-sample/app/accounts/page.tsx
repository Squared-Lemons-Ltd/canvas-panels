import type { Metadata } from "next";

import { SectionStub } from "@/components/app-shell/section-stub";

export const metadata: Metadata = {
  title: "Accounts",
};

export default function AccountsPage() {
  return (
    <SectionStub
      title="Accounts"
      description="Company records, hierarchies and ownership would live here."
    />
  );
}
