// supabase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const EXPO_PUBLIC_SUPABASE_URL = 'https://rumfyusijuoumtckykpo.supabase.co';
const EXPO_PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1bWZ5dXNpanVvdW10Y2t5a3BvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMTM5MDEsImV4cCI6MjA4NTc4OTkwMX0.s616aWlL_SJYCB-DlGdeLSAt896z5y9_bpwZGrd7_WQ';

export const supabase = createClient(EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
