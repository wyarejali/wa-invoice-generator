import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useNavigate, useParams } from 'react-router-dom';
import { InvoicesProvider, useInvoices } from './context/InvoicesContext';
import { ConfirmProvider, useConfirm } from './components/ui/ConfirmProvider';
import { ToastProvider, useToast } from './components/ui/ToastProvider';
import { nextStatus, statusPatch } from './lib/invoice';
import { downloadJSON, readJSONFile } from './lib/storage';
import { MOD, isTypingTarget } from './lib/shortcuts';
import { useAppearance } from './lib/theme';
import CommandPalette from './components/CommandPalette';
import Dashboard from './components/Dashboard';
import Header from './components/Header';
import Icon from './components/ui/Icon';
import InvoiceEditor from './components/InvoiceEditor';
import LandingPage from './components/LandingPage';
import PropertiesPanel from './components/PropertiesPanel';
import ShortcutsDialog from './components/ShortcutsDialog';
import Sidebar from './components/Sidebar';

/** Breakpoint as state, so only one copy of each panel is ever mounted. */
function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = (e) => setMatches(e.matches);
        setMatches(mql.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);
    return matches;
}

/**
 * One shell for both views. The dashboard and the editor share the header, the
 * invoice rail, the drawers, the command palette and every shortcut — so they
 * are one component with two middles rather than two near-copies.
 */
