import { describe, expect, it } from "vitest";
import { avatarPath } from "./avatarUpload";

describe("avatarPath", () => {
  it("namespaces the object under the user id with the file extension", () => {
    expect(avatarPath("user_123", "pic.PNG")).toBe("user_123/avatar.png");
  });
  it("defaults the extension when missing", () => {
    expect(avatarPath("u", "noext")).toBe("u/avatar.png");
  });
});
