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
  { catalogType: "performance-ratings", title: "Performance ratings", description: "The rating scale used on performance reviews." },
  { catalogType: "document-types", title: "Document types", description: "Categories for employee documents (government IDs, contracts, certifications)." },
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
      {/* A sticky index of every list with its size, so a long settings page is one jump away from any catalog. */}
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Catalogs" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-2 shadow-[var(--shadow-soft)] lg:sticky lg:top-0 lg:flex-col lg:overflow-visible">
          {visibleSections.map((section) => (
            <a
              key={section.catalogType}
              href={`#${section.catalogType}`}
              className="flex shrink-0 items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className="truncate">{section.title}</span>
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{section.items.filter((item) => item.status === "active").length}</span>
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-6">
          {visibleSections.map((section) => (
            <section key={section.catalogType} id={section.catalogType} className="scroll-mt-4">
              <CatalogSection
                organizationId={organizationId}
                catalogType={section.catalogType}
                title={section.title}
                description={section.description}
                items={section.items}
                canCreate={section.canCreate}
                canUpdate={section.canUpdate}
              />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
