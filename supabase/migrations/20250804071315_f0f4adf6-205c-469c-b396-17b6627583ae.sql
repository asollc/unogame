-- Add scoring system columns to games table
ALTER TABLE public.games 
ADD COLUMN scoring_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN score_limit integer,
ADD COLUMN match_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN player_total_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN eliminated_players jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN current_match_number integer NOT NULL DEFAULT 1,
ADD COLUMN final_winner_id text;