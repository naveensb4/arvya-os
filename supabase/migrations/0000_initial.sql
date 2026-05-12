-- Consolidated initial schema for Arvya OS (public schema)
-- Generated 2026-05-09 from pg_dump of the live database after applying
-- migrations 0000-0006, 0016, 0017. The original 9 incremental files
-- are preserved in supabase/migrations/archive/.
--
-- This file is the single source of truth for the public schema. To
-- recreate the DB from scratch:
--   psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0000_initial.sql
--
-- The psql 17+ restrict/unrestrict metacommands present in the raw dump
-- have been stripped so this applies cleanly with older psql clients.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: agent_run_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_run_status AS ENUM (
    'queued',
    'running',
    'succeeded',
    'failed'
);


--
-- Name: brain_alert_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.brain_alert_severity AS ENUM (
    'info',
    'warning',
    'error',
    'critical'
);


--
-- Name: brain_alert_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.brain_alert_status AS ENUM (
    'unread',
    'read',
    'dismissed'
);


--
-- Name: brain_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.brain_kind AS ENUM (
    'company',
    'sell_side',
    'buy_side'
);


--
-- Name: connector_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.connector_status AS ENUM (
    'active',
    'paused',
    'error',
    'connected',
    'needs_reauth'
);


--
-- Name: connector_sync_run_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.connector_sync_run_status AS ENUM (
    'started',
    'completed',
    'failed'
);


--
-- Name: loop_outcome_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.loop_outcome_decision AS ENUM (
    'closed',
    'advanced',
    'contradicts',
    'no_match',
    'uncertain'
);


--
-- Name: memory_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.memory_kind AS ENUM (
    'person',
    'company',
    'fact',
    'event',
    'decision',
    'insight',
    'risk',
    'question',
    'commitment',
    'task',
    'product_insight',
    'marketing_idea',
    'custom'
);


--
-- Name: memory_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.memory_status AS ENUM (
    'open',
    'in_progress',
    'waiting',
    'done',
    'closed',
    'snoozed'
);


--
-- Name: model_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.model_provider AS ENUM (
    'local',
    'anthropic',
    'openai'
);


--
-- Name: notetaker_auto_join_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notetaker_auto_join_decision AS ENUM (
    'join',
    'skip',
    'needs_review'
);


--
-- Name: notetaker_auto_join_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notetaker_auto_join_mode AS ENUM (
    'all_calls',
    'external_only',
    'arvya_related_only',
    'manual_only'
);


--
-- Name: notetaker_bot_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notetaker_bot_status AS ENUM (
    'not_scheduled',
    'scheduled',
    'joining',
    'in_call',
    'completed',
    'failed',
    'canceled'
);


--
-- Name: notetaker_calendar_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notetaker_calendar_status AS ENUM (
    'connected',
    'error',
    'disabled'
);


--
-- Name: notetaker_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notetaker_provider AS ENUM (
    'google_calendar',
    'outlook_calendar'
);


--
-- Name: calendar_event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_event_status AS ENUM (
    'active',
    'cancelled',
    'deleted'
);


--
-- Name: calendar_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_event_type AS ENUM (
    'virtual',
    'in_person',
    'hybrid',
    'unknown'
);


--
-- Name: open_loop_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.open_loop_priority AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


--
-- Name: open_loop_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.open_loop_status AS ENUM (
    'needs_review',
    'open',
    'in_progress',
    'waiting',
    'done',
    'dismissed',
    'closed'
);


--
-- Name: open_loop_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.open_loop_type AS ENUM (
    'follow_up',
    'intro',
    'product',
    'investor',
    'sales',
    'marketing',
    'engineering',
    'deal',
    'diligence',
    'crm',
    'scheduling',
    'other'
);


--
-- Name: priority_horizon; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority_horizon AS ENUM (
    'today',
    'week',
    'sprint',
    'quarter'
);


--
-- Name: priority_set_by; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority_set_by AS ENUM (
    'naveen',
    'pb',
    'system'
);


--
-- Name: priority_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority_status AS ENUM (
    'active',
    'achieved',
    'abandoned'
);


--
-- Name: workflow_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workflow_status AS ENUM (
    'started',
    'running',
    'waiting_for_human',
    'completed',
    'failed'
);


--
-- Name: workspace_member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_member_role AS ENUM (
    'owner',
    'member',
    'admin',
    'viewer'
);


--
-- Name: get_entity_neighbors(uuid, uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_entity_neighbors(p_brain_id uuid, p_entity_id uuid, p_depth integer DEFAULT 2, p_workspace_id uuid DEFAULT NULL::uuid) RETURNS TABLE(entity_id uuid, entity_name text, entity_type text, relationship_type text, related_entity_id uuid, related_entity_name text, related_entity_type text, depth integer, strength numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET statement_timeout TO '5s'
    AS $$
BEGIN
  IF p_depth > 3 THEN
    p_depth := 3;
  END IF;

  IF p_workspace_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM brains WHERE id = p_brain_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  RETURN QUERY
  WITH RECURSIVE graph AS (
    SELECT
      ce.id AS entity_id,
      ce.canonical_name AS entity_name,
      ce.entity_type,
      r.relationship_type,
      CASE
        WHEN mo_from.canonical_entity_id = p_entity_id THEN mo_to.canonical_entity_id
        ELSE mo_from.canonical_entity_id
      END AS related_entity_id,
      1 AS depth,
      r.strength,
      ARRAY[ce.id] AS path
    FROM canonical_entities ce
    JOIN entity_mentions em ON em.canonical_entity_id = ce.id
    JOIN memory_objects mo_from ON mo_from.canonical_entity_id = ce.id
    JOIN relationships r ON r.from_object_id = mo_from.id OR r.to_object_id = mo_from.id
    JOIN memory_objects mo_to ON (
      (r.from_object_id = mo_to.id OR r.to_object_id = mo_to.id)
      AND mo_to.id != mo_from.id
    )
    WHERE ce.id = p_entity_id
    AND ce.brain_id = p_brain_id
    AND r.brain_id = p_brain_id

    UNION ALL

    SELECT
      ce2.id,
      ce2.canonical_name,
      ce2.entity_type,
      r2.relationship_type,
      CASE
        WHEN mo_from2.canonical_entity_id = g.related_entity_id THEN mo_to2.canonical_entity_id
        ELSE mo_from2.canonical_entity_id
      END,
      g.depth + 1,
      r2.strength,
      g.path || ce2.id
    FROM graph g
    JOIN canonical_entities ce2 ON ce2.id = g.related_entity_id
    JOIN memory_objects mo_from2 ON mo_from2.canonical_entity_id = ce2.id
    JOIN relationships r2 ON r2.from_object_id = mo_from2.id OR r2.to_object_id = mo_from2.id
    JOIN memory_objects mo_to2 ON (
      (r2.from_object_id = mo_to2.id OR r2.to_object_id = mo_to2.id)
      AND mo_to2.id != mo_from2.id
    )
    WHERE g.depth < p_depth
    AND NOT (ce2.id = ANY(g.path))
    AND r2.brain_id = p_brain_id
  )
  SELECT DISTINCT
    g.entity_id,
    g.entity_name,
    g.entity_type,
    g.relationship_type,
    g.related_entity_id,
    ce3.canonical_name AS related_entity_name,
    ce3.entity_type AS related_entity_type,
    g.depth,
    g.strength
  FROM graph g
  JOIN canonical_entities ce3 ON ce3.id = g.related_entity_id
  ORDER BY g.depth, g.entity_name
  LIMIT 500;
END;
$$;


--
-- Name: handle_new_auth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, auth_provider)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
  )
  ON CONFLICT (email) DO UPDATE
    SET auth_provider = EXCLUDED.auth_provider;

  RETURN NEW;
END;
$$;


--
-- Name: user_brain_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_brain_role(p_brain_id uuid) RETURNS public.workspace_member_role
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT wm.role
  FROM workspace_members wm
  JOIN brains b ON b.workspace_id = wm.workspace_id
  WHERE b.id = p_brain_id
    AND wm.user_id = auth.uid()
  LIMIT 1;
$$;


--
-- Name: user_workspace_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_workspace_role(p_workspace_id uuid) RETURNS public.workspace_member_role
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT wm.role
  FROM workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = auth.uid()
  LIMIT 1;
$$;


SET default_table_access_method = heap;

