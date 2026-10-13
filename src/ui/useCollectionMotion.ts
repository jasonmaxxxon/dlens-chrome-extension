import { useLayoutEffect, useRef, useState } from "react";
import type { CollectionBrowserRow } from "../viewmodel/collection-browser";
import { tokens } from "./tokens";

/** The facade owns the clock; date arithmetic stays in the pure projection. */
export function useCollectionClock() {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useLayoutEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), tokens.motion.collection.clockMs);
    return () => clearInterval(timer);
  }, []);
  return nowMs;
}

/** Retain search exits until they fold; FLIP only the surviving row wrappers. */
export function useCollectionMotion(rows: CollectionBrowserRow[]) {
  const listRef = useRef<HTMLUListElement>(null);
  const [rendered, setRendered] = useState(rows);
  const before = useRef(new Map<string, number>());
  const incomingKeys = new Set(rows.map(row => row.post.key));
  const canMove = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches === true;

  useLayoutEffect(() => {
    const snapshot = new Map<string, number>();
    listRef.current?.querySelectorAll<HTMLElement>("[data-collection-row]").forEach(el => snapshot.set(el.dataset.collectionRow!, el.getBoundingClientRect().top - listRef.current!.getBoundingClientRect().top));
    before.current = snapshot;
    if (!canMove()) { setRendered(rows); return; }
    const gone = rendered.filter(row => !rows.some(next => next.post.key === row.post.key));
    if (!gone.length) { setRendered(rows); return; }
    // Keep exiting rows at their former positions while surviving rows reflow.
    const next = [...rows];
    rendered.forEach((row, index) => {
      if (gone.includes(row)) next.splice(Math.min(index, next.length), 0, row);
    });
    setRendered(next);
    const timer = setTimeout(() => {
      const positions = new Map<string, number>();
      listRef.current?.querySelectorAll<HTMLElement>("[data-collection-row]").forEach(el => positions.set(el.dataset.collectionRow!, el.getBoundingClientRect().top - listRef.current!.getBoundingClientRect().top));
      before.current = positions;
      setRendered(rows);
    }, tokens.motion.collection.foldMs);
    const preference = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const settle = () => { if (!preference.matches) { clearTimeout(timer); setRendered(rows); } };
    preference.addEventListener?.("change", settle);
    return () => { clearTimeout(timer); preference.removeEventListener?.("change", settle); };
  }, [rows]);

  useLayoutEffect(() => {
    const root = listRef.current;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (canMove()) listRef.current?.querySelectorAll<HTMLElement>("[data-collection-row]").forEach(el => {
      const was = before.current.get(el.dataset.collectionRow!);
      const delta = was === undefined ? 0 : was - (el.getBoundingClientRect().top - listRef.current!.getBoundingClientRect().top);
      if (!delta || !incomingKeys.has(el.dataset.collectionRow!)) return;
      el.style.setProperty("--collection-delta", `${delta}px`);
      el.dataset.collectionGlide = "true";
      timers.push(setTimeout(() => { delete el.dataset.collectionGlide; el.style.removeProperty("--collection-delta"); }, tokens.motion.collection.glideMs));
    });
    return () => {
      timers.forEach(clearTimeout);
      root?.querySelectorAll<HTMLElement>("[data-collection-glide]").forEach(el => { delete el.dataset.collectionGlide; el.style.removeProperty("--collection-delta"); });
    };
  }, [rendered]);
  return { listRef, rows: rendered.map(row => ({ ...row, exiting: !incomingKeys.has(row.post.key) })) };
}
