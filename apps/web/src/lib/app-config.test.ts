import { describe, expect, it } from "vitest";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config";

describe("app identity", () => {
  it("ships the app display name and description", () => {
    expect(APP_NAME).toBe("KISS-ICP LiDAR Archive");
    expect(APP_DESCRIPTION).toBe(
      "LiDAR SLAM odometry, mapping, and trajectory archive powered by Backblaze B2"
    );
  });
});