--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    source_item_id uuid,
    workflow_id uuid,
    name text NOT NULL,
    status public.agent_run_status DEFAULT 'queued'::public.agent_run_status NOT NULL,
    model_provider public.model_provider DEFAULT 'local'::public.model_provider NOT NULL,
    step_name text,
    input_summary text DEFAULT ''::text NOT NULL,
    output_summary text DEFAULT ''::text NOT NULL,
    raw_input jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_output jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: brain_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brain_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    alert_type text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    severity public.brain_alert_severity DEFAULT 'info'::public.brain_alert_severity NOT NULL,
    source_id uuid,
    open_loop_id uuid,
    status public.brain_alert_status DEFAULT 'unread'::public.brain_alert_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: brain_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brain_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    event_type text NOT NULL,
    source_system text,
    entity_id uuid,
    source_item_id uuid,
    memory_object_id uuid,
    relationship_id uuid,
    open_loop_id uuid,
    actor text DEFAULT 'system'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_content_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_content_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    source_item_id uuid,
    source_platform text NOT NULL,
    source_type text NOT NULL,
    source_url text,
    source_external_id text,
    source_owner text,
    source_date timestamp with time zone,
    source_confidentiality text DEFAULT 'internal'::text NOT NULL,
    raw_text text NOT NULL,
    cleaned_summary text,
    content_safe_summary text,
    requires_redaction boolean DEFAULT true NOT NULL,
    approved_for_content boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_content_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_content_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    content_item_id uuid NOT NULL,
    raw_insight text NOT NULL,
    content_safe_insight text NOT NULL,
    sensitivity_level text DEFAULT 'medium'::text NOT NULL,
    suggested_pillar text,
    suggested_channels jsonb DEFAULT '[]'::jsonb NOT NULL,
    approved_for_content boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_channel_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_channel_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    content_item_id uuid,
    content_insight_id uuid,
    channel text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    body_text text NOT NULL,
    media_type text,
    media_reference text,
    planned_post_date timestamp with time zone,
    posting_window text,
    scheduled_at timestamp with time zone,
    published_at timestamp with time zone,
    live_url text,
    scheduler_provider text,
    scheduler_post_id text,
    campaign_tag text,
    pillar text,
    format_type text,
    hook_type text,
    target_icp text,
    funnel_stage text,
    experiment_tag text,
    requires_review boolean DEFAULT true NOT NULL,
    sensitivity_level text DEFAULT 'medium'::text NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    revision_reason text,
    safety_check_status text DEFAULT 'not_run'::text NOT NULL,
    safety_check_reason text,
    is_exemplar boolean DEFAULT false NOT NULL,
    performance_tag text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_post_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_post_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    channel_post_id uuid NOT NULL,
    metric_date timestamp with time zone NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    reactions integer DEFAULT 0 NOT NULL,
    comments integer DEFAULT 0 NOT NULL,
    shares integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    saves integer DEFAULT 0 NOT NULL,
    follows integer DEFAULT 0 NOT NULL,
    raw_metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    channel_post_id uuid,
    event_type text NOT NULL,
    event_source text NOT NULL,
    event_at timestamp with time zone NOT NULL,
    description text NOT NULL,
    contact_name text,
    company_name text,
    value numeric,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    attribution_confidence text DEFAULT 'unknown'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_experiments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_experiments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    tag text NOT NULL,
    title text NOT NULL,
    hypothesis text NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_weekly_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_weekly_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    week_start timestamp with time zone NOT NULL,
    week_end timestamp with time zone NOT NULL,
    published_count integer DEFAULT 0 NOT NULL,
    qualitative_only boolean DEFAULT true NOT NULL,
    summary text NOT NULL,
    markdown text NOT NULL,
    recommended_experiments jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_llm_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_llm_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    job_type text NOT NULL,
    model_provider text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    estimated_cost_usd numeric DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: brain_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brain_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind public.brain_kind NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    thesis_starter text DEFAULT ''::text NOT NULL,
    default_source_types jsonb DEFAULT '[]'::jsonb NOT NULL,
    default_workflows jsonb DEFAULT '[]'::jsonb NOT NULL,
    memory_lens_order jsonb DEFAULT '[]'::jsonb NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: brains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    kind public.brain_kind DEFAULT 'company'::public.brain_kind NOT NULL,
    thesis text DEFAULT ''::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid NOT NULL,
    created_by_user_id uuid
);


--
-- Name: canonical_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canonical_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    entity_type text NOT NULL,
    canonical_name text NOT NULL,
    display_name text,
    aliases text[] DEFAULT '{}'::text[],
    external_ids jsonb DEFAULT '{}'::jsonb,
    properties jsonb DEFAULT '{}'::jsonb,
    confidence numeric(3,2),
    merged_from uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding public.vector(1536)
);


--
-- Name: connector_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    status public.connector_status DEFAULT 'active'::public.connector_status NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    credentials jsonb,
    sync_enabled boolean DEFAULT false NOT NULL,
    sync_interval_minutes integer,
    last_sync_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    connector_type text NOT NULL,
    CONSTRAINT connector_configs_connector_type_check CHECK ((connector_type = ANY (ARRAY['google_drive'::text, 'gmail'::text, 'outlook'::text, 'recall'::text, 'mock'::text, 'onedrive'::text, 'slack'::text, 'hubspot'::text, 'github'::text, 'notion'::text, 'google_calendar'::text])))
);


--
-- Name: connector_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    connector_config_id uuid,
    status public.connector_sync_run_status DEFAULT 'started'::public.connector_sync_run_status NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    items_found integer DEFAULT 0 NOT NULL,
    items_ingested integer DEFAULT 0 NOT NULL,
    items_skipped integer DEFAULT 0 NOT NULL,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    connector_type text NOT NULL,
    CONSTRAINT connector_sync_runs_connector_type_check CHECK ((connector_type = ANY (ARRAY['google_drive'::text, 'gmail'::text, 'outlook'::text, 'recall'::text, 'mock'::text, 'onedrive'::text, 'slack'::text, 'hubspot'::text, 'github'::text, 'notion'::text, 'google_calendar'::text])))
);


--
-- Name: entity_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_mentions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    canonical_entity_id uuid NOT NULL,
    memory_object_id uuid,
    source_item_id uuid,
    mention_text text NOT NULL,
    context_snippet text,
    mentioned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    slug text NOT NULL,
    kind text DEFAULT 'entity'::text NOT NULL,
    title text NOT NULL,
    body_md text DEFAULT ''::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    aliases text[] DEFAULT '{}'::text[],
    evidence_ids uuid[] DEFAULT '{}'::uuid[],
    compiled_at timestamp with time zone,
    confidence numeric(3,2),
    stale boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loop_outcome_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loop_outcome_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    loop_id uuid NOT NULL,
    source_item_id uuid,
    decision public.loop_outcome_decision NOT NULL,
    confidence numeric(3,2),
    evidence_quote text,
    agent_run_id uuid,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    human_overrode boolean DEFAULT false NOT NULL,
    human_override_at timestamp with time zone,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: memory_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    source_item_id uuid,
    object_type public.memory_kind NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_quote text,
    confidence numeric(3,2),
    status public.memory_status,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    canonical_entity_id uuid,
    embedding public.vector(1536)
);


