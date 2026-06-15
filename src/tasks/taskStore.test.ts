import { beforeEach, describe, expect, it } from "vitest";
import { useTaskStore, normalizeTasks, type Task } from "./taskStore";

beforeEach(() => useTaskStore.setState({ tasks: [] }));

describe("taskStore", () => {
  it("adds a backlog task with the given title", () => {
    useTaskStore.getState().add("Write docs");
    const t = useTaskStore.getState().tasks[0];
    expect(t.title).toBe("Write docs");
    expect(t.status).toBe("backlog");
    expect(t.description).toBe("");
    expect(typeof t.id).toBe("string");
    expect(t.createdAt).toBeGreaterThan(0);
  });

  it("updates fields by id (move column, edit) and keeps the id", () => {
    useTaskStore.getState().add("A");
    const id = useTaskStore.getState().tasks[0].id;
    useTaskStore.getState().update(id, { status: "done", title: "A!", wallId: "w1" });
    const t = useTaskStore.getState().tasks[0];
    expect(t.id).toBe(id);
    expect(t.status).toBe("done");
    expect(t.title).toBe("A!");
    expect(t.wallId).toBe("w1");
  });

  it("removes a task by id", () => {
    useTaskStore.getState().add("A");
    useTaskStore.getState().add("B");
    const firstId = useTaskStore.getState().tasks[0].id;
    useTaskStore.getState().remove(firstId);
    expect(useTaskStore.getState().tasks.map((t) => t.title)).toEqual(["B"]);
  });

  it("setAll replaces the list (for load)", () => {
    useTaskStore.getState().setAll([
      { id: "x", title: "X", description: "", status: "backlog", createdAt: 1, updatedAt: 1 },
    ]);
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0].id).toBe("x");
  });
});

describe("taskStore ordering", () => {
  it("add appends with increasing order within the backlog column", () => {
    useTaskStore.getState().add("A");
    useTaskStore.getState().add("B");
    const [a, b] = useTaskStore.getState().tasks;
    expect(a.order).toBe(0);
    expect(b.order).toBe(1);
  });

  it("reorder moves a task to a column at a given index and renumbers", () => {
    useTaskStore.getState().add("A"); // backlog 0
    useTaskStore.getState().add("B"); // backlog 1
    useTaskStore.getState().add("C"); // backlog 2
    const ids = useTaskStore.getState().tasks.map((t) => t.id);
    // move C (index 2) to top of in-progress
    useTaskStore.getState().reorder(ids[2], "in-progress", 0);
    const c = useTaskStore.getState().tasks.find((t) => t.id === ids[2])!;
    expect(c.status).toBe("in-progress");
    expect(c.order).toBe(0);
    // move A to index 1 within backlog (after B)
    useTaskStore.getState().reorder(ids[0], "backlog", 1);
    const backlog = useTaskStore.getState().tasks
      .filter((t) => t.status === "backlog")
      .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
      .map((t) => t.title);
    expect(backlog).toEqual(["B", "A"]);
  });
});

describe("normalizeTasks", () => {
  it("assigns sequential order per column, preserving prior order then createdAt", () => {
    const input: Task[] = [
      { id: "1", title: "older", description: "", status: "backlog", createdAt: 1, updatedAt: 1 },
      { id: "2", title: "newer", description: "", status: "backlog", createdAt: 9, updatedAt: 9, order: 0 },
      { id: "3", title: "done1", description: "", status: "done", createdAt: 5, updatedAt: 5 },
    ];
    const out = normalizeTasks(input);
    const backlog = out.filter((t) => t.status === "backlog");
    // "2" had order 0; "1" had none → sorts after by createdAt
    expect(backlog.map((t) => t.id)).toEqual(["2", "1"]);
    expect(backlog.map((t) => t.order)).toEqual([0, 1]);
    expect(out.find((t) => t.id === "3")!.order).toBe(0);
  });
});
