import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { CATALOG_REGISTRY, type CatalogTypeSlug } from "@/domains/catalog/catalog-registry";
import { PageHeader } from "@/components/shared/page-header";
import { CatalogSection } from "@/components/shared/catalog-section";

const CATALOG_SECTIONS: { catalogType: CatalogTypeSlug; title: string; description: string }[] = [
  { catalogType: "employment-types", title: "Employment types", description: "Regular, probationary, contractual, and other classifications." },
  { catalogType: "employment-statuses", title: "Employment statuses", description: "Lifecycle states an employment record can be in." },
  { catalogType: "attendance-statuses", title: "Attendance statuses", description: "Daily attendance outcomes selectable when recording or adjusting." },
  { catalogType: "recruitment-stages", title: "Recruitment stages", description: "The applicant pipeline, in order." },
  { catalogType: "event-categories", title: "Event categories", description: "Used to classify calendar events." },
  { catalogType: "case-classifications", title: "Case classifications", description: "Types of cases the organization tracks." },
  { catalogType: "case-statuses", title: "Case statuses", description: "Where a case currently stands." },
];

export default async function CatalogsSettingsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();

  const sectionsWithAccess = await Promise.all(
    CATALOG_SECTIONS.map(async (section) => {
      const { service, permissionPrefix } = CATALOG_REGISTRY[section.catalogType];
      const [canRead, canCreate, canUpdate] = await Promise.all([
        hasPermission(`${permissionPrefix}.read`, organizationId),
        hasPermission(`${permissionPrefix}.create`, organizationId),
        hasPermission(`${permissionPrefix}.update`, organizationId),
      ]);
      if (!canRead) return null;

      const items = await service.listCurrent(organizationId);
      return {
        ...section,
        canCreate,
        canUpdate,
        items: items.map((item) => ({
          _id: item._id.toString(),
          code: item.code,
          name: item.name,
          description: item.description,
          status: item.status,
        })),
      };
    }),
  );
  const visibleSections = sectionsWithAccess.filter((section) => section !== null);

  if (visibleSections.length === 0) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view any catalogs.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catalogs"
        description="Org-managed option lists used across employee records — add or retire values without touching code."
      />
      {visibleSections.map((section) => (
        <CatalogSection
          key={section.catalogType}
          organizationId={organizationId}
          catalogType={section.catalogType}
          title={section.title}
          description={section.description}
          items={section.items}
          canCreate={section.canCreate}
          canUpdate={section.canUpdate}
        />
      ))}
    </div>
  );
}
