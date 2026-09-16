import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  redirect(session?.user?.id ? "/dashboard" : "/login");
}
