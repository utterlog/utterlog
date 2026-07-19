/**
 * Stack integration check — exercises every library in the new admin UI kit so
 * `tsc` verifies the APIs compile together. Not a real screen; safe to delete
 * once the migration has real usages of each.
 */
import { useState } from 'react';
import { Dialog } from '@base-ui-components/react/dialog';
import { Save, Trash2 } from 'lucide-react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useForm } from '@tanstack/react-form';
import { Button } from './button';

type Row = { id: number; title: string };
const col = createColumnHelper<Row>();

export function KitCheck() {
  const [open, setOpen] = useState(false);

  // TanStack Table
  const table = useReactTable({
    data: [{ id: 1, title: 'hello' }] as Row[],
    columns: [
      col.accessor('id', { header: 'ID' }),
      col.accessor('title', { header: 'Title' }),
    ],
    getCoreRowModel: getCoreRowModel(),
  });

  // TanStack Form
  const form = useForm({
    defaultValues: { name: '' },
    onSubmit: ({ value }) => console.log(value),
  });

  return (
    <div className="p-4 text-foreground bg-background">
      {/* shadcn Button + Lucide */}
      <Button variant="default" size="sm">
        <Save /> 保存
      </Button>
      <Button variant="destructive" size="sm">
        <Trash2 /> 删除
      </Button>

      {/* Base UI Dialog */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger render={<Button variant="outline">打开</Button>} />
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-black/40" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 text-card-foreground">
            <Dialog.Title className="text-lg font-semibold">标题</Dialog.Title>
            <Dialog.Close render={<Button variant="ghost">关闭</Button>} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* TanStack Table */}
      <table className="mt-4 w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="border-b border-border px-2 text-left">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id}>
              {r.getVisibleCells().map((c) => (
                <td key={c.id} className="px-2">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* TanStack Form */}
      <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }}>
        <form.Field name="name">
          {(field) => (
            <input
              className="mt-2 border border-input rounded-md px-2 py-1"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          )}
        </form.Field>
      </form>
    </div>
  );
}
