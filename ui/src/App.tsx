import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const [version, setVersion] = useState<string>("—");

  useEffect(() => {
    invoke<string>("app_version")
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="px-8 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
          <div>
            <div className="text-sm uppercase tracking-widest text-zinc-400">
              5dlabs
            </div>
            <div className="text-lg font-semibold">CTO Desktop</div>
          </div>
        </div>
        <div className="text-xs text-zinc-500">v{version}</div>
      </header>

      <main className="flex-1 grid place-items-center px-8">
        <div className="max-w-xl text-center space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">
            Scaffold online.
          </h1>
          <p className="text-zinc-400">
            This is the bootstrap shell for CTO Desktop. The canonical design
            lives in{" "}
            <code className="text-zinc-300">.task/.docs/design/</code> and will
            replace this screen as components land.
          </p>
          <div className="text-xs text-zinc-600">
            Tauri 2 · React 18 · Vite 6 · Tailwind CSS
          </div>
        </div>
      </main>

      <footer className="px-8 py-3 border-t border-zinc-800 text-xs text-zinc-500">
        © 5dlabs — MIT
      </footer>
    </div>
  );
}
