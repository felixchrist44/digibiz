-- =========================================================
-- Migration: Rate Limiting & Bucket Table Security Lockdown
-- =========================================================

-- 1. Create rate_limit_buckets table
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key text PRIMARY KEY,
  tokens integer NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS with ZERO permissive policies (blocks direct PostgREST access)
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- 3. Explicitly revoke direct table permissions from API roles
REVOKE ALL ON TABLE public.rate_limit_buckets FROM anon, authenticated, public;

-- 4. Check rate limit RPC (inspect count without incrementing)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_bucket public.rate_limit_buckets%ROWTYPE;
  v_window_interval interval := (p_window_seconds || ' seconds')::interval;
  v_current_tokens integer := 0;
  v_allowed boolean;
BEGIN
  -- Cleanup stale buckets older than 1 day
  DELETE FROM public.rate_limit_buckets
  WHERE last_updated < (v_now - INTERVAL '1 day');

  SELECT * INTO v_bucket
  FROM public.rate_limit_buckets
  WHERE key = p_key;

  IF FOUND THEN
    -- Check if window has elapsed
    IF v_bucket.last_updated < (v_now - v_window_interval) THEN
      v_current_tokens := 0;
    ELSE
      v_current_tokens := v_bucket.tokens;
    END IF;
  END IF;

  v_allowed := v_current_tokens < p_max_requests;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'tokens', v_current_tokens,
    'remaining', GREATEST(0, p_max_requests - v_current_tokens),
    'reset_seconds', p_window_seconds
  );
END;
$$;

-- 5. Increment rate limit RPC (atomic increment & return status)
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_bucket public.rate_limit_buckets%ROWTYPE;
  v_window_interval interval := (p_window_seconds || ' seconds')::interval;
  v_new_tokens integer := 1;
  v_allowed boolean;
BEGIN
  -- Cleanup stale buckets older than 1 day
  DELETE FROM public.rate_limit_buckets
  WHERE last_updated < (v_now - INTERVAL '1 day');

  SELECT * INTO v_bucket
  FROM public.rate_limit_buckets
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limit_buckets (key, tokens, last_updated)
    VALUES (p_key, 1, v_now);
    v_new_tokens := 1;
  ELSE
    IF v_bucket.last_updated < (v_now - v_window_interval) THEN
      UPDATE public.rate_limit_buckets
      SET tokens = 1, last_updated = v_now
      WHERE key = p_key;
      v_new_tokens := 1;
    ELSE
      v_new_tokens := v_bucket.tokens + 1;
      UPDATE public.rate_limit_buckets
      SET tokens = v_new_tokens, last_updated = v_now
      WHERE key = p_key;
    END IF;
  END IF;

  v_allowed := v_new_tokens <= p_max_requests;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'tokens', v_new_tokens,
    'remaining', GREATEST(0, p_max_requests - v_new_tokens),
    'reset_seconds', p_window_seconds
  );
END;
$$;

-- 6. Reset rate limit RPC (clear failure count upon successful login)
CREATE OR REPLACE FUNCTION public.reset_rate_limit(
  p_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.rate_limit_buckets WHERE key = p_key;
END;
$$;

-- 7. Grant RPC execute permissions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_rate_limit(text) TO anon, authenticated;