--
-- Name: notetaker_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notetaker_calendars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    user_id text,
    provider public.notetaker_provider NOT NULL,
    recall_calendar_id text,
    external_calendar_id text,
    status public.notetaker_calendar_status DEFAULT 'connected'::public.notetaker_calendar_status NOT NULL,
    auto_join_enabled boolean DEFAULT true NOT NULL,
    auto_join_mode public.notetaker_auto_join_mode DEFAULT 'all_calls'::public.notetaker_auto_join_mode NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_sync_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notetaker_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notetaker_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    notetaker_meeting_id uuid,
    provider_event_id text,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notetaker_meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notetaker_meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    notetaker_calendar_id uuid,
    recall_calendar_event_id text,
    recall_bot_id text,
    external_event_id text,
    provider public.notetaker_provider NOT NULL,
    title text NOT NULL,
    meeting_url text,
    location text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    participants jsonb DEFAULT '[]'::jsonb NOT NULL,
    auto_join_decision public.notetaker_auto_join_decision DEFAULT 'needs_review'::public.notetaker_auto_join_decision NOT NULL,
    auto_join_reason text,
    bot_status public.notetaker_bot_status DEFAULT 'not_scheduled'::public.notetaker_bot_status NOT NULL,
    event_status public.calendar_event_status DEFAULT 'active'::public.calendar_event_status NOT NULL,
    event_type public.calendar_event_type DEFAULT 'unknown'::public.calendar_event_type NOT NULL,
    source_item_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    channel text NOT NULL,
    notification_type text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    notification_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    related_entity_type text,
    related_entity_id uuid,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    delivery_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nudges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nudges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    nudge_type text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    related_entity_id uuid,
    related_open_loop_id uuid,
    suggested_action text,
    delivery_channels text[] DEFAULT '{}'::text[],
    delivered_at jsonb DEFAULT '{}'::jsonb,
    acknowledged_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: open_loops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.open_loops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    source_item_id uuid,
    title text NOT NULL,
    description text NOT NULL,
    loop_type public.open_loop_type DEFAULT 'other'::public.open_loop_type NOT NULL,
    owner text,
    status public.open_loop_status DEFAULT 'needs_review'::public.open_loop_status NOT NULL,
    priority public.open_loop_priority DEFAULT 'medium'::public.open_loop_priority NOT NULL,
    due_date timestamp with time zone,
    suggested_action text,
    suggested_follow_up_email jsonb,
    requires_human_approval boolean DEFAULT false NOT NULL,
    approved_at timestamp with time zone,
    outcome text,
    source_quote text,
    confidence numeric(3,2),
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    created_by_user_id uuid,
    embedding public.vector(1536)
);


--
-- Name: page_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    entity_page_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    chunk_kind text DEFAULT 'compiled_truth'::text NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pending_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    created_by_agent text NOT NULL,
    action_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requires_approval boolean DEFAULT true NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    executed_at timestamp with time zone,
    execution_result jsonb,
    execution_error text,
    related_open_loop_id uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: priorities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.priorities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    statement text NOT NULL,
    set_at timestamp with time zone DEFAULT now() NOT NULL,
    set_by public.priority_set_by DEFAULT 'naveen'::public.priority_set_by NOT NULL,
    horizon public.priority_horizon DEFAULT 'week'::public.priority_horizon NOT NULL,
    status public.priority_status DEFAULT 'active'::public.priority_status NOT NULL,
    source_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    from_object_id uuid NOT NULL,
    to_object_id uuid NOT NULL,
    relationship_type text NOT NULL,
    source_item_id uuid,
    source_quote text,
    confidence numeric(3,2),
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone,
    valid_to timestamp with time zone,
    is_current boolean DEFAULT true,
    strength numeric(3,2),
    last_observed_at timestamp with time zone
);


