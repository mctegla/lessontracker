// This file used to wrap the @base44/sdk client. It now wraps Supabase, but
// keeps the exact same shape (`base44.entities.X.list/filter/get/create/
// update/delete/subscribe`, `base44.functions.invoke`, `base44.auth.me`) so
// that most pages didn't need to change at all during the migration off
// Base44. If you're extending this app going forward, it's fine to call
// `supabase` directly for new code instead of going through this shim.
import { supabase } from '@/lib/supabaseClient';

const TABLES = {
  Tracker: 'trackers',
  PurchaseLog: 'purchase_logs',
  AppNotification: 'app_notifications'
};

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

function parseSort(sort) {
  if (!sort) return null;
  const desc = sort.startsWith('-');
  const column = desc ? sort.slice(1) : sort;
  return { column, ascending: !desc };
}

function makeEntity(table) {
  return {
    async list(sort) {
      let q = supabase.from(table).select('*');
      const s = parseSort(sort);
      if (s) q = q.order(s.column, { ascending: s.ascending });
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    async filter(match = {}) {
      let q = supabase.from(table).select('*');
      if (Object.keys(match).length) q = q.match(match);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    async create(payload) {
      const user_id = await currentUserId();
      const { data, error } = await supabase.from(table).insert({ ...payload, user_id }).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, payload) {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return true;
    },
    subscribe(cb) {
      const channel = supabase
        .channel(`${table}-changes-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, cb)
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  };
}

async function invoke(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const err = new Error(error.message || 'Function call failed');
    try {
      // supabase-js FunctionsHttpError exposes the raw Response on `.context`
      if (error.context && typeof error.context.json === 'function') {
        const parsed = await error.context.json();
        err.response = { data: parsed };
      }
    } catch (_) { /* ignore parse failures */ }
    throw err;
  }
  return { data };
}

export const base44 = {
  entities: {
    Tracker: makeEntity(TABLES.Tracker),
    PurchaseLog: makeEntity(TABLES.PurchaseLog),
    AppNotification: makeEntity(TABLES.AppNotification)
  },
  functions: {
    invoke
  },
  auth: {
    async me() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      return { id: user.id, email: user.email, role: profile?.role || 'user' };
    }
  }
};
