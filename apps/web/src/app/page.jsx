import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppSession } from "@/lib/auth/session";
import { destinationFor } from "@/lib/auth/redirect";
export default async function Home() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        redirect("/auth/login");
    const session = await getAppSession(user);
    if (!session)
        redirect("/auth/login?error=account_not_provisioned");
    redirect(destinationFor(session));
}
