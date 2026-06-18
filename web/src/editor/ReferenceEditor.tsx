import { useEffect, useRef } from "react";
import { baseEditorOptions, monaco } from "./monaco";

interface ReferenceEditorProps {
  code: string;
}

/** Read-only, syntax-highlighted view of the target solution. */
export function ReferenceEditor({ code }: ReferenceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const editor = monaco.editor.create(container, {
      ...baseEditorOptions,
      value: code,
      language: "python",
      readOnly: true,
      domReadOnly: true,
    });

    return () => editor.dispose();
  }, [code]);

  return <div ref={containerRef} className="h-full w-full" />;
}
