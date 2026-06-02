import { beforeEach, describe, expect, it } from "vitest";
import { useTaskStore } from "./taskStore";

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
