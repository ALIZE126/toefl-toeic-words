import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import BlankInput, { clampBlank } from "../src/components/BlankInput";

afterEach(() => cleanup());

function Harness({ length = 3 }: { length?: number }) {
  const [v, setV] = useState("");
  return <BlankInput prefix="car" length={length} value={v} onChange={setV} label="空" />;
}

describe("补词输入框：缺几个字母只能填几个", () => {
  it("只保留字母并截断到格子数", () => {
    expect(clampBlank("ved", 3)).toBe("ved");
    expect(clampBlank("vedx", 3)).toBe("ved");
    expect(clampBlank(" v e d!", 3)).toBe("ved");
    expect(clampBlank("v3d", 3)).toBe("vd");
    expect(clampBlank("降水precipitation", 4)).toBe("prec");
  });

  it("输入、粘贴超过格子数时截断；maxLength 等于缺失字母数；宽度按格子数", () => {
    render(<Harness length={3} />);
    const box = screen.getByRole("textbox") as HTMLInputElement;
    expect(box.maxLength).toBe(3);
    expect(box.style.width).toBe("calc(3ch + 6px)");
    expect(box.placeholder).toBe("");
    fireEvent.change(box, { target: { value: "vedded" } });
    expect(box.value).toBe("ved");
    fireEvent.change(box, { target: { value: "v e" } });
    expect(box.value).toBe("ve");
  });

  it("删除只影响这个空：空里没字时删除键被拦下，前半个词不在输入框里不能删", () => {
    render(<Harness />);
    const box = screen.getByRole("textbox") as HTMLInputElement;
    expect(box.value).toBe("");
    const ev = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
    box.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    fireEvent.change(box, { target: { value: "v" } });
    const ev2 = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
    box.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
    expect(document.querySelector(".blank-prefix")!.textContent).toBe("car");
  });
});
