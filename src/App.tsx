import { useEffect } from "react";
import { PROBLEMS } from "./content/problems";
import { initStorage } from "./persistence/storage";
import { SessionView } from "./ui/SessionView";

export function App() {
  useEffect(() => {
    initStorage();
  }, []);

  const problem = PROBLEMS[0];
  const solution = problem.solutions[0];

  return <SessionView problem={problem} solution={solution} />;
}
