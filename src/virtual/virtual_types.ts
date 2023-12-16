import { JSX } from "solid-js/types/jsx";
import { Accessor, Resource } from "solid-js";

export interface RangeRequest {
  from: number;
  length: number;
}

export interface MeasureStats {
  measuredItemsCount: number;
  averageItemLength: number;
}

export interface Measurements {
  topIntersects: boolean;
  bottomIntersects: boolean;
  compensationDelta: number;
  scrollerStart: number;
  scrollOffset: number;
  scrolled: number;
  chunkMeasurements: ChunkMsrmt[];
  spaceBefore: number;
  scrollTop: number;
  scrollViewport: number;
  scrollHeight: number;
  scrollIndex: number;
  measured: MeasureStats;
  time: number;
}

export interface ChunkMsrmt {
  id: number;
  count: number;
  start: number;
  startPx: number;
  end: number;
  itemsLength: number;
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
export type Chunk<T> = {
  id: number;
  start: number;
  expectedItemsLength: number;
  measurements: ChunkMsrmt | null;
  count: number;
  measured: boolean;
};
export type VirtualState<T> = {
  spaceBefore: number;
  spaceAfter: number;
  total: number;
  chunks: Chunk<T>[];
  lastIndex: number;
  averageItemLength: number;
  measuredItemsCount: number;
  spaceAboveCoeff: number;
  measurements: Measurements | null;
  lowWatermark: number;
  lowWatermarkIndex: number;
  highWatermark: number;
  highWatermarkIndex: number;
  page: number;
  chunkLength: number;
};

export type ChunkProps<T> = {
  data: (request: Accessor<RangeRequest>) => Accessor<T[]> | Resource<T[]>;
  state: Chunk<T>;
  children: (item: () => T, index: () => number) => JSX.Element;
};
