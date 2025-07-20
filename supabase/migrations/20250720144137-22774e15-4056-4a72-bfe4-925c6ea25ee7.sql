-- Create games table
CREATE TABLE public.games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  max_players INTEGER NOT NULL CHECK (max_players >= 2 AND max_players <= 6),
  current_player_index INTEGER NOT NULL DEFAULT 0,
  direction INTEGER NOT NULL DEFAULT 1,
  draw_pile JSONB NOT NULL DEFAULT '[]',
  discard_pile JSONB NOT NULL DEFAULT '[]',
  current_color TEXT NOT NULL DEFAULT 'red',
  draw_count INTEGER NOT NULL DEFAULT 0,
  pending_wild_card JSONB,
  last_played_card JSONB,
  play_history JSONB NOT NULL DEFAULT '[]',
  game_state TEXT NOT NULL DEFAULT 'waiting',
  winner_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create players table
CREATE TABLE public.players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  hand JSONB NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL,
  is_host BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id),
  UNIQUE(game_id, position)
);

-- Enable Row Level Security
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Create policies (public access since no authentication)
CREATE POLICY "Games are viewable by everyone" 
ON public.games 
FOR SELECT 
USING (true);

CREATE POLICY "Games can be created by everyone" 
ON public.games 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Games can be updated by everyone" 
ON public.games 
FOR UPDATE 
USING (true);

CREATE POLICY "Players are viewable by everyone" 
ON public.players 
FOR SELECT 
USING (true);

CREATE POLICY "Players can be created by everyone" 
ON public.players 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Players can be updated by everyone" 
ON public.players 
FOR UPDATE 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for tables
ALTER TABLE public.games REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;