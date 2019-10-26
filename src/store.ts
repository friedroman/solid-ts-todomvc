import { createEffect, createState } from 'solid-js';

const LOCAL_STORAGE_KEY = 'todos-solid';

export interface Todo {
  title: string,
  id: number,
  completed: boolean
}
export interface Store {
  counter: number,
  readonly todos: Todo[],
  showMode: ShowMode,
  completedCount: number,
  remainingCount: number
}

export type ShowMode = 'all' | 'active' | 'completed';

export type TodoInit = Partial<Omit<Todo, 'id'>>;

export interface Actions {
  addTodo: (init: TodoInit) => void,
  removeTodo: (id: number) => void,
  editTodo: (todo: Partial<Todo>) => void,
  clearCompleted: () => void,
  toggleAll: (completed?: boolean) => void,
  setVisibility: (showMode: ShowMode) => void
}

function getLocalStore(): Store {
  const storedString = localStorage.getItem(LOCAL_STORAGE_KEY);
  return storedString ? JSON.parse(storedString) : { counter: 1, todos: [], showMode: 'all' };
}

export default function createTodosStore(): [Store, Actions] {
  const [state, setState] = createState(getLocalStore());

  // JSON.stringify creates deps on every iterable field
  createEffect(() => localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state)));
  createEffect(() => {
    const completedCount = state.todos.filter(todo => todo.completed).length;
    setState({ completedCount, remainingCount: state.todos.length - completedCount });
  });


  return [
    state, {
      addTodo: (todo) => {
        setState('todos', (t: Todo[]) => [{ title: todo.title, id: state.counter, completed: false }, ...t]);
        setState('counter', (c: number) => c + 1);
      },
      removeTodo: todoId => setState('todos', (t: Todo[]) => t.filter(item => item.id !== todoId)),
      editTodo: (todo) => setState('todos', (t: Todo, i: number) => t.id === todo.id, todo),
      clearCompleted: () => setState('todos', (t: Todo[]) => t.filter(todo => !todo.completed)),
      toggleAll: completed => setState('todos', (todo: Todo) => todo.completed !== completed, { completed }),
      setVisibility: showMode => setState('showMode', showMode)
    }];
}
