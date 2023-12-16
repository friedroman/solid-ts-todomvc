import { JSX, batch, children, createComputed, createMemo, getOwner, onMount, runWithOwner } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { For, Index } from "solid-js/web";
import { ChunkMsrmt, ChunkProps, MeasureStats, Measurements, VirtProps } from "./virtual_types";
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
    const scrollOffset = top.top - scrollRect.top;
    const scrollTop = scroller.scrollTop;
    const scrolled = scrollTop - scrollOffset;
    const scrollViewport = scroller.clientHeight;
    const { measuredItemsCount, averageItemLength } = state;
    const stats: MeasureStats = { measuredItemsCount, averageItemLength };
    const chunkMsrmts: ChunkMsrmt[] = [];
    for (let i = 0; i < state.chunks.length; i++) {
      const chunk = state.chunks[i];
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
      // Check if this chunk was already measured previously
      if (chunk.measurements) {
        continue;
      }
      stats.averageItemLength =
        stats.measuredItemsCount === 0
          ? itemsHeight / chunk.count
          : (stats.averageItemLength * stats.measuredItemsCount + itemsHeight) /
            (stats.measuredItemsCount + chunk.count);
      stats.measuredItemsCount += chunk.count;
    }
    const scrollIndex = scrolled > 0 ? Math.floor(scrolled / state.averageItemLength) : 0;
    const page = Math.ceil(scrollViewport / stats.averageItemLength);
    const measurements: Measurements = {
      topIntersects,
      bottomIntersects,
      lowWatermark: scrollRect.top + scrollTop - scrollViewport * margin,
      lowWatermarkIndex: Math.max(0, Math.floor(scrollIndex - page * margin)),
      highWatermark: scrollRect.top + scrollTop + scrollViewport * (margin + 1),
      highWatermarkIndex: Math.ceil(scrollIndex + page * (margin + 1)),
      compensationDelta: 0,
      spaceBefore: state.spaceBefore,
      chunkMeasurements: chunkMsrmts,
      scrollOffset,
      scrolled,
      scrollTop,
      scrollViewport,
      scrollIndex,
      page,
      chunkLength: Math.ceil(page * 0.6),
      measured: stats,
      scrollHeight: scroller.scrollHeight,
      time: performance.now(),
    };
    const renderedItemsCount = chunkMsrmts.reduce((acc, c) => acc + c.count, 0);
    console.log(
      `Position s:${scrollIndex} ch:${chunkMsrmts.length} r:[${state.chunks[0].start},${state.lastIndex}] ${renderedItemsCount},w:[${measurements.lowWatermarkIndex},${measurements.highWatermarkIndex}]`,
      measurements,
      unwrap(state)
    );
    return measurements;
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
