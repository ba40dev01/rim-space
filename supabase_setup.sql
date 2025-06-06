-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create rooms table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended'))
);

-- Create players table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nickname TEXT NOT NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  is_host BOOLEAN DEFAULT FALSE,
  turn_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create prompts table
CREATE TABLE prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('truth', 'dare')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game_state table
CREATE TABLE game_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  current_player_id UUID REFERENCES players(id),
  current_prompt_id UUID REFERENCES prompts(id),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create responses table
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
    response TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for game_state
CREATE TRIGGER update_game_state_updated_at
    BEFORE UPDATE ON game_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample prompts
INSERT INTO prompts (type, content) VALUES
('truth', 'What is the most embarrassing thing you have done in public?'),
('truth', 'What is your biggest fear?'),
('truth', 'What is the worst lie you have ever told?'),
('dare', 'Do your best dance move right now!'),
('dare', 'Let someone in the room post anything they want on your social media.'),
('dare', 'Call your mom and tell her you are getting married tomorrow.');

-- Enable Row Level Security (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Create policies for rooms
CREATE POLICY "Enable read access for all users" ON rooms FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON rooms FOR UPDATE USING (true);

-- Create policies for players
CREATE POLICY "Enable read access for all users" ON players FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON players FOR UPDATE USING (true);

-- Create policies for prompts
CREATE POLICY "Enable read access for all users" ON prompts FOR SELECT USING (true);

-- Create policies for game_state
CREATE POLICY "Enable read access for all users" ON game_state FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON game_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON game_state FOR UPDATE USING (true);

-- Create policies for responses
CREATE POLICY "Enable read access for all users" ON responses FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON responses FOR INSERT WITH CHECK (true); 