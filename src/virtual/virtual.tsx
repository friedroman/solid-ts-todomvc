import { batch, createComputed, createMemo } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { For, Index } from "solid-js/web";
import { ChunkMsrmt, ChunkProps, Measurements, VirtProps } from "./virtual_types";
import { createState } from "./virtual-state";

/**
 * Renders a chunk of items from the virtual list.
 * Manages the chunk's state and re-renders when needed.
 */
function Chunk<T>(props: ChunkProps<T>) {
  const [state, set] = createStore(props.state);
  const key = createMemo(() => ({ from: state.start, length: state.length }));
  createComputed(() => {
    key();
    set("measured", false);
  });
  return (
    <Index
      fallback={<li class="virtual-row" style={{ height: `${state.itemsHeight}px` }} />}
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
  const chunks: HTMLElement[][] = [];
  const scroller = document.scrollingElement!;
  let topIntersects = false;
  let bottomIntersects = false;

  const [state, { jump, shiftDown, shiftUp, updateVirtualSpaces }] = createState<T>(props);

  function updateViewport(msrm: Measurements) {
    const { scrollIndex, page, chunkLength } = msrm;
    const total = state.total;

    if (topIntersects && scrollIndex > 0) {
      const startDiff = scrollIndex - state.chunks[0].start;
      const jumpDetected = startDiff < page * -state.chunks.length;
      if (jumpDetected) {
        const start = scrollIndex < page ? 0 : scrollIndex - page;
        jump(start, chunkLength);
      } else {
        shiftUp();
      }
    }
    batch(() => {
      if (bottomIntersects && state.lastIndex !== total) {
        console.log("Shift down");
        shiftDown(msrm);
      }
      updateVirtualSpaces(msrm);
    });
  }

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
      const msrm = measure();
      updateViewport(msrm);
      scheduleMeasure();
    },
    observer = new IntersectionObserver(intersectCallback, {
      rootMargin: `${margin * 100}% 0px`,
    });
  void Promise.resolve().then(() => {
    if (!topSpace || !bottomSpace) {
      throw new Error("Top or bottom space ref is not initialized");
    }
    observer.observe(topSpace);
    observer.observe(bottomSpace);
  });

  function measure(): Measurements {
    const top = topSpace!.getBoundingClientRect();
    const scrollRect = scroller.getBoundingClientRect();
    const scrollOffset = top.top - scrollRect.top;
    const scrollTop = scroller.scrollTop;
    const scrolled = scrollTop - scrollOffset;
    const scrollViewport = scroller.clientHeight;
    const { measuredItemsCount, averageHeight } = state;
    const measured = { measuredItemsCount, averageHeight };
    const chunkMsrmts: ChunkMsrmt[] = [];
    for (let i = 0; i < state.chunks.length; i++) {
      const chunk = state.chunks[i];
      const elements = chunks[i];
      if (elements.length === 0) {
        continue;
      }
      const first = elements[0].getBoundingClientRect();
      const last = elements[elements.length - 1];
      const nextStart = last.nextElementSibling!.getBoundingClientRect().top;
      const itemsHeight = nextStart - first.top;
      chunkMsrmts.push({
        id: chunk.id,
        startIndex: chunk.start,
        length: chunk.length,
        start: first.top,
        end: nextStart,
        itemsHeight,
      });
      if (chunk.measured) {
        continue;
      }
      measured.averageHeight =
        measured.measuredItemsCount === 0
          ? itemsHeight / chunk.length
          : (measured.averageHeight * measured.measuredItemsCount + itemsHeight) /
            (measured.measuredItemsCount + chunk.length);
      measured.measuredItemsCount += chunk.length;
    }
    const scrollIndex = scrolled > 0 ? Math.floor(scrolled / state.averageHeight) : 0;
    const page = Math.ceil(scrollViewport / measured.averageHeight);
    const measurements: Measurements = {
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
      chunkLength: Math.ceil(page * 0.3),
      measured,
      scrollHeight: scroller.scrollHeight,
      time: performance.now(),
    };
    console.log(
      `Position s:${scrollIndex} r:[${state.chunks[0].start},${state.lastIndex}],w:[${measurements.lowWatermarkIndex},${measurements.highWatermarkIndex}]`,
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
      const measurements1 = measure();
      updateViewport(measurements1);
      rafId = requestAnimationFrame((time2) => {
        console.log("Measure 2", time1, time2);
        if (!measureScheduled) {
          return;
        }
        measureScheduled = false;
        const measurements2 = measure();
        updateViewport(measurements2);
      });
    });
  }

  return (
    <>
      <li ref={topSpace} class="virtual-space-above" style={{ height: `${state.spaceBefore}px` }} />
      <li class="virtual-parity" />
      <For each={state.chunks}>
        {(chunkState) => (
          <Chunk state={chunkState} data={props.data}>
            {props.children}
          </Chunk>
        )}
      </For>
      <li
        ref={bottomSpace}
        class="virtual-space-below"
        style={{ height: `${state.spaceAfter}px` }}
      />
    </>
  );
}
