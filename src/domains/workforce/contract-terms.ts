import { catalogFlag } from "@/domains/catalog/catalog-flags";

/**
 * When an employment has a contract that ends. Whether a type carries an
 * end-of-contract date is data on its catalog item
 * (`metadata.requiresEndOfContract`, e.g. Contractual, Probationary), never
 * a list of codes here (ENGINEERING.md §2). Pure, so client components and the
 * dashboard can use it, and the rules are tested directly.
 */

type TypeItem = { code: string; metadata?: unknown };

/** Whether an employment type needs an end-of-contract date. */
export function requiresEndOfContract(item: TypeItem | null | undefined): boolean {
  return item ? catalogFlag(item, "requiresEndOfContract") : false;
}

/**
 * Whether an end-of-contract date on an employment of `typeCode` counts.
 * A type the catalog says has no end date (Regular) never has a contract
 * ending, whatever date the record still carries from before. A code the
 * catalog doesn't list (deactivated, or a catalog never set up) keeps its
 * date, so nothing that used to show disappears silently.
 */
export function contractEndApplies(typeCode: string | null | undefined, types: TypeItem[]): boolean {
  const item = typeCode ? types.find((type) => type.code === typeCode) : undefined;
  return item ? requiresEndOfContract(item) : true;
}

/** The configured types whose end dates never count, for database filters (`$nin`). */
export function typesWithoutContractEnd(types: TypeItem[]): string[] {
  return types.filter((type) => !requiresEndOfContract(type)).map((type) => type.code);
}

/** The date an employment's contract ends, or null when it has none (or its type doesn't end). */
export function contractEndOf(employment: { employmentType?: string | null; endOfContract?: Date | string | null } | null | undefined, types: TypeItem[]): Date | null {
  if (!employment?.endOfContract) return null;
  return contractEndApplies(employment.employmentType, types) ? new Date(employment.endOfContract) : null;
}
