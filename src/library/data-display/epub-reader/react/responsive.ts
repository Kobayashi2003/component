import { useEffect, useState } from 'react';

const COMPACT_READER_WIDTH = 700;

export function useCompactReaderLayout(target: { readonly current: HTMLElement | null }): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const update = () => setCompact(element.getBoundingClientRect().width <= COMPACT_READER_WIDTH);
    update();
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return compact;
}
