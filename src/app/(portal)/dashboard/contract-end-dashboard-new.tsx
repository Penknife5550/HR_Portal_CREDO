"use client";

import { ProcessDashboard } from "@/components/process-dashboard";
import { NeuerVertragsendeModal } from "@/components/neuer-vertragsende-modal";
import { contractEndDashboardConfig } from "./contract-end-config";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

export function ContractEndDashboardContent({ user: _user }: { user: User }) {
  return (
    <ProcessDashboard
      config={contractEndDashboardConfig}
      renderCreateModal={({ open, onClose, onCreated }) => (
        <NeuerVertragsendeModal open={open} onClose={onClose} onCreated={onCreated} />
      )}
    />
  );
}
