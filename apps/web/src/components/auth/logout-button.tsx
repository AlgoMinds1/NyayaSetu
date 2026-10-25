"use client";
export default function LogoutButton({ className }: { className?: string }) {
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/auth/login"; }
  return <button className={`!mt-0 !w-auto shrink-0 whitespace-nowrap ${className ?? ""}`} onClick={logout}>Sign out</button>;
}
