export interface RangeRequest {
  from: number;
  length: number;
}

export interface Measurements {
  scrollOffset: number;
  scrolled: number;
  lowWatermark: number;
  highWatermark: number;
  scrollTop: number;
  scrollViewport: number;
  scrollHeight: number;
  scrollIndex: number;
  page: number;
  chunkLength: number;
  measured: { measuredItemsCount: number; averageHeight: number };
  time: number;
}

export type VirtProps<T> = {
  data: (request: RangeRequest) => T[] | Promise<T[]>;
  total: () => Promise<number>;
  fallback?: any;
  margin?: number;
  children: (item: () => T, index: () => number) => JSX.Element;
};
type Chunk<T> = {
  id: number;
  start: number;
  itemsHeight: number;
  length: number;
  measured: boolean;
};
export type VirtualState<T> = {
  readonly spaceAbove: number;
  readonly nextChunkStartIndex: number;
  chunks: Chunk<T>[];
  averageHeight: number;
  measuredItemsCount: number;
  spaceAboveCoeff: number;
};
export type ChunkProps<T> = {
  data: (request: RangeRequest) => T[] | Promise<T[]>;
  state: Chunk<T>;
  children: (item: () => T, index: () => number) => JSX.Element;
};
