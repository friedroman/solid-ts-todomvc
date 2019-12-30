import { createState, onCleanup } from "solid-js";
import { For, render, Show } from "solid-js/dom";
import createTodosStore, { Actions, ShowMode, Store, Todo } from "./store";
import "babel-plugin-jsx-dom-expressions";
import "todomvc-app-css/index";

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

  const appSection: any = (
    <section className="todoapp">
      <TodoHeader addTodo={addTodo} />
      <Show when={store.todos.length > 0}>
        <TodoList {...{ store, toggleAll, editTodo, removeTodo }} />
        <TodoFooter store={store} clearCompleted={clearCompleted} />
      </Show>
    </section>
  );
  const obs = new MutationObserver(mutations => console.log("DOM Mutations", mutations));
  obs.observe(appSection, {
    attributeOldValue: true,
    characterDataOldValue: true,
    subtree: true,
    childList: true,
  });
  onCleanup(() => obs.disconnect());
  return appSection;
};

const TodoHeader = ({ addTodo }: Pick<Actions, "addTodo">) => (
  <header className="header">
    <h1>todos</h1>
    <input
      className="new-todo"
      autofocus
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
      if (state.editingTodoId !== todoId) {
        return;
      }
      if (title.length == 0) {
        removeTodo(todoId);
        return;
      }
      editTodo({ id: todoId, title, completed: false });
      setCurrent();
    },
    toggle = (todoId: number, completed?: boolean) => {
      return editTodo({ id: todoId, completed: completed });
    },
    remove = (todoId: number) => removeTodo(todoId);
  return (
    <section className="main">
      <input
        id="toggle-all"
        className="toggle-all"
        type="checkbox"
        checked={!store.remainingCount}
        onInput={({ target }: Event) => toggleAll((target as HTMLInputElement).checked)}
      />
      <label htmlFor="toggle-all" />
      <ul className="todo-list">
        <For each={filterList(store.todos)}>
          {todo => (
            <TodoItem {...{ todo, isEditing, toggle, remove, setCurrent, save, key: todo.id }} />
          )}
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
    <li className="todo" classList={{ completed: !!todo.completed, editing: isEditing(todo.id) }}>
      <div className="view">
        <input
          className="toggle"
          type="checkbox"
          checked={todo.completed}
          onInput={(e: Event) => {
            const target = e.target as HTMLInputElement;
            toggle(todo.id, target.checked);
          }}
        />
        <label onDblClick={() => setCurrent(todo.id)}>{todo.title}</label>
        <button className="destroy" onClick={() => remove(todo.id)} />
      </div>
      <Show when={isEditing(todo.id)}>
        <input
          className="edit"
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
  <footer className="footer">
    <span className="todo-count">
      <strong>{store.remainingCount}</strong>
      {store.remainingCount === 1 ? " item left" : " items left"}
    </span>
    <ul className="filters">
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
      <button className="clear-completed" onClick={clearCompleted}>
        Clear completed
      </button>
    </Show>
  </footer>
);

render(TodoApp, document.getElementById("main")!);
