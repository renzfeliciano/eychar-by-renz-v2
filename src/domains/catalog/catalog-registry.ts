import { EmploymentTypeService } from "./employment-type-service";
import { EmploymentStatusService } from "./employment-status-service";
import { AttendanceStatusService } from "./attendance-status-service";
import { RecruitmentStageService } from "./recruitment-stage-service";
import { EventCategoryService } from "./event-category-service";
import { CaseClassificationService } from "./case-classification-service";
import { CaseStatusService } from "./case-status-service";
import { PerformanceRatingService } from "./performance-rating-service";
import { DocumentTypeService } from "./document-type-service";

/**
 * Maps a URL-safe type slug to its bound service + permission prefix, so
 * `/api/catalogs/[type]` can stay two route files instead of fourteen
 * near-identical ones, while each entity still owns its own collection
 * (via createSimpleCatalogService — see simple-catalog-service.ts) and its
 * own granular permission keys (matching every other resource in this
 * codebase, e.g. "leave-types.create/read/update").
 */
export const CATALOG_REGISTRY = {
  "employment-types": { service: EmploymentTypeService, permissionPrefix: "employment-types" },
  "employment-statuses": { service: EmploymentStatusService, permissionPrefix: "employment-statuses" },
  "attendance-statuses": { service: AttendanceStatusService, permissionPrefix: "attendance-statuses" },
  "recruitment-stages": { service: RecruitmentStageService, permissionPrefix: "recruitment-stages" },
  "event-categories": { service: EventCategoryService, permissionPrefix: "event-categories" },
  "case-classifications": { service: CaseClassificationService, permissionPrefix: "case-classifications" },
  "case-statuses": { service: CaseStatusService, permissionPrefix: "case-statuses" },
  "performance-ratings": { service: PerformanceRatingService, permissionPrefix: "performance-ratings" },
  "document-types": { service: DocumentTypeService, permissionPrefix: "document-types" },
} as const;

export type CatalogTypeSlug = keyof typeof CATALOG_REGISTRY;

export function isCatalogTypeSlug(value: string): value is CatalogTypeSlug {
  return value in CATALOG_REGISTRY;
}
