import { useEffect, useRef } from "react";
import { monaco } from "./monaco";

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
      value: code,
      language: "python",
      theme: "vs-dark",
      readOnly: true,
      domReadOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      contextmenu: false,
      renderLineHighlight: "none",
      folding: false,
    });

    return () => editor.dispose();
  }, [code]);

  return <div ref={containerRef} className="h-full w-full" />;
}
