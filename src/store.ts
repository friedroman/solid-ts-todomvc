import { createComputed, createEffect } from "solid-js";
import { createStore } from "solid-js/store";
import { setStateMutator } from "./utils/set";
import { LoremIpsum } from "lorem-ipsum";

const LOCAL_STORAGE_KEY = "todos-solid";

export interface Store {
  counter: number;
  readonly todos: Todo[];
  showMode: ShowMode;
  listMode: ListMode;
  completedCount: number;
  remainingCount: number;
}

export interface Todo {
  title: string;
  id: number;
  completed?: boolean;
}
export type TodoInit = Omit<Todo, "id">;
export type TodoEdit = Pick<Todo, "id"> & Partial<Todo>;
export type ListMode = "plain" | "virtual" | "both";

export type ShowMode = "all" | "active" | "completed";

export interface Actions {
  addTodo: (init: TodoInit) => void;
  removeTodo: (id: number) => void;
  editTodo: (todo: TodoEdit) => void;
  clearCompleted: () => void;
  toggleAll: (completed: boolean) => void;
  setVisibility: (showMode: ShowMode) => void;
  setListMode: (mode: ListMode) => void;
  generateTodos: (index: number, count: number) => void;
}

const lorem = new LoremIpsum({
  wordsPerSentence: {
    min: 3,
    max: 15,
  },
  sentencesPerParagraph: {
    min: 1,
    max: 5,
  },
});

function getLocalStore(): Store {
  const storedString = localStorage.getItem(LOCAL_STORAGE_KEY);
  return storedString
    ? (JSON.parse(storedString) as Store)
    : {
        counter: 1,
        todos: [],
        showMode: "all",
        listMode: "both",
        completedCount: 0,
        remainingCount: 0,
      };
}

export default function createTodosStore(): [Store, Actions] {
  const [state, setState] = createStore(getLocalStore());
  const mut = setStateMutator([state, setState]);

  // JSON.stringify creates deps on every iterable field
  createEffect(() => localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state)));
  createComputed(() => {
    const completedCount = state.todos.filter((todo) => todo.completed).length;
    mut.selfNow({ completedCount, remainingCount: state.todos.length - completedCount });
  });

  return [
    state,
    {
      setListMode: (mode) => mut.setNow((s) => s.listMode, mode),
      addTodo: (todo) => {
        mut.set((s) => s.counter, (c) => ++c,);
        mut.set((s) => s.todos, (t) => [...t, { id: state.counter, ...todo }]);
        mut.engage();
      },
      removeTodo: (todoId) =>
        mut.setNow(
          (s) => s.todos,
          (t) => t.filter((item) => item.id !== todoId),
        ),
      editTodo: (todo) =>
        mut.setNow<Todo>((s) => s.todos.$filter((t) => t.id, todo.id), todo),
      clearCompleted: () =>
        mut.setNow(
          (s) => s.todos,
          (t) => t.filter((todo) => !todo.completed),
        ),
      toggleAll: (completed) =>
        mut.setNow((s) => s.todos.$all.completed, completed),
      setVisibility: (showMode) => mut.setNow((s) => s.showMode, showMode),
      generateTodos: (index, count) => {
        const generated = new Array<Todo>(count);
        let counter = state.counter;
        for (let i = 0; i < count; i++) {
          generated[i] = {
            id: counter++,
            completed: false,
            title: lorem.generateParagraphs(1),
          };
        }
        mut.setNow((s) => s.counter, counter);
        mut.setNow(
          (s) => s.todos,
          (todos) =>
            todos.slice(0, index).concat(generated, todos.slice(index)),
        );
      },
    },
  ];
}
