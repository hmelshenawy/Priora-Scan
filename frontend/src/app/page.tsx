import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">PrioraScan</h1>
      <p className="text-lg text-gray-600">
        AI-powered automotive diagnostic assistant
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/vehicles"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Vehicles
        </Link>
        <Link
          href="/obd"
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
        >
          OBD Dashboard
        </Link>
      </div>
    </main>
  );
}
