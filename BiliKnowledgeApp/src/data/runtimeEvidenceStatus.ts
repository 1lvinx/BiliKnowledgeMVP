export type RuntimeEvidenceStatusValue = "PASS" | "MISSING" | "STALE";

export interface RuntimeEvidenceStatus {
  status: RuntimeEvidenceStatusValue;
  lastRouteUrl: string;
  lastScreenshotPath: string;
  lastReportPath: string;
  lastVerifiedAt: string;
  evidenceRule: string;
}

export const runtimeEvidenceStatus: RuntimeEvidenceStatus = {
  status: "PASS",
  lastRouteUrl: "http://127.0.0.1:1420/",
  lastScreenshotPath: "/private/tmp/bili-runtime-evidence-capture.png",
  lastReportPath: "reports/runtime-evidence-capture-stabilization-2026-05-23.md",
  lastVerifiedAt: "2026-05-23 14:56 SGT",
  evidenceRule: "Build/test PASS alone is insufficient for UI-visible tasks.",
};
