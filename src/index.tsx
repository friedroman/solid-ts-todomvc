import { createState, ErrorBoundary, onCleanup } from "solid-js";
import { For, render, Show } from "solid-js/dom";
import createTodosStore, { Actions, ShowMode, Store, Todo } from "./store";
import "babel-plugin-jsx-dom-expressions";
import "./index.sass";
import { RangeRequest, VirtualList } from "./virtual";

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

  const appSection = (
    <section className="todoapp">
      <TodoHeader addTodo={addTodo} />
      <Show when={store.todos.length > 0}>
        <TodoList {...{ store, toggleAll, editTodo, removeTodo }} />
        <TodoFooter store={store} clearCompleted={clearCompleted} />
      </Show>
    </section>
  ) as HTMLElement;
  const obs = new MutationObserver((mutations) => console.log("DOM Mutations", mutations));
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
    <h1 className="title is-1 has-text-centered">Todos</h1>
    <input
      className="new-todo input"
      type="text"
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
  editingTodoId?: number;
}

type ListProps = StoreHolder & Pick<Actions, "editTodo" | "removeTodo" | "toggleAll">;
const TodoList = ({ store, editTodo, removeTodo, toggleAll }: ListProps) => {
  const [state, setState] = createState({} as ListState),
    filterList = (todos: Todo[]) => {
      if (store.showMode === "active") return todos.filter((todo) => !todo.completed);
      else if (store.showMode === "completed") return todos.filter((todo) => todo.completed);
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
  const sliceTodos = (request: RangeRequest) => {
    const todos = filterList(store.todos);
    const slice = todos.slice(request.from, request.from + request.length);
    return Promise.resolve(slice);
  };
  return (
    <section className="main section">
      <div className="field">
        <input
          id="toggle-all"
          className="toggle-all checkbox"
          type="checkbox"
          checked={!store.remainingCount}
          onInput={({ target }: Event) => toggleAll((target as HTMLInputElement).checked)}
        />
        <label className="label" htmlFor="toggle-all" />
      </div>
      <div className="lists-container">
        <ul className="todo-list list">
          <For each={filterList(store.todos)}>
            {(todo) => (
              <TodoItem {...{ todo, isEditing, toggle, remove, setCurrent, save, key: todo.id }} />
            )}
          </For>
        </ul>
          <ul className="todo-list list">
            <VirtualList data={sliceTodos} total={() => Promise.resolve(store.todos.length)}>
              {(todo) => (
                <TodoItem {...{ todo, isEditing, toggle, remove, setCurrent, save, key: todo.id }} />
              )}
            </VirtualList>
          </ul>
      </div>
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
    <li
      className="todo list-item"
      classList={{ completed: !!todo.completed, editing: isEditing(todo.id) }}>
      <div className="view control">
        <input
          className="toggle checkbox"
          type="checkbox"
          checked={todo.completed}
          onInput={({ target }) => toggle(todo.id, target.checked)}
        />
        <label onDblClick={() => setCurrent(todo.id)}>{todo.title}</label>
        <button
          className="destroy delete is-small is-pulled-right"
          onClick={() => remove(todo.id)}
        />
      </div>
      <Show when={isEditing(todo.id)}>
        <input
          className="edit"
          value={todo.title}
          onBlur={onBlur}
          onKeyUp={onKeyUp}
          ref={setFocus}
        />
      </Show>
    </li>
  );
};

const TodoFooter = ({ store, clearCompleted }: StoreHolder & Pick<Actions, "clearCompleted">) => (
  <footer className="footer level">
    <span className="todo-count level-item">
      <strong>{store.remainingCount}</strong>
      {store.remainingCount === 1 ? " item left" : " items left"}
    </span>
    <ul className="filters level-item">
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
      <button className="clear-completed button level-item" onClick={clearCompleted}>
        Clear completed
      </button>
    </Show>
  </footer>
);

render(TodoApp, document.getElementById("main")!);
