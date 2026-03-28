"use client";

/**
 * Offboarding Dashboard — nutzt die generische ProcessDashboard-Komponente
 */

import { ProcessDashboard } from "@/components/process-dashboard";
import { NeuerAustrittModal } from "@/components/neuer-austritt-modal";
import { offboardingDashboardConfig } from "./offboarding-config";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

export function OffboardingDashboardContent({ }: { user: User }) {
  return (
    <ProcessDashboard
      config={offboardingDashboardConfig}
      renderCreateModal={({ open, onClose, onCreated }) => (
        <NeuerAustrittModal open={open} onClose={onClose} onCreated={onCreated} />
      )}
    />
  );
}
