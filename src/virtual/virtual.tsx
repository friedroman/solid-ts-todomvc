import { JSX, batch, createComputed, createEffect, createMemo, getOwner, onMount, runWithOwner } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { For, Index } from "solid-js/web";
import {
  Chunk,
  ChunkMsrmt,
  ChunkProps,
  MeasureStats,
  Measurements,
  VirtProps,
} from "./virtual_types";
import { createState } from "./virtual-state";

/**
 * Renders a chunk of items from the virtual list.
 * Manages the chunk's state and re-renders when needed.
 */
function Chunk<T>(props: ChunkProps<T>) {
  const [state, set] = createStore(props.state);
  const key = createMemo(() => ({ from: state.start, length: state.count }));
  createComputed(() => {
    key();
    set("measured", false);
  });
  return (
    <Index
      fallback={<li class="virtual-row" style={{ height: `${state.expectedItemsLength}px` }} />}
      each={props.data(key)()}>
      {(item, index) => props.children(item, () => index + state.start)}
    </Index>
  );
}

type ElementRef = HTMLLIElement | undefined;

/**
 * VirtualList is a SolidJS component that manages the rendering of a potentially large list by dividing it into chunks and only rendering the visible chunks.
 *
 * It uses an IntersectionObserver to track the visible regions of the list and updates the rendered chunks accordingly instead of using scroll events.
 *
 * @param props - The component props, which should be of type VirtProps<T>
 * @returns A JSX element representing the virtual list component
 */
export function VirtualList<T>(props: VirtProps<T>): any {
  const margin = props.margin ?? 0.5;
  let topSpace: ElementRef;
  let bottomSpace: ElementRef;
  const chunkElements: HTMLElement[][] = [];
  const scroller = document.scrollingElement!;
  let topIntersects = false;
  let bottomIntersects = false;
  const Owner = getOwner();

  const [state, { updateViewport }] = createState<T>(props);

  const intersectCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.target === topSpace) {
          topIntersects = entry.isIntersecting;
        } else if (entry.target === bottomSpace) {
          bottomIntersects = entry.isIntersecting;
        }
      });
      console.log("Intersect", topIntersects, bottomIntersects, entries);
      cancelMeasure();
      measureAndUpdate();
    },
    observer = new IntersectionObserver(intersectCallback, {
      rootMargin: `${margin * 100}% 0px`,
    });
  onMount(() => {
    if (!topSpace || !bottomSpace) {
      throw new Error("Top or bottom space ref is not initialized");
    }
    observer.observe(topSpace);
    observer.observe(bottomSpace);
  });

  createEffect(() => {
    if (state.measurements == null) {
      return;
    }
    const msrmts = state.measurements;
    const chunkMsrmts = msrmts.chunkMeasurements;
    const renderedItemsCount = chunkMsrmts.reduce((acc, c) => acc + c.count, 0);
    const { scrollIndex } = msrmts;
    const { lowWatermarkIndex, highWatermarkIndex, lastIndex } = state;
    console.log(
      `Position s:${scrollIndex} ch:${chunkMsrmts.length} r:[${state.chunks[0].start},${lastIndex}] ${renderedItemsCount},w:[${lowWatermarkIndex},${highWatermarkIndex}]`,
      unwrap(state)
    );
  });

  function measureAndUpdate() {
    const msrm = measure();
    if (measurementsUpdated(msrm)) {
      scheduleMeasure();
    }
  }

  function measurementsUpdated(msrm: Measurements): boolean | undefined {
    return runWithOwner(Owner, () => batch(() => updateViewport(msrm)));
  }

  function measure(): Measurements {
    const top = topSpace!.getBoundingClientRect();
    const scrollRect = scroller.getBoundingClientRect();
    const scrollTop = scroller.scrollTop;
    const scrollViewport = scroller.clientHeight;
    const scrollerStart = scrollRect.top;
    const scrollOffset = top.top - scrollerStart;
    const scrolled = scrollTop - scrollOffset;
    const { measuredItemsCount, averageItemLength } = state;
    const stats: MeasureStats = { measuredItemsCount, averageItemLength };

    const chunkMsrmts: ChunkMsrmt[] = measureChunks(state.chunks, stats);

    const scrollIndex = scrolled > 0 ? Math.floor(scrolled / state.averageItemLength) : 0;
    const measurements: Measurements = {
      topIntersects,
      bottomIntersects,
      compensationDelta: 0,
      spaceBefore: state.spaceBefore,
      chunkMeasurements: chunkMsrmts,
      scrollOffset,
      scrollerStart,
      scrolled,
      scrollTop,
      scrollViewport,
      scrollIndex,
      scrollHeight: scroller.scrollHeight,
      measured: stats,
      time: performance.now(),
    };
    return measurements;

    function measureChunks(chunks: Chunk<T>[], stats: MeasureStats) {
      const chunkMsrmts: ChunkMsrmt[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const elements = chunkElements[chunk.id];
        if (elements.length === 0) {
          continue;
        }
        const first = elements[0].getBoundingClientRect();
        const last = elements[elements.length - 1];
        const nextStart = last.nextElementSibling!.getBoundingClientRect().top;
        const itemsHeight = nextStart - first.top;
        chunkMsrmts.push({
          id: chunk.id,
          start: chunk.start,
          count: chunk.count,
          startPx: first.top,
          end: nextStart,
          itemsLength: itemsHeight,
        });
        // Check if this chunk was already measured previously.
        // If so, we don't need to account for it in statistics twice even if chunk length changed.
        if (chunk.measurements) {
          continue;
        }
        stats.averageItemLength =
          stats.measuredItemsCount === 0
            ? itemsHeight / chunk.count
            : calculateNewAverage(itemsHeight, chunk);
        stats.measuredItemsCount += chunk.count;
      }
      return chunkMsrmts;
    }

    function calculateNewAverage(itemsHeight: number, chunk: Chunk<T>): number {
      return (
        (stats.averageItemLength * stats.measuredItemsCount + itemsHeight) /
        (stats.measuredItemsCount + chunk.count)
      );
    }
  }

  let measureScheduled = false,
    rafId: number;
  function cancelMeasure() {
    if (!measureScheduled) {
      return;
    }
    measureScheduled = false;
    cancelAnimationFrame(rafId);
  }

  function scheduleMeasure() {
    if (measureScheduled) {
      return;
    }
    measureScheduled = true;
    rafId = requestAnimationFrame((time1) => {
      console.log("Measure 1", time1);
      measureAndUpdate();
      rafId = requestAnimationFrame((time2) => {
        console.log("Measure 2", time1, time2);
        if (!measureScheduled) {
          return;
        }
        measureScheduled = false;
        measureAndUpdate();
      });
    });
  }

  return (
    <>
      <li ref={topSpace} class="virtual-space-above" style={{ height: `${state.spaceBefore}px` }} />
      <li class="virtual-parity" />
      <For each={state.chunks}>
        {(chunkState) => {
           const ch = (
             <Chunk state={chunkState} data={props.data}>
               {props.children}
             </Chunk>
           );

          return (() => {
            const chunk = ch as unknown as () => HTMLElement[];
            const elements = chunk();
            chunkElements[chunkState.id] = elements;
            return elements;
          }) as unknown as JSX.Element;
        }}
      </For>
      <li
        ref={bottomSpace}
        class="virtual-space-below"
        style={{ height: `${state.spaceAfter}px` }}
      />
    </>
  );
}
