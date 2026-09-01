import type { Bookmark } from '../../features/annotations';
import type { ReaderUiIntent } from './model';

/** Emit success feedback only after locator capture produced a bookmark. */
export async function addBookmarkAndNotify(
  addBookmark: (label?: string) => Promise<Bookmark | null>,
  label: string | undefined,
  onIntent?: (intent: ReaderUiIntent) => void,
): Promise<Bookmark | null> {
  const bookmark = await addBookmark(label);
  if (bookmark) onIntent?.({ type: 'bookmark-added' });
  return bookmark;
}
