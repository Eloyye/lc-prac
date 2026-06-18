import { create } from "zustand";

export type SessionStatus = "idle" | "running" | "done";

interface SessionState {
  status: SessionStatus;
  startedAt: number | null;
  finishedAt: number | null;
  totalKeystrokes: number;
  errorKeystrokes: number;
  correctChars: number;
  start: () => void;
  registerKeystroke: (correct: boolean) => void;
  setCorrectChars: (n: number) => void;
  finish: () => void;
  reset: () => void;
}

const initialState = {
  status: "idle" as SessionStatus,
  startedAt: null,
  finishedAt: null,
  totalKeystrokes: 0,
  errorKeystrokes: 0,
  correctChars: 0,
};

export const useSession = create<SessionState>((set, get) => ({
  ...initialState,
  start: () => {
    if (get().status === "idle") {
      set({ status: "running", startedAt: Date.now() });
    }
  },
  registerKeystroke: (correct) =>
    set((s) => ({
      totalKeystrokes: s.totalKeystrokes + 1,
      errorKeystrokes: s.errorKeystrokes + (correct ? 0 : 1),
    })),
  setCorrectChars: (n) => set({ correctChars: n }),
  finish: () => {
    if (get().status === "running") {
      set({ status: "done", finishedAt: Date.now() });
    }
  },
  reset: () => set({ ...initialState }),
}));
