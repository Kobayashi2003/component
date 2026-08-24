import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import "./styles.css";

export interface CursorSpotlightProps {
  children: ReactNode;
  className?: string;
  color?: string;
  radius?: number;
  intensity?: number;
  softness?: number;
  smoothing?: number;
  shadowDistance?: number;
}

type SpotlightStyle = CSSProperties & Record<`--spotlight-${string}`, string>;

export function CursorSpotlight({
  children,
  className = "",
  color = "#d8efff",
  radius = 300,
  intensity = 32,
  softness = 68,
  smoothing = 0.16,
  shadowDistance = 52,
}: CursorSpotlightProps) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const current = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const follow = Math.max(0.01, Math.min(1, smoothing));
  const safeRadius = Math.max(0, radius);
  const safeIntensity = Math.max(0, Math.min(100, intensity));
  const safeSoftness = Math.max(0, Math.min(100, softness));

  // Interpolate in local coordinates so the effect remains reusable in any
  // positioned container, including catalog previews and nested panels.
  function paint() {
    current.current.x += (target.current.x - current.current.x) * follow;
    current.current.y += (target.current.y - current.current.y) * follow;
    root.current?.style.setProperty("--spotlight-x", `${current.current.x}px`);
    root.current?.style.setProperty("--spotlight-y", `${current.current.y}px`);

    const bounds = root.current?.getBoundingClientRect();
    if (bounds) {
      const nx = Math.max(
        -1,
        Math.min(1, (current.current.x / bounds.width - 0.5) * 2),
      );
      const ny = Math.max(
        -1,
        Math.min(1, (current.current.y / bounds.height - 0.5) * 2),
      );
      root.current?.style.setProperty("--spotlight-nx", String(nx));
      root.current?.style.setProperty("--spotlight-ny", String(ny));
      root.current?.style.setProperty(
        "--spotlight-shadow-x",
        `${-nx * shadowDistance}px`,
      );
      root.current?.style.setProperty(
        "--spotlight-shadow-y",
        `${-ny * shadowDistance + 12}px`,
      );
      root.current?.style.setProperty(
        "--spotlight-shadow-blur",
        `${Math.max(26, safeRadius * 0.2)}px`,
      );
    }

    const distanceX = Math.abs(target.current.x - current.current.x);
    const distanceY = Math.abs(target.current.y - current.current.y);
    if (distanceX > 0.2 || distanceY > 0.2) {
      frame.current = requestAnimationFrame(paint);
    } else {
      frame.current = null;
    }
  }

  function move(event: PointerEvent<HTMLDivElement>, immediate = false) {
    const bounds = event.currentTarget.getBoundingClientRect();
    target.current = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    if (immediate) current.current = target.current;
    if (frame.current === null) frame.current = requestAnimationFrame(paint);

    // Some preview shells mount beneath an already-positioned cursor and do
    // not dispatch pointerenter. The first real movement must therefore be
    // sufficient to activate the light on its own.
    if (event.pointerType !== "touch") setActive(true);
  }

  // A route can mount while the mouse is already stationary over the preview.
  // Initialize the light at the center and honor the browser's current hover
  // state instead of waiting indefinitely for pointerenter.
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;

    const bounds = node.getBoundingClientRect();
    const center = { x: bounds.width / 2, y: bounds.height / 2 };
    current.current = center;
    target.current = center;
    node.style.setProperty("--spotlight-x", `${center.x}px`);
    node.style.setProperty("--spotlight-y", `${center.y}px`);

    const supportsHover = window.matchMedia("(hover: hover)").matches;
    if (supportsHover && node.matches(":hover")) setActive(true);
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const style = {
    "--spotlight-color": color,
    "--spotlight-radius": `${safeRadius}px`,
    "--spotlight-strength": `${safeIntensity}%`,
    "--spotlight-softness": `${safeSoftness}%`,
    "--spotlight-shadow-x": "0px",
    "--spotlight-shadow-y": "34px",
    "--spotlight-shadow-blur": `${Math.max(26, safeRadius * 0.2)}px`,
  } as SpotlightStyle;

  return (
    <div
      ref={root}
      className={["cursor-spotlight", active && "is-active", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      onPointerEnter={(event) => {
        move(event, true);
        setActive(event.pointerType !== "touch");
      }}
      onPointerMove={move}
      onPointerLeave={() => setActive(false)}
    >
      {children}
      <div className="cursor-spotlight__diffuse" aria-hidden="true" />
      <div className="cursor-spotlight__core" aria-hidden="true" />
    </div>
  );
}
