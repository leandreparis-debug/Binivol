"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  /** Renders the cell. Defaults to `String(row[key])`. */
  cell?: (row: Row) => React.ReactNode;
  /** Monospace cell (NIVOL, dates). */
  mono?: boolean;
  align?: "left" | "right";
  /** Hide this column in the mobile card layout. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<Row extends Record<string, unknown>> extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Returns the stable key of a row. */
  rowKey: (row: Row) => string;
  /** Accessible caption. */
  caption: string;
  /** Adds a selection checkbox on each row. */
  selectable?: boolean;
  /** Controlled selection. */
  selectedKeys?: string[];
  onSelectedKeysChange?: (keys: string[]) => void;
  /** Column used as the card title under 640 px. Defaults to the first column. */
  primaryKey?: string;
  /** Message shown when `rows` is empty. */
  emptyMessage?: string;
}

function defaultCell(row: Record<string, unknown>, key: string): React.ReactNode {
  const value = row[key];
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (value instanceof Date) return value.toISOString();
  return "—";
}

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  label: string;
}

/** Accessible custom checkbox: a real input, visually replaced. */
function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <label className="inline-flex size-11 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
      <span
        aria-hidden="true"
        className="inline-flex size-5 items-center justify-center rounded-[6px] border border-line bg-surface text-white transition-colors peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </label>
  );
}

/**
 * Presentational data table (no sorting logic). Veil header, hairline rows,
 * selected rows on veil, mono cells for NIVOL and dates, and a card list
 * layout under 640 px.
 */
export function DataTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  caption,
  selectable = false,
  selectedKeys,
  onSelectedKeysChange,
  primaryKey,
  emptyMessage = "Aucune ligne",
  className,
  ...rest
}: DataTableProps<Row>) {
  const [internal, setInternal] = useState<string[]>([]);
  const selected = selectedKeys ?? internal;
  const captionId = useId();

  const setSelected = (keys: string[]) => {
    if (selectedKeys === undefined) setInternal(keys);
    onSelectedKeysChange?.(keys);
  };
  const toggle = (key: string) => {
    setSelected(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };
  const allKeys = rows.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.includes(k));
  const toggleAll = () => {
    setSelected(allSelected ? [] : allKeys);
  };

  const primary = columns.find((c) => c.key === primaryKey) ?? columns[0];
  const render = (row: Row, col: DataTableColumn<Row>) =>
    col.cell?.(row) ?? defaultCell(row, col.key);

  return (
    <div className={cn("w-full", className)} {...rest}>
      {/* Table, from 640 px */}
      <div className="hidden overflow-x-auto rounded-inner border border-line sm:block">
        <table className="w-full border-collapse text-body" aria-labelledby={captionId}>
          <caption id={captionId} className="sr-only">
            {caption}
          </caption>
          <thead className="bg-veil text-small text-muted">
            <tr>
              {selectable && (
                <th scope="col" className="w-11 px-1 py-1 text-left">
                  <Checkbox checked={allSelected} onChange={toggleAll} label="Tout sélectionner" />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3 font-medium",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-6 text-center text-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const key = rowKey(row);
              const isSelected = selected.includes(key);
              return (
                <tr
                  key={key}
                  aria-selected={selectable ? isSelected : undefined}
                  className={cn("border-t border-line", isSelected && "bg-veil")}
                >
                  {selectable && (
                    <td className="px-1 py-1">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => {
                          toggle(key);
                        }}
                        label={`Sélectionner ${key}`}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3",
                        col.mono && "font-mono text-mono",
                        col.align === "right" ? "text-right tabular-nums" : "text-left",
                      )}
                    >
                      {render(row, col)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Card list, under 640 px */}
      <ul className="flex flex-col gap-3 sm:hidden" aria-label={caption}>
        {rows.length === 0 && (
          <li className="rounded-inner bg-veil p-4 text-center text-muted">{emptyMessage}</li>
        )}
        {rows.map((row) => {
          const key = rowKey(row);
          const isSelected = selected.includes(key);
          return (
            <li
              key={key}
              className={cn(
                "rounded-inner border border-line p-4",
                isSelected ? "bg-veil" : "bg-surface",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                {primary && (
                  <p className="text-body font-semibold text-ink">{render(row, primary)}</p>
                )}
                {selectable && (
                  <Checkbox
                    checked={isSelected}
                    onChange={() => {
                      toggle(key);
                    }}
                    label={`Sélectionner ${key}`}
                  />
                )}
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
                {columns
                  .filter((col) => col !== primary && !col.hideOnMobile)
                  .map((col) => (
                    <div key={col.key} className="contents">
                      <dt className="text-muted">{col.header}</dt>
                      <dd className={cn("text-ink", col.mono && "font-mono text-mono")}>
                        {render(row, col)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
