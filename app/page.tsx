import AuthGuard from "@/components/AuthGuard";

export default function Home() {
  return (
    <AuthGuard>
      <main className="p-4">Dashboard coming soon</main>
    </AuthGuard>
  );
}
