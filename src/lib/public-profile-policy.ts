/** New accounts must never expose the legal first/last name by default. */
export function initialPublicDisplayName(username: string) {
  return username.trim();
}

/** Pure helper documenting which old default is eligible for migration. */
export function isLegacyLegalDisplayName(
  displayName: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) {
  const legalName = [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
  return Boolean(legalName && displayName?.trim().localeCompare(legalName, undefined, { sensitivity: "accent" }) === 0);
}
