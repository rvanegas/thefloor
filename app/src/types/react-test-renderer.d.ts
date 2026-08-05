/**
 * Minimal local typings for the bits of react-test-renderer the view smoke
 * tests use, so the suite typechecks without pulling in @types/*.
 */
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface ReactTestRendererJSON {
    type: string;
    props: Record<string, unknown>;
    children: Array<ReactTestRendererJSON | string> | null;
  }

  export interface ReactTestInstance {
    props: Record<string, any>;
    type: unknown;
    children: Array<ReactTestInstance | string>;
    findAll(
      predicate: (instance: ReactTestInstance) => boolean
    ): ReactTestInstance[];
  }

  export interface ReactTestRenderer {
    toJSON(): ReactTestRendererJSON | ReactTestRendererJSON[] | null;
    root: ReactTestInstance;
    unmount(): void;
    update(element: ReactElement): void;
  }

  export function act(callback: () => void | Promise<void>): void;
  export function create(element: ReactElement): ReactTestRenderer;

  const renderer: { create: typeof create; act: typeof act };
  export default renderer;
}
