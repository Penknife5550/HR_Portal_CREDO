"use client";

/**
 * Verbeamtung Dashboard — nutzt die generische ProcessDashboard-Komponente
 */

import { ProcessDashboard } from "@/components/process-dashboard";
import { civilServiceDashboardConfig } from "./civil-service-config";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

export function CivilServiceDashboardContent({ }: { user: User }) {
  return (
    <ProcessDashboard
      config={civilServiceDashboardConfig}
    />
  );
}
