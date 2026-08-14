import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerContext } from "@/lib/server/context";

export default async function HomePage() {
  const { auth } = getServerContext();
  const session = auth
    ? await auth.api.getSession({ headers: await headers() })
    : null;
  if (!session) redirect("/signin");
  redirect("/today");
}
