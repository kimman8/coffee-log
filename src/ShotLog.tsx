import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Bean, Shot } from './types'
import { num, ratio, str, timeLabel, dayLabel } from './format'
import BeanPicker from './BeanPicker'
import ShotList from './ShotList'

type Props = { householdId: string; userId: string }

type Form = { dose: string; yield: string; time: string; grind: string; rating: string; notes: string }
const emptyForm: Form = { dose: '', yield: '', time: '', grind: '', rating: '', notes: '' }

// Your last shot with each bean ('*' = your last shot with any bean)
type Last = { dose: string; grind: string; yield: string; time: string }
type LastByBean = Record<string, Last>

const SHOT_COLUMNS =
  'id, user_id, bean_id, pulled_at, dose_g, yield_g, time_s, grind_setting, rating, notes, beans(name), household_members(display_name)'

// Fill dose and grind from your last shot with this bean. Leaves the other fields alone.
function prefill(f: Form, beanId: string | null, last: LastByBean): Form {
  const hit = (beanId && last[beanId]) || null
  return {
    ...f,
    dose: hit?.dose ?? (f.dose || last['*']?.dose || ''), // new bean: keep your usual dose
    grind: hit?.grind ?? '',
  }
}

export default function ShotLog({ householdId, userId }: Props) {
  const [beans, setBeans] = useState<Bean[]>([])
  const [shots, setShots] = useState<Shot[]>([])
  const [lastByBean, setLastByBean] = useState<LastByBean>({})
  const [beanId, setBeanId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [notesOpen, setNotesOpen] = useState(false)
  const [editing, setEditing] = useState<Shot | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Brief confirmation on the main button ("Logged", "Saved", "Deleted") and the new row's id
  const [done, setDone] = useState<string | null>(null)
  const [newId, setNewId] = useState<string | null>(null)
  const doneTimer = useRef<number | undefined>(undefined)

  function confirmDone(label: string, id: string | null = null) {
    setDone(label)
    setNewId(id)
    window.clearTimeout(doneTimer.current)
    doneTimer.current = window.setTimeout(() => {
      setDone(null)
      setNewId(null)
    }, 1500)
  }

  const load = useCallback(async () => {
    const [beansRes, mineRes, shotsRes] = await Promise.all([
      supabase
        .from('beans')
        .select('id, name, roaster, roast_date, created_at')
        .eq('household_id', householdId)
        .eq('archived', false)
        .order('created_at', { ascending: false }),
      // your recent shots: order the beans, pick the default bean, pre-fill, "last time" hint
      supabase
        .from('shots')
        .select('bean_id, dose_g, grind_setting, yield_g, time_s')
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .order('pulled_at', { ascending: false })
        .limit(100),
      supabase
        .from('shots')
        .select(SHOT_COLUMNS)
        .eq('household_id', householdId)
        .order('pulled_at', { ascending: false })
        .limit(30),
    ])
    setLoaded(true)
    const err = beansRes.error ?? mineRes.error ?? shotsRes.error
    if (err) {
      setError(err.message)
      return null
    }

    type Mine = {
      bean_id: string | null
      dose_g: number
      grind_setting: number | null
      yield_g: number | null
      time_s: number | null
    }
    const last: LastByBean = {}
    const recentIds: string[] = []
    for (const s of mineRes.data as Mine[]) {
      const entry = { dose: str(s.dose_g), grind: str(s.grind_setting), yield: str(s.yield_g), time: str(s.time_s) }
      last['*'] ??= entry
      if (s.bean_id && !last[s.bean_id]) {
        last[s.bean_id] = entry
        recentIds.push(s.bean_id)
      }
    }

    // Order: most recently used by you first; never-used beans after, newest first.
    const rank = (id: string) => {
      const i = recentIds.indexOf(id)
      return i === -1 ? recentIds.length : i
    }
    const active = (beansRes.data as Bean[]).slice().sort((a, b) => rank(a.id) - rank(b.id))

    setBeans(active)
    setShots(shotsRes.data as unknown as Shot[])
    setLastByBean(last)
    return { active, last, shots: shotsRes.data as unknown as Shot[] }
  }, [householdId, userId])

  // First load: select the bean of your last shot and pre-fill from it.
  useEffect(() => {
    load().then((r) => {
      if (!r) return
      const id = r.active[0]?.id ?? null
      setBeanId(id)
      setForm(prefill(emptyForm, id, r.last))
    })
  }, [load])

  function selectBean(id: string) {
    setBeanId(id)
    if (!editing) setForm((f) => prefill(f, id, lastByBean)) // don't overwrite a shot you're editing
  }

  // After adding or finishing a bean
  async function beansChanged(selectId?: string) {
    const r = await load()
    if (!r) return
    if (selectId) return selectBean(selectId)
    if (!r.active.some((b) => b.id === beanId)) {
      const id = r.active[0]?.id ?? null
      setBeanId(id)
      setForm((f) => prefill(f, id, r.last))
    }
  }

  function startEdit(s: Shot) {
    if (editing?.id === s.id) return finishEditing() // tap the row again to cancel
    setEditing(s)
    setBeanId(s.bean_id)
    setForm({
      dose: str(s.dose_g),
      yield: str(s.yield_g),
      time: str(s.time_s),
      grind: str(s.grind_setting),
      rating: str(s.rating),
      notes: s.notes ?? '',
    })
    setNotesOpen(!!s.notes)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function finishEditing() {
    setEditing(null)
    setError(null)
    setNotesOpen(false)
    const r = await load()
    if (!r) return
    const id = r.active[0]?.id ?? null
    setBeanId(id)
    setForm(prefill(emptyForm, id, r.last))
  }

  async function deleteShot() {
    if (!editing || !window.confirm('Delete this shot? This can’t be undone.')) return
    // .select() returns the deleted rows, so we can tell if RLS blocked it (0 rows, no error)
    const { data, error } = await supabase.from('shots').delete().eq('id', editing.id).select('id')
    if (error) return setError(error.message)
    if (!data?.length) return setError('That shot wasn’t deleted. Only the person who pulled it can delete it.')
    confirmDone('Deleted')
    finishEditing()
  }

  const set = (field: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!beanId) return setError('Choose a bean first.')
    const dose = num(form.dose)
    const values = {
      bean_id: beanId,
      dose_g: dose,
      yield_g: num(form.yield),
      time_s: num(form.time),
      grind_setting: num(form.grind),
      rating: num(form.rating),
      notes: form.notes.trim() || null,
    }
    if (!dose || dose <= 0) return setError('Enter the dose to log this shot.')
    if (Object.values(values).some((v) => typeof v === 'number' && Number.isNaN(v)))
      return setError('One of the numbers isn’t a number. Use digits and a decimal point, like 18.5.')

    setSaving(true)
    setError(null)
    const { data, error } = editing
      ? await supabase.from('shots').update(values).eq('id', editing.id).select('id')
      : await supabase.from('shots').insert({ ...values, household_id: householdId }).select('id')
    setSaving(false)
    if (error) return setError(error.message)
    if (!data?.length) return setError('That shot wasn’t saved. Try again.')

    if (editing) {
      confirmDone('Saved')
      return finishEditing()
    }
    confirmDone('Logged', data[0].id)
    setNotesOpen(false)
    // Next shot: keep the same bean, pre-fill dose/grind from the shot you just logged
    const r = await load()
    if (r) setForm(prefill(emptyForm, beanId, r.last))
  }

  const formRatio = ratio(num(form.dose), num(form.yield))
  const editingFinishedBean = editing && beanId && !beans.some((b) => b.id === beanId)
  const last = !editing && beanId ? lastByBean[beanId] : undefined
  const selectedName = beans.find((b) => b.id === beanId)?.name

  if (!loaded) return null

  return (
    <>
      <form onSubmit={submit} noValidate aria-label={editing ? 'Edit shot' : 'Log a shot'}>
        <BeanPicker
          householdId={householdId}
          beans={beans}
          selectedId={beanId}
          onSelect={selectBean}
          onChanged={beansChanged}
        />

        {editing && (
          <p className="editing-note">
            <span>
              Editing your shot from {dayLabel(editing.pulled_at).toLowerCase()}, {timeLabel(editing.pulled_at)}
              {editingFinishedBean && ` (${editing.beans?.name}, finished bag)`}
            </span>
            <button type="button" className="link" onClick={finishEditing}>
              Cancel
            </button>
          </p>
        )}

        {/* The recipe, written the way baristas write it */}
        <div className="recipe">
          <Line value={form.dose} onChange={set('dose')} word="g in" label="Dose in grams" placeholder="–" />
          <Line
            value={form.yield}
            onChange={set('yield')}
            word="g out"
            label="Yield in grams"
            placeholder="–"
            aside={formRatio && <span className="ratio">{formRatio}</span>}
          />
          <Line value={form.time} onChange={set('time')} word="seconds" label="Time in seconds" placeholder="–" />
        </div>

        {last && (last.yield || last.time) && (
          <p className="last">{lastTime(selectedName, last)}</p>
        )}

        <div className="settings">
          <label className="grind">
            <span className="muted">grind</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="–"
              value={form.grind}
              onChange={set('grind')}
            />
          </label>
          <div className="rating" role="group" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => {
              const on = Number(form.rating) >= n
              return (
                <button
                  key={n}
                  type="button"
                  className={on ? 'on' : ''}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  aria-pressed={form.rating === String(n)}
                  // tap the current rating again to clear it
                  onClick={() => setForm((f) => ({ ...f, rating: f.rating === String(n) ? '' : String(n) }))}
                >
                  {on ? '★' : '☆'}
                </button>
              )
            })}
          </div>
        </div>

        <div className="notes">
          {notesOpen ? (
            <textarea
              className="textarea"
              rows={2}
              autoFocus={!editing}
              aria-label="Notes"
              placeholder="How did it taste? Any channeling?"
              value={form.notes}
              onChange={set('notes')}
            />
          ) : (
            <button type="button" className="link" onClick={() => setNotesOpen(true)}>
              Add a note
            </button>
          )}
        </div>

        <div className="bar">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="bar-inner">
            {editing && (
              <button type="button" className="btn btn-danger" onClick={deleteShot}>
                Delete
              </button>
            )}
            <button className="btn btn-primary" disabled={saving || !beanId}>
              {saving ? 'Saving…' : (done ?? (editing ? 'Save changes' : 'Log shot'))}
            </button>
          </div>
        </div>
      </form>

      <ShotList shots={shots} userId={userId} editingId={editing?.id ?? null} newId={newId} onEdit={startEdit} />
    </>
  )
}

// "Last time with Guji: 36.5g out in 29 seconds"
function lastTime(beanName: string | undefined, l: Last): string {
  const parts = [l.yield && `${l.yield}g out`, l.time && `in ${l.time} seconds`].filter(Boolean).join(' ')
  return `Last time${beanName ? ` with ${beanName}` : ''}: ${parts}`
}

type LineProps = {
  value: string
  onChange: (e: { target: { value: string } }) => void
  word: string
  label: string
  placeholder: string
  aside?: ReactNode
}

// One line of the recipe: a large editable figure and the word after it
function Line({ value, onChange, word, label, placeholder, aside }: LineProps) {
  return (
    <label className="line">
      <input
        className="figure"
        // size the figure to its digits so the word sits right after it
        style={{ width: `${Math.max(value.length, 1) + 0.15}ch` }}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <span className="word" aria-hidden>
        {word}
      </span>
      {aside ?? <span />}
    </label>
  )
}
