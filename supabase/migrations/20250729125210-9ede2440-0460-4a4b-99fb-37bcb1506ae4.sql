-- Add columns for stacking system to games table
ALTER TABLE public.games 
ADD COLUMN selected_cards jsonb DEFAULT '[]'::jsonb,
ADD COLUMN stacking_timer timestamp with time zone,
ADD COLUMN pending_draw_total integer DEFAULT 0,
ADD COLUMN pending_draw_type text,
ADD COLUMN stacked_discard jsonb DEFAULT '[]'::jsonb,
ADD COLUMN expanded_hand_player text;