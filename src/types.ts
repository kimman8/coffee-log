// Hand-written row shapes matching espresso-log-schema.sql (only the columns the app uses).

export type Membership = {
  household_id: string
  display_name: string
  households: { name: string; invite_code: string }
}

export type Bean = {
  id: string
  name: string
  roaster: string | null
  roast_date: string | null // 'YYYY-MM-DD'
  created_at: string
}

export type Shot = {
  id: string
  user_id: string
  bean_id: string | null
  pulled_at: string
  dose_g: number
  yield_g: number | null
  time_s: number | null
  grind_setting: number | null
  rating: number | null
  notes: string | null
  beans: { name: string } | null
  household_members: { display_name: string }
}