--
-- Name: skill_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    triggered_by text NOT NULL,
    trigger_payload jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'running'::text NOT NULL,
    steps_completed jsonb DEFAULT '[]'::jsonb,
    current_step integer DEFAULT 0 NOT NULL,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    trigger jsonb DEFAULT '{}'::jsonb NOT NULL,
    procedure jsonb DEFAULT '[]'::jsonb NOT NULL,
    output_template jsonb,
    learned_from_sources uuid[] DEFAULT '{}'::uuid[],
    version integer DEFAULT 1 NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    execution_count integer DEFAULT 0 NOT NULL,
    last_executed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: source_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_item_id uuid NOT NULL,
    brain_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: source_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    external_uri text,
    storage_path text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    type text NOT NULL,
    CONSTRAINT source_items_type_check CHECK ((type = ANY (ARRAY['transcript'::text, 'email'::text, 'note'::text, 'document'::text, 'github'::text, 'strategy_output'::text, 'web'::text, 'manual'::text, 'slack_message'::text, 'hubspot_record'::text, 'github_event'::text, 'notion_page'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_provider text
);


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brain_id uuid NOT NULL,
    source_item_id uuid,
    workflow_type text NOT NULL,
    status public.workflow_status DEFAULT 'started'::public.workflow_status NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: workspace_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    email text NOT NULL,
    role public.workspace_member_role DEFAULT 'member'::public.workspace_member_role NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.workspace_member_role DEFAULT 'member'::public.workspace_member_role NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: brain_alerts brain_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_alerts
    ADD CONSTRAINT brain_alerts_pkey PRIMARY KEY (id);


--
-- Name: brain_events brain_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_events
    ADD CONSTRAINT brain_events_pkey PRIMARY KEY (id);


--
-- Name: marketing_content_items marketing_content_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_items
    ADD CONSTRAINT marketing_content_items_pkey PRIMARY KEY (id);


--
-- Name: marketing_content_insights marketing_content_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_insights
    ADD CONSTRAINT marketing_content_insights_pkey PRIMARY KEY (id);


--
-- Name: marketing_channel_posts marketing_channel_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_channel_posts
    ADD CONSTRAINT marketing_channel_posts_pkey PRIMARY KEY (id);


--
-- Name: marketing_post_metrics marketing_post_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_post_metrics
    ADD CONSTRAINT marketing_post_metrics_pkey PRIMARY KEY (id);


--
-- Name: marketing_events marketing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_events
    ADD CONSTRAINT marketing_events_pkey PRIMARY KEY (id);


--
-- Name: marketing_experiments marketing_experiments_brain_tag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_experiments
    ADD CONSTRAINT marketing_experiments_brain_tag_key UNIQUE (brain_id, tag);


--
-- Name: marketing_experiments marketing_experiments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_experiments
    ADD CONSTRAINT marketing_experiments_pkey PRIMARY KEY (id);


--
-- Name: marketing_weekly_reports marketing_weekly_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_weekly_reports
    ADD CONSTRAINT marketing_weekly_reports_pkey PRIMARY KEY (id);


--
-- Name: marketing_llm_usage marketing_llm_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_llm_usage
    ADD CONSTRAINT marketing_llm_usage_pkey PRIMARY KEY (id);


--
-- Name: brain_templates brain_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_templates
    ADD CONSTRAINT brain_templates_pkey PRIMARY KEY (id);


--
-- Name: brains brains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brains
    ADD CONSTRAINT brains_pkey PRIMARY KEY (id);


--
-- Name: canonical_entities canonical_entities_brain_id_entity_type_canonical_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canonical_entities
    ADD CONSTRAINT canonical_entities_brain_id_entity_type_canonical_name_key UNIQUE (brain_id, entity_type, canonical_name);


--
-- Name: canonical_entities canonical_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canonical_entities
    ADD CONSTRAINT canonical_entities_pkey PRIMARY KEY (id);


--
-- Name: connector_configs connector_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_configs
    ADD CONSTRAINT connector_configs_pkey PRIMARY KEY (id);


--
-- Name: connector_sync_runs connector_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_sync_runs
    ADD CONSTRAINT connector_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: entity_mentions entity_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_pkey PRIMARY KEY (id);


--
-- Name: entity_pages entity_pages_brain_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_pages
    ADD CONSTRAINT entity_pages_brain_id_slug_key UNIQUE (brain_id, slug);


--
-- Name: entity_pages entity_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_pages
    ADD CONSTRAINT entity_pages_pkey PRIMARY KEY (id);


--
-- Name: loop_outcome_log loop_outcome_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_outcome_log
    ADD CONSTRAINT loop_outcome_log_pkey PRIMARY KEY (id);


--
-- Name: memory_objects memory_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_objects
    ADD CONSTRAINT memory_objects_pkey PRIMARY KEY (id);


--
-- Name: notetaker_calendars notetaker_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_calendars
    ADD CONSTRAINT notetaker_calendars_pkey PRIMARY KEY (id);


--
-- Name: notetaker_events notetaker_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_events
    ADD CONSTRAINT notetaker_events_pkey PRIMARY KEY (id);


--
-- Name: notetaker_meetings notetaker_meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_meetings
    ADD CONSTRAINT notetaker_meetings_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_workspace_id_channel_notif_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_workspace_id_channel_notif_key UNIQUE (user_id, workspace_id, channel, notification_type);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: nudges nudges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudges
    ADD CONSTRAINT nudges_pkey PRIMARY KEY (id);


--
-- Name: open_loops open_loops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_loops
    ADD CONSTRAINT open_loops_pkey PRIMARY KEY (id);


--
-- Name: page_chunks page_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_chunks
    ADD CONSTRAINT page_chunks_pkey PRIMARY KEY (id);


--
-- Name: pending_actions pending_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_actions
    ADD CONSTRAINT pending_actions_pkey PRIMARY KEY (id);


--
-- Name: priorities priorities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priorities
    ADD CONSTRAINT priorities_pkey PRIMARY KEY (id);


--
-- Name: relationships relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_pkey PRIMARY KEY (id);


--
-- Name: skill_executions skill_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_executions
    ADD CONSTRAINT skill_executions_pkey PRIMARY KEY (id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: source_embeddings source_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_embeddings
    ADD CONSTRAINT source_embeddings_pkey PRIMARY KEY (id);


--
-- Name: source_items source_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_items
    ADD CONSTRAINT source_items_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: workspace_invites workspace_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_pkey PRIMARY KEY (id);


--
-- Name: workspace_invites workspace_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_token_key UNIQUE (token);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: agent_runs_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_brain_id_idx ON public.agent_runs USING btree (brain_id);


--
-- Name: agent_runs_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_source_item_id_idx ON public.agent_runs USING btree (source_item_id);


--
-- Name: agent_runs_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_started_at_idx ON public.agent_runs USING btree (started_at);


--
-- Name: agent_runs_workflow_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_workflow_id_idx ON public.agent_runs USING btree (workflow_id);


--
-- Name: brain_alerts_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_alerts_brain_id_idx ON public.brain_alerts USING btree (brain_id);


--
-- Name: brain_alerts_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_alerts_created_at_idx ON public.brain_alerts USING btree (created_at);


--
-- Name: brain_alerts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_alerts_status_idx ON public.brain_alerts USING btree (status);


--
-- Name: brain_events_brain_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_events_brain_created_at_idx ON public.brain_events USING btree (brain_id, created_at);


--
-- Name: brain_events_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_events_brain_id_idx ON public.brain_events USING btree (brain_id);


--
-- Name: brain_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_events_created_at_idx ON public.brain_events USING btree (created_at);


--
-- Name: brain_events_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_events_entity_id_idx ON public.brain_events USING btree (entity_id);


--
-- Name: brain_events_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_events_event_type_idx ON public.brain_events USING btree (event_type);


--
-- Name: brain_events_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_events_source_item_id_idx ON public.brain_events USING btree (source_item_id);


--
-- Name: brain_events_source_system_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_events_source_system_idx ON public.brain_events USING btree (source_system);


--
-- Name: marketing_content_items_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_content_items_brain_id_idx ON public.marketing_content_items USING btree (brain_id);


--
-- Name: marketing_content_items_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_content_items_source_item_id_idx ON public.marketing_content_items USING btree (source_item_id);


--
-- Name: marketing_content_items_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_content_items_created_at_idx ON public.marketing_content_items USING btree (created_at);


--
-- Name: marketing_content_insights_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_content_insights_brain_id_idx ON public.marketing_content_insights USING btree (brain_id);


--
-- Name: marketing_content_insights_content_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_content_insights_content_item_id_idx ON public.marketing_content_insights USING btree (content_item_id);


--
-- Name: marketing_content_insights_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_content_insights_created_at_idx ON public.marketing_content_insights USING btree (created_at);


--
-- Name: marketing_channel_posts_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_channel_posts_brain_id_idx ON public.marketing_channel_posts USING btree (brain_id);


--
-- Name: marketing_channel_posts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_channel_posts_status_idx ON public.marketing_channel_posts USING btree (status);


--
-- Name: marketing_channel_posts_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_channel_posts_channel_idx ON public.marketing_channel_posts USING btree (channel);


--
-- Name: marketing_channel_posts_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_channel_posts_created_at_idx ON public.marketing_channel_posts USING btree (created_at);


--
-- Name: marketing_post_metrics_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_post_metrics_brain_id_idx ON public.marketing_post_metrics USING btree (brain_id);


--
-- Name: marketing_post_metrics_channel_post_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_post_metrics_channel_post_id_idx ON public.marketing_post_metrics USING btree (channel_post_id);


--
-- Name: marketing_post_metrics_metric_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_post_metrics_metric_date_idx ON public.marketing_post_metrics USING btree (metric_date);


--
-- Name: marketing_events_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_events_brain_id_idx ON public.marketing_events USING btree (brain_id);


--
-- Name: marketing_events_channel_post_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_events_channel_post_id_idx ON public.marketing_events USING btree (channel_post_id);


--
-- Name: marketing_events_event_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_events_event_at_idx ON public.marketing_events USING btree (event_at);


--
-- Name: marketing_experiments_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_experiments_brain_id_idx ON public.marketing_experiments USING btree (brain_id);


--
-- Name: marketing_weekly_reports_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_weekly_reports_brain_id_idx ON public.marketing_weekly_reports USING btree (brain_id);


--
-- Name: marketing_weekly_reports_week_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_weekly_reports_week_start_idx ON public.marketing_weekly_reports USING btree (week_start);


--
-- Name: marketing_llm_usage_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_llm_usage_brain_id_idx ON public.marketing_llm_usage USING btree (brain_id);


--
-- Name: marketing_llm_usage_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_llm_usage_created_at_idx ON public.marketing_llm_usage USING btree (created_at);


--
-- Name: canonical_entities_aliases_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canonical_entities_aliases_idx ON public.canonical_entities USING gin (aliases);


--
-- Name: canonical_entities_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canonical_entities_brain_id_idx ON public.canonical_entities USING btree (brain_id);


--
-- Name: canonical_entities_canonical_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canonical_entities_canonical_name_trgm_idx ON public.canonical_entities USING gist (canonical_name public.gist_trgm_ops);


--
-- Name: canonical_entities_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canonical_entities_embedding_idx ON public.canonical_entities USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: canonical_entities_entity_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canonical_entities_entity_type_idx ON public.canonical_entities USING btree (entity_type);


--
-- Name: canonical_entities_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canonical_entities_workspace_id_idx ON public.canonical_entities USING btree (workspace_id);


--
-- Name: connector_configs_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connector_configs_brain_id_idx ON public.connector_configs USING btree (brain_id);


--
-- Name: connector_configs_sync_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connector_configs_sync_enabled_idx ON public.connector_configs USING btree (sync_enabled);


--
-- Name: connector_sync_runs_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connector_sync_runs_brain_id_idx ON public.connector_sync_runs USING btree (brain_id);


--
-- Name: connector_sync_runs_connector_config_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connector_sync_runs_connector_config_id_idx ON public.connector_sync_runs USING btree (connector_config_id);


--
-- Name: connector_sync_runs_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connector_sync_runs_started_at_idx ON public.connector_sync_runs USING btree (started_at);


--
-- Name: entity_mentions_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_mentions_brain_id_idx ON public.entity_mentions USING btree (brain_id);


--
-- Name: entity_mentions_canonical_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_mentions_canonical_entity_id_idx ON public.entity_mentions USING btree (canonical_entity_id);


--
-- Name: entity_mentions_memory_object_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_mentions_memory_object_id_idx ON public.entity_mentions USING btree (memory_object_id);


--
-- Name: entity_mentions_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_mentions_source_item_id_idx ON public.entity_mentions USING btree (source_item_id);


--
-- Name: entity_pages_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_pages_brain_id_idx ON public.entity_pages USING btree (brain_id);


--
-- Name: entity_pages_brain_stale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_pages_brain_stale_idx ON public.entity_pages USING btree (brain_id, stale) WHERE (stale = true);


--
-- Name: entity_pages_compiled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_pages_compiled_at_idx ON public.entity_pages USING btree (compiled_at);


--
-- Name: entity_pages_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_pages_entity_id_idx ON public.entity_pages USING btree (entity_id);


--
-- Name: entity_pages_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_pages_slug_idx ON public.entity_pages USING btree (slug);


--
-- Name: entity_pages_stale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_pages_stale_idx ON public.entity_pages USING btree (stale) WHERE (stale = true);


--
-- Name: idx_brain_events_brain_id_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brain_events_brain_id_created ON public.brain_events USING btree (brain_id, created_at DESC);


--
-- Name: idx_canonical_entities_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canonical_entities_name_trgm ON public.canonical_entities USING gin (canonical_name public.gin_trgm_ops);


--
-- Name: idx_entity_mentions_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_mentions_entity_id ON public.entity_mentions USING btree (canonical_entity_id);


--
-- Name: idx_memory_objects_brain_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_objects_brain_id ON public.memory_objects USING btree (brain_id);


--
-- Name: idx_memory_objects_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_objects_fts ON public.memory_objects USING gin (to_tsvector('english'::regconfig, ((((COALESCE(name, ''::text) || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || COALESCE(source_quote, ''::text))));


--
-- Name: idx_open_loops_brain_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_open_loops_brain_id ON public.open_loops USING btree (brain_id);


--
-- Name: idx_open_loops_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_open_loops_fts ON public.open_loops USING gin (to_tsvector('english'::regconfig, ((((((COALESCE(title, ''::text) || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || COALESCE(source_quote, ''::text)) || ' '::text) || COALESCE(outcome, ''::text))));


--
-- Name: idx_source_items_brain_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_source_items_brain_id ON public.source_items USING btree (brain_id);


--
-- Name: loop_outcome_log_brain_decided_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loop_outcome_log_brain_decided_at_idx ON public.loop_outcome_log USING btree (brain_id, decided_at DESC);


--
-- Name: loop_outcome_log_loop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loop_outcome_log_loop_id_idx ON public.loop_outcome_log USING btree (loop_id);


--
-- Name: loop_outcome_log_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loop_outcome_log_source_item_id_idx ON public.loop_outcome_log USING btree (source_item_id);


--
-- Name: memory_objects_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_objects_brain_id_idx ON public.memory_objects USING btree (brain_id);


--
-- Name: memory_objects_canonical_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_objects_canonical_entity_id_idx ON public.memory_objects USING btree (canonical_entity_id);


--
-- Name: memory_objects_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_objects_embedding_idx ON public.memory_objects USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: memory_objects_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_objects_source_item_id_idx ON public.memory_objects USING btree (source_item_id);


--
-- Name: memory_objects_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_objects_status_idx ON public.memory_objects USING btree (status);


--
-- Name: memory_objects_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_objects_type_idx ON public.memory_objects USING btree (object_type);


--
-- Name: memory_objects_unlinked_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_objects_unlinked_idx ON public.memory_objects USING btree (brain_id) WHERE (canonical_entity_id IS NULL);


--
-- Name: notetaker_calendars_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_calendars_brain_id_idx ON public.notetaker_calendars USING btree (brain_id);


--
-- Name: notetaker_calendars_external_calendar_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_calendars_external_calendar_id_idx ON public.notetaker_calendars USING btree (external_calendar_id);


--
-- Name: notetaker_calendars_recall_calendar_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_calendars_recall_calendar_id_idx ON public.notetaker_calendars USING btree (recall_calendar_id);


--
-- Name: notetaker_events_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_events_brain_id_idx ON public.notetaker_events USING btree (brain_id);


--
-- Name: notetaker_events_meeting_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_events_meeting_id_idx ON public.notetaker_events USING btree (notetaker_meeting_id);


--
-- Name: notetaker_events_provider_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_events_provider_event_id_idx ON public.notetaker_events USING btree (provider_event_id);


--
-- Name: notetaker_events_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_events_type_idx ON public.notetaker_events USING btree (event_type);


--
-- Name: notetaker_meetings_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_meetings_brain_id_idx ON public.notetaker_meetings USING btree (brain_id);


--
-- Name: notetaker_meetings_calendar_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_meetings_calendar_id_idx ON public.notetaker_meetings USING btree (notetaker_calendar_id);


--
-- Name: notetaker_meetings_external_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_meetings_external_event_id_idx ON public.notetaker_meetings USING btree (external_event_id);


--
-- Name: notetaker_meetings_recall_bot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_meetings_recall_bot_id_idx ON public.notetaker_meetings USING btree (recall_bot_id);


--
-- Name: notetaker_meetings_recall_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_meetings_recall_event_id_idx ON public.notetaker_meetings USING btree (recall_calendar_event_id);


--
-- Name: notetaker_meetings_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_meetings_source_item_id_idx ON public.notetaker_meetings USING btree (source_item_id);


--
-- Name: notetaker_meetings_start_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_meetings_start_time_idx ON public.notetaker_meetings USING btree (start_time);


--
-- Name: notetaker_meetings_event_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_meetings_event_status_idx ON public.notetaker_meetings USING btree (event_status);


--
-- Name: notification_preferences_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_preferences_user_id_idx ON public.notification_preferences USING btree (user_id);


--
-- Name: notifications_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_brain_id_idx ON public.notifications USING btree (brain_id);


--
-- Name: notifications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at);


--
-- Name: notifications_read_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_read_at_idx ON public.notifications USING btree (read_at) WHERE (read_at IS NULL);


--
-- Name: notifications_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id);


--
-- Name: nudges_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nudges_brain_id_idx ON public.nudges USING btree (brain_id);


--
-- Name: nudges_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nudges_created_at_idx ON public.nudges USING btree (created_at);


--
-- Name: nudges_nudge_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nudges_nudge_type_idx ON public.nudges USING btree (nudge_type);


--
-- Name: open_loops_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_loops_brain_id_idx ON public.open_loops USING btree (brain_id);


--
-- Name: open_loops_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_loops_embedding_idx ON public.open_loops USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: open_loops_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_loops_priority_idx ON public.open_loops USING btree (priority);


--
-- Name: open_loops_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_loops_source_item_id_idx ON public.open_loops USING btree (source_item_id);


--
-- Name: open_loops_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_loops_status_idx ON public.open_loops USING btree (status);


--
-- Name: page_chunks_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_chunks_brain_id_idx ON public.page_chunks USING btree (brain_id);


--
-- Name: page_chunks_chunk_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_chunks_chunk_kind_idx ON public.page_chunks USING btree (chunk_kind);


--
-- Name: page_chunks_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_chunks_embedding_idx ON public.page_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: page_chunks_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_chunks_entity_id_idx ON public.page_chunks USING btree (entity_id);


--
-- Name: page_chunks_entity_page_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_chunks_entity_page_id_idx ON public.page_chunks USING btree (entity_page_id);


--
-- Name: pending_actions_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_actions_brain_id_idx ON public.pending_actions USING btree (brain_id);


--
-- Name: pending_actions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_actions_expires_at_idx ON public.pending_actions USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: pending_actions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_actions_status_idx ON public.pending_actions USING btree (status);


--
-- Name: priorities_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX priorities_brain_id_idx ON public.priorities USING btree (brain_id);


--
-- Name: priorities_brain_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX priorities_brain_status_idx ON public.priorities USING btree (brain_id, status);


--
-- Name: priorities_set_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX priorities_set_at_idx ON public.priorities USING btree (set_at);


--
-- Name: priorities_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX priorities_status_idx ON public.priorities USING btree (status);


--
-- Name: relationships_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationships_brain_id_idx ON public.relationships USING btree (brain_id);


--
-- Name: relationships_from_object_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationships_from_object_id_idx ON public.relationships USING btree (from_object_id);


--
-- Name: relationships_to_object_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationships_to_object_id_idx ON public.relationships USING btree (to_object_id);


--
-- Name: skill_executions_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_executions_brain_id_idx ON public.skill_executions USING btree (brain_id);


--
-- Name: skill_executions_skill_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_executions_skill_id_idx ON public.skill_executions USING btree (skill_id);


--
-- Name: skill_executions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_executions_status_idx ON public.skill_executions USING btree (status);


--
-- Name: skills_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_brain_id_idx ON public.skills USING btree (brain_id);


--
-- Name: skills_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_status_idx ON public.skills USING btree (status);


--
-- Name: source_embeddings_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_embeddings_brain_id_idx ON public.source_embeddings USING btree (brain_id);


--
-- Name: source_embeddings_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_embeddings_embedding_idx ON public.source_embeddings USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: source_embeddings_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_embeddings_source_item_id_idx ON public.source_embeddings USING btree (source_item_id);


--
-- Name: source_items_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_items_brain_id_idx ON public.source_items USING btree (brain_id);


--
-- Name: workflows_brain_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflows_brain_id_idx ON public.workflows USING btree (brain_id);


--
-- Name: workflows_source_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflows_source_item_id_idx ON public.workflows USING btree (source_item_id);


--
-- Name: workflows_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflows_status_idx ON public.workflows USING btree (status);


--
-- Name: workspace_invites_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_invites_email_idx ON public.workspace_invites USING btree (email);


--
-- Name: workspace_invites_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_invites_token_idx ON public.workspace_invites USING btree (token);


--
-- Name: workspace_invites_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_invites_workspace_id_idx ON public.workspace_invites USING btree (workspace_id);


--
-- Name: workspace_members_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_members_user_id_idx ON public.workspace_members USING btree (user_id);


--
-- Name: workspace_members_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_members_workspace_id_idx ON public.workspace_members USING btree (workspace_id);


--
-- Name: agent_runs agent_runs_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: agent_runs agent_runs_source_item_id_source_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_source_item_id_source_items_id_fk FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: agent_runs agent_runs_workflow_id_workflows_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_workflow_id_workflows_id_fk FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE SET NULL;


--
-- Name: brain_alerts brain_alerts_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_alerts
    ADD CONSTRAINT brain_alerts_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: brain_alerts brain_alerts_open_loop_id_open_loops_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_alerts
    ADD CONSTRAINT brain_alerts_open_loop_id_open_loops_id_fk FOREIGN KEY (open_loop_id) REFERENCES public.open_loops(id) ON DELETE SET NULL;


--
-- Name: brain_alerts brain_alerts_source_id_source_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_alerts
    ADD CONSTRAINT brain_alerts_source_id_source_items_id_fk FOREIGN KEY (source_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: brain_events brain_events_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_events
    ADD CONSTRAINT brain_events_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: brain_events brain_events_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_events
    ADD CONSTRAINT brain_events_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.canonical_entities(id) ON DELETE SET NULL;


--
-- Name: brain_events brain_events_memory_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_events
    ADD CONSTRAINT brain_events_memory_object_id_fkey FOREIGN KEY (memory_object_id) REFERENCES public.memory_objects(id) ON DELETE SET NULL;


--
-- Name: brain_events brain_events_open_loop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_events
    ADD CONSTRAINT brain_events_open_loop_id_fkey FOREIGN KEY (open_loop_id) REFERENCES public.open_loops(id) ON DELETE SET NULL;


--
-- Name: brain_events brain_events_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_events
    ADD CONSTRAINT brain_events_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.relationships(id) ON DELETE SET NULL;


--
-- Name: brain_events brain_events_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_events
    ADD CONSTRAINT brain_events_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: marketing_content_items marketing_content_items_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_items
    ADD CONSTRAINT marketing_content_items_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: marketing_content_items marketing_content_items_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_items
    ADD CONSTRAINT marketing_content_items_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: marketing_content_insights marketing_content_insights_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_insights
    ADD CONSTRAINT marketing_content_insights_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: marketing_content_insights marketing_content_insights_content_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_insights
    ADD CONSTRAINT marketing_content_insights_content_item_id_fkey FOREIGN KEY (content_item_id) REFERENCES public.marketing_content_items(id) ON DELETE CASCADE;


--
-- Name: marketing_channel_posts marketing_channel_posts_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_channel_posts
    ADD CONSTRAINT marketing_channel_posts_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: marketing_channel_posts marketing_channel_posts_content_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_channel_posts
    ADD CONSTRAINT marketing_channel_posts_content_item_id_fkey FOREIGN KEY (content_item_id) REFERENCES public.marketing_content_items(id) ON DELETE SET NULL;


--
-- Name: marketing_channel_posts marketing_channel_posts_content_insight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_channel_posts
    ADD CONSTRAINT marketing_channel_posts_content_insight_id_fkey FOREIGN KEY (content_insight_id) REFERENCES public.marketing_content_insights(id) ON DELETE SET NULL;


--
-- Name: marketing_post_metrics marketing_post_metrics_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_post_metrics
    ADD CONSTRAINT marketing_post_metrics_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: marketing_post_metrics marketing_post_metrics_channel_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_post_metrics
    ADD CONSTRAINT marketing_post_metrics_channel_post_id_fkey FOREIGN KEY (channel_post_id) REFERENCES public.marketing_channel_posts(id) ON DELETE CASCADE;


--
-- Name: marketing_events marketing_events_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_events
    ADD CONSTRAINT marketing_events_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: marketing_events marketing_events_channel_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_events
    ADD CONSTRAINT marketing_events_channel_post_id_fkey FOREIGN KEY (channel_post_id) REFERENCES public.marketing_channel_posts(id) ON DELETE SET NULL;


--
-- Name: marketing_experiments marketing_experiments_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_experiments
    ADD CONSTRAINT marketing_experiments_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: marketing_weekly_reports marketing_weekly_reports_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_weekly_reports
    ADD CONSTRAINT marketing_weekly_reports_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: marketing_llm_usage marketing_llm_usage_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_llm_usage
    ADD CONSTRAINT marketing_llm_usage_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: brains brains_workspace_id_workspaces_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brains
    ADD CONSTRAINT brains_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: canonical_entities canonical_entities_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canonical_entities
    ADD CONSTRAINT canonical_entities_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: canonical_entities canonical_entities_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canonical_entities
    ADD CONSTRAINT canonical_entities_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: connector_configs connector_configs_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_configs
    ADD CONSTRAINT connector_configs_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: connector_sync_runs connector_sync_runs_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_sync_runs
    ADD CONSTRAINT connector_sync_runs_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: connector_sync_runs connector_sync_runs_connector_config_id_connector_configs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_sync_runs
    ADD CONSTRAINT connector_sync_runs_connector_config_id_connector_configs_id_fk FOREIGN KEY (connector_config_id) REFERENCES public.connector_configs(id) ON DELETE SET NULL;


--
-- Name: entity_mentions entity_mentions_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: entity_mentions entity_mentions_canonical_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_canonical_entity_id_fkey FOREIGN KEY (canonical_entity_id) REFERENCES public.canonical_entities(id) ON DELETE CASCADE;


--
-- Name: entity_mentions entity_mentions_memory_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_memory_object_id_fkey FOREIGN KEY (memory_object_id) REFERENCES public.memory_objects(id) ON DELETE SET NULL;


--
-- Name: entity_mentions entity_mentions_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: entity_mentions entity_mentions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_mentions
    ADD CONSTRAINT entity_mentions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: entity_pages entity_pages_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_pages
    ADD CONSTRAINT entity_pages_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: entity_pages entity_pages_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_pages
    ADD CONSTRAINT entity_pages_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.canonical_entities(id) ON DELETE CASCADE;


--
-- Name: loop_outcome_log loop_outcome_log_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_outcome_log
    ADD CONSTRAINT loop_outcome_log_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: loop_outcome_log loop_outcome_log_loop_id_open_loops_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_outcome_log
    ADD CONSTRAINT loop_outcome_log_loop_id_open_loops_id_fk FOREIGN KEY (loop_id) REFERENCES public.open_loops(id) ON DELETE CASCADE;


--
-- Name: loop_outcome_log loop_outcome_log_source_item_id_source_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loop_outcome_log
    ADD CONSTRAINT loop_outcome_log_source_item_id_source_items_id_fk FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: memory_objects memory_objects_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_objects
    ADD CONSTRAINT memory_objects_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: memory_objects memory_objects_canonical_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_objects
    ADD CONSTRAINT memory_objects_canonical_entity_id_fkey FOREIGN KEY (canonical_entity_id) REFERENCES public.canonical_entities(id) ON DELETE SET NULL;


--
-- Name: memory_objects memory_objects_source_item_id_source_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_objects
    ADD CONSTRAINT memory_objects_source_item_id_source_items_id_fk FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: notetaker_calendars notetaker_calendars_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_calendars
    ADD CONSTRAINT notetaker_calendars_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: notetaker_events notetaker_events_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_events
    ADD CONSTRAINT notetaker_events_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: notetaker_events notetaker_events_notetaker_meeting_id_notetaker_meetings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_events
    ADD CONSTRAINT notetaker_events_notetaker_meeting_id_notetaker_meetings_id_fk FOREIGN KEY (notetaker_meeting_id) REFERENCES public.notetaker_meetings(id) ON DELETE SET NULL;


--
-- Name: notetaker_meetings notetaker_meetings_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_meetings
    ADD CONSTRAINT notetaker_meetings_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: notetaker_meetings notetaker_meetings_notetaker_calendar_id_notetaker_calendars_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_meetings
    ADD CONSTRAINT notetaker_meetings_notetaker_calendar_id_notetaker_calendars_id FOREIGN KEY (notetaker_calendar_id) REFERENCES public.notetaker_calendars(id) ON DELETE SET NULL;


--
-- Name: notetaker_meetings notetaker_meetings_source_item_id_source_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_meetings
    ADD CONSTRAINT notetaker_meetings_source_item_id_source_items_id_fk FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: nudges nudges_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudges
    ADD CONSTRAINT nudges_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: nudges nudges_related_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudges
    ADD CONSTRAINT nudges_related_entity_id_fkey FOREIGN KEY (related_entity_id) REFERENCES public.canonical_entities(id) ON DELETE SET NULL;


--
-- Name: nudges nudges_related_open_loop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudges
    ADD CONSTRAINT nudges_related_open_loop_id_fkey FOREIGN KEY (related_open_loop_id) REFERENCES public.open_loops(id) ON DELETE SET NULL;


--
-- Name: open_loops open_loops_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_loops
    ADD CONSTRAINT open_loops_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: open_loops open_loops_source_item_id_source_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_loops
    ADD CONSTRAINT open_loops_source_item_id_source_items_id_fk FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: page_chunks page_chunks_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_chunks
    ADD CONSTRAINT page_chunks_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: page_chunks page_chunks_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_chunks
    ADD CONSTRAINT page_chunks_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.canonical_entities(id) ON DELETE CASCADE;


--
-- Name: page_chunks page_chunks_entity_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_chunks
    ADD CONSTRAINT page_chunks_entity_page_id_fkey FOREIGN KEY (entity_page_id) REFERENCES public.entity_pages(id) ON DELETE CASCADE;


--
-- Name: pending_actions pending_actions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_actions
    ADD CONSTRAINT pending_actions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pending_actions pending_actions_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_actions
    ADD CONSTRAINT pending_actions_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: pending_actions pending_actions_related_open_loop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_actions
    ADD CONSTRAINT pending_actions_related_open_loop_id_fkey FOREIGN KEY (related_open_loop_id) REFERENCES public.open_loops(id) ON DELETE SET NULL;


--
-- Name: priorities priorities_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priorities
    ADD CONSTRAINT priorities_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_from_object_id_memory_objects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_from_object_id_memory_objects_id_fk FOREIGN KEY (from_object_id) REFERENCES public.memory_objects(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_source_item_id_source_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_source_item_id_source_items_id_fk FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: relationships relationships_to_object_id_memory_objects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_to_object_id_memory_objects_id_fk FOREIGN KEY (to_object_id) REFERENCES public.memory_objects(id) ON DELETE CASCADE;


--
-- Name: skill_executions skill_executions_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_executions
    ADD CONSTRAINT skill_executions_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: skill_executions skill_executions_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_executions
    ADD CONSTRAINT skill_executions_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skills skills_brain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_brain_id_fkey FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: source_embeddings source_embeddings_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_embeddings
    ADD CONSTRAINT source_embeddings_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: source_embeddings source_embeddings_source_item_id_source_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_embeddings
    ADD CONSTRAINT source_embeddings_source_item_id_source_items_id_fk FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE CASCADE;


--
-- Name: source_items source_items_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_items
    ADD CONSTRAINT source_items_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: workflows workflows_brain_id_brains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_brain_id_brains_id_fk FOREIGN KEY (brain_id) REFERENCES public.brains(id) ON DELETE CASCADE;


--
-- Name: workflows workflows_source_item_id_source_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_source_item_id_source_items_id_fk FOREIGN KEY (source_item_id) REFERENCES public.source_items(id) ON DELETE SET NULL;


--
-- Name: workspace_invites workspace_invites_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_workspaces_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: agent_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_runs agent_runs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_runs_delete ON public.agent_runs FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: agent_runs agent_runs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_runs_insert ON public.agent_runs FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: agent_runs agent_runs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_runs_select ON public.agent_runs FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: agent_runs agent_runs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_runs_update ON public.agent_runs FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: brain_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brain_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: brain_alerts brain_alerts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_alerts_delete ON public.brain_alerts FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: brain_alerts brain_alerts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_alerts_insert ON public.brain_alerts FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: brain_alerts brain_alerts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_alerts_select ON public.brain_alerts FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: brain_alerts brain_alerts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_alerts_update ON public.brain_alerts FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: brain_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brain_events ENABLE ROW LEVEL SECURITY;

--
-- Name: brain_events brain_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_events_insert ON public.brain_events FOR INSERT WITH CHECK ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role]))))));


--
-- Name: brain_events brain_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_events_select ON public.brain_events FOR SELECT USING ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE (wm.user_id = auth.uid()))));


