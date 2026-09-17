import { getSelfServiceSession } from "@/app/_shared/get-self-service-session";
import { SelfServiceHeader } from "@/components/shared/self-service-header";

export default async function SelfServiceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSelfServiceSession();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SelfServiceHeader name={session.name} />
      <main className="flex flex-1 items-start justify-center p-4 md:p-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
