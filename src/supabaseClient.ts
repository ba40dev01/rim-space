import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://aqvrwpnbgaztprkhyvuc.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxdnJ3cG5iZ2F6dHBya2h5dnVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MTU0MjQsImV4cCI6MjA2NDI5MTQyNH0.OqM-8yYVuX6joAqT8SD-vd9bGtnyHiXHUMEfI4HpSxU";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      "X-Client-Info": "supabase-js-v2",
    },
  },
});