--
-- Name: brain_events brain_events_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_events_service ON public.brain_events USING ((auth.role() = 'service_role'::text));


--
-- Name: marketing_content_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_content_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_channel_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_llm_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_content_items_service ON public.marketing_content_items USING ((auth.role() = 'service_role'::text));
CREATE POLICY marketing_content_insights_service ON public.marketing_content_insights USING ((auth.role() = 'service_role'::text));
CREATE POLICY marketing_channel_posts_service ON public.marketing_channel_posts USING ((auth.role() = 'service_role'::text));
CREATE POLICY marketing_post_metrics_service ON public.marketing_post_metrics USING ((auth.role() = 'service_role'::text));
CREATE POLICY marketing_events_service ON public.marketing_events USING ((auth.role() = 'service_role'::text));
CREATE POLICY marketing_experiments_service ON public.marketing_experiments USING ((auth.role() = 'service_role'::text));
CREATE POLICY marketing_weekly_reports_service ON public.marketing_weekly_reports USING ((auth.role() = 'service_role'::text));
CREATE POLICY marketing_llm_usage_service ON public.marketing_llm_usage USING ((auth.role() = 'service_role'::text));


--
-- Name: brains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brains ENABLE ROW LEVEL SECURITY;

--
-- Name: brains brains_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brains_delete ON public.brains FOR DELETE TO authenticated USING ((public.user_workspace_role(workspace_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: brains brains_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brains_insert ON public.brains FOR INSERT TO authenticated WITH CHECK ((public.user_workspace_role(workspace_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: brains brains_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brains_select ON public.brains FOR SELECT TO authenticated USING ((public.user_workspace_role(workspace_id) IS NOT NULL));


--
-- Name: brains brains_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brains_update ON public.brains FOR UPDATE TO authenticated USING ((public.user_workspace_role(workspace_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: canonical_entities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canonical_entities ENABLE ROW LEVEL SECURITY;

--
-- Name: canonical_entities canonical_entities_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY canonical_entities_delete ON public.canonical_entities FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: canonical_entities canonical_entities_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY canonical_entities_insert ON public.canonical_entities FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: canonical_entities canonical_entities_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY canonical_entities_select ON public.canonical_entities FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: canonical_entities canonical_entities_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY canonical_entities_update ON public.canonical_entities FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: connector_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connector_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: connector_configs connector_configs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connector_configs_delete ON public.connector_configs FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: connector_configs connector_configs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connector_configs_insert ON public.connector_configs FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: connector_configs connector_configs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connector_configs_select ON public.connector_configs FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: connector_configs connector_configs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connector_configs_update ON public.connector_configs FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: connector_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connector_sync_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: connector_sync_runs connector_sync_runs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connector_sync_runs_delete ON public.connector_sync_runs FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: connector_sync_runs connector_sync_runs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connector_sync_runs_insert ON public.connector_sync_runs FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: connector_sync_runs connector_sync_runs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connector_sync_runs_select ON public.connector_sync_runs FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: connector_sync_runs connector_sync_runs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connector_sync_runs_update ON public.connector_sync_runs FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: entity_mentions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_mentions ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_mentions entity_mentions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_mentions_delete ON public.entity_mentions FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: entity_mentions entity_mentions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_mentions_insert ON public.entity_mentions FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: entity_mentions entity_mentions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_mentions_select ON public.entity_mentions FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: entity_mentions entity_mentions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_mentions_update ON public.entity_mentions FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: entity_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_pages entity_pages_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_pages_delete ON public.entity_pages FOR DELETE USING ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role]))))));


--
-- Name: entity_pages entity_pages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_pages_insert ON public.entity_pages FOR INSERT WITH CHECK ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role]))))));


