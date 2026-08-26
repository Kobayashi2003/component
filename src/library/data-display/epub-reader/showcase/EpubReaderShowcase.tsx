import { useState } from 'react';
import { EpubFilePicker } from '../react/EpubFilePicker';
import { EpubReader } from '../react/EpubReader';
import { EpubReaderBackground } from '../react/EpubReaderBackground';

/**
 * Component Atlas demo boundary.
 *
 * The reader stays source-driven; this showcase only provides the background
 * frame and the optional local-file picker.
 */
export function EpubReaderShowcase() {
  const [file, setFile] = useState<File | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);



  const choose = (next: File) => {
    setRejected(null);
    setFile(next);
  };

  const picker = (
    <EpubFilePicker
      compact={Boolean(file)}
      currentFileName={file?.name ?? null}
      onFile={choose}
      onRejected={next => setRejected(`${next.name} is not an EPUB file.`)}
    />
  );

  return (
    <EpubReaderBackground
      file={file}
      picker={picker}
      rejectedMessage={rejected}
      onCloseBook={() => setFile(null)}
      reader={file ? <EpubReader source={file} /> : null}
    />
  );
}
