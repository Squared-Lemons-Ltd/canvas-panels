import type { Metadata } from "next";

import { SectionStub } from "@/components/app-shell/section-stub";

export const metadata: Metadata = {
  title: "Reports",
};

export default function ReportsPage() {
  return (
    <SectionStub
      title="Reports"
      description="Forecasts, win rates and cohort analysis would live here."
    />
  );
}
