import type { Shot } from './types'
import { dayLabel, ratio, timeLabel } from './format'

type Props = {
  shots: Shot[]
  userId: string
  editingId: string | null
  newId: string | null // the shot just logged, briefly highlighted
  onEdit: (s: Shot) => void
}

// Recent shots as a dial-in notebook: one row per shot, columns that line up.
// Your own rows are tappable to edit.
export default function ShotList({ shots, userId, editingId, newId, onEdit }: Props) {
  if (shots.length === 0)
    return <p className="empty">No shots yet. Pull one, then log it above.</p>

  const groups: { day: string; shots: Shot[] }[] = []
  for (const s of shots) {
    const day = dayLabel(s.pulled_at)
    if (groups.at(-1)?.day !== day) groups.push({ day, shots: [] })
    groups.at(-1)!.shots.push(s)
  }

  return (
    <section className="history" aria-label="Recent shots">
      {groups.map((g) => (
        <div key={g.day}>
          <h2 className="day">{g.day}</h2>
          <ul className="rows">
            {g.shots.map((s) => {
              const mine = s.user_id === userId
              const body = <Entry shot={s} who={mine ? 'You' : s.household_members.display_name} />
              return (
                <li key={s.id} className={s.id === newId ? 'new' : undefined}>
                  {mine ? (
                    <button
                      type="button"
                      className={`entry${s.id === editingId ? ' editing' : ''}`}
                      onClick={() => onEdit(s)}
                      aria-label={`Edit your ${timeLabel(s.pulled_at)} shot`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="entry">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

function Entry({ shot: s, who }: { shot: Shot; who: string }) {
  const r = ratio(s.dose_g, s.yield_g)
  return (
    <>
      <span className="entry-time">{timeLabel(s.pulled_at)}</span>
      <span className="entry-bean">{s.beans?.name ?? 'No bean'}</span>
      <span className="entry-recipe">
        {s.dose_g}
        {s.yield_g != null && ` → ${s.yield_g}`}
        {s.time_s != null && <span style={{ marginLeft: 12 }}>{s.time_s}s</span>}
      </span>
      <span className="entry-meta">
        {s.grind_setting != null && <span>grind {s.grind_setting}</span>}
        {r && <span>{r}</span>}
        {s.rating != null && (
          <span className="stars" aria-label={`${s.rating} out of 5`}>
            {'★'.repeat(s.rating)}
          </span>
        )}
      </span>
      <span className="entry-who">{who}</span>
      {s.notes && <p className="entry-notes">{s.notes}</p>}
    </>
  )
}
