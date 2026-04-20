import { useState } from "react";
import { Sidebar, type NavKey } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { AgentGrid } from "./components/AgentGrid";
import { ActivityFeed } from "./components/ActivityFeed";

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md text-center space-y-2">
        <div className="text-[11px] uppercase tracking-caps text-ink-500">
          Not yet implemented
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-100">
          {title}
        </h2>
        <p className="text-sm text-ink-400">
          This surface is reserved. The canonical design drop in{" "}
          <code className="text-ink-300">.task/.docs/design/</code> will
          replace this view.
        </p>
      </div>
    </div>
  );
}

const routeTitles: Record<Exclude<NavKey, "agents">, string> = {
  plays: "Plays",
  sessions: "Sessions",
  intake: "Intake",
  repos: "Repositories",
  infra: "Infrastructure",
};

export default function App() {
  const [nav, setNav] = useState<NavKey>("agents");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink-950 font-sans text-ink-100 antialiased">
      <Sidebar active={nav} onChange={setNav} />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {nav === "agents" ? (
          <AgentGrid />
        ) : (
          <Placeholder title={routeTitles[nav]} />
        )}
      </main>
      <ActivityFeed />
    </div>
  );
}
