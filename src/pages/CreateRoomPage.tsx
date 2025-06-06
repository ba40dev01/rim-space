import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const CreateRoomPage: React.FC = () => {
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const code = generateRoomCode();
    try {
      // 1. Create room
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .insert([{ code }])
        .select()
        .single();
      if (roomError || !room)
        throw roomError || new Error("Room creation failed");
      // 2. Add player as host
      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert([
          {
            nickname,
            room_id: room.id,
            is_host: true,
            turn_order: 1,
          },
        ])
        .select()
        .single();
      if (playerError || !player)
        throw playerError || new Error("Player creation failed");
      // 3. Store player info in sessionStorage (for later use)
      sessionStorage.setItem("playerId", player.id);
      sessionStorage.setItem("roomId", room.id);
      sessionStorage.setItem("roomCode", code);
      // 4. Navigate to lobby
      navigate(`/room/${code}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "3rem" }}>
      <h2>Create Room</h2>
      <form onSubmit={handleCreateRoom} style={{ marginTop: "2rem" }}>
        <input
          type="text"
          placeholder="Enter your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          style={{ padding: "0.5rem", fontSize: "1rem" }}
        />
        <button
          type="submit"
          disabled={loading || !nickname}
          style={{
            marginLeft: "1rem",
            padding: "0.5rem 1rem",
            fontSize: "1rem",
          }}
        >
          {loading ? "Creating..." : "Create Room"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default CreateRoomPage;
