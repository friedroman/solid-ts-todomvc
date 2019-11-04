import { createState, onCleanup } from "solid-js";
import { For, render, selectWhen, Show } from "solid-js/dom";
import createTodosStore, { Actions, ShowMode, Store, Todo } from "./store";
import "babel-plugin-jsx-dom-expressions";

const setFocus = (el: HTMLElement) => Promise.resolve().then(() => el.focus());

type TodoApp = () => any;

const TodoApp: TodoApp = () => {
  const [
    store,
    { addTodo, toggleAll, editTodo, removeTodo, clearCompleted, setVisibility },
  ] = createTodosStore();
  const locationHandler = () => setVisibility((location.hash.slice(2) as ShowMode) || "all");
  window.addEventListener("hashchange", locationHandler);
  onCleanup(() => window.removeEventListener("hashchange", locationHandler));

  return (
    <section class="todoapp">
      <TodoHeader addTodo={addTodo} />
      <Show when={store.todos.length > 0}>
        <TodoList {...{ store, toggleAll, editTodo, removeTodo }} />
        <TodoFooter store={store} clearCompleted={clearCompleted} />
      </Show>
    </section>
  );
};

const TodoHeader = ({ addTodo }: Pick<Actions, "addTodo">) => (
  <header class="header">
    <h1>todos</h1>
    <input
      class="new-todo"
      placeholder="What needs to be done?"
      onKeyUp={({ target, code }: KeyboardEvent) => {
        const t = target as HTMLInputElement;
        const title = t.value.trim();
        if (code === "Enter" && title) {
          addTodo({ title });
          t.value = "";
        }
      }}
    />
  </header>
);

interface ListActions {
  isEditing: (id: number) => boolean;
  save: (id: number, title: string) => void;
  toggle: (id: number, completed: boolean) => void;
  remove: (todoId: number) => void;
  setCurrent: (todoId?: number) => void;
}

interface StoreHolder {
  store: Store;
}

interface ListState {
  editingTodoId: number;
}

type ListProps = StoreHolder & Pick<Actions, "editTodo" | "removeTodo" | "toggleAll">;
const TodoList = ({ store, editTodo, removeTodo, toggleAll }: ListProps) => {
  const [state, setState] = createState({} as ListState),
    filterList = (todos: Todo[]) => {
      if (store.showMode === "active") return todos.filter(todo => !todo.completed);
      else if (store.showMode === "completed") return todos.filter(todo => todo.completed);
      else return todos;
    },
    isEditing = (todoId: number) => {
      return state.editingTodoId === todoId;
    },
    setCurrent = (todoId?: number) => setState("editingTodoId", todoId),
    save = (todoId: number, title: string) => {
      if (state.editingTodoId === todoId && title) {
        editTodo({ id: todoId, title, completed: false });
        setCurrent();
      }
    },
    toggle = (todoId: number, completed?: boolean) => {
      return editTodo({ id: todoId, completed: completed || false });
    },
    remove = (todoId: number) => removeTodo(todoId);
  return (
    <section class="main">
      <input
        id="toggle-all"
        class="toggle-all"
        type="checkbox"
        checked={!store.remainingCount}
        onInput={({ target }: Event) => toggleAll((target as HTMLInputElement).checked)}
      />
      <label for="toggle-all" />
      <ul class="todo-list">
        <For
          each={filterList(store.todos)}
          transform={selectWhen(() => state.editingTodoId, "editing")}>
          {todo => <TodoItem {...{ todo, isEditing, toggle, remove, setCurrent, save }} />}
        </For>
      </ul>
    </section>
  );
};

const TodoItem = ({
  todo,
  isEditing,
  toggle,
  remove,
  setCurrent,
  save,
}: { todo: Todo } & ListActions) => {
  const saveInputValue = (e: Event) => {
      const input = e.target as HTMLInputElement;
      save(todo.id, input.value.trim());
    },
    onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Enter") saveInputValue(e);
      else if (e.code === "Escape") setCurrent();
    },
    onBlur = (e: Event) => saveInputValue(e);
  return (
    <li class="todo" classList={{ completed: todo.completed }}>
      <div class="view">
        <input
          class="toggle"
          type="checkbox"
          checked={todo.completed}
          onInput={(e: Event) => {
            const target = e.target as HTMLInputElement;
            toggle(todo.id, target.checked);
          }}
        />
        <label onDblClick={() => setCurrent(todo.id)}>{todo.title}</label>
        <button class="destroy" onClick={() => remove(todo.id)} />
      </div>
      <Show when={isEditing(todo.id)}>
        <input
          class="edit"
          value={todo.title}
          onBlur={onBlur}
          onkeyup={onKeyUp}
          forwardRef={setFocus}
        />
      </Show>
    </li>
  );
};

const TodoFooter = ({ store, clearCompleted }: StoreHolder & Pick<Actions, "clearCompleted">) => (
  <footer class="footer">
    <span class="todo-count">
      <strong>{store.remainingCount}</strong>
      {store.remainingCount === 1 ? " item" : " items"} left
    </span>
    <ul class="filters">
      <li>
        <a href="#/" classList={{ selected: store.showMode === "all" }}>
          All
        </a>
      </li>
      <li>
        <a href="#/active" classList={{ selected: store.showMode === "active" }}>
          Active
        </a>
      </li>
      <li>
        <a href="#/completed" classList={{ selected: store.showMode === "completed" }}>
          Completed
        </a>
      </li>
    </ul>
    <Show when={store.completedCount > 0}>
      <button class="clear-completed" onClick={clearCompleted}>
        Clear completed
      </button>
    </Show>
  </footer>
);

render(TodoApp, document.getElementById("main")!);
