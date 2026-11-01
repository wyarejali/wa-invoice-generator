import { useEffect, useMemo, useState } from 'react';
import { STATUSES, computeTotals, formatDay, money, sumTotals } from '../lib/invoice';
import { MOD } from '../lib/shortcuts';
import { useInvoices } from '../context/InvoicesContext';
import { useConfirm } from './ui/ConfirmProvider';
import { useToast } from './ui/ToastProvider';
import { StatusText } from './StatusBadge';
import Icon from './ui/Icon';

export default function Sidebar({ activeId, onSelect, onNew, onClose, query, onQueryChange, filter, onFilterChange }) {
    const { invoices, deleteInvoices, duplicateInvoice, undo } = useInvoices();
    const confirm = useConfirm();
    const toast = useToast();

    const [selected, setSelected] = useState(() => new Set());

    const counts = useMemo(() => {
        const out = { all: invoices.length };
        for (const s of STATUSES) out[s] = 0;
        for (const inv of invoices) out[inv.status] = (out[inv.status] ?? 0) + 1;
        return out;
    }, [invoices]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return invoices.filter(
            (i) => (filter === 'all' || i.status === filter) && (!q || i.number.toLowerCase().includes(q)),
        );
    }, [invoices, query, filter]);

    // Outstanding is everything not yet paid — the number worth watching.
    const outstanding = useMemo(() => sumTotals(invoices.filter((i) => i.status !== 'paid')), [invoices]);

    // Drop selections for rows that have gone away (deleted, filtered, undone).
    useEffect(() => {
        setSelected((prev) => {
            if (!prev.size) return prev;
            const live = new Set(invoices.map((i) => i.id));
            const next = new Set([...prev].filter((id) => live.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [invoices]);

    const allVisibleSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));

    const toggleOne = (id) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const toggleAll = () =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) filtered.forEach((i) => next.delete(i.id));
            else filtered.forEach((i) => next.add(i.id));
            return next;
        });

    const removeInvoices = async (ids, label) => {
        const ok = await confirm({
            title: ids.length === 1 ? `Delete ${label}?` : `Delete ${ids.length} invoices?`,
            body:
                ids.length === 1
                    ? 'It will be removed from this device and your account.'
                    : 'They will be removed from this device and your account.',
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!ok) return;
        deleteInvoices(ids);
        setSelected(new Set());
        toast({
            title: ids.length === 1 ? `${label} deleted` : `${ids.length} invoices deleted`,
            action: { label: 'Undo', onClick: undo },
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-surface">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-3">
                <h1 className="flex-1 text-[13px] font-semibold tracking-tight">Invoices</h1>
                <button type="button" className="ui-btn ui-btn-primary" onClick={onNew} title={`New invoice (${MOD}N)`}>
                    <Icon name="plus" size={14} />
                    New
                </button>
                <button
                    type="button"
                    className="ui-icon-btn lg:hidden"
                    aria-label="Close invoice list"
                    onClick={onClose}>
                    <Icon name="close" size={16} />
                </button>
            </div>

            {/* Search */}
            <div className="px-3 pb-2.5">
                <div className="relative">
                    <Icon
                        name="search"
                        size={14}
                        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle"
                    />
                    <input
                        type="search"
                        className="ui-input pl-8"
                        placeholder="Search by number…"
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        aria-label="Search invoices by number"
                    />
                </div>
            </div>

            {/* Status filters */}
            <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
                {['all', ...STATUSES].map((key) => (
                    <button
                        key={key}
                        type="button"
                        className="ui-chip"
                        data-on={filter === key}
                        onClick={() => onFilterChange(key)}>
                        <span className="capitalize">{key}</span>
                        {counts[key] > 0 && <span className="tabular-nums opacity-60">{counts[key]}</span>}
                    </button>
                ))}
            </div>

            {/* Meta / selection bar */}
            <div className="flex min-h-[38px] items-center gap-2 border-y border-line px-3 py-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-fg-muted">
                    <input
                        type="checkbox"
                        className="accent-accent"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                        disabled={!filtered.length}
                        aria-label="Select all visible invoices"
                    />
                    {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                </label>

                <div className="ml-auto flex items-center gap-2">
                    {selected.size > 0 ? (
                        <>
                            <button
                                type="button"
                                className="text-[12px] font-medium text-fg-muted hover:text-fg"
                                onClick={() => setSelected(new Set())}>
                                Clear
                            </button>
                            <button
                                type="button"
                                className="flex items-center gap-1 text-[12px] font-medium text-danger hover:underline"
                                onClick={() => removeInvoices([...selected])}>
                                <Icon name="trash" size={13} />
                                Delete
                            </button>
                        </>
                    ) : (
                        <span className="text-[12px] text-fg-subtle tabular-nums" title="Unpaid, sent and draft totals">
                            {money(outstanding)} open
                        </span>
                    )}
                </div>
            </div>

            {/* List */}
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
                {filtered.length === 0 && (
                    <div className="px-2 py-8 text-center">
                        <p className="text-[13px] text-fg-muted">
                            {invoices.length ? 'Nothing matches those filters.' : 'No invoices yet.'}
                        </p>
                        {!invoices.length && (
                            <button type="button" className="ui-btn mt-3" onClick={onNew}>
                                <Icon name="plus" size={14} />
                                Create the first one
                            </button>
                        )}
                    </div>
                )}

                {filtered.map((inv) => {
                    const isActive = inv.id === activeId;
                    const isSelected = selected.has(inv.id);
                    return (
                        <div
                            key={inv.id}
                            className={`group relative mb-0.5 rounded-lg px-2.5 py-2 transition-colors ${
                                isActive ? 'bg-accent-soft' : 'hover:bg-raised'
                            }`}>
                            {/* The active marker is a bar rather than a border: a border on a
                                rounded row has to follow the corner and reads as a box. */}
                            {isActive && (
                                <span
                                    aria-hidden
                                    className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent"
                                />
                            )}

                            <div className="flex items-start gap-2.5">
                                {/* Hover-to-reveal keeps the list calm on a desktop; a touch
                                    device has no hover, so below `lg` they are always shown.
                                    The column is reserved either way, so nothing shifts. */}
                                <input
                                    type="checkbox"
                                    className={`mt-0.5 accent-accent transition-opacity ${
                                        isSelected || selected.size > 0
                                            ? 'opacity-100'
                                            : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100'
                                    }`}
                                    checked={isSelected}
                                    onChange={() => toggleOne(inv.id)}
                                    aria-label={`Select invoice ${inv.number}`}
                                />
                                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(inv.id)}>
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="flex min-w-0 items-baseline gap-2">
                                            <span
                                                className={`truncate font-mono text-[13px] font-medium ${
                                                    isActive ? 'text-accent' : ''
                                                }`}>
                                                {inv.number}
                                            </span>
                                            <StatusText status={inv.status} size={12} className="shrink-0 text-[11px]" />
                                        </span>
                                        <span className="shrink-0 font-mono text-[12.5px] tabular-nums">
                                            {money(computeTotals(inv).total)}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11.5px] text-fg-subtle tabular-nums">
                                        {formatDay(inv.date)}
                                    </div>
                                </button>
                            </div>

                            {/* Pinned to the meta line rather than the first one: covering a
                                date on hover costs nothing, covering the total does. */}
                            <div className="absolute right-1.5 bottom-1.5 hidden gap-0.5 rounded-md border border-line bg-surface p-0.5 group-hover:flex group-focus-within:flex">
                                <button
                                    type="button"
                                    className="ui-icon-btn h-6 w-6"
                                    title="Duplicate"
                                    aria-label={`Duplicate invoice ${inv.number}`}
                                    onClick={() => {
                                        const copy = duplicateInvoice(inv.id);
                                        if (copy) {
                                            onSelect(copy.id);
                                            toast({ title: `Duplicated as ${copy.number}` });
                                        }
                                    }}>
                                    <Icon name="copy" size={13} />
                                </button>
                                <button
                                    type="button"
                                    className="ui-icon-btn h-6 w-6 hover:text-danger"
                                    title="Delete"
                                    aria-label={`Delete invoice ${inv.number}`}
                                    onClick={() => removeInvoices([inv.id], inv.number)}>
                                    <Icon name="trash" size={13} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