--
-- Name: entity_pages entity_pages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_pages_select ON public.entity_pages FOR SELECT USING ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE (wm.user_id = auth.uid()))));


--
-- Name: entity_pages entity_pages_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_pages_service ON public.entity_pages USING ((auth.role() = 'service_role'::text));


--
-- Name: entity_pages entity_pages_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_pages_update ON public.entity_pages FOR UPDATE USING ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role]))))));


--
-- Name: memory_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_objects memory_objects_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memory_objects_delete ON public.memory_objects FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: memory_objects memory_objects_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memory_objects_insert ON public.memory_objects FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: memory_objects memory_objects_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memory_objects_select ON public.memory_objects FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: memory_objects memory_objects_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memory_objects_update ON public.memory_objects FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: notetaker_calendars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notetaker_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: notetaker_calendars notetaker_calendars_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_calendars_delete ON public.notetaker_calendars FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: notetaker_calendars notetaker_calendars_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_calendars_insert ON public.notetaker_calendars FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: notetaker_calendars notetaker_calendars_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_calendars_select ON public.notetaker_calendars FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: notetaker_calendars notetaker_calendars_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_calendars_update ON public.notetaker_calendars FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: notetaker_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notetaker_events ENABLE ROW LEVEL SECURITY;

--
-- Name: notetaker_events notetaker_events_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_events_delete ON public.notetaker_events FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: notetaker_events notetaker_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_events_insert ON public.notetaker_events FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: notetaker_events notetaker_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_events_select ON public.notetaker_events FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: notetaker_events notetaker_events_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_events_update ON public.notetaker_events FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: notetaker_meetings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notetaker_meetings ENABLE ROW LEVEL SECURITY;

