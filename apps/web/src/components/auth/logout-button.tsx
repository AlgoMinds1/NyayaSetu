"use client";
export default function LogoutButton({ className }: { className?: string }) {
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/auth/login"; }
  return <button className={className} onClick={logout}>Sign out</button>;
}
