import { JSX } from "solid-js/types/jsx";
import { Accessor, Resource } from "solid-js";

export interface RangeRequest {
  from: number;
  length: number;
}

export interface Measurements {
  compensationDelta: number;
  scrollOffset: number;
  scrolled: number;
  lowWatermark: number;
  lowWatermarkIndex: number;
  chunkMeasurements: ChunkMsrmt[];
  highWatermark: number;
  highWatermarkIndex: number;
  spaceBefore: number;
  scrollTop: number;
  scrollViewport: number;
  scrollHeight: number;
  scrollIndex: number;
  page: number;
  chunkLength: number;
  measured: { measuredItemsCount: number; averageHeight: number };
  time: number;
}

export interface ChunkMsrmt {
  id: number;
  startIndex: number;
  length: number;
  start: number;
  end: number;
}

export type VirtProps<T> = {
  data: (request: Accessor<RangeRequest>) => Accessor<T[]> | Resource<T[]>;
  total: Accessor<number> | Resource<number>;
  fallback?: any;
  margin?: number;
  initChunkLength?: number;
  initItemHeight?: number;
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
  spaceBefore: number;
  spaceAfter: number;
  nextChunkStartIndex: number;
  total: number;
  chunks: Chunk<T>[];
  lastIndex: number;
  averageHeight: number;
  measuredItemsCount: number;
  spaceAboveCoeff: number;
};
export type ChunkProps<T> = {
  data: (request: Accessor<RangeRequest>) => Accessor<T[]> | Resource<T[]>;
  state: Chunk<T>;
  children: (item: () => T, index: () => number) => JSX.Element;
};