function Shell({ view }) {
    const isDashboard = view === 'dashboard';
    const {
        invoices,
        addInvoice,
        duplicateInvoice,
        deleteInvoices,
        importInvoices,
        updateInvoice,
        undo,
        redo,
        canUndo,
        canRedo,
    } = useInvoices();
    const confirm = useConfirm();
    const toast = useToast();
    const appearance = useAppearance();

    const isDesktop = useMediaQuery('(min-width: 1024px)');
    // Three columns only pay off once there is room for the document between
    // them; on a narrower desktop the panel starts closed but still opens inline.
    const isWide = useMediaQuery('(min-width: 1280px)');
    const [railOpen, setRailOpen] = useState(true);
    const [panelOpen, setPanelOpen] = useState(true);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    // Owned here, not in Sidebar, so the list survives the drawer closing.
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');

    const navigate = useNavigate();
    const { id } = useParams();
    const fileRef = useRef(null);
    const editorApi = useRef({});

    const active = invoices.find((i) => i.id === id) || null;

    // Drawers start closed on a phone; the rail and panel start open on a desktop.
    useEffect(() => {
        setRailOpen(isDesktop);
        setPanelOpen(isWide);
    }, [isDesktop, isWide]);

    /* ------------------------------------------------------------------ *
     * Actions
     * ------------------------------------------------------------------ */
    const closeDrawers = useCallback(() => {
        if (!isDesktop) {
            setRailOpen(false);
            setPanelOpen(false);
        }
    }, [isDesktop]);

    const handleNew = useCallback(() => {
        const invoice = addInvoice();
        navigate(`/i/${invoice.id}`);
        closeDrawers();
    }, [addInvoice, navigate, closeDrawers]);

    const handleDuplicate = useCallback(() => {
        if (!active) return;
        const copy = duplicateInvoice(active.id);
        if (!copy) return;
        navigate(`/i/${copy.id}`);
        toast({ title: `Duplicated as ${copy.number}` });
    }, [active, duplicateInvoice, navigate, toast]);

    const handleDelete = useCallback(async () => {
        if (!active) return;
        const ok = await confirm({
            title: `Delete ${active.number}?`,
            body: 'It will be removed from this device and your account.',
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!ok) return;
        deleteInvoices([active.id]);
        toast({ title: `${active.number} deleted`, action: { label: 'Undo', onClick: undo } });
    }, [active, confirm, deleteInvoices, toast, undo]);

    const handleExport = useCallback(
        async (format) => {
            setExporting(true);
            try {
                const name = await editorApi.current.exportCard?.(format);
                if (name) toast({ title: `Exported ${name}` });
            } catch (err) {
                toast({ title: 'Export failed', description: err.message, tone: 'error' });
            } finally {
                setExporting(false);
            }
        },
        [toast],
    );

    const handleImportFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const list = await readJSONFile(file);
            const { added, updated } = importInvoices(list);
            toast({
                title: 'Import complete',
                description: `${added} added · ${updated} updated`,
                action: { label: 'Undo', onClick: undo },
            });
        } catch (err) {
            toast({ title: 'Import failed', description: err.message, tone: 'error' });
        }
    };

    const openInvoice = useCallback(
        (nextId) => {
            navigate(`/i/${nextId}`);
            closeDrawers();
        },
        [navigate, closeDrawers],
    );

    const patchActive = useCallback(
        (patch, options) => active && updateInvoice(active.id, patch, options),
        [active, updateInvoice],
    );

    /* ------------------------------------------------------------------ *
     * If the open invoice disappears — deleted, or an undone creation —
     * fall through to the newest one rather than an empty panel.
     * ------------------------------------------------------------------ */
    useEffect(() => {
        if (!id || !invoices.length) return;
        if (!invoices.some((i) => i.id === id)) {
            navigate(`/i/${invoices[0].id}`, { replace: true });
        }
    }, [id, invoices, navigate]);

    /* ------------------------------------------------------------------ *
     * Global shortcuts
     * ------------------------------------------------------------------ */
    useEffect(() => {
        const onKey = (e) => {
            const mod = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();

            if (mod && key === 'k') {
                e.preventDefault();
                setPaletteOpen((v) => !v);
                return;
            }
            // Anything below acts on the invoice behind an open dialog, so let the
            // dialog keep the keyboard to itself.
            if (document.querySelector('[role="dialog"]')) return;

            // ⌘⇧N is the browser's own private window, so only plain ⌘N is ours.
            if (mod && key === 'n' && !e.shiftKey) {
                e.preventDefault();
                handleNew();
            } else if (mod && key === 'd' && !e.shiftKey) {
                e.preventDefault();
                handleDuplicate();
            } else if (mod && key === 'z') {
                // App-level undo everywhere, including inside fields: the history is
                // per-invoice content, which is what the user means by "undo" here.
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (key === '?' && !mod && !isTypingTarget(e.target)) {
                e.preventDefault();
                setShortcutsOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleNew, handleDuplicate, undo, redo]);

    useEffect(() => {
        if (isDesktop || (!railOpen && !panelOpen)) return;
        const onKey = (e) => e.key === 'Escape' && closeDrawers();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isDesktop, railOpen, panelOpen, closeDrawers]);

    /* ------------------------------------------------------------------ *
     * Command palette entries
     * ------------------------------------------------------------------ */
    const commands = useMemo(
        () => [
            { id: 'new', label: 'New invoice', icon: 'plus', hint: [MOD, 'N'], run: handleNew },
            {
                id: 'duplicate',
                label: 'Duplicate invoice',
                icon: 'copy',
                hint: [MOD, 'D'],
                disabled: !active,
                run: handleDuplicate,
            },
            {
                id: 'status',
                label: active ? `Mark as ${nextStatus(active.status)}` : 'Advance status',
                icon: 'check',
                disabled: !active,
                run: () => patchActive(statusPatch(active, nextStatus(active.status))),
            },
            {
                id: 'layout',
                label: active?.template === 'business' ? 'Use the minimal layout' : 'Use the business layout',
                icon: 'fileText',
                disabled: !active,
                run: () => patchActive({ template: active.template === 'business' ? 'minimal' : 'business' }),
            },
            {
                id: 'png',
                label: 'Export as PNG',
                icon: 'image',
                disabled: !active,
                run: () => handleExport('png'),
            },
            {
                id: 'pdf',
                label: 'Export as PDF',
                icon: 'file',
                disabled: !active,
                run: () => handleExport('pdf'),
            },
            {
                id: 'json-out',
                label: 'Export all as JSON',
                icon: 'download',
                disabled: !invoices.length,
                run: () => downloadJSON(invoices, 'invoices.json'),
            },
            {
                id: 'json-in',
                label: 'Import from JSON',
                icon: 'upload',
                run: () => fileRef.current?.click(),
            },
            { id: 'undo', label: 'Undo', icon: 'undo', hint: [MOD, 'Z'], disabled: !canUndo, run: undo },
            { id: 'redo', label: 'Redo', icon: 'redo', disabled: !canRedo, run: redo },
            {
                id: 'theme',
                label: appearance.resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
                icon: appearance.resolved === 'dark' ? 'sun' : 'moon',
                run: appearance.toggleTheme,
            },
            {
                id: 'panel',
                label: panelOpen ? 'Hide invoice settings' : 'Show invoice settings',
                icon: 'panel',
                run: () => setPanelOpen((v) => !v),
            },
            {
                id: 'dashboard',
                label: isDashboard ? 'Back to the invoice' : 'Open the dashboard',
                icon: isDashboard ? 'receipt' : 'dashboard',
                disabled: isDashboard && !active,
                run: () => navigate(isDashboard ? `/i/${active.id}` : '/dashboard'),
            },
            {
                id: 'shortcuts',
                label: 'Keyboard shortcuts',
                icon: 'keyboard',
                hint: ['?'],
                run: () => setShortcutsOpen(true),
            },
            {
                id: 'delete',
                label: 'Delete invoice',
                icon: 'trash',
                disabled: !active,
                run: handleDelete,
            },
        ],
        [
            active,
            invoices,
            isDashboard,
            navigate,
            canUndo,
            canRedo,
            panelOpen,
            appearance.resolved,
            appearance.toggleTheme,
            handleNew,
            handleDuplicate,
            handleDelete,
            handleExport,
            patchActive,
            undo,
            redo,
        ],
    );

    const sidebar = (
        <Sidebar
            activeId={id}
            onSelect={openInvoice}
            onNew={handleNew}
            onClose={() => setRailOpen(false)}
            query={query}
            onQueryChange={setQuery}
            filter={filter}
            onFilterChange={setFilter}
        />
    );

    const panel =
        !isDashboard && active ? (
            <PropertiesPanel
                invoice={active}
                onChange={patchActive}
                onExport={handleExport}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                exporting={exporting}
                appearance={appearance}
                onClose={isDesktop ? null : () => setPanelOpen(false)}
            />
        ) : null;

    return (
        <div className="flex h-dvh flex-col">
            <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportFile}
            />

            <Header
                isDashboard={isDashboard}
                isDesktop={isDesktop}
                railOpen={railOpen}
                onToggleRail={() => setRailOpen((v) => !v)}
                panelOpen={panelOpen}
                onTogglePanel={() => setPanelOpen((v) => !v)}
                onPalette={() => setPaletteOpen(true)}
                onImport={() => fileRef.current?.click()}
                onExport={() => downloadJSON(invoices, 'invoices.json')}
                onShortcuts={() => setShortcutsOpen(true)}
            />

            <div className="flex min-h-0 flex-1">
                {isDesktop && railOpen && <aside className="w-[290px] shrink-0 border-r border-line">{sidebar}</aside>}

                <main className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-bg">
                    {isDashboard ? (
                        <Dashboard onOpenInvoice={openInvoice} onNew={handleNew} />
                    ) : active ? (
                        <InvoiceEditor key={active.id} invoice={active} onChange={patchActive} api={editorApi} />
                    ) : (
                        <div className="flex h-full items-center justify-center p-8 text-center">
                            <div>
                                <Icon name="receipt" size={30} className="mx-auto text-fg-subtle" />
                                <p className="mt-3 text-[14px] font-medium">
                                    {invoices.length ? 'Select an invoice' : 'No invoices yet'}
                                </p>
                                <p className="mt-1 text-[13px] text-fg-muted">
                                    Press <kbd className="ui-kbd">{MOD}</kbd> <kbd className="ui-kbd">N</kbd> to create
                                    one.
                                </p>
                                <button type="button" className="ui-btn ui-btn-primary mt-4" onClick={handleNew}>
                                    <Icon name="plus" size={14} />
                                    New invoice
                                </button>
                            </div>
                        </div>
                    )}
                </main>

                {isDesktop && panelOpen && panel && (
                    <aside className="w-[270px] shrink-0 border-l border-line">{panel}</aside>
                )}
            </div>

            {/* Mobile drawers */}
            {!isDesktop && (railOpen || panelOpen) && (
                <div className="fixed inset-0 z-40">
                    <button type="button" aria-label="Close panel" className="ui-overlay" onClick={closeDrawers} />
                    {railOpen && (
                        <div className="absolute inset-y-0 left-0 w-[88%] max-w-[330px] border-r border-line bg-surface">
                            {sidebar}
                        </div>
                    )}
                    {panelOpen && panel && (
                        <div className="absolute inset-y-0 right-0 w-[84%] max-w-[300px] border-l border-line bg-surface">
                            {panel}
                        </div>
                    )}
                </div>
            )}

            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                commands={commands}
                invoices={invoices}
                onOpenInvoice={openInvoice}
            />
            <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </div>
    );
}

/**
 * `/app` is the way in from the landing page.
 *
 * Signed in, that is the dashboard — the question someone with an account
 * arrives with is "where do I stand?", not "let me edit this invoice". A guest
 * has no account to have a standing in, so they land in the editor, with a
 * first invoice created if the archive is empty.
 *
 * Nothing is seeded before `authReady`: a signed-in user's cloud rows have not
 * arrived yet at that point, and seeding would mint a blank invoice over them.
 */
function EnterApp() {
    const { invoices, addInvoice, user, authReady } = useInvoices();
    const [createdId, setCreatedId] = useState(null);
    // A ref, not state: StrictMode runs this effect twice with the same state,
    // and a state guard would let the second pass create a duplicate invoice.
    const seededRef = useRef(false);

    useEffect(() => {
        if (!authReady || user || invoices.length || seededRef.current) return;
        // The OAuth redirect lands here with the session still in the URL hash. If
        // `authReady` wins that race by a tick we would seed a blank invoice for
        // someone who is in fact signing in, and then sync it to their account.
        if (window.location.hash.includes('access_token')) return;
        seededRef.current = true;
        setCreatedId(addInvoice().id);
    }, [authReady, user, invoices.length, addInvoice]);

    if (!authReady) return null;
    if (user) return <Navigate to="/dashboard" replace />;

    const target = invoices[0]?.id || createdId;
    if (!target) return null;
    return <Navigate to={`/i/${target}`} replace />;
}

/**
 * The marketing page is for people who do not have an account yet; anyone
 * signed in gets their dashboard instead. Gated on `authReady`, or a returning
 * user sees the pitch flash past before being moved on.
 */
function Home() {
    const { user, authReady } = useInvoices();
    if (authReady && user) return <Navigate to="/dashboard" replace />;
    return <LandingPage />;
}

export default function App() {
    return (
        <InvoicesProvider>
            <ToastProvider>
                <ConfirmProvider>
                    <Router>
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/app" element={<EnterApp />} />
                            <Route path="/dashboard" element={<Shell view="dashboard" />} />
                            <Route path="/i/:id" element={<Shell />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Router>
                </ConfirmProvider>
            </ToastProvider>
        </InvoicesProvider>
    );
}
