-- Add seated field to players table to track seating status
ALTER TABLE public.players 
ADD COLUMN seated boolean NOT NULL DEFAULT false;

-- Add seated_position field to track which position the player is seated in
ALTER TABLE public.players 
ADD COLUMN seated_position integer;