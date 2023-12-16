import { Accessor, batch, createComputed, createEffect, createMemo, createSignal, on } from "solid-js";
import { createStore, Store, unwrap } from "solid-js/store";
import { setStateMutator } from "../utils/set";
import { Chunk, ChunkMsrmt, MeasureStats, Measurements, VirtProps, VirtualState } from "./virtual_types";
import { equalsEpsilon, withinEpsilon } from "./equalsEpsilon";

type MutationCommands = {
  updateViewport: (msrm: Measurements) => boolean;
};

const PIXELS_EPS = 0.01;

export function createState<T>(props: VirtProps<T>): [VirtualState<T>, MutationCommands] {
  let chunkId = 1;
  const margin = props.margin ?? 0.5;
  const initChunkLength = props.initChunkLength ?? 10;
  const initItemHeight = props.initItemHeight ?? 80;
  const [state, setState] = createStore<VirtualState<T>>({
    averageItemLength: initItemHeight,
    measuredItemsCount: 0,
    spaceAboveCoeff: 1,
    measurements: null,
    chunks: [
      {
        id: 0,
        start: 0,
        count: initChunkLength,
        expectedItemsLength: initChunkLength * initItemHeight,
        measured: false,
        measurements: null
      },
    ],
    get spaceBefore() {
      return spaceBefore();
    },
    get total() {
      return props.total() ?? 0;
    },
    get spaceAfter() {
      return spaceAfter();
    },
    get lastIndex() {
      return lastIndex();
    },
    get lowWatermark() {
      if (!this.measurements) {
        return 0;
      }
      const { scrollTop, scrollerStart, scrollViewport } = this.measurements;
      return scrollerStart + scrollTop - scrollViewport * margin;
    },
    get highWatermark() {
      const measurements = this.measurements as Measurements;
      if (measurements == null) {
        return 0;
      }
      const { scrollTop, scrollerStart, scrollViewport } = measurements;
      return scrollerStart + scrollTop + scrollViewport * (1 + margin);
    },
    get lowWatermarkIndex() {
      const measurements = this.measurements as Measurements;
      if (measurements == null) {
        return 0;
      }
      const { scrollIndex } = measurements;
      return Math.max(0, Math.floor(scrollIndex - this.page * margin));
    },
    get highWatermarkIndex() {
      const measurements = this.measurements as Measurements;
      if (measurements == null) {
        return initChunkLength;
      }
      const { scrollIndex } = measurements;
      return Math.max(0, Math.ceil(scrollIndex + this.page * margin));
    },
    get page() {
      return page();
    },
    get chunkLength() {
      return Math.ceil(this.page * 0.6);
    },
  });
  // createEffect(()=> {
  //   console.log("Space before", state.spaceBefore, "Space after", state.spaceAfter);
  // });
  const lastIndex: Accessor<number> = createMemo(() => {
      // console.log("Last Index memo");
      const chks = state.chunks,
        length = chks.length,
        ch = chks[length - 1];
      if (length == 0) {
        return 0;
      }
      if (ch == null) {
        return 0;
      }
      const last = ch.start + ch.count - 1;
      console.log("lastIndex: ", last, ", chunk: ", unwrap(ch), "chunks count:", chks.length);
      return last;
    }),
    spaceBefore: Accessor<number> = createMemo(
      () => {
        const approxLength = state.chunks[0].start * state.averageItemLength;
        const newLength = approxLength * state.spaceAboveCoeff;
        // console.log("Above", previous, "->", current, " approx:", approxHeight);
        return newLength;
      },
      0,
      { equals: equalsEpsilon(PIXELS_EPS) }
    ),
    spaceAfter: Accessor<number> = createMemo(
      (previous) => {
        const rowsBelow = Math.max(state.total - state.lastIndex, 0);
        const newSpace = rowsBelow * state.averageItemLength;
        // console.log(
        //   "Triggered space after,",
        //   previous,
        //   "->",
        //   newSpace,
        //   "will update:",
        //   !withinEpsilon(previous, newSpace, PIXELS_EPS),
        //   "below:",
        //   rowsBelow,
        //   "/",
        //   state.total
        // );
        return newSpace;
      },
      0,
      // Suppress propagation of small changes in the space below height as it is not visible and
      // does not affect the layout of what is visible as opposed to space above.
      { equals: equalsEpsilon(PIXELS_EPS) }
    ),
    page: Accessor<number> = createMemo(() => {
      if (state.measurements == null) {
        return initChunkLength;
      }
      const { scrollViewport } = state.measurements;
      return Math.ceil(scrollViewport / state.averageItemLength);
    }),

    mutator = setStateMutator([state, setState]),

    jump = (startIndex: number, chunkLength: number) => {
      console.log("Jump", startIndex, chunkLength);
      for (
        let i = 0, chunkStart = startIndex;
        i < state.chunks.length;
        i++, chunkStart += chunkLength
      ) {
        const edge = chunkStart + chunkLength >= state.total;
        const len = edge ? state.total - chunkStart : chunkLength;
        mutator.set((s) => s.chunks[i], {
          start: chunkStart,
          count: len,
          measurements: null,
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
    },

    shiftUp = (msrm: Measurements) => {
      // Calculate index we're shifting from
      const lastIndex = state.lastIndex;

      // If we're already at 0, exit
      if (lastIndex === 0) {
        return false;
      }

      // Calculate how many items we need to shift up
      const needToCover = state.lowWatermark - msrm.chunkMeasurements[0].start;
      const itemsToShift = Math.ceil(needToCover / msrm.measured.averageItemLength);

      // Calculate chunks to shift
      const chunksToShift = Math.ceil(itemsToShift / state.chunkLength);

      // Get chunks we can't shift
      const fixedChunks = msrm.chunkMeasurements.filter((m) => m.start < state.lowWatermark);
      const movableChunks = state.chunks.length - fixedChunks.length;
      const chunksToMove = Math.min(chunksToShift, movableChunks);

      // Shift chunks
      if (chunksToMove > 0) {
        mutator.setNow(
          (s) => s.chunks,
          (chunks) => {
            const shifted = chunks.slice(-chunksToMove);
            return shifted.concat(chunks.slice(0, -chunksToMove));
          }
        );
      }

      // Update shifted chunk data
      let itemsShifted = 0;
      for (let i = 0; i < chunksToMove; i++) {
        const chunkIndex = state.chunks.length - chunksToMove + i;
        const chunk = state.chunks[chunkIndex];
        const newStart = chunk.start - itemsToShift;
        const newLength = Math.max(0, chunk.count - itemsShifted);

        mutator.setNow((s) => s.chunks[chunkIndex], {
          ...chunk,
          start: newStart,
          count: newLength,
          measurements: null,
        });

        itemsShifted += chunk.count - newLength;
        if (itemsShifted >= itemsToShift) {
          break;
        }
      }
      return true;
    },

    /**
     * A function to shift down some of the existing chunks or create new ones to devirtualize the space below.
     * Takes msrm to calculate how much space we need to fill below in order to have enough rows rendered to hit the high watermark.
     */
    shiftDown = (msrm: Measurements) => {
      // Get start index for the chunks about to be shifted down or created
      const startIndex = state.lastIndex + 1;
      const total = state.total;
      // Calculate how many items below are currently virtualized and not rendered
      const itemsLeft = total - startIndex;

      // Check if we are at the last item
      if (itemsLeft <= 0) {
        console.log("Last item, no need to shift");
        // If so, exit early
        return false;
      }

      // Get the end of the last rendered chunk from measurements
      const chunkMsrm = msrm.chunkMeasurements;
      const lastChunkEnd = chunkMsrm[chunkMsrm.length - 1].end;

      // Calculate how much we need to cover
      const needToCover = state.highWatermark - lastChunkEnd;

      // Check if we are less than half an item height below the high watermark
      if (needToCover < msrm.measured.averageItemLength * -0.5) {
        // If not, log and exit
        console.log("No need to cover", needToCover);
        return false;
      }
      console.log("Need to cover: ", needToCover);

      // Calculate number of items needed to cover the distance
      const itemsNeeded = Math.max(
        1,
        Math.min(itemsLeft, Math.ceil(needToCover / msrm.measured.averageItemLength))
      );

      // Calculate how many chunks we need to cover the needed distance
      const chunksNeeded = Math.max(1, Math.ceil(itemsNeeded / state.chunkLength));

      // Find the first chunk that intersects low watermark and therefore cannot be shifted
      const firstUnmovable = chunkMsrm.findIndex((chkMsr) => chkMsr.end > state.lowWatermark);

      // Calculate how many chunks are available to shift
      const chunksAvailableToShift = firstUnmovable == -1 ? state.chunks.length : firstUnmovable;

      // Find out how many chunks we will actually shift
      const chunksToShift = Math.min(chunksNeeded, chunksAvailableToShift);

      // Calculate chunks untouched
      const chunksUntouched = state.chunks.length - chunksToShift;

      // Log calculations
      console.log(
        "Diff:",
        itemsNeeded,
        "Needed:",
        chunksNeeded,
        "Available:",
        chunksAvailableToShift,
        "ToShift:",
        chunksToShift
      );

      // Shift existing chunks if needed
      if (chunksToShift > 0) {
        mutator.setNow(
          (s) => s.chunks,
          (chunks) => chunks.slice(chunksToShift).concat(chunks.slice(0, chunksToShift))
        );
      }

      // Iterate to add new chunks or update shifted ones
      for (
        let i = 0, start = startIndex, toShift = chunksToShift;
        i < chunksNeeded && i < 6;
        i++, toShift--
      ) {
        // Calculate items count for new chunk 
        const newChunkCount = Math.min(total - start, state.chunkLength);
        // Check if we're overlowing the total
        if (newChunkCount <= 0) {
          break;
        }

        // Create chunk update
        const chunkUpdate = {
          start,
          expectedItemsLength: newChunkCount * state.averageItemLength,
          measured: false,
          count: newChunkCount,
          measurements: null
        };

        console.log(`Chunk update: ${i} toShift: ${toShift}`, chunkUpdate);

        // Increment start
        start += newChunkCount;

        // Check if shifting existing chunk
        if (toShift > 0) {
          // Get index
          const index = i + chunksUntouched;
          const ch = state.chunks[index];

          // Update compensation delta
          msrm.compensationDelta += ch.measurements?.itemsLength ?? ch.expectedItemsLength;

          // Update existing chunk
          mutator.setNow((s) => s.chunks[index], chunkUpdate);
        } else {
          // Otherwise add new chunk
          mutator.setNow(
            (s) => s.chunks,
            (chunks) =>
              chunks.concat({
                id: chunkId++,
                ...chunkUpdate,
              })
          );
        }
      }
      return true;
    },

    updateVirtualSpaces = (msrm: Measurements) => {
      const expectedHeight = msrm.spaceBefore + msrm.compensationDelta;
      const newStart = state.chunks[0].start;
      const computedHeight = newStart * msrm.measured.averageItemLength;
      const newCoeff = computedHeight > 0 ? expectedHeight / computedHeight : 1.0;

      mutator.selfNow({ ...msrm.measured, spaceAboveCoeff: newCoeff, measurements: msrm });
      console.log(
        "New coeff", newCoeff,
        ", old: ", state.spaceBefore,
        ", computed: ", computedHeight,
        ", expected: ", expectedHeight,
      );
    };
  // createComputed(() => {
  //   if (state.total == null || state.total >= state.lastIndex) {
  //     return;
  //   }
  //   console.error("Total is less than last index, total", state.total, ", last: ", state.lastIndex);
  //   let offset = (state.total ?? 0) - state.lastIndex;
  //   for (let i = state.chunks.length - 1; i >= 0 && offset > 0; i--) {
  //     const length = state.chunks[i].count;
  //     if (length <= offset && i > 0) {
  //       mutator.set(
  //         (s) => s.chunks,
  //         (chunks) => chunks.slice(0, chunks.length - 1)
  //       );
  //       offset -= length;
  //     } else {
  //       mutator.set((s) => s.chunks[i].count, length - offset);
  //     }
  //   }
  //   mutator.engage();
  // });

  const updateChunkMeasurements = (msrmts: Measurements) => {
    msrmts.chunkMeasurements.forEach((msrm, i) => {
      mutator.setNow((s) => s.chunks[i].measurements, msrm);
    })
  }

  return [
    state,
    {
      updateViewport: (msrm: Measurements) => {
        // Update measurements immediately to have some source data
        if (state.measurements == null) {
          mutator.selfNow({ measurements: msrm });
        }
        updateChunkMeasurements(msrm);
        const { scrollIndex } = msrm;
        const { total, page, chunkLength } = state;
        let changed = false;

        if (msrm.topIntersects && scrollIndex > 0) {
          const startDiff = scrollIndex - state.chunks[0].start;
          const jumpDetected = startDiff < page * -state.chunks.length;
          if (jumpDetected) {
            const start = scrollIndex < page ? 0 : scrollIndex - page;
            changed = true;
            jump(start, chunkLength);
          } else {
            console.log("Shift up");
            // changed = shiftUp(msrm);
          }
        }
        if (msrm.bottomIntersects && state.lastIndex !== total) {
          console.log("Shift down");
          changed = shiftDown(msrm);
        }
        updateVirtualSpaces(msrm);
        return changed;
      }
    },
  ];
}