import type { Metadata } from "next";

import { SectionStub } from "@/components/app-shell/section-stub";

export const metadata: Metadata = {
  title: "Contacts",
};

export default function ContactsPage() {
  return (
    <SectionStub
      title="Contacts"
      description="People, roles and relationship history would live here."
    />
  );
}
