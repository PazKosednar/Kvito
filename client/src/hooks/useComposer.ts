import { useCallback, useState } from "react";
import { useAsyncAction } from "./useAsyncAction";

const MAX_FILES = 6;

/** Text + pending files for a message or comment, sent once at a time. */
export function useComposer(send: (body: string, files: File[]) => Promise<void>) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const action = useAsyncAction(async () => {
    const text = body.trim();
    if (!text && files.length === 0) return;
    await send(text, files);
    setBody("");
    setFiles([]);
  });

  const addFiles = useCallback((picked: File[]) => setFiles((f) => [...f, ...picked].slice(0, MAX_FILES)), []);
  const removeFile = useCallback((i: number) => setFiles((f) => f.filter((_, j) => j !== i)), []);

  return {
    body,
    setBody,
    files,
    addFiles,
    removeFile,
    submit: action.run,
    pending: action.pending,
    error: action.error,
    canSend: !action.pending && (body.trim().length > 0 || files.length > 0),
  };
}
