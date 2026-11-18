"use client";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface Ghost<T> {
  item: T;
  x: number;
  y: number;
}

/**
 * Drag-and-drop that works three ways: drag with mouse/touch/pen (pointer events, so it works
 * on phones), tap an item then tap a target, or Tab to an item, press Enter, Tab to a target and
 * press Enter. Targets are any elements with the props from targetProps(id).
 */
export function useDragDrop<T extends string>(onDrop: (item: T, target: string) => void) {
  const [selected, setSelected] = useState<T | null>(null);
  const [ghost, setGhost] = useState<Ghost<T> | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const start = useRef<{ item: T; x: number; y: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);

  const targetAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest("[data-drop-target]") as HTMLElement | null)?.dataset.dropTarget ?? null;

  const itemProps = (item: T) => ({
    "aria-pressed": selected === item,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      start.current = { item, x: e.clientX, y: e.clientY, dragging: false };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      if (!s.dragging && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 6) {
        s.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (s.dragging) {
        setGhost({ item, x: e.clientX, y: e.clientY });
        setOver(targetAt(e.clientX, e.clientY));
      }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      if (!s?.dragging) return;
      suppressClick.current = true;
      setGhost(null);
      setOver(null);
      const t = targetAt(e.clientX, e.clientY);
      if (t) {
        setSelected(null);
        onDrop(s.item, t);
      }
    },
    onPointerCancel: () => {
      start.current = null;
      setGhost(null);
      setOver(null);
    },
    onClick: () => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      setSelected((cur) => (cur === item ? null : item));
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    },
    "data-dragging": ghost?.item === item,
  });

  const drop = (target: string) => {
    if (!selected) return false;
    onDrop(selected, target);
    setSelected(null);
    return true;
  };

  const targetProps = (id: string) => ({
    "data-drop-target": id,
    "data-over": over === id,
    onClick: () => drop(id),
    onKeyDown: (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && drop(id)) e.preventDefault();
      if (e.key === "Escape") setSelected(null);
    },
  });

  return { selected, setSelected, ghost, over, itemProps, targetProps };
}
