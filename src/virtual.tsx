import {createEffect, createMemo, createResource, createSignal, createState, Index, untrack,} from "solid-js";
import {For} from "solid-js/dom";
import {setStateMutator} from "./utils/set";
import {ChunkProps, Measurements, VirtProps, VirtualState} from "./virtual_types";
import get = Reflect.get;

function Chunk<T>(props: ChunkProps<T>): any {
  const state = props.state;
  const dataFn = () => props.data({ from: state.start, length: state.length });
  const [data, load] = createResource<T[]>([]);
  createEffect(() => {
    untrack(() =>
      console.log("Chunk reload: {", state.id, ",", state.start, ":", state.length, "H:", state.itemsHeight, "}", data())
    );
    load(dataFn);
  });
  return (
    <Index
      fallback={<li class="virtual-row" style={{ height: `${state.itemsHeight}px` }} />}
      each={data() ?? []}>
      {(item, index) => props.children(item, () => index + state.start)}
    </Index>
  );
}

type ElementRef = HTMLLIElement | undefined;

export function VirtualList<T, U>({
  children,
  data,
  fallback,
  total,
  margin = 0.5,
}: VirtProps<T>): any {
  let topSpace: ElementRef, bottomSpace: ElementRef;

  function updateVirtualSpaces(measurements: Measurements) {
    const newCoeff =
      spaceAbove() > 0
        ? spaceAbove() / (state.chunks[0].start * measurements.measured.averageHeight)
        : 1.0;
    mutator.selfNow({ ...measurements.measured, spaceAboveCoeff: newCoeff });
  }

  function updateViewport(msrm: Measurements) {
    const both = topIntersects && bottomIntersects;
    const { scrollIndex, page } = msrm;
    const t = totalRes()!;

    function jump(start: number, chunkLength: number = msrm.chunkLength) {
      console.log("Jump", start, chunkLength);
      for (let i = 0, chunkStart = start; i < state.chunks.length; i++, chunkStart += chunkLength) {
        const edge = chunkStart + chunkLength >= t;
        const len = edge ? t - chunkStart : chunkLength;
        mutator.set((s) => s.chunks[i], {
          start: chunkStart,
          length: len,
          measured: false,
        });
        if (edge) {
          console.warn("Edge on jump up");
          mutator.set(
            (s) => s.chunks,
            (chs) => chs.slice(0, i + 1)
          );
          break;
        }
      }
    }

    if (topIntersects && scrollIndex > 0) {
      const startDiff = scrollIndex - state.chunks[0].start;
      const jumpDetected = startDiff < page * -state.chunks.length;
      if (jumpDetected) {
        const start = scrollIndex < page ? 0 : scrollIndex - page;
        jump(start);
      } else {
        //todo incremental shift up
      }
    }
    if (bottomIntersects && lastIndex() !== t) {
      console.log("Shift down");
      shiftDown(msrm);
    }
  }

  const [scroll, setScroll] = createSignal(0),
    [state, setState] = createState<VirtualState<T>>({
      averageHeight: 40,
      measuredItemsCount: 0,
      spaceAboveCoeff: 1,
      chunks: [{ id: 0, start: 0, length: 20, itemsHeight: 40 * 20, measured: false }],
      get spaceAbove() {
        return this.chunks[0].start * this.averageHeight * this.spaceAboveCoeff;
      },
      get nextChunkStartIndex(): number {
        const chunk = this.chunks[this.chunks.length - 1];
        return chunk.start + chunk.length;
      },
    }),
    [totalRes, loadTotal] = createResource<number>(0),
    chunks: HTMLElement[][] = [],
    mutator = setStateMutator([state, setState]),
    scroller = document.scrollingElement!,
    spaceAbove = () => state.chunks[0].start * state.averageHeight * state.spaceAboveCoeff,
    lastIndex = () => {
      const chunk = state.chunks[state.chunks.length - 1];
      return chunk.start + chunk.length;
    },
    spaceBelow = createMemo((previous) => {
      const total = totalRes() ?? 0;
      const rowsBelow = Math.max(total - lastIndex(), 0);
      const newSpace = rowsBelow * state.averageHeight;
      // eslint-disable-next-line prettier/prettier
      console.log("Updating space below", previous, "->", newSpace, "below:", rowsBelow, "/", total);
      return newSpace;
    }, 0),
    shiftUp = () => {},
    shiftDown = (msrm: Measurements) => {
      const startIndex = lastIndex();
      if (startIndex === (totalRes() ?? 0 - 1)) {
        return;
      }

      const diff = msrm.highWatermark - startIndex;
      const chunkCount = Math.max(1, Math.ceil(diff / msrm.page));
      for (let i = 0, start = startIndex; i < state.chunks.length && i < chunkCount; i++) {
        const ch = state.chunks[i];
        const newLength = Math.min(totalRes()! - startIndex, msrm.chunkLength);
        if (newLength <= 0) {
          break;
        }
        const chEndIndex = ch.start + ch.length;
        if (chEndIndex < msrm.lowWatermark) {
          const newCoeff = (spaceAbove() + ch.itemsHeight) / (chEndIndex * state.averageHeight);
          mutator
            .set(
              (s) => s.chunks,
              ([first, ...chunks]) => [...chunks, first]
            )
            .set((s) => s.chunks[state.chunks.length - 1], {
              start: start,
              length: newLength,
              itemsHeight: newLength * state.averageHeight,
              measured: false,
            })
            .set((s) => s.spaceAboveCoeff, newCoeff);
        } else {
          mutator.setNow(
            (s) => s.chunks,
            (chunks) => {
              return [
                ...chunks,
                {
                  id: chunkId++,
                  start: start,
                  itemsHeight: newLength * state.averageHeight,
                  measured: false,
                  length: newLength,
                },
              ];
            }
          );
        }
        start += newLength;
      }
      mutator.engage();
    },
    intersectCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.target === topSpace) {
          topIntersects = entry.isIntersecting;
        } else if (entry.target === bottomSpace) {
          bottomIntersects = entry.isIntersecting;
        }
      });
      console.log("Intersect", topIntersects, bottomIntersects, entries);
      if (measureScheduled) {
        measureScheduled = false;
        cancelAnimationFrame(rafId);
      }
      const msrm = measure();
      updateVirtualSpaces(msrm);
      updateViewport(msrm);
    },
    observer = new IntersectionObserver(intersectCallback, { rootMargin: `${margin * 100}% 0px` });
  let measureScheduled = false,
    rafId: number,
    chunkId = 1,
    topIntersects = false,
    bottomIntersects = false;
  void Promise.resolve().then(() => {
    if (!topSpace || !bottomSpace) {
      throw new Error("Top or bottom space ref is not initialized");
    }
    observer.observe(topSpace);
    observer.observe(bottomSpace);
  });
  createEffect(() => loadTotal(total));
  createEffect(() => {
    if (totalRes.loading || (totalRes() ?? 0 < lastIndex())) {
      return;
    }
    console.error("Total is less than last index, total", totalRes(), ", last: ", lastIndex());
    let offset = totalRes() ?? 0 - lastIndex();
    for (let i = state.chunks.length - 1; i >= 0 && offset > 0; i--) {
      const length = state.chunks[i].length;
      if (length <= offset && i > 0) {
        mutator.set(
          (s) => s.chunks,
          (chunks) => chunks.slice(0, chunks.length - 1)
        );
        offset -= length;
      } else {
        mutator.set((s) => s.chunks[i].length, length - offset);
      }
    }
    mutator.engage();
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
      const topDist = first.top - scrollRect.top;
      // console.log("Measure chunk", unwrap(chunk), itemsHeight, measured);
      if (itemsHeight === chunk.itemsHeight || chunk.measured) {
        continue;
      }
      const newAverage =
        measured.measuredItemsCount === 0
          ? itemsHeight / chunk.length
          : (measured.averageHeight * measured.measuredItemsCount + itemsHeight) /
            (measured.measuredItemsCount + chunk.length);
      measured.averageHeight = newAverage;
      measured.measuredItemsCount += chunk.length;
      mutator.set((root) => root.chunks[i], { itemsHeight, measured: true });
    }
    mutator.engage();
    const scrollIndex = scrolled > 0 ? Math.floor(scrolled / state.averageHeight) : 0;
    const page = Math.ceil(scrollViewport / state.averageHeight);
    const measurements = {
      lowWatermark: Math.max(0, Math.floor(scrollIndex - page * margin)),
      highWatermark: Math.ceil(scrollIndex + page * (margin + 1)),
      scrollOffset,
      scrolled,
      scrollTop,
      scrollViewport,
      scrollIndex,
      page,
      chunkLength: Math.ceil(page * (1 + margin)),
      measured,
      scrollHeight: scroller.scrollHeight,
      time: performance.now(),
    };
    console.log("Position:", measurements);
    return measurements;
  }

  function scheduleMeasure() {
    if (measureScheduled) {
      return;
    }
    measureScheduled = true;
    rafId = requestAnimationFrame((time1) => {
      console.log("Measure 1", time1);
      const measurements1 = measure();
      updateVirtualSpaces(measurements1);
      updateViewport(measurements1);
      rafId = requestAnimationFrame((time2) => {
        console.log("Measure 2", time1, time2);
        if (!measureScheduled) {
          return;
        }
        measureScheduled = false;
        const measurements2 = measure();
        updateVirtualSpaces(measurements2);
        updateViewport(measurements2);
      });
    });
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
