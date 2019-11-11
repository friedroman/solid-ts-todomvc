import { createEffect, createState, SetStateFunction } from "solid-js";
import { setStateMutator } from "./utils/set";
import { Wrapped } from "solid-js/types/state";

const LOCAL_STORAGE_KEY = "todos-solid";

export interface Todo {
  title: string;
  id: number;
  completed: boolean;
}
export interface Store {
  counter: number;
  readonly todos: Todo[];
  showMode: ShowMode;
  completedCount: number;
  remainingCount: number;
}

export type ShowMode = "all" | "active" | "completed";

export type TodoInit = Partial<Omit<Todo, "id">>;

export interface Actions {
  addTodo: (init: TodoInit) => void;
  removeTodo: (id: number) => void;
  editTodo: (todo: Partial<Todo>) => void;
  clearCompleted: () => void;
  toggleAll: (completed?: boolean) => void;
  setVisibility: (showMode: ShowMode) => void;
}

function getLocalStore(): Store {
  const storedString = localStorage.getItem(LOCAL_STORAGE_KEY);
  return storedString ? JSON.parse(storedString) : { counter: 1, todos: [], showMode: "all" };
}

export default function createTodosStore(): [Store, Actions] {
  const [state, setState]: [Wrapped<Store>, SetStateFunction<Store>] = createState(getLocalStore());
  const mut = setStateMutator([state, setState]);

  // JSON.stringify creates deps on every iterable field
  createEffect(() => localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state)));
  createEffect(() => {
    const completedCount = state.todos.filter(todo => todo.completed).length;
    mut.setSelfNow({ completedCount, remainingCount: state.todos.length - completedCount });
  });

  return [
    state,
    {
      addTodo: todo =>
        mut
          .set(s => s.counter, (c: number) => ++c)
          .set(s => s.todos, t => [...t, { id: state.counter, ...(todo as Required<TodoInit>) }])
          .engage(),
      removeTodo: todoId => mut.mutNow(s => s.todos, t => t.filter(item => item.id !== todoId)),
      editTodo: todo => mut.mutPathNow(["todos", [todo.id!]], t => ({ ...t, ...todo })),
      clearCompleted: () => mut.mutNow(s => s.todos, t => t.filter(todo => !todo.completed)),
      toggleAll: completed =>
        state.todos
          .filter(t => t.completed !== completed || false)
          .reduce((m, t, i) => m.set(s => s.todos[i].completed, completed || false), mut)
          .engage(),
      setVisibility: showMode => mut.mutNow(s => s.showMode, showMode),
    },
  ];
}
