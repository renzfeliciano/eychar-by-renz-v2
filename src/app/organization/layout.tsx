import Link from "next/link";

const SECTIONS = [
  { href: "/organization/units", label: "Units" },
  { href: "/organization/positions", label: "Positions" },
  { href: "/organization/locations", label: "Locations" },
  { href: "/organization/projects", label: "Projects" },
];

export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Organization</h1>
      <nav className="mt-4 flex gap-4 border-b pb-3" style={{ borderColor: "var(--line)" }}>
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="text-sm" style={{ color: "var(--accent)" }}>
            {section.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </main>
  );
}
