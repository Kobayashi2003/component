import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_READER_CHROME_STATE, reduceReaderChrome } from './reader-chrome-model';

export interface ReaderChromeControls {
  readonly visible: boolean;
  readonly pinned: boolean;
  readonly show: () => void;
  readonly hide: () => void;
  readonly toggle: () => void;
  readonly setPinned: (pinned: boolean) => void;
}

export function useReaderChrome(locked: boolean, hideDelay = 2400): ReaderChromeControls {
  const [state, setState] = useState(INITIAL_READER_CHROME_STATE);
  const [activity, setActivity] = useState(0);
  const dispatch = useCallback(
    (event: Parameters<typeof reduceReaderChrome>[1]) => setState(current => reduceReaderChrome(current, event)),
    [],
  );

  const show = useCallback(() => {
    dispatch({ type: 'show' });
    setActivity(value => value + 1);
  }, []);
  const hide = useCallback(() => dispatch({ type: 'hide' }), []);
  const toggle = useCallback(() => {
    dispatch({ type: 'toggle' });
    setActivity(value => value + 1);
  }, []);
  const setPinned = useCallback((pinned: boolean) => {
    dispatch({ type: 'set-pinned', pinned });
    setActivity(value => value + 1);
  }, []);

  useEffect(() => {
    if (locked) {
      dispatch({ type: 'show' });
      return;
    }
    if (state.mode === 'pinned' || state.visibility === 'hidden') return;
    const timer = setTimeout(() => dispatch({ type: 'hide' }), hideDelay);
    return () => clearTimeout(timer);
  }, [activity, hideDelay, locked, state.mode, state.visibility]);

  return useMemo(() => ({
    visible: locked || state.mode === 'pinned' || state.visibility === 'shown',
    pinned: state.mode === 'pinned',
    show,
    hide,
    toggle,
    setPinned,
  }), [hide, locked, setPinned, show, state.mode, state.visibility, toggle]);
}
