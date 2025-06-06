import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

interface Player {
  id: string;
  nickname: string;
  is_host: boolean;
  turn_order: number;
}

const RoomLobbyPage: React.FC = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  const fetchPlayers = async () => {
    try {
      const roomId = sessionStorage.getItem("roomId");
      if (!roomId) return;

      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .order("turn_order", { ascending: true });

      if (error) throw error;
      setPlayers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkGameStatus = async () => {
    try {
      const roomId = sessionStorage.getItem("roomId");
      if (!roomId) return;

      const { data, error } = await supabase
        .from("rooms")
        .select("status")
        .eq("id", roomId)
        .single();

      if (error) throw error;
      setGameStarted(data.status === "active");
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    const playerId = sessionStorage.getItem("playerId");
    const roomId = sessionStorage.getItem("roomId");

    if (!playerId || !roomId) {
      navigate("/");
      return;
    }

    // Check if current player is host
    const checkHost = async () => {
      const { data: player } = await supabase
        .from("players")
        .select("is_host")
        .eq("id", playerId)
        .single();
      setIsHost(player?.is_host || false);
    };

    checkHost();

    // Initial fetch of players and game status
    fetchPlayers();
    checkGameStatus();

    // Set up polling interval for player list and game status
    const pollInterval = setInterval(() => {
      fetchPlayers();
      checkGameStatus();
    }, 2000);

    // Subscribe to players table changes for real-time updates
    const playersSubscription = supabase
      .channel("players")
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchPlayers();
        }
      )
      .subscribe();

    // Subscribe to room status changes
    const roomSubscription = supabase
      .channel("rooms")
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        () => {
          checkGameStatus();
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      playersSubscription.unsubscribe();
      roomSubscription.unsubscribe();
    };
  }, [roomCode, navigate]);

  const startGame = async () => {
    try {
      const roomId = sessionStorage.getItem("roomId");
      if (!roomId) return;

      // Update room status to active
      await supabase
        .from("rooms")
        .update({ status: "active" })
        .eq("id", roomId);

      // Create initial game state
      const firstPlayer = players[0];

      // Get a random prompt using a different approach
      const { data: prompts, error: promptsError } = await supabase
        .from("prompts")
        .select("*")
        .limit(100); // Get a reasonable number of prompts

      if (promptsError) throw promptsError;
      if (!prompts || prompts.length === 0)
        throw new Error("No prompts available");

      // Select a random prompt from the array
      const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

      // Create game state with the random prompt
      const { error: gameStateError } = await supabase
        .from("game_state")
        .insert([
          {
            room_id: roomId,
            current_player_id: firstPlayer.id,
            current_prompt_id: randomPrompt.id,
            status: "active",
          },
        ]);

      if (gameStateError) throw gameStateError;

      navigate(`/game/${roomCode}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const joinGame = () => {
    navigate(`/game/${roomCode}`);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div style={{ textAlign: "center", marginTop: "3rem" }}>
      <h2>Room Lobby</h2>

      <div
        style={{
          margin: "2rem auto",
          padding: "1rem",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          maxWidth: "400px",
        }}
      >
        <h3>Room Code</h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            marginTop: "0.5rem",
          }}
        >
          <code
            style={{
              fontSize: "1.5rem",
              padding: "0.5rem 1rem",
              backgroundColor: "#fff",
              borderRadius: "4px",
              border: "1px solid #ddd",
            }}
          >
            {roomCode}
          </code>
          <button
            onClick={copyRoomCode}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "1rem",
              backgroundColor: copied ? "#4CAF50" : "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p style={{ marginTop: "0.5rem", color: "#666" }}>
          Share this code with your friends to join the game
        </p>
      </div>

      <div style={{ marginTop: "2rem" }}>
        <h3>Players ({players.length})</h3>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            maxWidth: "400px",
            margin: "1rem auto",
          }}
        >
          {players.map((player) => (
            <li
              key={player.id}
              style={{
                margin: "0.5rem 0",
                padding: "0.5rem",
                backgroundColor: "#f5f5f5",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{player.nickname}</span>
              {player.is_host && (
                <span
                  style={{
                    backgroundColor: "#4CAF50",
                    color: "white",
                    padding: "0.25rem 0.5rem",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                  }}
                >
                  Host
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <div style={{ marginTop: "2rem" }}>
          <button
            onClick={startGame}
            disabled={players.length < 2}
            style={{
              padding: "0.75rem 1.5rem",
              fontSize: "1.1rem",
              backgroundColor: players.length < 2 ? "#ccc" : "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: players.length < 2 ? "not-allowed" : "pointer",
              transition: "all 0.3s ease",
            }}
          >
            {players.length < 2
              ? "Need at least 2 players to start"
              : "Start Game"}
          </button>
        </div>
      ) : gameStarted ? (
        <div style={{ marginTop: "2rem" }}>
          <button
            onClick={joinGame}
            style={{
              padding: "0.75rem 1.5rem",
              fontSize: "1.1rem",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          >
            Join Game
          </button>
        </div>
      ) : (
        <div style={{ marginTop: "2rem", color: "#666" }}>
          Waiting for host to start the game...
        </div>
      )}
    </div>
  );
};

export default RoomLobbyPage;
