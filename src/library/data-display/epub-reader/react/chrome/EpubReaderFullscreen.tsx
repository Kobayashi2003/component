import { FullscreenIcon } from './reader-icons';
import type { EpubReaderFullscreenController } from './use-epub-reader-fullscreen';

export interface EpubReaderFullscreenButtonProps {
  readonly controller: EpubReaderFullscreenController;
  readonly className?: string;
}

export function EpubReaderFullscreenButton({
  controller,
  className = 'epub-reader-shell__tool is-secondary epub-reader-shell__fullscreen',
}: EpubReaderFullscreenButtonProps) {
  const label = controller.active ? 'Exit full screen' : 'Enter full screen';
  return (
    <button
      className={className}
      type="button"
      disabled={!controller.supported}
      aria-label={label}
      aria-pressed={controller.active}
      title={label}
      onClick={() => void controller.toggle()}
    >
      <FullscreenIcon active={controller.active} />
      <span>{controller.active ? 'Exit full screen' : 'Full screen'}</span>
    </button>
  );
}
