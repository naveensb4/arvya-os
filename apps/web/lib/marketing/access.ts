import { notFound } from "next/navigation";

export function assertMarketingOsAccess(searchParams?: { key?: string }) {
  const requiredKey = process.env.MARKETING_OS_INTERNAL_KEY?.trim();
  if (!requiredKey) return;
  if (searchParams?.key === requiredKey) return;
  notFound();
}

export function marketingDryRunEnabled() {
  return process.env.MARKETING_OS_DRY_RUN !== "false";
}
