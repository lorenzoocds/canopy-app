import { supabase } from './supabase';

export interface DispatchJob {
  jobType: 'verify' | 'errand';
  reportId?: string;
  errandId?: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  taskDescription: string;
  payoutAmount: number;
}

export interface DispatchResult {
  success: boolean;
  provider: string;
  deliveryId?: string;
  trackingUrl?: string;
  error?: string;
}

/**
 * Dispatches a job via the configured provider (DoorDash Drive sandbox).
 * Calls the dispatch-job Edge Function server-side so the signing secret
 * never leaves the server.
 *
 * Design: Adding Uber Direct later means adding a new provider case in the
 * Edge Function — the client interface stays the same.
 */
export async function dispatchJob(job: DispatchJob): Promise<DispatchResult> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      return { success: false, provider: 'unknown', error: 'Not authenticated' };
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wowyavzbcmegwqnmulff.supabase.co';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvd3lhdnpiY21lZ3dxbm11bGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTM3OTUsImV4cCI6MjA5MDM2OTc5NX0.np2MY9MaCNXZoGawIV4zWmCeyQgLJs1tX6n2fUwsYKo';

    const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-job`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(job),
    });

    const result: DispatchResult = await response.json();
    return result;
  } catch (err: any) {
    return {
      success: false,
      provider: 'unknown',
      error: err.message || 'Dispatch failed',
    };
  }
}
