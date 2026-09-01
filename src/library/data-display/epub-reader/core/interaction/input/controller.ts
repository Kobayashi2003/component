import type { ReaderNavigator } from '../navigation';
import type { ReaderNavigationResult } from '../navigation';
import type { ReaderCommand, ReaderInputDispatcher } from './model';

export interface ReaderInputActions {
  readonly navigator: Pick<ReaderNavigator, 'next' | 'previous'>;
  navigationResult?(result: ReaderNavigationResult): void;
  openSearch?(): void;
  openHelp?(): void;
  historyBack?(): void | Promise<void>;
  historyForward?(): void | Promise<void>;
  toggleChrome?(): void;
  stepFont?(delta: 1 | -1): void | Promise<void>;
  escape?(): void;
}

export class ReaderInputController implements ReaderInputDispatcher {
  constructor(private readonly actions: ReaderInputActions) {}

  async dispatch(command: ReaderCommand): Promise<void> {
    switch (command.type) {
      case 'navigate':
        {
          const result = command.direction === 'forward'
          ? await this.actions.navigator.next()
          : await this.actions.navigator.previous();
          this.actions.navigationResult?.(result);
        }
        return;
      case 'open-search':
        this.actions.openSearch?.();
        return;
      case 'open-help':
        this.actions.openHelp?.();
        return;
      case 'history-back':
        await this.actions.historyBack?.();
        return;
      case 'history-forward':
        await this.actions.historyForward?.();
        return;
      case 'toggle-chrome':
        this.actions.toggleChrome?.();
        return;
      case 'font-step':
        await this.actions.stepFont?.(command.delta);
        return;
      case 'escape':
        this.actions.escape?.();
        return;
    }
  }
}
