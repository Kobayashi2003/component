import { useCallback, useState } from "react";
import {
  EpubFilePicker,
  EpubReader,
  EpubReaderBackground,
  type ReaderUiConfiguration,
} from "../react";
import type { ReaderTheme } from "../core";

/**
 * Component Atlas demo boundary.
 *
 * The reader stays source-driven; this showcase only provides the background
 * frame and the optional local-file picker.
 */
export function EpubReaderShowcase({
  readerConfiguration,
}: {
  readonly readerConfiguration?: ReaderUiConfiguration;
} = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("publisher");
  const choose = (next: File) => {
    setRejected(null);
    setFile(next);
  };
  const onThemeChange = useCallback(
    (next: ReaderTheme) =>
      setReaderTheme((current) => (current === next ? current : next)),
    [],
  );

  const picker = (
    <EpubFilePicker
      compact={Boolean(file)}
      currentFileName={file?.name ?? null}
      onFile={choose}
      onRejected={(next) => setRejected(`${next.name} is not an EPUB file.`)}
    />
  );

  return (
    <EpubReaderBackground
      file={file}
      picker={picker}
      rejectedMessage={rejected}
      readerTheme={readerTheme}
      onCloseBook={() => {
        setFile(null);
        setReaderTheme("publisher");
      }}
      reader={
        file ? (
          <EpubReader
            source={file}
            configuration={readerConfiguration}
            onThemeChange={onThemeChange}
          />
        ) : null
      }
    />
  );
}
