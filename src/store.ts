import { createEffect, createState } from "solid-js";
import { setStateMutator } from "./utils/set";

const LOCAL_STORAGE_KEY = "todos-solid";

export interface Store {
  counter: number;
  readonly todos: Todo[];
  showMode: ShowMode;
  completedCount: number;
  remainingCount: number;
}

export interface Todo {
  title: string;
  id: number;
  completed?: boolean;
}
export type TodoInit = Omit<Todo, "id">;
export type TodoEdit = { id: number } & Partial<Todo>;

export type ShowMode = "all" | "active" | "completed";

export interface Actions {
  addTodo: (init: TodoInit) => void;
  removeTodo: (id: number) => void;
  editTodo: (todo: TodoEdit) => void;
  clearCompleted: () => void;
  toggleAll: (completed: boolean) => void;
  setVisibility: (showMode: ShowMode) => void;
}

function getLocalStore(): Store {
  const storedString = localStorage.getItem(LOCAL_STORAGE_KEY);
  return storedString ? JSON.parse(storedString) : { counter: 1, todos: [], showMode: "all" };
}

export default function createTodosStore(): [Store, Actions] {
  const [state, setState] = createState(getLocalStore());
  const mut = setStateMutator([state, setState]);

  // JSON.stringify creates deps on every iterable field
  createEffect(() => localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state)));
  createEffect(() => {
    const completedCount = state.todos.filter(todo => todo.completed).length;
    mut.selfNow({ completedCount, remainingCount: state.todos.length - completedCount });
  });

  return [
    state,
    {
      addTodo: todo =>
        mut
          .set(s => s.counter, c => ++c)
          .set(s => s.todos, t => [...t, { id: state.counter, ...todo }])
          .engage(),
      removeTodo: todoId => mut.setNow(s => s.todos, t => t.filter(item => item.id !== todoId)),
      editTodo: todo => mut.setNow(s => s.todos.$filter(t => t.id, todo.id), todo),
      clearCompleted: () => mut.setNow(s => s.todos, t => t.filter(todo => !todo.completed)),
      toggleAll: completed => mut.setNow(s => s.todos.$all.completed, completed),
      setVisibility: showMode => mut.setNow(s => s.showMode, showMode),
    },
  ];
}
