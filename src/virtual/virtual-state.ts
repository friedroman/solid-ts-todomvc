import { batch, createComputed, createMemo, createSignal } from "solid-js";
import { createStore, Store, unwrap } from "solid-js/store";
import { For, Index } from "solid-js/web";
import { setStateMutator } from "../utils/set";
import { ChunkMsrmt, ChunkProps, Measurements, VirtProps, VirtualState } from "./virtual_types";

type MutationCommands = {
  jump: (startIndex: number, chunkLength: number) => void;
  shiftUp: () => void;
  shiftDown: (msrm: Measurements) => void;
  updateVirtualSpaces: (msrm: Measurements) => void;
};

export function createState<T>(props: VirtProps<T>): [VirtualState<T>, MutationCommands] {
  let chunkId = 1;
  const initChunkLength = props.initChunkLength ?? 10;
  const initItemHeight = props.initItemHeight ?? 80;
  const [state, setState] = createStore<VirtualState<T>>({
      averageHeight: initItemHeight,
      measuredItemsCount: 0,
      spaceAboveCoeff: 1,
      chunks: [
        {
          id: 0,
          start: 0,
          length: initChunkLength,
          itemsHeight: initChunkLength * initItemHeight,
          measured: false,
        },
      ],
      get spaceBefore() {
        return spaceBefore();
      },
      get nextChunkStartIndex() {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const st = this as Store<VirtualState<T>>;
        const lastIdx = st.chunks.length - 1;
        const chunk = st.chunks[lastIdx];
        return chunk.start + chunk.length;
      },
      get total() {
        return props.total() ?? 0;
      },
      get spaceAfter() {
        return spaceBelow();
      },
      get lastIndex() {
        const chunk = this.chunks[this.chunks.length - 1];
        return chunk.start + chunk.length;
      },
    }),
    spaceBefore: () => number = createMemo((previous) => {
      const approxHeight = state.chunks[0].start * state.averageHeight;
      const current = approxHeight * state.spaceAboveCoeff;
      console.log("Above", previous, "->", current, " approx:", approxHeight);
      return current;
    }),
    spaceBelow: () => number = createMemo((previous) => {
      const rowsBelow = Math.max(state.total - state.lastIndex, 0);
      const newSpace = rowsBelow * state.averageHeight;
      // eslint-disable-next-line prettier/prettier
      console.log("Updating space below", previous, "->", newSpace, "below:", rowsBelow, "/", state.total);
      return newSpace;
    }, 0),
    mutator = setStateMutator([state, setState]);
  createComputed(() => {
    if (state.total == null || state.total >= state.lastIndex) {
      return;
    }
    console.error("Total is less than last index, total", state.total, ", last: ", state.lastIndex);
    let offset = (state.total ?? 0) - state.lastIndex;
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

  return [
    state,
    {
      jump: (startIndex: number, chunkLength: number) => {
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
      },
      shiftUp: () => {
        // TODO: shiftUp logic using state and mutator
      },
      shiftDown: (msrm: Measurements) => {
        const startIndex = state.lastIndex;
        const total = state.total;
        const itemsLeft = total - startIndex;
        if (startIndex === total - 1) {
          return;
        }

        const chunkMsrm = msrm.chunkMeasurements;
        const needToCover = msrm.highWatermark - chunkMsrm[chunkMsrm.length - 1].end;
        if (needToCover < msrm.measured.averageHeight * -0.5) {
          console.log("No need to cover", needToCover);
          return;
        }
        const diff = Math.max(
          1,
          Math.min(itemsLeft, Math.ceil(needToCover / msrm.measured.averageHeight))
        );
        const chunksNeeded = Math.max(1, Math.ceil(diff / msrm.chunkLength));
        const firstUnmovable = chunkMsrm.findIndex((chkMsr) => chkMsr.end > msrm.lowWatermark);
        const chunksAvailableToShift = firstUnmovable == -1 ? state.chunks.length : firstUnmovable;
        const chunksToShift = Math.min(chunksNeeded, chunksAvailableToShift);
        const chunksUntouched = state.chunks.length - chunksToShift;
        console.log(
          "Diff:",
          diff,
          "Needed:",
          chunksNeeded,
          "Available:",
          chunksAvailableToShift,
          "ToShift:",
          chunksToShift
        );

        if (chunksToShift > 0) {
          mutator.setNow(
            (s) => s.chunks,
            (chunks) => chunks.slice(chunksToShift).concat(chunks.slice(0, chunksToShift))
          );
        }
        for (
          let i = 0, start = startIndex, toShift = chunksToShift;
          i < chunksNeeded && i < 5;
          i++, toShift--
        ) {
          const newLength = Math.min(total - start, msrm.chunkLength);
          if (newLength <= 0) {
            break;
          }
          const chunkUpdate = {
            start: start,
            itemsHeight: newLength * state.averageHeight,
            measured: false,
            length: newLength,
          };
          start += newLength;
          if (toShift > 0) {
            //we're updating an already shifted chunk with its new start index and length
            const index = i + chunksUntouched;
            //add compensation delta to be applied later to virtual space above
            //to adjust for change in height and scroll position
            msrm.compensationDelta += state.chunks[i].itemsHeight;
            mutator.setNow((s) => s.chunks[index], chunkUpdate);
          } else {
            //we're adding a new chunk
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
      },
      updateVirtualSpaces: (msrm: Measurements) => {
        const expectedHeight = msrm.spaceBefore + msrm.compensationDelta;
        const startIndex = unwrap(state).chunks[0].start;
        const computedHeight = startIndex * msrm.measured.averageHeight;
        const newCoeff = startIndex > 0 ? expectedHeight / computedHeight : 1.0;
        mutator.selfNow({ ...msrm.measured, spaceAboveCoeff: newCoeff });
        console.log(
          "New coeff, height, comp, space",
          newCoeff,
          expectedHeight,
          computedHeight,
          state.spaceBefore
        );
      },
    },
  ];
}
