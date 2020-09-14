import {
  createMemo,
  createSignal,
  createState,
  createResource,
  createEffect,
  untrack, unwrap,
} from "solid-js";
import { For } from "solid-js/dom";
import { setStateMutator } from "./utils/set";

export interface RangeRequest {
  from: number;
  length: number;
}

export type VirtProps<T> = {
  data: (request: RangeRequest) => Promise<T[]>;
  total: () => Promise<number>;
  fallback?: any;
  children: (item: T, index: () => number) => JSX.Element;
};

type Chunk<T> = {
  start: number;
  itemsHeight: number;
  length: number;
  measured: boolean;
};

type VirtualState<T> = {
  chunks: Chunk<T>[];
  averageHeight: number;
  measuredItemsCount: number;
  spaceAboveCoeff: number;
};

type ChunkProps<T> = {
  data: (request: RangeRequest) => Promise<T[]>;
  state: Chunk<T>;
  children: (item: T, index: () => number) => JSX.Element;
};

function Chunk<T>(props: ChunkProps<T>): any {
  const dataFn = () => props.data({ from: props.state.start, length: props.state.length });
  const [data, load] = createResource<T[]>([]);
  createEffect(() => {
    untrack(() => console.debug("Chunk reload", props.state));
    load(dataFn);
  });
  return (
    <For
      fallback={<li class="virtual-row" style={{ height: props.state.itemsHeight }} />}
              each={data() ?? []}>{props.children}</For>;
  }

type ElementRef = HTMLLIElement | undefined;

export function VirtualList<T, U>({ children, data, fallback, total }: VirtProps<T>): any {
  let topSpace: ElementRef, bottomSpace: ElementRef;
  const [scroll, setScroll] = createSignal(0),
    [state, setState] = createState<VirtualState<T>>({
      averageHeight: 40,
      measuredItemsCount: 0,
      spaceAboveCoeff: 1,
      chunks: [{ length: 20, itemsHeight: 40 * 20, measured: false, start: 0 }],
    }),
    [totalRes, loadTotal] = createResource<number>(0),
    chunks: HTMLElement[][] = [],
    mutator = setStateMutator([state, setState]),
    scroller = document.scrollingElement!,
    rects = scroller.getClientRects(),
    spaceAbove = () => state.chunks[0].start * state.averageHeight * state.spaceAboveCoeff,
    lastIndex = () => {
      const chunk = state.chunks[state.chunks.length - 1];
      return chunk.start + chunk.length;
    },
    spaceBelow = createMemo(() => {
      const total = totalRes();
      return total == null ? 0 : (total - lastIndex()) * state.averageHeight;
    }),
    shiftUp = () => {},
    shiftDown = () => {
      if (lastIndex() === (totalRes() ?? 0 - 1)) {
        return;
      }

      const newLength = Math.min(totalRes()! - lastIndex(), 20);
      if (newLength <= 0) {
        return;
      }
      if (state.chunks.length > 2) {
        const ch = state.chunks[0];
        const newCoeff =
          (spaceAbove() + ch.itemsHeight) / ((ch.start + ch.length) * state.averageHeight);
        mutator
          .set(
            (s) => s.chunks,
            ([first, ...chunks]) => [...chunks, first]
          )
          .set((s) => s.chunks[state.chunks.length - 1], {
            start: lastIndex(),
            length: newLength,
            measured: false,
          })
          .set((s) => s.spaceAboveCoeff, newCoeff)
          .engage();
      } else {
        mutator.setNow(
          (s) => s.chunks,
          (chunks) => {
            return [
              ...chunks,
              {
                start: lastIndex(),
                itemsHeight: newLength * state.averageHeight,
                measured: false,
                length: newLength,
              },
            ];
          }
        );
      }
    },
    viewPortHeight = () => {
      const startOffset = scroller.clientTop - topSpace!.clientTop;
      scroller.scrollTop - scroller.scrollHeight;
    },
    intersectCallback: IntersectionObserverCallback = (entries) => {
      console.log("Intersect", entries);
      measure();
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        if (entry.target === topSpace) {
          shiftUp();
        } else if (entry.target === bottomSpace) {
          shiftDown();
        }
      });
    },
    observer = new IntersectionObserver(intersectCallback, { rootMargin: "50% 0px" });
  let measureScheduled = false,
    rafId: number;
  void Promise.resolve().then(() => {
    if (!topSpace || !bottomSpace) {
      throw new Error("Top or bottom space ref is not initialized");
    }
    observer.observe(topSpace);
    observer.observe(bottomSpace);
  });
  createEffect(() => loadTotal(total));
  createEffect(() => {
    if (totalRes() ?? 0 < lastIndex()) {
      return;
    }
    const offset = totalRes() ?? 0 - lastIndex();
    for (let i = state.chunks.length - 1; i >= 0 && offset > 0; i--) {
      const length = state.chunks[i].length;
      if (length <= offset && i > 0) {
        mutator.set(
          (s) => s.chunks,
          (chunks) => chunks.slice(0, chunks.length - 1)
        );
      } else {
        mutator.set((s) => s.chunks[i].length, length - offset);
      }
    }
    mutator.engage();
  });

  function measure() {
    measureScheduled = false;
    cancelAnimationFrame(rafId);
    const { measuredItemsCount, averageHeight, spaceAboveCoeff } = state;
    const measured = { measuredItemsCount, averageHeight, spaceAboveCoeff };
    for (let i = 0; i < state.chunks.length; i++) {
      const chunk = state.chunks[i];
      const elements = chunks[i];
      if (elements.length === 0) {
        continue;
      }
      const first = elements[0].getBoundingClientRect();
      const last = elements[elements.length - 1].getBoundingClientRect();
      const itemsHeight = last.bottom - first.top;
      console.log("Measure chunk", unwrap(chunk), itemsHeight, measured);
      if (itemsHeight === chunk.itemsHeight || chunk.measured) {
        continue;
      }
      const newAverage =
        measured.measuredItemsCount === 0
          ? itemsHeight / chunk.length
          : (measured.averageHeight * measured.measuredItemsCount + itemsHeight) /
            (measured.measuredItemsCount + chunk.length);
      const newCoeff = spaceAbove() > 0 ? spaceAbove() / (state.chunks[0].start * newAverage) : 1.0;
      measured.averageHeight = newAverage;
      measured.spaceAboveCoeff = newCoeff;
      measured.measuredItemsCount += chunk.length;
      mutator.set((root) => root.chunks[i], { itemsHeight, measured: true });
    }
    mutator.self(measured);
    mutator.engage();
  }

  function scheduleMeasure() {
    if (measureScheduled) {
      return;
    }
    measureScheduled = true;
    rafId = requestAnimationFrame(() => measure());
  }

  return (
    <>
      <li ref={topSpace} className="virtual-space-above" style={{ height: `${spaceAbove()}px` }} />
      <li className="virtual-parity" />
      <For each={state.chunks}>
        {(chunkState) => {
          const chunk = (
            <Chunk state={chunkState} data={data}>
              {children}
            </Chunk>
          ) as () => HTMLElement[];
          return () => {
            const elements = chunk();
            const index = state.chunks.indexOf(chunkState);
            chunks[index] = elements;
            if (elements.length > 0) {
              scheduleMeasure();
            }
            return elements;
          };
        }}
      </For>
      <li
        ref={bottomSpace}
        className="virtual-space-below"
        style={{ height: `${spaceBelow()}px` }}
      />
    </>
  );
}
