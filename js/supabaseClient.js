import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const SUPABASE_URL = "https://gktuyykbggzrutszzrbz.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdHV5eWtiZ2d6cnV0c3p6cmJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2OTkyNjEsImV4cCI6MjA3NjI3NTI2MX0.EYzpKE4x1eiY1k5qwCFQ-9o59kJIMUg0x5ElLuQj7E4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
