"use client";

/**
 * Mutterschutz Dashboard — nutzt die generische ProcessDashboard-Komponente
 */

import { ProcessDashboard } from "@/components/process-dashboard";
import { NeuerMutterschutzModal } from "@/components/neuer-mutterschutz-modal";
import { mutterschutzDashboardConfig } from "./mutterschutz-config";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

const CREATE_ROLES = [
  "SUPER_ADMIN",
  "HR_LEITUNG",
  "HR_SACHBEARBEITER",
  "EINRICHTUNGSLEITUNG",
];

export function MutterschutzDashboardContent({ user }: { user: User }) {
  const canCreate = CREATE_ROLES.includes(user.role);
  return (
    <ProcessDashboard
      config={mutterschutzDashboardConfig}
      renderCreateModal={
        canCreate
          ? ({ open, onClose, onCreated }) => (
              <NeuerMutterschutzModal
                open={open}
                onClose={onClose}
                onCreated={onCreated}
              />
            )
          : undefined
      }
    />
  );
}
