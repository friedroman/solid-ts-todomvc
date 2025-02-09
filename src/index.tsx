import { Accessor, createMemo, For, onCleanup, Show, VoidComponent } from "solid-js";
import { createStore } from "solid-js/store";
import { render } from "solid-js/web";
import createTodosStore, { Actions, ListMode, ShowMode, Store, Todo } from "./store";
import "./index.sass";
import { VirtualList } from "./virtual/virtual";
import { RangeRequest } from "./virtual/virtual_types";
import { arrayEqualShallow } from "./utils/utils";

const setFocus = (el: HTMLElement) => void Promise.resolve().then(() => el.focus());

const TodoApp = () => {
  const [
    store,
    {
      addTodo,
      toggleAll,
      editTodo,
      removeTodo,
      clearCompleted,
      setVisibility,
      setListMode,
      generateTodos,
    },
  ] = createTodosStore();
  const locationHandler = () => setVisibility((location.hash.slice(2) as ShowMode) || "all");
  window.addEventListener("hashchange", locationHandler);
  onCleanup(() => window.removeEventListener("hashchange", locationHandler));

  const appSection = (
    <section class="todoapp">
      <TodoHeader listMode={store.listMode} setListMode={setListMode} addTodo={addTodo} />
      <GeneratePanel maxIndex={store.todos.length - 1} generateTodos={generateTodos} />
      <Show when={store.todos.length > 0}>
        <TodoList {...{ store, toggleAll, editTodo, removeTodo }} />
        <TodoFooter store={store} clearCompleted={clearCompleted} />
      </Show>
    </section>
  );
  // const obs = new MutationObserver((mutations) => console.log("DOM Mutations", mutations));
  // obs.observe(appSection as Node, {
  //   attributeOldValue: true,
  //   characterDataOldValue: true,
  //   subtree: true,
  //   childList: true,
  // });
  // onCleanup(() => obs.disconnect());
  return appSection;
};

const TodoHeader = (props: { listMode: ListMode } & Pick<Actions, "addTodo" | "setListMode">) => {
  const onChange = (value: ListMode) => (e: { currentTarget: HTMLInputElement }) =>
    e.currentTarget.checked ? props.setListMode(value) : undefined;
  const header = (
    <header class="header">
      <h1 class="title is-1 has-text-centered">Todos</h1>
      <input
        class="new-todo input"
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

const GeneratePanel: VoidComponent<{
  generateTodos: (index: number, count: number) => void;
  maxIndex: number;
}> = (props) => {
  const [st, set] = createStore<{ index: number; count: number }>({ index: 0, count: 1 });
  return (
    <section>
      <div class="field">
        <label class="label">
          Start index
          <input
            class="input"
            type="number"
            min="0"
            max={props.maxIndex}
            value="0"
            onInput={({ currentTarget }) => set("index", currentTarget.valueAsNumber)}
          />
        </label>
      </div>
      <div class="field">
        <label class="label">
          Count
          <input
            class="input"
            type="number"
            min="0"
            value="1"
            onInput={({ currentTarget }) => set("count", currentTarget.valueAsNumber)}
          />
        </label>
      </div>
      <button class="button" onClick={() => props.generateTodos(st.index, st.count)}>
        Generate
      </button>
    </section>
  );
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
  const [state, setState] = createStore({} as ListState),
    filterList = createMemo(
      () => {
        if (store.showMode === "active") return store.todos.filter((todo) => !todo.completed);
        else if (store.showMode === "completed")
          return store.todos.filter((todo) => todo.completed);
        else return store.todos;
      },
      [],
      { equals: arrayEqualShallow }
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
  const sliceTodos = (req: Accessor<RangeRequest>) => {
    return () => filterList().slice(req().from, req().from + req().length);
  };
  let rowId = 0,
    virtRowId = 0;
  return (
    <section class="main section">
      <div class="field">
        <input
          id="toggle-all"
          class="toggle-all checkbox"
          type="checkbox"
          checked={!store.remainingCount}
          onInput={({ currentTarget }) => toggleAll(currentTarget.checked)}
        />
        <label class="label" for="toggle-all" />
      </div>
      <div class="lists-container">
        <Show when={store.listMode !== "virtual"}>
          <ul class="todo-list list">
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
          <ul class="todo-list list">
            <VirtualList data={sliceTodos} total={() => filterList().length}>
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
      class="todo list-item box"
      classList={{ completed: todo().completed, editing: isEditing(todo().id) }}>
      <div class="view control">
        <input
          class="toggle checkbox"
          type="checkbox"
          checked={todo().completed}
          onInput={({ currentTarget: i }) => toggle(todo().id, i.checked)}
        />
        {index ? index() : undefined}
        <label onDblClick={() => setCurrent(todo().id)}>{todo().title}</label>
        <button class="destroy delete is-small is-pulled-right" onClick={() => remove(todo().id)} />
      </div>
      <Show when={isEditing(todo().id)}>
        <input
          class="edit"
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
  <footer class="footer level">
    <span class="todo-count level-item">
      <strong>{store.remainingCount}</strong>
      {store.remainingCount === 1 ? " item left" : " items left"}
    </span>
    <ul class="filters level-item">
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
      <button class="clear-completed button level-item" onClick={clearCompleted}>
        Clear completed
      </button>
    </Show>
  </footer>
);

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
render(() => <TodoApp />, document.getElementById("main")!);
