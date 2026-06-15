import { useEffect, useState } from "react";
import type { Problem, Solution } from "./types";
import { initStorage } from "./persistence/storage";
import { Library } from "./ui/Library";
import { SessionView } from "./ui/SessionView";

interface Active {
  problem: Problem;
  solution: Solution;
}

export function App() {
  useEffect(() => {
    initStorage();
  }, []);

  const [active, setActive] = useState<Active | null>(null);

  if (active !== null) {
    return (
      <SessionView
        key={active.solution.id}
        problem={active.problem}
        solution={active.solution}
        onExit={() => setActive(null)}
      />
    );
  }

  return <Library onStart={(problem, solution) => setActive({ problem, solution })} />;
}