--
-- Name: notetaker_meetings notetaker_meetings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_meetings_delete ON public.notetaker_meetings FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: notetaker_meetings notetaker_meetings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_meetings_insert ON public.notetaker_meetings FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: notetaker_meetings notetaker_meetings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_meetings_select ON public.notetaker_meetings FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: notetaker_meetings notetaker_meetings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notetaker_meetings_update ON public.notetaker_meetings FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences notification_preferences_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_delete ON public.notification_preferences FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notification_preferences notification_preferences_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_insert ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: notification_preferences notification_preferences_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_select ON public.notification_preferences FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notification_preferences notification_preferences_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_update ON public.notification_preferences FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: nudges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;

--
-- Name: nudges nudges_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nudges_delete ON public.nudges FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: nudges nudges_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nudges_insert ON public.nudges FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: nudges nudges_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nudges_select ON public.nudges FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: nudges nudges_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nudges_update ON public.nudges FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: open_loops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.open_loops ENABLE ROW LEVEL SECURITY;

--
-- Name: open_loops open_loops_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY open_loops_delete ON public.open_loops FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: open_loops open_loops_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY open_loops_insert ON public.open_loops FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: open_loops open_loops_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY open_loops_select ON public.open_loops FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: open_loops open_loops_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY open_loops_update ON public.open_loops FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: page_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.page_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: page_chunks page_chunks_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY page_chunks_delete ON public.page_chunks FOR DELETE USING ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role]))))));


