import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hxohfvcgvvejirkcusrj.supabase.co'
const supabaseAnonKey = 'sb_publishable_-8MTpNKDgB80qvAf9gyghg_5C0OjKpz'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)