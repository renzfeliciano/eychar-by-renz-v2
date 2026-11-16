const TYPES: [code: string, name: string][] = [
  ["drivers_license", "Driver's License"],
  ["passport", "Passport"],
  ["umid", "UMID"],
  ["voters_id", "Voter's ID"],
  ["postal_id", "Postal ID"],
  ["national_id", "National ID (PhilSys)"],
  ["senior_citizen_id", "Senior Citizen ID"],
  ["barangay_id", "Barangay ID"],
];

/**
 * The government ID types a new organization starts with. Starting data only: each organization can add,
 * rename or retire types under Settings › Catalogs, so nothing in the code depends on these codes.
 * The codes are stable because an employee's ID record stores the code, not the name.
 */
export const GOVERNMENT_ID_TYPE_DEFAULTS: { code: string; name: string; sortOrder: number }[] = TYPES.map(([code, name], sortOrder) => ({ code, name, sortOrder }));
