import { createClient } from "@/utils/supabase/client";

// Compatibility export: all browser consumers use the same SSR cookie client.
export const supabase = createClient();
