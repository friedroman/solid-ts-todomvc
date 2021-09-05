import {
  batch,
  createComputed,
  createMemo,
  createResource,
  createSignal,
  createState,
  State,
} from "solid-js";
import { For, Index } from "solid-js/web";
import { setStateMutator } from "./utils/set";
import { ChunkProps, Measurements, VirtProps, VirtualState } from "./virtual_types";

function Chunk<T>(props: ChunkProps<T>): any {
  const [state, set] = createState(props.state);
  const key = () => ({ from: state.start, length: state.length });
  const [data, load] = createResource(key, props.data);
  // createEffect(() => {
  //   untrack(() =>
  //     console.log("Chunk reload: {", state.id, ",", state.start, ":", state.length, "H:", state.itemsHeight, "}", data())
  //   );
  //   load.refetch();
  // });
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

  function updateVirtualSpaces(msrm: Measurements) {
    const expectedHeight = msrm.spaceBefore + msrm.compensationDelta;
    const computedHeight = state.chunks[0].start * msrm.measured.averageHeight;
    const newCoeff = state.chunks[0].start > 0 ? expectedHeight / computedHeight : 1.0;
    mutator.selfNow({ ...msrm.measured, spaceAboveCoeff: newCoeff });
    console.log("New coeff: , height", newCoeff, expectedHeight, state.spaceBefore);
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
    batch(() => {
      if (bottomIntersects && lastIndex() !== t) {
        console.log("Shift down");
        shiftDown(msrm);
      }
      updateVirtualSpaces(msrm);
    });
  }

  const [scroll, setScroll] = createSignal(0),
    [state, setState] = createState<VirtualState<T>>({
      averageHeight: 40,
      measuredItemsCount: 0,
      spaceAboveCoeff: 1,
      chunks: [{ id: 0, start: 0, length: 20, itemsHeight: 40 * 20, measured: false }],
      get spaceBefore() {
        return spaceBefore();
      },
      get nextChunkStartIndex() {
        const st = this as State<VirtualState<T>>;
        const lastIdx = st.chunks.length - 1;
        const chunk = st.chunks[lastIdx];
        return chunk.start + chunk.length;
      },
      get total() {
        return totalRes() ?? 0;
      },
      get spaceAfter() {
        return spaceBelow();
      },
    }),
    spaceBefore: () => number = createMemo((previous) => {
      const approxHeight = state.chunks[0].start * state.averageHeight;
      const current = approxHeight * state.spaceAboveCoeff;
      console.log("Above", previous, "->", current, " approx:", approxHeight);
      return current;
    }),
    [totalRes, loadTotal] = createResource(() => "total", total),
    chunks: HTMLElement[][] = [],
    mutator = setStateMutator([state, setState]),
    scroller = document.scrollingElement!,
    lastIndex = () => {
      const chunk = state.chunks[state.chunks.length - 1];
      return chunk.start + chunk.length;
    },
    spaceBelow: () => number = createMemo((previous) => {
      const rowsBelow = Math.max(state.total - lastIndex(), 0);
      const newSpace = rowsBelow * state.averageHeight;
      // eslint-disable-next-line prettier/prettier
      console.log("Updating space below", previous, "->", newSpace, "below:", rowsBelow, "/", state.total);
      return newSpace;
    }, 0),
    shiftUp = () => {},
    shiftDown = (msrm: Measurements) => {
      const startIndex = lastIndex();
      if (startIndex === (totalRes() ?? 0 - 1)) {
        return;
      }

      const diff = msrm.highWatermark - startIndex;
      const chunkCount = Math.max(1, Math.ceil(diff / msrm.chunkLength));
      for (let i = 0, start = startIndex; i < 5 && i < chunkCount; i++) {
        const ch = state.chunks[i];
        const newLength = Math.min(totalRes()! - start, msrm.chunkLength);
        if (newLength <= 0) {
          break;
        }
        const chEndIndex = ch.start + ch.length;
        if (chEndIndex < msrm.lowWatermark && ch.measured) {
          // const newCoeff = (spaceAbove() + ch.itemsHeight) / (chEndIndex * state.averageHeight);
          msrm.compensationDelta += ch.itemsHeight;
          mutator
            .set((s) => s.chunks[0], {
              start: start,
              length: newLength,
              itemsHeight: newLength * state.averageHeight,
              measured: false,
            })
            .setNow(
              (s) => s.chunks,
              ([first, ...chunks]) => [...chunks, first]
            );
        } else {
          mutator.setNow(
            (s) => s.chunks,
            (chunks) => [
              ...chunks,
              {
                id: chunkId++,
                start: start,
                itemsHeight: newLength * state.averageHeight,
                measured: false,
                length: newLength,
              },
            ]
          );
        }
        start += newLength;
      }
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
  createComputed(() => {
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
      compensationDelta: 0,
      spaceBefore: state.spaceBefore,
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
    const cancelMeasure = () => {
      if (!measureScheduled) {
        return;
      }
    };
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
      <li ref={topSpace} className="virtual-space-above" style={{ height: `${spaceBefore()}px` }} />
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