--
-- Name: page_chunks page_chunks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY page_chunks_insert ON public.page_chunks FOR INSERT WITH CHECK ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role]))))));


--
-- Name: page_chunks page_chunks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY page_chunks_select ON public.page_chunks FOR SELECT USING ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE (wm.user_id = auth.uid()))));


--
-- Name: page_chunks page_chunks_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY page_chunks_service ON public.page_chunks USING ((auth.role() = 'service_role'::text));


--
-- Name: page_chunks page_chunks_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY page_chunks_update ON public.page_chunks FOR UPDATE USING ((brain_id IN ( SELECT b.id
   FROM (public.brains b
     JOIN public.workspace_members wm ON ((wm.workspace_id = b.workspace_id)))
  WHERE ((wm.user_id = auth.uid()) AND (wm.role = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role]))))));


--
-- Name: pending_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_actions pending_actions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pending_actions_delete ON public.pending_actions FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: pending_actions pending_actions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pending_actions_insert ON public.pending_actions FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: pending_actions pending_actions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pending_actions_select ON public.pending_actions FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: pending_actions pending_actions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pending_actions_update ON public.pending_actions FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: priorities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.priorities ENABLE ROW LEVEL SECURITY;

--
-- Name: priorities priorities_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY priorities_delete ON public.priorities FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: priorities priorities_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY priorities_insert ON public.priorities FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: priorities priorities_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY priorities_select ON public.priorities FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: priorities priorities_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY priorities_update ON public.priorities FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: relationships relationships_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY relationships_delete ON public.relationships FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: relationships relationships_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY relationships_insert ON public.relationships FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: relationships relationships_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY relationships_select ON public.relationships FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: relationships relationships_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY relationships_update ON public.relationships FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: skill_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_executions skill_executions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_executions_delete ON public.skill_executions FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: skill_executions skill_executions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_executions_insert ON public.skill_executions FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: skill_executions skill_executions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_executions_select ON public.skill_executions FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: skill_executions skill_executions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_executions_update ON public.skill_executions FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: skills skills_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_delete ON public.skills FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: skills skills_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_insert ON public.skills FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: skills skills_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_select ON public.skills FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: skills skills_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_update ON public.skills FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: source_embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.source_embeddings ENABLE ROW LEVEL SECURITY;

--
-- Name: source_embeddings source_embeddings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY source_embeddings_delete ON public.source_embeddings FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: source_embeddings source_embeddings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY source_embeddings_insert ON public.source_embeddings FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: source_embeddings source_embeddings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY source_embeddings_select ON public.source_embeddings FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: source_embeddings source_embeddings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY source_embeddings_update ON public.source_embeddings FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: source_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.source_items ENABLE ROW LEVEL SECURITY;

--
-- Name: source_items source_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY source_items_delete ON public.source_items FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: source_items source_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY source_items_insert ON public.source_items FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: source_items source_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY source_items_select ON public.source_items FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: source_items source_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY source_items_update ON public.source_items FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select ON public.users FOR SELECT TO authenticated USING (true);


--
-- Name: workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

--
-- Name: workflows workflows_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflows_delete ON public.workflows FOR DELETE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: workflows workflows_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflows_insert ON public.workflows FOR INSERT TO authenticated WITH CHECK ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: workflows workflows_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflows_select ON public.workflows FOR SELECT TO authenticated USING ((public.user_brain_role(brain_id) IS NOT NULL));


--
-- Name: workflows workflows_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflows_update ON public.workflows FOR UPDATE TO authenticated USING ((public.user_brain_role(brain_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role, 'member'::public.workspace_member_role])));


--
-- Name: workspace_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_invites workspace_invites_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_invites_delete ON public.workspace_invites FOR DELETE TO authenticated USING ((public.user_workspace_role(workspace_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: workspace_invites workspace_invites_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_invites_insert ON public.workspace_invites FOR INSERT TO authenticated WITH CHECK ((public.user_workspace_role(workspace_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: workspace_invites workspace_invites_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_invites_select ON public.workspace_invites FOR SELECT TO authenticated USING ((public.user_workspace_role(workspace_id) = ANY (ARRAY['owner'::public.workspace_member_role, 'admin'::public.workspace_member_role])));


--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members workspace_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_members_select ON public.workspace_members FOR SELECT TO authenticated USING ((public.user_workspace_role(workspace_id) IS NOT NULL));


--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces workspaces_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_select ON public.workspaces FOR SELECT TO authenticated USING ((public.user_workspace_role(id) IS NOT NULL));


--
-- PostgreSQL database dump complete
--

--
-- Name: brain_docs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brain_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id uuid NOT NULL REFERENCES public.brains(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  title text NOT NULL,
  content jsonb NOT NULL,
  content_text text,
  feedback text,
  feedback_at timestamptz,
  agent_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  external_event_id text,
  meeting_id uuid REFERENCES public.notetaker_meetings(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_brain_docs_meeting ON public.brain_docs(brain_id, meeting_id);
CREATE INDEX idx_brain_docs_type ON public.brain_docs(brain_id, doc_type);
CREATE INDEX idx_brain_docs_ext_event ON public.brain_docs(brain_id, external_event_id);
CREATE INDEX idx_brain_docs_agent_run ON public.brain_docs(agent_run_id);

-- Meeting Prep Agent: brain-level settings
-- Settings are stored as keys in the existing brains.metadata jsonb column:
--   meeting_prep_enabled   (boolean, default false)
--   linkedin_enrichment_enabled (boolean, default false)
--   web_search_enabled     (boolean, default true)
--   timezone               (string, default "UTC")
-- No schema change needed — metadata column already exists.
