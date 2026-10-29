import LoginForm from "@/components/auth/login-form";
import { Suspense } from "react";
export default function LoginPage() { return <main className="shell"><Suspense fallback={<section className="card">Loading…</section>}><LoginForm /></Suspense></main>; }
