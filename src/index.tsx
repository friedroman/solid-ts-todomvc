import {createMemo, createState, onCleanup} from "solid-js";
import {For, render, Show} from "solid-js/web";
import createTodosStore, {Actions, ListMode, ShowMode, Store, Todo} from "./store";
import "./index.sass";
import {VirtualList} from "./virtual";
import {RangeRequest} from "./virtual_types";
import {arrayEqualShallow} from "./utils/utils";

const setFocus = (el: HTMLElement) => void Promise.resolve().then(() => el.focus());

type TodoApp = () => any;

const TodoApp: TodoApp = () => {
  const [
    store,
    { addTodo, toggleAll, editTodo, removeTodo, clearCompleted, setVisibility, setListMode },
  ] = createTodosStore();
  const locationHandler = () => setVisibility((location.hash.slice(2) as ShowMode) || "all");
  window.addEventListener("hashchange", locationHandler);
  onCleanup(() => window.removeEventListener("hashchange", locationHandler));

  const appSection = (
    <section className="todoapp">
      <TodoHeader listMode={store.listMode} setListMode={setListMode} addTodo={addTodo} />
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

const TodoHeader = (props: { listMode: ListMode } & Pick<Actions, "addTodo" | "setListMode">) => {
  const onChange = (value: ListMode) => (e: { currentTarget: HTMLInputElement }) =>
    e.currentTarget.checked ? props.setListMode(value) : undefined;
  const header = (
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
            props.addTodo({ title });
            t.value = "";
          }
        }}
      />
      <div class="control list-mode-switcher">
        <label class="radio">
          <input
            type="radio"
            name="listmode"
            checked={props.listMode == null || props.listMode === "plain"}
            onChange={onChange("plain")}
          />
          Real
        </label>
        <label class="radio">
          <input
            type="radio"
            name="listmode"
            checked={props.listMode === "virtual"}
            onChange={onChange("virtual")}
          />
          Virtual
        </label>
        <label class="radio">
          <input
            type="radio"
            name="listmode"
            checked={props.listMode === "both"}
            onChange={onChange("both")}
          />
          Both
        </label>
      </div>
    </header>
  );
  return header;
};

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
    filterList = createMemo(
      () => {
        if (store.showMode === "active") return store.todos.filter((todo) => !todo.completed);
        else if (store.showMode === "completed")
          return store.todos.filter((todo) => todo.completed);
        else return store.todos;
      },
      [],
      arrayEqualShallow
    ),
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
    return filterList().slice(request.from, request.from + request.length);
  };
  let rowId = 0,
    virtRowId = 0;
  return (
    <section className="main section">
      <div className="field">
        <input
          id="toggle-all"
          className="toggle-all checkbox"
          type="checkbox"
          checked={!store.remainingCount}
          onInput={({ currentTarget }) => toggleAll(currentTarget.checked)}
        />
        <label className="label" htmlFor="toggle-all" />
      </div>
      <div className="lists-container">
        <Show when={store.listMode !== "virtual"}>
          <ul className="todo-list list">
            <For each={filterList()}>
              {(todo, index) => (
                <TodoItem
                  {...{
                    todo: () => todo,
                    index,
                    isEditing,
                    toggle,
                    remove,
                    setCurrent,
                    save,
                    rowId: rowId++,
                  }}
                />
              )}
            </For>
          </ul>
        </Show>
        <Show when={store.listMode != null && store.listMode !== "plain"}>
          <ul className="todo-list list">
            <VirtualList data={sliceTodos} total={() => Promise.resolve(filterList().length)}>
              {(todo, index) => (
                <TodoItem
                  {...{
                    todo,
                    index,
                    isEditing,
                    toggle,
                    remove,
                    setCurrent,
                    save,
                    rowId: virtRowId++,
                  }}
                />
              )}
            </VirtualList>
          </ul>
        </Show>
      </div>
    </section>
  );
};

type ItemProps = { todo: () => Todo; index: () => number; rowId: number } & ListActions;
const TodoItem = ({
  todo,
  index,
  isEditing,
  toggle,
  remove,
  setCurrent,
  save,
  rowId,
}: ItemProps) => {
  const saveInputValue = ({ currentTarget }: { currentTarget: HTMLInputElement }) =>
    save(todo().id, currentTarget.value.trim());
  return (
    <li
      data-virtual-row-id={rowId}
      className="todo list-item box"
      classList={{ completed: todo().completed, editing: isEditing(todo().id) }}>
      <div className="view control">
        <input
          className="toggle checkbox"
          type="checkbox"
          checked={todo().completed}
          onInput={({ currentTarget: i }) => toggle(todo().id, i.checked)}
        />
        {index ? index() : undefined}
        <label onDblClick={() => setCurrent(todo().id)}>{todo().title}</label>
        <button
          className="destroy delete is-small is-pulled-right"
          onClick={() => remove(todo().id)}
        />
      </div>
      <Show when={isEditing(todo().id)}>
        <input
          className="edit"
          value={todo().title}
          onBlur={(e) => saveInputValue(e)}
          onKeyUp={(e) => {
            if (e.code === "Enter") saveInputValue(e);
            else if (e.code === "Escape") setCurrent();
          }}
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

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
render(TodoApp, document.getElementById("main")!);
