"use client";

import { Children, Fragment, cloneElement, isValidElement, useLayoutEffect, useRef, useState, type ReactNode, type ReactElement, type ComponentProps } from "react";
import { compareTableValues, tableValue, type SortValue } from "@/lib/table-sort";

type ElementProps = { children?: ReactNode; colSpan?: number; [key: string]: unknown };
function tag(node: ReactElement): string {
  return typeof node.type === "string" ? node.type : (node.type as { displayName?: string }).displayName || "";
}
function mapTree(nodes: ReactNode, visit: (node: ReactElement<ElementProps>) => ReactNode): ReactNode {
  return Children.map(nodes, child => isValidElement<ElementProps>(child) ? visit(child) : child);
}

/** Sort React row groups, keeping expanded rows and their event handlers intact. */
export function SortableTable({ children, ...props }: ComponentProps<"table">) {
  const ref = useRef<HTMLTableElement>(null);
  const [column, setColumn] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [snapshot, setSnapshot] = useState<{ headers: string[]; values: Record<string, SortValue[]> }>({ headers: [], values: {} });
  let bodyIndex = 0;
  function transform(nodes: ReactNode): ReactNode {
    return mapTree(nodes, node => {
      if (["tbody", "TableBody"].includes(tag(node))) {
        const body = bodyIndex++;
        const groups = Children.toArray(node.props.children).map((child, index) => ({ child, id: `${body}:${index}` }));
        if (column !== "") groups.sort((a, b) => compareTableValues(snapshot.values[a.id]?.[Number(column)] ?? null, snapshot.values[b.id]?.[Number(column)] ?? null, direction));
        function mark(nodes: ReactNode, id: string): ReactNode {
          return mapTree(nodes, child => ["tr", "TableRow"].includes(tag(child))
            ? cloneElement(child, { "data-sort-group": id })
            : child.type === Fragment ? cloneElement(child, {}, mark(child.props.children, id)) : child);
        }
        // Colspan summary/detail rows remain with their original group. Standalone
        // summary rows have no sort values and stay at the bottom in either direction.
        return cloneElement(node, {}, groups.map(group => <Fragment key={group.id}>{mark(group.child, group.id)}</Fragment>));
      }
      return node.props.children ? cloneElement(node, {}, transform(node.props.children)) : node;
    });
  }
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const headers = Array.from(table.tHead?.rows[0]?.cells || []).map(cell => cell.textContent?.trim() || "");
    const values: Record<string, SortValue[]> = {};
    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) {
        const id = row.dataset.sortGroup;
        if (!id || values[id] || Array.from(row.cells).some(cell => cell.colSpan > 1)) continue;
        values[id] = Array.from(row.cells).map((cell, index) => tableValue(cell.dataset.sortValue ?? cell.textContent ?? "", headers[index] || ""));
      }
    }
    const next = { headers, values };
    setSnapshot(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, [children, column, direction]);
  const options = snapshot.headers.map((label, index) => ({ label, index })).filter(({ label }) => label && !/^(actions?|select|edit|delete)$/i.test(label));
  return <>
    {options.length > 0 && <div className="flex items-center justify-end gap-2 px-3 py-2 text-xs text-[#52525b]">
      <label className="flex items-center gap-2">Sort by
        <select aria-label="Sort by column" className="rounded border border-[#e4e4e7] bg-white px-2 py-1" value={column} onChange={event => setColumn(event.target.value)}>
          <option value="">Default order</option>
          {options.map(({ label, index }) => <option key={index} value={index}>{label}</option>)}
        </select>
      </label>
      {column !== "" && <button type="button" className="rounded border border-[#e4e4e7] px-2 py-1" onClick={() => setDirection(value => value === "asc" ? "desc" : "asc")}>{direction === "asc" ? "↑ Ascending" : "↓ Descending"}</button>}
    </div>}
    <table {...props} ref={ref}>{transform(children)}</table>
  </>;
}
