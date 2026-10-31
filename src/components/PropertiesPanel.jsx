import { ADJUSTMENT_KEYS, num } from '../lib/invoice'
import { MOD } from '../lib/shortcuts'
import { PALETTES } from '../lib/theme'
import { useInvoices } from '../context/InvoicesContext'
import Icon from './ui/Icon'
import StatusSelect from './StatusSelect'

function Section({ title, children, className = '' }) {
  return (
    <section className={`border-b border-line px-3 py-3.5 ${className}`}>
      <h3 className="ui-section mb-2.5">{title}</h3>
      {children}
    </section>
  )
}

function SwitchRow({ icon, label, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-raised"
    >
      <Icon name={icon} size={15} className="text-fg-muted" />
      <span className="flex-1 text-[13px] capitalize">{label}</span>
      <span className="ui-switch" data-on={checked}>
        <span />
      </span>
    </button>
  )
}

function ActionButton({ icon, label, onClick, disabled, title, danger }) {
  return (
    <button
      type="button"
      className={`ui-btn flex-col gap-1 px-2 py-2 text-[11px] font-medium ${
        danger ? 'hover:text-danger' : ''
      }`}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
    >
      <Icon name={icon} size={17} />
      {label}
    </button>
  )
}

/**
 * The invoice's controls, parked beside the document instead of in a bar above
 * it. Status, history, export, which rows and columns the invoice shows, and
 * the shell's appearance — with room to grow downward.
 */
export default function PropertiesPanel({
  invoice,
  onChange,
  onExport,
  onDuplicate,
  onDelete,
  exporting,
  appearance,
  onClose,
}) {
  const { undo, redo, canUndo, canRedo } = useInvoices()
  const { resolved, theme, setTheme, palette, setPalette } = appearance

  const setOption = (key, value) =>
    onChange({ options: { ...invoice.options, [key]: value } })

  /**
   * Switching the quantity column on or off must not move the total, so the
   * value is carried across: into qty 1 x price on the way in, and folded back
   * into a plain amount on the way out.
   */
  const toggleQuantity = () => {
    const on = !invoice.options.quantity
    const items = invoice.items.map((item) => {
      if (on) {
        if (item.qty === '' && item.rate === '') {
          return num(item.amount)
            ? { ...item, qty: '1', rate: num(item.amount).toFixed(2) }
            : item
        }
        return item
      }
      const computed = num(item.qty) * num(item.rate)
      return computed ? { ...item, amount: computed.toFixed(2) } : item
    })
    onChange({ options: { ...invoice.options, quantity: on }, items })
  }

  const toggleAdjustment = (key) =>
    onChange({
      adjustments: {
        ...invoice.adjustments,
        [key]: { ...invoice.adjustments[key], enabled: !invoice.adjustments[key].enabled },
      },
    })

  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col overflow-y-auto bg-surface">
      <div className="flex items-center gap-2 px-3 py-3">
        <h2 className="flex-1 text-[13px] font-semibold tracking-tight">Invoice</h2>
        {onClose && (
          <button type="button" className="ui-icon-btn" aria-label="Close panel" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      <Section title="Status">
        <StatusSelect status={invoice.status} onChange={(status) => onChange({ status })} />
      </Section>

      <Section title="Actions">
        <div className="grid grid-cols-4 gap-1.5">
          <ActionButton
            icon="undo"
            label="Undo"
            title={`Undo (${MOD}Z)`}
            disabled={!canUndo}
            onClick={undo}
          />
          <ActionButton
            icon="redo"
            label="Redo"
            title={`Redo (${MOD}⇧Z)`}
            disabled={!canRedo}
            onClick={redo}
          />
          <ActionButton
            icon="copy"
            label="Copy"
            title={`Duplicate (${MOD}D)`}
            onClick={onDuplicate}
          />
          <ActionButton icon="trash" label="Delete" danger onClick={onDelete} />
        </div>
      </Section>

      <Section title="Export">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className="ui-btn"
            disabled={exporting}
            onClick={() => onExport('png')}
          >
            <Icon name="image" size={15} />
            PNG
          </button>
          <button
            type="button"
            className="ui-btn"
            disabled={exporting}
            onClick={() => onExport('pdf')}
          >
            <Icon name="file" size={15} />
            PDF
          </button>
        </div>
        {exporting && <p className="mt-2 text-[11px] text-fg-subtle">Rendering…</p>}
      </Section>

      <Section title="Columns">
        <SwitchRow
          icon="detail"
          label="Item description"
          checked={invoice.options.itemDetail}
          onChange={() => setOption('itemDetail', !invoice.options.itemDetail)}
        />
        <SwitchRow
          icon="columns"
          label="Quantity & price"
          checked={invoice.options.quantity}
          onChange={toggleQuantity}
        />
      </Section>

      <Section title="Rows">
        <SwitchRow
          icon="plus"
          label="Previous balance"
          checked={invoice.previousBalance.enabled}
          onChange={() =>
            onChange({
              previousBalance: {
                ...invoice.previousBalance,
                enabled: !invoice.previousBalance.enabled,
              },
            })
          }
        />
        {ADJUSTMENT_KEYS.map((key) => (
          <SwitchRow
            key={key}
            icon={key === 'discount' ? 'arrowDown' : 'arrowUp'}
            label={key}
            checked={invoice.adjustments[key].enabled}
            onChange={() => toggleAdjustment(key)}
          />
        ))}
      </Section>

      <Section title="Appearance" className="border-b-0">
        <div className="ui-segment w-full">
          {[
            { id: 'light', icon: 'sun', label: 'Light' },
            { id: 'dark', icon: 'moon', label: 'Dark' },
            { id: 'system', icon: 'settings', label: 'Auto' },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              data-on={theme === option.id}
              onClick={() => setTheme(option.id)}
              title={`${option.label} theme`}
            >
              <Icon name={option.icon} size={14} />
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {PALETTES.map((option) => {
            const active = palette === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setPalette(option.id)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-[8px] border px-2 py-1.5 text-[12px] ${
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-fg-muted hover:bg-raised'
                }`}
              >
                <span className="flex -space-x-1">
                  {option.swatch.map((colour) => (
                    <span
                      key={colour}
                      className="h-3.5 w-3.5 rounded-full border border-surface"
                      style={{ background: colour }}
                    />
                  ))}
                </span>
                {option.label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 px-0.5 text-[11px] leading-relaxed text-fg-subtle">
          The invoice itself stays black on white in every theme — {resolved} affects
          the app only.
        </p>
      </Section>
    </div>
  )
}
