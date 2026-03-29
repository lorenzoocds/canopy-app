import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wowyavzbcmegwqnmulff.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvd3lhdnpiY21lZ3dxbm11bGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTM3OTUsImV4cCI6MjA5MDM2OTc5NX0.np2MY9MaCNXZoGawIV4zWmCeyQgLJs1tX6n2fUwsYKo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
