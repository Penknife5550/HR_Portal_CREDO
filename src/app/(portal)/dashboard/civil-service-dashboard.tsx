"use client";

/**
 * Verbeamtung Dashboard — nutzt die generische ProcessDashboard-Komponente
 */

import { ProcessDashboard } from "@/components/process-dashboard";
import { NeueVerbeamtungModal } from "@/components/neue-verbeamtung-modal";
import { civilServiceDashboardConfig } from "./civil-service-config";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

const CREATE_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG"];

export function CivilServiceDashboardContent({ user }: { user: User }) {
  const canCreate = CREATE_ROLES.includes(user.role);
  return (
    <ProcessDashboard
      config={civilServiceDashboardConfig}
      renderCreateModal={canCreate ? ({ open, onClose, onCreated }) => (
        <NeueVerbeamtungModal open={open} onClose={onClose} onCreated={onCreated} />
      ) : undefined}
    />
  );
}
