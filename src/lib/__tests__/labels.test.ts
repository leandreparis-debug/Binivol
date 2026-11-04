import { describe, expect, it } from "vitest";
import * as enums from "@/generated/prisma/enums";
import { ENUM_LABELS } from "@/lib/labels";

const enumObjects: [string, Record<string, string>][] = Object.entries(
  enums as Record<string, unknown>,
).flatMap(([name, value]) =>
  typeof value === "object" && value !== null ? [[name, value as Record<string, string>]] : [],
);

describe("labels", () => {
  it("covers every enum of the schema", () => {
    const names = enumObjects.map(([name]) => name).sort();
    expect(Object.keys(ENUM_LABELS).sort()).toEqual(names);
  });

  it.each(enumObjects)("gives a French label to every value of %s", (name, values) => {
    const labels = (ENUM_LABELS as Record<string, Record<string, string>>)[name];
    expect(labels, name).toBeDefined();
    for (const value of Object.values(values)) {
      expect(labels?.[value]?.trim(), `${name}.${value}`).toBeTruthy();
    }
    expect(Object.keys(labels ?? {}).sort()).toEqual(Object.values(values).sort());
  });
});
