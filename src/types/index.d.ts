export * from "babel-plugin-jsx-dom-expressions";
declare global {
  namespace JSX {
    interface EventHandler<T, E extends Event> {
      (e: E & { currentTarget: T }): void;

      (e: E & { currentTarget: T }, model?: unknown): void;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface DOMAttributes<T> extends CustomAttributes<T> {
      onDblClick?: EventHandler<T, MouseEvent>;
    }
  }
}
