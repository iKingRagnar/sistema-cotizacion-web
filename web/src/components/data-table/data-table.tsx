"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  className?: string;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 15,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const tableData = useMemo(() => data, [data]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-xl border border-border/50 bg-card/35 backdrop-blur-md overflow-hidden shadow-sm ring-1 ring-white/[0.04] dark:ring-white/[0.06]">
        <Table>
          <TableHeader className="sticky top-0 z-[1] bg-card/90 backdrop-blur-md shadow-sm">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent border-border/50">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row, idx) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "group border-border/30 transition-all duration-200",
                    idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.12]",
                    "hover:bg-teal-500/[0.06] hover:shadow-[inset_0_0_0_1px_rgba(45,212,191,0.12)] dark:hover:bg-teal-500/[0.08]"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Sin datos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground mr-auto">
          {table.getFilteredRowModel().rows.length} registros
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
