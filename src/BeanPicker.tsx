import { useState, type KeyboardEvent, type SyntheticEvent } from 'react'
import { supabase } from './supabase'
import type { Bean } from './types'
import { daysOffRoast } from './format'

type Props = {
  householdId: string
  beans: Bean[] // active beans, already ordered by your most recent use
  selectedId: string | null
  onSelect: (id: string) => void
  onChanged: (selectId?: string) => void // reload beans, optionally selecting one
}

// A row of bean tabs. The selected bean defaults to the bean of your last shot (set by ShotLog).
export default function BeanPicker({ householdId, beans, selectedId, onSelect, onChanged }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [roaster, setRoaster] = useState('')
  const [roastDate, setRoastDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const selected = beans.find((b) => b.id === selectedId)

  async function addBean(e: SyntheticEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    const { data, error } = await supabase
      .from('beans')
      .insert({
        household_id: householdId,
        name: name.trim(),
        roaster: roaster.trim() || null,
        roast_date: roastDate || null,
      })
      .select('id')
      .single()
    if (error) return setError(error.message)
    setName('')
    setRoaster('')
    setRoastDate('')
    setAdding(false)
    onChanged(data.id)
  }

  async function finish(bean: Bean) {
    if (!window.confirm(`Mark ${bean.name} as finished? It leaves this row, and past shots keep its name.`)) return
    const { error } = await supabase.from('beans').update({ archived: true }).eq('id', bean.id)
    if (error) return setError(error.message)
    onChanged()
  }

  // Enter in the new-bag fields adds the bag instead of submitting the shot form around it
  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') addBean(e)
  }

  return (
    <div>
      <div className="beans" role="group" aria-label="Bean">
        {beans.map((b) => {
          const days = daysOffRoast(b.roast_date)
          return (
            <button
              key={b.id}
              type="button"
              className="bean"
              aria-pressed={b.id === selectedId}
              onClick={() => onSelect(b.id)}
            >
              <span className="bean-name">{b.name}</span>
              {days != null && <span className="bean-age">{days}d</span>}
            </button>
          )
        })}
        {!adding && (
          <button type="button" className="bean bean-add" onClick={() => setAdding(true)}>
            + New bag
          </button>
        )}
      </div>

      {selected && !adding && (
        <div className="bean-detail">
          <span>{describe(selected)}</span>
          <button type="button" className="link" onClick={() => finish(selected)}>
            Mark finished
          </button>
        </div>
      )}

      {adding && (
        <div className="sheet">
          <input
            className="input"
            autoFocus
            placeholder="Bean name"
            aria-label="Bean name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onEnter}
          />
          <div className="row">
            <input
              className="input grow"
              placeholder="Roaster"
              aria-label="Roaster (optional)"
              value={roaster}
              onChange={(e) => setRoaster(e.target.value)}
              onKeyDown={onEnter}
            />
            <input
              className="input"
              style={{ width: 'auto' }}
              type="date"
              aria-label="Roast date (optional)"
              title="Roast date"
              value={roastDate}
              onChange={(e) => setRoastDate(e.target.value)}
            />
          </div>
          <div className="sheet-actions">
            <button type="button" className="btn" style={{ border: 'none' }} onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={!name.trim()} onClick={addBean}>
              Add bag
            </button>
          </div>
        </div>
      )}

      {beans.length === 0 && !adding && <p className="bean-detail">Add your first bag to start logging.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// "Square Mile, roasted 9 days ago" — whatever we know about the bag
function describe(b: Bean): string {
  const days = daysOffRoast(b.roast_date)
  const roasted =
    days == null ? null : days === 0 ? 'roasted today' : `roasted ${days} day${days === 1 ? '' : 's'} ago`
  const parts = [b.roaster, roasted].filter(Boolean).join(', ')
  return parts ? parts.charAt(0).toUpperCase() + parts.slice(1) : 'No roast date'
}
