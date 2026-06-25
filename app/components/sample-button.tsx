"use client";

import { useRouter } from "next/navigation";
import { sampleIntake } from "@/lib/sample-intake";
import { buildReport } from "@/lib/report-builder";
import { saveReportToSession } from "@/lib/default-intake";

export function SampleButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  function load() {
    const report = buildReport(sampleIntake(), new Date().toISOString());
    saveReportToSession(report, sampleIntake());
    router.push("/report");
  }
  return (
    <button onClick={load} className={className}>
      {children}
    </button>
  );
}
